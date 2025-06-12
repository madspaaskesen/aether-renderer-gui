// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::{Deserialize, Serialize};
use serde_json;
use std::fs::File;
use std::io::Write;
use tauri::command;

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
}

#[command]
fn run_renderer_from_config(values: RenderValues) -> Result<String, String> {
    let config_json =
        serde_json::to_string_pretty(&values).map_err(|e| format!("Failed to serialize: {}", e))?;

    /* */
    let config_path = "/tmp/aether-auto-config.json"; // or use tempfile crate

    let mut file =
        File::create(config_path).map_err(|e| format!("Failed to create config file: {}", e))?;

    file.write_all(config_json.as_bytes())
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    let _result = aether_renderer_core::render_from_config(config_path);
    
    Ok(format!("Rendered successfully to {}", values.output))
}

#[command]
fn run_renderer(values: RenderValues) -> Result<String, String> {
    let output_path = values.output.clone();

    let _result = aether_renderer_core::render(aether_renderer_core::RenderConfig {
        input: values.input.into(),
        output: values.output,
        file_pattern: None,
        fps: values.fps.unwrap_or(30),
        format: values.format.unwrap_or("webm".to_string()),
        fade_in: values.fade_in.unwrap_or(0.0),
        fade_out: values.fade_out.unwrap_or(0.0),
        bitrate: values.bitrate,
        crf: values.crf.map(|v| v as u32), // convert Option<u8> to Option<u32>
        open: false,
        verbose: false,
        verbose_ffmpeg: false,
    });

    Ok(format!("Rendered successfully to {}", output_path))
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
        .invoke_handler(tauri::generate_handler![run_renderer, run_renderer_from_config, get_rendered_file, open_file])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
