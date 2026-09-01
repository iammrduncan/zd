//! Tauri command adapter for host-owned theme discovery.

use tauri::Manager;
use zd_host::{theme_files_in, ThemeConfigFile};

#[tauri::command]
pub fn theme_config_files(app: tauri::AppHandle) -> Result<Vec<ThemeConfigFile>, String> {
    let directory = app
        .path()
        .config_dir()
        .map_err(|error| error.to_string())?
        .join("zd");
    theme_files_in(&directory)
}
