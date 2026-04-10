use serde::{Serialize, Deserialize};
use std::fs;
use tauri::Manager;
use log::LevelFilter;
use walkdir::WalkDir;
use std::path::PathBuf;

#[derive(Serialize)]
struct ImageInfo {
    name: String,
    path: String,
}

#[allow(dead_code)]
#[derive(Serialize, Deserialize, Debug)]
// Build triggered update at 13:12
struct ConfigData {
    #[serde(rename = "fullscreen")]
    pub fullscreen_start: Option<bool>,
    // Other fields can be dynamic since we just pass the JSON string to/from JS
}

#[tauri::command]
fn get_local_images(path: String) -> Vec<ImageInfo> {
    let mut images = Vec::new();
    let valid_extensions = ["jpg", "jpeg", "png", "gif", "webp"];

    for entry in WalkDir::new(path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                    images.push(ImageInfo {
                        name: entry.file_name().to_string_lossy().into_owned(),
                        path: entry.path().to_string_lossy().into_owned(),
                    });
                }
            }
        }
    }
    images
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: String) -> Result<(), String> {
    let exe_path = app.path().executable_dir().map_err(|e| e.to_string())?;
    let conf_path = exe_path.join("img_slide_conf.json");
    fs::write(conf_path, settings).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<String, String> {
    let exe_path = app.path().executable_dir().map_err(|e| e.to_string())?;
    let conf_path = exe_path.join("img_slide_conf.json");
    if conf_path.exists() {
        fs::read_to_string(conf_path).map_err(|e| e.to_string())
    } else {
        Err("NOT_FOUND".to_string())
    }
}

#[tauri::command]
fn set_fullscreen(window: tauri::Window, fullscreen: bool) -> Result<(), String> {
    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_local_images,
            save_settings,
            load_settings,
            set_fullscreen,
            exit_app
        ])
        .setup(|app| {
            // 실행 시 전체화면 적용 옵션 처리
            let exe_path = app.path().executable_dir().unwrap_or_else(|_| PathBuf::from("."));
            let conf_path = exe_path.join("img_slide_conf.json");
            
            if conf_path.exists() {
                if let Ok(content) = fs::read_to_string(conf_path) {
                    if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(fullscreen_on) = config.get("fullscreen").and_then(|v| v.as_bool()) {
                            if fullscreen_on {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.set_fullscreen(true);
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
