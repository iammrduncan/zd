//! Thin Tauri commands over shared host file authority.

use crate::cli::LaunchState;
use crate::grants::ResourceRef;
use tauri_plugin_opener::OpenerExt;

pub use zd_host::{BoundedFileRead, FileStamp, ProjectImage, WorkspaceListing};

pub(crate) mod mutations;

#[tauri::command]
pub fn read_bounded_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> BoundedFileRead {
    let path = match launch.resolve(&resource) {
        Ok(path) => path,
        Err(_) => {
            return BoundedFileRead::Unavailable {
                problem: "File authority is unavailable".to_string(),
            }
        }
    };
    zd_host::read_bounded_file_at(&path)
}

#[tauri::command]
pub fn read_project_image(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> Result<ProjectImage, String> {
    let path = launch.resolve(&resource)?;
    zd_host::read_project_image_at(&path)
}

#[tauri::command]
pub fn read_text_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> Result<String, String> {
    let path = launch.resolve(&resource)?;
    zd_host::read_text_file_at(&path)
}

#[tauri::command]
pub fn workspace_files(
    launch: tauri::State<'_, LaunchState>,
    project_id: String,
    worktree_id: String,
) -> Result<WorkspaceListing, String> {
    let root = launch.root(&project_id, &worktree_id)?;
    zd_host::workspace_files_in(&root, &project_id, &worktree_id)
}

#[tauri::command]
pub fn write_text_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
    contents: String,
) -> Result<(), String> {
    let path = launch.resolve(&resource)?;
    zd_host::write_text_file_at(&path, &contents)
}

#[tauri::command]
pub fn file_stamp(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> Result<Option<FileStamp>, String> {
    let path = launch.resolve(&resource)?;
    zd_host::file_stamp_at(&path)
}

pub fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err("refused to open a non-web URL".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn is_web_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    lowered.starts_with("http://") || lowered.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::is_web_url;

    #[test]
    fn only_http_and_https_may_leave_the_process() {
        assert!(is_web_url("https://example.com"));
        assert!(is_web_url(" HTTP://example.com "));
        for refused in [
            "file:///tmp/private",
            "javascript:alert(1)",
            "mailto:user@example.com",
        ] {
            assert!(!is_web_url(refused));
        }
    }
}
