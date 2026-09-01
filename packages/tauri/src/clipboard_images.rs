use crate::cli::LaunchState;

pub use zd_host::{ClipboardImageRequest, SavedClipboardImage};

#[tauri::command]
pub fn save_clipboard_image(
    launch: tauri::State<'_, LaunchState>,
    request: ClipboardImageRequest,
) -> Result<SavedClipboardImage, String> {
    let root = launch.root(&request.project_id, &request.worktree_id)?;
    zd_host::save_clipboard_image_at(&root, &request)
}
