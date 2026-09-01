use std::sync::Arc;

use zd_host::file_tree_watch::{
    FileTreeWatchRequest, FileTreeWatchSignal, FileTreeWatchState, MAX_FILE_TREE_WATCHES,
};

#[test]
fn host_watch_contract_is_path_free_and_bounded() {
    assert_eq!(MAX_FILE_TREE_WATCHES, 32);
    let request = FileTreeWatchRequest {
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
        watch_id: "watch-a".to_string(),
    };
    let state = FileTreeWatchState::default();
    state
        .start(std::path::Path::new("."), &request, Arc::new(|_| {}))
        .unwrap();
    assert_eq!(state.snapshot().len(), 1);
    state.stop(&request);

    let widened = serde_json::json!({
        "projectId": "project-a",
        "worktreeId": "worktree-a",
        "watchId": "watch-a",
        "path": "/outside"
    });
    assert!(serde_json::from_value::<FileTreeWatchRequest>(widened).is_err());

    let signal = FileTreeWatchSignal::Changed {
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
        watch_id: "watch-a".to_string(),
    };
    let value = serde_json::to_value(signal).unwrap();
    assert!(value.get("path").is_none());
}
