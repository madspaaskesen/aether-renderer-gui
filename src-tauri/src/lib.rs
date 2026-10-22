// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use aether_renderer_core::config::PartialConfig;
use serde::{Deserialize, Serialize};
use std::io::Write;
use tauri::{command, AppHandle, Emitter};

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
/// `render-progress` events while ffmpeg works.
#[command]
async fn run_renderer(app: AppHandle, values: RenderValues) -> Result<RenderResult, String> {
    // PartialConfig gives the same defaults and validation as the CLI, e.g. the
    // format follows the output extension when none is chosen.
    let cfg = PartialConfig {
        input: Some(values.input.into()),
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
        aether_renderer_core::render_with_progress(cfg, |progress| {
            let _ = app.emit(PROGRESS_EVENT, progress);
        })
    })
    .await
    .map_err(|e| format!("Render task failed: {e}"))?
    .map(RenderResult::from)
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
            get_rendered_file,
            open_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
