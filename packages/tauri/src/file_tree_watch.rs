//! Thin Tauri events over the shared host watcher owner.

use std::sync::Arc;

use tauri::Emitter;
pub use zd_host::file_tree_watch::FileTreeWatchState;
use zd_host::file_tree_watch::{FileTreeWatchRequest, FileTreeWatchSignal};

use crate::cli::LaunchState;

const WATCH_EVENT: &str = "file-tree-watch";
const WATCH_PROBLEM: &str = "Automatic file-tree updates are unavailable.";

#[tauri::command]
pub fn start_file_tree_watch(
    app: tauri::AppHandle,
    launch: tauri::State<'_, LaunchState>,
    watches: tauri::State<'_, FileTreeWatchState>,
    request: FileTreeWatchRequest,
) -> Result<(), String> {
    let root = launch
        .root(&request.project_id, &request.worktree_id)
        .map_err(|_| WATCH_PROBLEM.to_string())?;
    watches.start(
        &root,
        &request,
        Arc::new(move |signal: FileTreeWatchSignal| {
            let _ = app.emit(WATCH_EVENT, signal);
        }),
    )
}

#[tauri::command]
pub fn stop_file_tree_watch(
    watches: tauri::State<'_, FileTreeWatchState>,
    request: FileTreeWatchRequest,
) {
    watches.stop(&request);
}
