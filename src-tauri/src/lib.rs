// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use aether_renderer_capture::{png_stream, CaptureOptions};
use aether_renderer_core::config::PartialConfig;
use aether_renderer_core::{RenderConfig, RenderProgress, RenderReport};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
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
    let input = if html { "-".into() } else { values.input };
    let cfg = PartialConfig {
        input: Some(input.into()),
        output: Some(values.output),
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
        let progress = |p: RenderProgress| {
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
    on_progress: impl FnMut(RenderProgress),
) -> Result<RenderReport, String> {
    let frames = u32::try_from(opts.frame_count())
        .map_err(|_| "❌ Too many frames for one render.".to_string())?;
    let (stream, capture) = png_stream(opts).map_err(|e| format!("❌ {e:#}"))?;
    let rendered = aether_renderer_core::render_stream(cfg, stream, Some(frames), on_progress);
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
        .invoke_handler(tauri::generate_handler![
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
        let mut last = None;
        let report = render_capture(cfg, opts, |p| last = Some(p)).unwrap();
        assert_eq!(report.frames_rendered, Some(10));
        assert_eq!(last.unwrap().percent, 100.0);
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
