use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use zd_host::terminal::{TerminalStartRequest, TerminalViewport};
use zd_host::HostService;
use zd_server::{
    HostEvent, ReplayDecision, SessionRuntime, CONTROLLER_DISCONNECT_GRACE,
    MAX_EVENT_JOURNAL_BYTES, MAX_EVENT_JOURNAL_EVENTS,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-server-session-runtime-{stamp}"));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn host_with_terminal() -> (Scratch, Arc<HostService>) {
    let project = Scratch::new();
    let host = Arc::new(HostService::open_project(&project.0).unwrap());
    let launch = host.launch_request();
    host.start_terminal(
        TerminalStartRequest {
            project_id: launch.project.unwrap().id,
            worktree_id: launch.worktree_id.unwrap(),
            terminal_id: "terminal-session-runtime".to_string(),
            viewport: TerminalViewport::new(24, 80, 0, 0).unwrap(),
        },
        None,
        None,
    )
    .unwrap();
    (project, host)
}

#[test]
fn events_are_closed_versioned_ordered_and_replayable() {
    let runtime = SessionRuntime::new("epoch-a");
    let first = runtime.publish(HostEvent::FileTreeChanged {
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
        watch_id: "watch-a".to_string(),
    });
    let second = runtime.publish(HostEvent::TerminalOutputReady {
        session_id: "session-a".to_string(),
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
    });

    let wire = serde_json::to_value(&first).unwrap();
    assert_eq!(wire["protocolVersion"], 1);
    assert_eq!(wire["type"], "event");
    assert_eq!(wire["sessionEpoch"], "epoch-a");
    assert_eq!(wire["sequence"], 1);
    assert_eq!(wire["event"], "fileTree.changed");
    assert_eq!(
        wire["payload"],
        serde_json::json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "watchId": "watch-a",
        })
    );
    assert_eq!(second.sequence(), 2);

    let replay = runtime.replay("epoch-a", 0);
    let ReplayDecision::Replay(events) = replay else {
        panic!("the complete retained suffix is replayable");
    };
    assert_eq!(
        events
            .iter()
            .map(|event| event.sequence())
            .collect::<Vec<_>>(),
        vec![1, 2]
    );
    assert!(matches!(
        runtime.replay("old-epoch", 0),
        ReplayDecision::ResyncRequired
    ));
    assert!(matches!(
        runtime.replay("epoch-a", 3),
        ReplayDecision::ResyncRequired
    ));
}

#[test]
fn journal_enforces_both_bounds_and_never_returns_a_partial_suffix() {
    let runtime = SessionRuntime::new("epoch-b");
    for sequence in 0..(MAX_EVENT_JOURNAL_EVENTS + 200) {
        runtime.publish(HostEvent::FileTreeChanged {
            project_id: format!("project-{sequence:04}"),
            worktree_id: "worktree-a".to_string(),
            watch_id: "x".repeat(96),
        });
    }

    let usage = runtime.journal_usage();
    assert!(usage.events <= MAX_EVENT_JOURNAL_EVENTS);
    assert!(usage.bytes <= MAX_EVENT_JOURNAL_BYTES);
    assert!(matches!(
        runtime.replay("epoch-b", 0),
        ReplayDecision::ResyncRequired
    ));
    let after = runtime.current_sequence() - 1;
    let ReplayDecision::Replay(events) = runtime.replay("epoch-b", after) else {
        panic!("the last retained event remains replayable");
    };
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].sequence(), runtime.current_sequence());
}

#[tokio::test(start_paused = true)]
async fn reconnect_cancels_grace_while_expiry_releases_runtime_resources() {
    assert_eq!(CONTROLLER_DISCONNECT_GRACE, Duration::from_secs(30));
    let (_project, host) = host_with_terminal();
    let runtime = Arc::new(SessionRuntime::new("epoch-c"));
    let mut events = runtime.subscribe();

    assert!(runtime.claim_controller());
    assert!(!runtime.claim_controller());
    runtime.controller_disconnected(Arc::clone(&host));
    tokio::time::advance(Duration::from_secs(29)).await;
    assert!(runtime.claim_controller());
    tokio::time::advance(Duration::from_secs(2)).await;
    assert_eq!(host.terminal_snapshot().unwrap().len(), 1);
    assert!(
        tokio::time::timeout(Duration::from_millis(1), events.recv())
            .await
            .is_err()
    );

    runtime.controller_disconnected(Arc::clone(&host));
    tokio::time::advance(Duration::from_secs(31)).await;
    let event = tokio::time::timeout(Duration::from_secs(1), events.recv())
        .await
        .expect("grace expiry emits a bounded resync marker")
        .unwrap();
    assert_eq!(
        serde_json::to_value(event).unwrap()["event"],
        "session.resyncRequired"
    );
    assert!(host.terminal_snapshot().unwrap().is_empty());
    let snapshot = runtime.authoritative_snapshot(&host).unwrap();
    assert_eq!(snapshot.resource_status, "lost");
    assert_eq!(snapshot.terminals.len(), 1);
    assert_eq!(
        serde_json::to_value(snapshot).unwrap()["terminals"][0]["availability"],
        "unavailable"
    );
}
