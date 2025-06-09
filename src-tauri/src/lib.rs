// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::fs::File;
use std::io::Write;
use serde::{Serialize, Deserialize};
use serde_json;
use tauri::command;
use aether_renderer_core::render_from_config;

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
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[command]
fn run_renderer(values: RenderValues) -> Result<(), String> {
    let config_json = serde_json::to_string_pretty(&values)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    let config_path = "/tmp/aether-auto-config.json"; // or use tempfile crate

    let mut file = File::create(config_path)
        .map_err(|e| format!("Failed to create config file: {}", e))?;

    file.write_all(config_json.as_bytes())
        .map_err(|e| format!("Failed to write config file: {}", e))?;

    render_from_config(config_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, run_renderer]) // ✅ fixed
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
