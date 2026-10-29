// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use aether_renderer_capture::{png_stream, CaptureOptions};
use aether_renderer_core::config::PartialConfig;
use aether_renderer_core::{RenderConfig, RenderProgress, RenderReport};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{command, AppHandle, Emitter, Manager};

/// Event sent to the frontend while rendering, with a `RenderProgress`
/// payload: `{ frame, total_frames, percent }`.
const PROGRESS_EVENT: &str = "render-progress";

#[derive(Serialize, Deserialize)]
struct RenderValues {
    input: String,
    output: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    fps: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fade_in: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    fade_out: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bitrate: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    crf: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    preview: Option<bool>,
    /// A color such as "#1e1e1e"; missing or "transparent" keeps transparency
    #[serde(skip_serializing_if = "Option::is_none")]
    background: Option<String>,
    /// Viewport and length for an HTML input (ignored for folders and ZIPs)
    #[serde(skip_serializing_if = "Option::is_none")]
    capture: Option<CaptureValues>,
    /// Path to chrome-headless-shell set in Settings; empty means auto-detect
    #[serde(skip_serializing_if = "Option::is_none")]
    chrome: Option<String>,
}

/// The "HTML capture" fields of the form.
#[derive(Serialize, Deserialize, Clone, Copy)]
struct CaptureValues {
    width: u32,
    height: u32,
    /// Seconds
    duration: f64,
}

impl Default for CaptureValues {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            duration: 4.0,
        }
    }
}

/// What the frontend gets back after a successful render.
#[derive(Serialize)]
struct RenderResult {
    output: String,
    frames: Option<usize>,
    notes: Option<String>,
    warnings: Vec<String>,
}

impl From<aether_renderer_core::RenderReport> for RenderResult {
    fn from(report: aether_renderer_core::RenderReport) -> Self {
        Self {
            output: report.output_path.to_string_lossy().into_owned(),
            frames: report.frames_rendered,
            notes: report.notes,
            warnings: report.ffmpeg_warnings,
        }
    }
}

#[command]
async fn run_renderer_from_config(values: RenderValues) -> Result<RenderResult, String> {
    let config_json =
        serde_json::to_string_pretty(&values).map_err(|e| format!("Failed to serialize: {}", e))?;

    let config_path = std::env::temp_dir().join("aether-auto-config.json");
    let mut file = std::fs::File::create(&config_path)
        .map_err(|e| format!("Failed to create config file: {}", e))?;
    file.write_all(config_json.as_bytes())
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    let config_path = config_path.to_string_lossy().into_owned();
    tauri::async_runtime::spawn_blocking(move || {
        aether_renderer_core::render_from_config(&config_path)
    })
    .await
    .map_err(|e| format!("Render task failed: {e}"))?
    .map(RenderResult::from)
}

/// Render on a background thread (so the window stays responsive) and emit
/// `render-progress` events while ffmpeg works. An HTML file or URL is captured
/// with aether-renderer-capture and streamed straight into the encoder.
#[command]
async fn run_renderer(app: AppHandle, values: RenderValues) -> Result<RenderResult, String> {
    let html = is_html_input(&values.input);
    let capture = if html {
        let chrome = find_chrome(values.chrome.as_deref()).ok_or_else(chrome_missing)?;
        let c = values.capture.unwrap_or_default();
        Some(
            CaptureOptions::new(values.input.clone(), chrome)
                .size(c.width, c.height)
                .fps(values.fps.unwrap_or(30))
                .duration_secs(c.duration),
        )
    } else {
        None
    };
    // PartialConfig gives the same defaults and validation as the CLI, e.g. the
    // format follows the output extension when none is chosen. A capture is
    // read from a stream, which core calls "-".
    let output = resolve_output(&values.output, &values.input, home_dir().as_deref());
    let input = if html { "-".into() } else { values.input };
    let cfg = PartialConfig {
        input: Some(input.into()),
        output: Some(output),
        fps: values.fps,
        format: values.format.filter(|f| !f.is_empty()),
        fade_in: values.fade_in,
        fade_out: values.fade_out,
        bitrate: values.bitrate.filter(|b| !b.is_empty()),
        crf: values.crf.map(u32::from),
        background: values.background,
        ..Default::default()
    }
    .into_config()?;

    tauri::async_runtime::spawn_blocking(move || {
        let progress = move |p: RenderProgress| {
            let _ = app.emit(PROGRESS_EVENT, p);
        };
        match capture {
            Some(opts) => render_capture(cfg, opts, progress),
            None => aether_renderer_core::render_with_progress(cfg, progress),
        }
    })
    .await
    .map_err(|e| format!("Render task failed: {e}"))?
    .map(RenderResult::from)
}

/// Capture `opts` in headless Chrome and encode the frames as they arrive.
/// No frames are written to disk.
fn render_capture(
    cfg: RenderConfig,
    opts: CaptureOptions,
    on_progress: impl FnMut(RenderProgress) + Send + 'static,
) -> Result<RenderReport, String> {
    let frames = u32::try_from(opts.frame_count())
        .map_err(|_| "❌ Too many frames for one render.".to_string())?;
    // Progress comes from two places: the capture (frames reaching ffmpeg, the
    // slow part) and ffmpeg (frames encoded, reported late and in bursts).
    // Show whichever is further, so the bar moves steadily and never goes back.
    let progress = Arc::new(Mutex::new(Furthest {
        on_progress: Box::new(on_progress),
        shown: 0,
        total: frames,
    }));
    let captured = Arc::clone(&progress);
    let (stream, capture) = png_stream(opts).map_err(|e| format!("❌ {e:#}"))?;
    let stream = stream.on_frame(move |n| lock(&captured).report(n as u32));
    let rendered = aether_renderer_core::render_stream(cfg, stream, Some(frames), |p| {
        lock(&progress).report(p.frame)
    });
    // The stream is gone now, so the capture has finished or stopped.
    match (rendered, capture.wait()) {
        (Ok(report), Ok(_)) => Ok(report),
        // The capture failed first (bad page, Chrome crashed): say why.
        (_, Err(e)) if !e.to_string().contains("stream was closed") => {
            Err(format!("❌ Capture failed: {e:#}"))
        }
        // The encoder stopped first, which ended the capture: its error is the cause.
        (Err(e), _) => Err(e),
        (Ok(report), Err(_)) => Ok(report),
    }
}

/// Emits a progress event only when the frame count goes up.
struct Furthest {
    on_progress: Box<dyn FnMut(RenderProgress) + Send>,
    shown: u32,
    total: u32,
}

impl Furthest {
    fn report(&mut self, frame: u32) {
        let frame = frame.min(self.total);
        if frame > self.shown {
            self.shown = frame;
            (self.on_progress)(RenderProgress::new(frame, self.total));
        }
    }
}

fn lock<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Where to write the video. Relative names (like the default `output.webm`)
/// go next to the input instead of the app's working directory, which is
/// `src-tauri` in dev and often `/` in the built app. `~/` means home.
fn resolve_output(output: &str, input: &str, home: Option<&Path>) -> String {
    let output = output.trim();
    if let (Some(rest), Some(home)) = (output.strip_prefix("~/"), home) {
        return home.join(rest).to_string_lossy().into_owned();
    }
    if Path::new(output).is_absolute() {
        return output.to_string();
    }
    let input = input.trim();
    // A folder of frames gets its video next to it, not inside it.
    let base = if input.contains("://") || input.is_empty() {
        None
    } else {
        std::path::absolute(input)
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf))
    };
    match base.or_else(|| home.map(Path::to_path_buf)) {
        Some(dir) => dir.join(output).to_string_lossy().into_owned(),
        None => output.to_string(),
    }
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// An HTML file or a web address, as opposed to a folder or ZIP of frames.
fn is_html_input(input: &str) -> bool {
    let lower = input.trim().to_ascii_lowercase();
    lower.starts_with("http://")
        || lower.starts_with("https://")
        || [".html", ".htm", ".xhtml"]
            .iter()
            .any(|ext| lower.ends_with(ext))
}

fn chrome_missing() -> String {
    "❌ Chrome for HTML capture was not found. Install it with\n   \
     npx @puppeteer/browsers install chrome-headless-shell@stable --path ~/.cache/puppeteer\n\
     or choose its path in ⚙️ Settings."
        .into()
}

/// chrome-headless-shell to use: the path from Settings, else `AETHER_CHROME`,
/// else the newest one in the usual download folder (`~/.cache/puppeteer`).
fn find_chrome(explicit: Option<&str>) -> Option<PathBuf> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from);
    let env = std::env::var_os("AETHER_CHROME").map(PathBuf::from);
    find_chrome_in(explicit, env, home.as_deref())
}

fn find_chrome_in(
    explicit: Option<&str>,
    env: Option<PathBuf>,
    home: Option<&Path>,
) -> Option<PathBuf> {
    let explicit = explicit
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(PathBuf::from);
    if let Some(path) = explicit {
        // A path the user chose wins, even if it's wrong: they get the error.
        return path.is_file().then_some(path);
    }
    if let Some(path) = env.filter(|p| p.is_file()) {
        return Some(path);
    }
    // ~/.cache/puppeteer/chrome-headless-shell/<platform>-<version>/<build>/chrome-headless-shell
    let root = home?.join(".cache/puppeteer/chrome-headless-shell");
    let exe = if cfg!(windows) {
        "chrome-headless-shell.exe"
    } else {
        "chrome-headless-shell"
    };
    let mut found: Vec<PathBuf> = std::fs::read_dir(root)
        .ok()?
        .flatten()
        .flat_map(|version| std::fs::read_dir(version.path()).into_iter().flatten())
        .flatten()
        .map(|build| build.path().join(exe))
        .filter(|p| p.is_file())
        .collect();
    // Newest version last: compare the numbers in the folder names.
    found.sort_by_key(|p| version_key(p));
    found.pop()
}

/// The numbers in a path, e.g. `mac_arm-156.0.8078.73` -> [156, 0, 8078, 73].
fn version_key(path: &Path) -> Vec<u64> {
    path.to_string_lossy()
        .split(|c: char| !c.is_ascii_digit())
        .filter_map(|n| n.parse().ok())
        .collect()
}

/// The chrome-headless-shell the app would use, for the Settings drawer.
#[command]
fn detect_chrome(explicit: Option<String>) -> Option<String> {
    find_chrome(explicit.as_deref()).map(|p| p.to_string_lossy().into_owned())
}

/// Let the preview iframe load the chosen HTML file and the files next to it
/// (CSS, scripts, images) through the asset protocol, and nothing else.
#[command]
fn allow_preview(app: AppHandle, path: String) -> Result<(), String> {
    let dir = Path::new(&path)
        .parent()
        .ok_or("❌ The HTML file has no folder.")?;
    app.asset_protocol_scope()
        .allow_directory(dir, true)
        .map_err(|e| format!("❌ Can't preview {path}: {e}"))
}

/// Facts for the About window, also handy to paste into a bug report.
#[derive(Serialize)]
struct AboutInfo {
    version: &'static str,
    core: &'static str,
    capture: &'static str,
    ffmpeg: Option<String>,
    chrome: Option<String>,
}

#[command]
async fn about_info(chrome: Option<String>) -> AboutInfo {
    AboutInfo {
        version: env!("CARGO_PKG_VERSION"),
        core: env!("AETHER_CORE_VERSION"),
        capture: env!("AETHER_CAPTURE_VERSION"),
        ffmpeg: ffmpeg_version(),
        chrome: find_chrome(chrome.as_deref()).map(|p| p.to_string_lossy().into_owned()),
    }
}

/// "7.1" from `ffmpeg -version`, or None when ffmpeg isn't found.
fn ffmpeg_version() -> Option<String> {
    let out = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().next()?;
    let version = line
        .strip_prefix("ffmpeg version ")
        .and_then(|v| v.split_whitespace().next())
        .unwrap_or(line);
    Some(version.to_string())
}

/// Where bug reports and feature requests go (shared with Flixlar, which
/// tells them apart by `project`).
const FEEDBACK_URL: &str = "https://api.flixlar.com/feedback";

/// A bug report or feature request from the Feedback window.
#[derive(Deserialize)]
struct Feedback {
    /// "bug" or "feature"
    kind: String,
    email: Option<String>,
    message: String,
    diagnostics: Option<serde_json::Value>,
    user_agent: Option<String>,
    /// Hidden form field; only bots fill it in.
    website: Option<String>,
}

#[command]
async fn send_feedback(feedback: Feedback) -> Result<(), String> {
    let message = feedback.message.trim().to_string();
    if message.chars().count() < 5 {
        return Err("Please write a little more.".into());
    }
    if message.chars().count() > 2000 {
        return Err("Please keep it under 2000 characters.".into());
    }
    let body = serde_json::json!({
        "project": "aether-renderer",
        "type": feedback.kind,
        "email": feedback.email.map(|e| e.trim().to_string()).filter(|e| !e.is_empty()),
        "message": message,
        "version": env!("CARGO_PKG_VERSION"),
        "platform": format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH),
        "userAgent": feedback.user_agent,
        "referrer": "aether-renderer-gui",
        "diagnostics": feedback.diagnostics,
        "website": feedback.website.unwrap_or_default(),
    });
    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout(std::time::Duration::from_secs(20))
            .build();
        match agent.post(FEEDBACK_URL).send_json(body) {
            Ok(_) => Ok(()),
            Err(ureq::Error::Status(code, response)) => {
                // The API answers {"error": "..."} for bad input.
                let reason = response
                    .into_json::<serde_json::Value>()
                    .ok()
                    .and_then(|v| v.get("error")?.as_str().map(String::from))
                    .unwrap_or_else(|| format!("the server answered {code}"));
                Err(format!("Couldn't send: {reason}."))
            }
            Err(e) => Err(format!(
                "Couldn't reach the feedback server. Are you online? ({e})"
            )),
        }
    })
    .await
    .map_err(|e| format!("Couldn't send: {e}"))?
}

/// Sent to the frontend to open the Feedback window, with "bug" or "feature".
const OPEN_FEEDBACK_EVENT: &str = "open-feedback";

/// Sent to the frontend to open the About window.
const SHOW_ABOUT_EVENT: &str = "show-about";

/// The macOS menu bar. "About Aether Renderer…" opens our own About window
/// instead of the standard panel; Edit and Window keep copy/paste and the
/// usual shortcuts working.
#[cfg(target_os = "macos")]
fn mac_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem as P, Submenu};
    let about = MenuItem::with_id(app, "about", "About Aether Renderer…", true, None::<&str>)?;
    let app_menu = Submenu::with_items(
        app,
        "Aether Renderer",
        true,
        &[
            &about,
            &P::separator(app)?,
            &P::services(app, None)?,
            &P::separator(app)?,
            &P::hide(app, None)?,
            &P::hide_others(app, None)?,
            &P::show_all(app, None)?,
            &P::separator(app)?,
            &P::quit(app, None)?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &P::undo(app, None)?,
            &P::redo(app, None)?,
            &P::separator(app)?,
            &P::cut(app, None)?,
            &P::copy(app, None)?,
            &P::paste(app, None)?,
            &P::select_all(app, None)?,
        ],
    )?;
    let report_bug = MenuItem::with_id(app, "report-bug", "Report a Bug…", true, None::<&str>)?;
    let request_feature = MenuItem::with_id(
        app,
        "request-feature",
        "Request a Feature…",
        true,
        None::<&str>,
    )?;
    let help = Submenu::with_items(app, "Help", true, &[&report_bug, &request_feature])?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &P::minimize(app, None)?,
            &P::maximize(app, None)?,
            &P::separator(app)?,
            &P::close_window(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&app_menu, &edit, &window, &help])
}

/// Only local HTML files can be read or written by the code editor.
fn editable_html(path: &str) -> Result<&Path, String> {
    if path.contains("://") || !is_html_input(path) {
        return Err("❌ Only local .html files can be edited here.".into());
    }
    Ok(Path::new(path))
}

/// The HTML file shown in the code editor.
#[command]
async fn read_html_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(editable_html(&path)?)
        .map_err(|e| format!("❌ Couldn't read {path}: {e}"))
}

/// Save the code editor's HTML (Save button, ⌘S, or a new file from the template).
#[command]
async fn write_html_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(editable_html(&path)?, contents)
        .map_err(|e| format!("❌ Couldn't save {path}: {e}"))
}

#[command]
fn get_rendered_file(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(path).map_err(|e| format!("Failed to read file: {}", e))
}

#[command]
fn open_file(path: String) -> Result<(), String> {
    open::that(path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.handle().set_menu(mac_menu(app.handle())?)?;
            let _ = app; // only used on macOS
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().0.as_str() {
            "about" => {
                let _ = app.emit(SHOW_ABOUT_EVENT, ());
            }
            "report-bug" => {
                let _ = app.emit(OPEN_FEEDBACK_EVENT, "bug");
            }
            "request-feature" => {
                let _ = app.emit(OPEN_FEEDBACK_EVENT, "feature");
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            about_info,
            send_feedback,
            read_html_file,
            write_html_file,
            run_renderer,
            run_renderer_from_config,
            detect_chrome,
            allow_preview,
            get_rendered_file,
            open_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_local_html_is_editable() {
        assert!(editable_html("/a/page.html").is_ok());
        assert!(editable_html("C:\\x\\page.HTM").is_ok());
        for no in [
            "/a/frames.zip",
            "/a/notes.txt",
            "https://example.com/x.html",
            "/etc/passwd",
        ] {
            assert!(editable_html(no).is_err(), "{no}");
        }
    }

    #[test]
    #[cfg(unix)] // Windows paths need a drive letter to be absolute
    fn relative_output_goes_next_to_the_input() {
        let home = Path::new("/home/me");
        let next_to = |out: &str, input: &str| resolve_output(out, input, Some(home));
        assert_eq!(
            next_to("output.webm", "/a/b/loading.html"),
            "/a/b/output.webm"
        );
        assert_eq!(next_to("out.gif", "/a/frames"), "/a/out.gif");
        assert_eq!(next_to("/x/y.mp4", "/a/b.html"), "/x/y.mp4");
        assert_eq!(next_to("~/v.webm", "/a/b.html"), "/home/me/v.webm");
        assert_eq!(next_to("v.webm", "https://example.com"), "/home/me/v.webm");
    }

    #[test]
    fn html_inputs_are_recognized() {
        for yes in [
            "anim.html",
            "/a/B.HTM",
            "C:\\x\\page.xhtml",
            "https://example.com",
            " http://localhost:8080/x ",
        ] {
            assert!(is_html_input(yes), "{yes}");
        }
        for no in [
            "frames",
            "frames.zip",
            "/a/html/frames",
            "shot.png",
            "htmlfolder",
        ] {
            assert!(!is_html_input(no), "{no}");
        }
    }

    #[test]
    fn chrome_is_found_in_the_puppeteer_cache_newest_first() {
        let home = tempfile::tempdir().unwrap();
        let exe = if cfg!(windows) {
            "chrome-headless-shell.exe"
        } else {
            "chrome-headless-shell"
        };
        let root = home.path().join(".cache/puppeteer/chrome-headless-shell");
        for v in [
            "mac_arm-99.0.1.2",
            "mac_arm-156.0.8078.73",
            "mac_arm-156.0.999.1",
        ] {
            let dir = root.join(v).join("chrome-headless-shell-mac-arm64");
            std::fs::create_dir_all(&dir).unwrap();
            std::fs::write(dir.join(exe), b"").unwrap();
        }
        let found = find_chrome_in(None, None, Some(home.path())).unwrap();
        assert!(
            found.to_string_lossy().contains("156.0.8078.73"),
            "{found:?}"
        );

        // AETHER_CHROME wins over the cache, the Settings path over both.
        let env = home.path().join("env-chrome");
        std::fs::write(&env, b"").unwrap();
        assert_eq!(
            find_chrome_in(None, Some(env.clone()), Some(home.path())),
            Some(env.clone())
        );
        let chosen = home.path().join("chosen");
        std::fs::write(&chosen, b"").unwrap();
        let chosen_str = chosen.to_string_lossy().into_owned();
        assert_eq!(
            find_chrome_in(Some(&chosen_str), Some(env), Some(home.path())),
            Some(chosen)
        );
        // A wrong Settings path is not silently replaced.
        assert_eq!(
            find_chrome_in(Some("/no/such/chrome"), None, Some(home.path())),
            None
        );
        assert_eq!(find_chrome_in(None, None, None), None);
    }

    /// The whole HTML path: capture in Chrome, encode with core, no files in
    /// between. Needs AETHER_CHROME and ffmpeg, else skipped.
    #[test]
    fn html_capture_renders_a_transparent_webm() {
        let Some(chrome) = std::env::var_os("AETHER_CHROME").map(PathBuf::from) else {
            eprintln!("skipping: set AETHER_CHROME to chrome-headless-shell");
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let page = dir.path().join("anim.html");
        std::fs::write(
            &page,
            r#"<html><body style="margin:0;background:transparent">
            <div id="b" style="position:absolute;width:40px;height:40px;background:red"></div>
            <script>
              const b = document.getElementById("b");
              function f(t) { b.style.left = (t / 10) + "px"; requestAnimationFrame(f); }
              requestAnimationFrame(f);
            </script></body></html>"#,
        )
        .unwrap();
        let out = dir.path().join("out.webm");
        let cfg = PartialConfig {
            input: Some("-".into()),
            output: Some(out.to_string_lossy().into_owned()),
            fps: Some(20),
            ..Default::default()
        }
        .into_config()
        .unwrap();
        let opts = CaptureOptions::new(page.to_string_lossy(), chrome)
            .size(160, 120)
            .fps(20)
            .duration_secs(0.5);
        let last = Arc::new(Mutex::new(None));
        let seen = Arc::clone(&last);
        let report = render_capture(cfg, opts, move |p| *lock(&seen) = Some(p)).unwrap();
        assert_eq!(report.frames_rendered, Some(10));
        assert_eq!(lock(&last).as_ref().unwrap().percent, 100.0);
        assert!(out.metadata().unwrap().len() > 0);
    }

    #[test]
    fn capture_errors_are_reported_not_hidden_by_the_encoder() {
        let Some(chrome) = std::env::var_os("AETHER_CHROME").map(PathBuf::from) else {
            eprintln!("skipping: set AETHER_CHROME to chrome-headless-shell");
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let cfg = PartialConfig {
            input: Some("-".into()),
            output: Some(dir.path().join("x.webm").to_string_lossy().into_owned()),
            ..Default::default()
        }
        .into_config()
        .unwrap();
        // Chrome refuses port 9, so navigation fails right away.
        let opts = CaptureOptions::new("http://127.0.0.1:9/", chrome).duration_secs(0.5);
        let err = render_capture(cfg, opts, |_| {}).unwrap_err();
        assert!(
            err.contains("Capture failed") && err.contains("ERR_"),
            "{err}"
        );
    }
}
