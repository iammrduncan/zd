use std::path::PathBuf;

use zd_host::terminal::{
    TerminalAvailability, TerminalErrorKind, TerminalScope, TerminalSessions, TerminalStartRequest,
    TerminalViewport, MAX_TERMINAL_SESSIONS,
};
use zd_host::HostService;

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-host-terminal-service-{stamp}"));
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
fn host_terminal_contract_is_closed_and_bounded() {
    assert_eq!(MAX_TERMINAL_SESSIONS, 32);
    assert_eq!(
        TerminalSessions::with_output_limit(0).err().unwrap().kind,
        TerminalErrorKind::InvalidInput
    );
    assert!(TerminalScope::from_approved_worktree("", "worktree-a", ".").is_err());

    let widened = serde_json::json!({
        "projectId": "project-a",
        "worktreeId": "worktree-a",
        "terminalId": "terminal-a",
        "viewport": { "rows": 24, "columns": 80, "pixelWidth": 0, "pixelHeight": 0 },
        "command": "arbitrary",
        "cwd": "/outside",
        "environment": { "TOKEN": "secret" }
    });
    assert!(serde_json::from_value::<TerminalStartRequest>(widened).is_err());
    assert!(TerminalViewport::new(24, 80, 0, 0).is_ok());
}

#[test]
fn host_service_runtime_shutdown_preserves_terminals_until_explicit_disposal() {
    let project = Scratch::new();
    let host = HostService::open_project(&project.0).unwrap();
    let launch = host.launch_request();
    let request = TerminalStartRequest {
        project_id: launch.project.unwrap().id,
        worktree_id: launch.worktree_id.unwrap(),
        terminal_id: "terminal-host-test".to_string(),
        viewport: TerminalViewport::new(24, 80, 0, 0).unwrap(),
    };

    let session = host.start_terminal(request.clone(), None, None).unwrap();
    assert_eq!(session.session_id, "terminal-host-test");
    assert_eq!(
        host.reattach_terminal(request).unwrap(),
        Some(session.clone())
    );
    let snapshot = host.terminal_snapshot().unwrap();
    assert_eq!(snapshot.len(), 1);
    assert_eq!(snapshot[0].session, session);
    assert_eq!(snapshot[0].availability, TerminalAvailability::Running);
    let wire = serde_json::to_value(&snapshot).unwrap();
    assert!(wire.to_string().contains("retainedFrom"));
    assert!(wire.to_string().contains("nextOffset"));
    for forbidden in ["bytes", "command", "cwd", "environment", "processId"] {
        assert!(
            !wire.to_string().contains(forbidden),
            "snapshot exposed {forbidden}"
        );
    }

    host.shutdown_runtime().unwrap();
    assert_eq!(host.terminal_snapshot().unwrap().len(), 1);
    host.dispose_terminal(&session).unwrap();
    assert!(host.terminal_snapshot().unwrap().is_empty());
}
