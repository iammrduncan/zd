use zd_host::terminal::{
    TerminalErrorKind, TerminalScope, TerminalSessions, TerminalStartRequest, TerminalViewport,
    MAX_TERMINAL_SESSIONS,
};

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
        "viewport": { "rows": 24, "columns": 80, "pixelWidth": 0, "pixelHeight": 0 },
        "command": "arbitrary",
        "cwd": "/outside",
        "environment": { "TOKEN": "secret" }
    });
    assert!(serde_json::from_value::<TerminalStartRequest>(widened).is_err());
    assert!(TerminalViewport::new(24, 80, 0, 0).is_ok());
}
