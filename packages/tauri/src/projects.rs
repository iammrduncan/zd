//! Native project-folder selection and grant recovery.
//!
//! Paths enter the application only here, through an operating-system picker.
//! The webview receives the resulting opaque grant and cannot submit a path of
//! its own to widen filesystem authority.

use std::path::PathBuf;

use tauri_plugin_dialog::DialogExt;

use crate::cli::LaunchState;
use crate::grants::ProjectGrant;

fn picked_folder(window: &tauri::Window, title: &str) -> Result<Option<PathBuf>, String> {
    window
        .dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .map(|selected| selected.into_path().map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
pub async fn choose_project(
    window: tauri::Window,
    state: tauri::State<'_, LaunchState>,
) -> Result<Option<ProjectGrant>, String> {
    let Some(root) = picked_folder(&window, "Open Project")? else {
        return Ok(None);
    };
    state.approve_project(&root).map(Some)
}

#[tauri::command]
pub async fn recover_project_grant(
    window: tauri::Window,
    state: tauri::State<'_, LaunchState>,
    project_id: String,
) -> Result<Option<ProjectGrant>, String> {
    let Some(root) = picked_folder(&window, "Locate Project Folder")? else {
        return Ok(None);
    };
    state.recover_project(&project_id, &root).map(Some)
}
