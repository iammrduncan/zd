use crate::cli::LaunchState;

pub use zd_host::{FileTreeMutationRequest, FileTreeMutationResult};

#[tauri::command]
pub fn mutate_file_tree(
    launch: tauri::State<'_, LaunchState>,
    request: FileTreeMutationRequest,
) -> FileTreeMutationResult {
    let (project_id, worktree_id) = request.scope();
    let root = match launch.root(project_id, worktree_id) {
        Ok(root) => root,
        Err(_) => {
            return FileTreeMutationResult::Refused {
                reason: "File authority is unavailable.".to_string(),
            }
        }
    };
    zd_host::mutate_file_tree_at(&root, request)
}
