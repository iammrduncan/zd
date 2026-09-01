use std::path::PathBuf;

use crate::cli::LaunchState;
use crate::grants::ResourceRef;

pub use zd_host::{
    GitCompareRequest, GitComparison, GitDiff, GitDiffRequest, GitHistoryPage, GitHistoryRequest,
    GitScope, GitStatusSnapshot,
};

impl zd_host::GitAuthority for LaunchState {
    fn git_root(&self, project_id: &str, worktree_id: &str) -> Result<PathBuf, String> {
        self.root(project_id, worktree_id)
    }

    fn git_resource(&self, resource: &ResourceRef) -> Result<PathBuf, String> {
        self.resolve(resource)
    }
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, LaunchState>, scope: GitScope) -> GitStatusSnapshot {
    zd_host::status_for(&*state, scope)
}

#[tauri::command]
pub fn git_history_page(
    state: tauri::State<'_, LaunchState>,
    request: GitHistoryRequest,
) -> GitHistoryPage {
    zd_host::history_for(&*state, request)
}

#[tauri::command]
pub fn git_compare(
    state: tauri::State<'_, LaunchState>,
    request: GitCompareRequest,
) -> GitComparison {
    zd_host::compare_for(&*state, request)
}

#[tauri::command]
pub fn git_diff(state: tauri::State<'_, LaunchState>, request: GitDiffRequest) -> GitDiff {
    zd_host::diff_for(&*state, request)
}
