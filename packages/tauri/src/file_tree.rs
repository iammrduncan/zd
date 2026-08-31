use crate::cli::LaunchState;

pub use zd_host::{
    snapshot_in, FileTreeEntry, FileTreeEntryKind, FileTreeRequest, FileTreeResult, TreeLimits,
};

#[tauri::command]
pub fn file_tree_snapshot(
    launch: tauri::State<'_, LaunchState>,
    request: FileTreeRequest,
) -> FileTreeResult {
    let root = match launch.root(&request.project_id, &request.worktree_id) {
        Ok(root) => root,
        Err(_) => {
            return FileTreeResult::Unavailable {
                project_id: request.project_id,
                worktree_id: request.worktree_id,
                problem: "File-tree authority is unavailable".to_string(),
            };
        }
    };
    snapshot_in(&root, &request, TreeLimits::default())
}
