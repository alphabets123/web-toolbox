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

// 설정 파일 경로를 획득하는 보조 함수 (EXE와 같은 폴더)
fn get_config_path() -> Result<PathBuf, String> {
    let exe_path = std::env::current_exe().map_err(|e| format!("EXE 경로 획득 실패: {}", e))?;
    let dir = exe_path.parent().ok_or("EXE 부모 폴더 획득 실패")?;
    Ok(dir.join("img_slide_conf.json"))
}

#[derive(Serialize, Deserialize, Debug)]
struct ConfigData {
    #[serde(rename = "fullscreen")]
    pub fullscreen_start: Option<bool>,
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
fn save_settings(settings: String) -> Result<(), String> {
    let conf_path = get_config_path()?;
    println!("Saving settings to: {:?}", conf_path);
    fs::write(&conf_path, settings).map_err(|e| format!("설정 저장 실패({:?}): {}", conf_path, e))?;
    Ok(())
}

#[tauri::command]
fn load_settings() -> Result<String, String> {
    let conf_path = get_config_path()?;
    println!("Loading settings from: {:?}", conf_path);
    if conf_path.exists() {
        fs::read_to_string(&conf_path).map_err(|e| format!("설정 로드 실패({:?}): {}", conf_path, e))
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
            if let Ok(conf_path) = get_config_path() {
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
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
