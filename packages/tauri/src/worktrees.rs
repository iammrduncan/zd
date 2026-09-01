//! Tauri command adapter for host-owned Git worktree creation.

use std::path::{Path, PathBuf};

use zd_host::{
    create_worktree_for, CreateThreadWorktreeRequest, CreateThreadWorktreeResult,
    WorktreeAuthority, WorktreeGrant,
};

use crate::cli::LaunchState;

impl WorktreeAuthority for LaunchState {
    fn worktree_project_root(&self, project_id: &str) -> Result<PathBuf, String> {
        self.project_root(project_id)
    }

    fn approve_created_worktree(
        &self,
        project_id: &str,
        root: &Path,
    ) -> Result<WorktreeGrant, String> {
        self.approve_worktree(project_id, root)
    }
}

#[tauri::command]
pub fn create_thread_worktree(
    launch: tauri::State<'_, LaunchState>,
    request: CreateThreadWorktreeRequest,
) -> CreateThreadWorktreeResult {
    create_worktree_for(launch.inner(), request)
}
