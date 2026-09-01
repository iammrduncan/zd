use std::path::PathBuf;
use std::sync::Arc;

use zd_host::file_tree_watch::{
    FileTreeWatchRequest, FileTreeWatchSignal, FileTreeWatchState, MAX_FILE_TREE_WATCHES,
};
use zd_host::HostService;

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-host-watch-service-{stamp}"));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

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

#[test]
fn host_service_resolves_watch_scopes_and_owns_shutdown() {
    let project = Scratch::new();
    let host = HostService::open_project(&project.0).unwrap();
    let launch = host.launch_request();
    let request = FileTreeWatchRequest {
        project_id: launch.project.unwrap().id,
        worktree_id: launch.worktree_id.unwrap(),
        watch_id: "watch-service".to_string(),
    };

    host.start_file_tree_watch(&request, Arc::new(|_| {}))
        .unwrap();
    assert_eq!(host.file_tree_watch_snapshot().len(), 1);

    let mut outside = request.clone();
    outside.project_id = "project-not-approved".to_string();
    assert!(host
        .start_file_tree_watch(&outside, Arc::new(|_| {}))
        .is_err());

    host.shutdown_runtime().unwrap();
    assert!(host.file_tree_watch_snapshot().is_empty());
}
