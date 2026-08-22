#[path = "../src/terminal/mod.rs"]
mod terminal;

use std::path::{Path, PathBuf};
#[cfg(any(unix, windows))]
use std::process::Command;
use std::sync::{mpsc, Arc};
use std::thread;
use std::time::{Duration, Instant};

use terminal::{
    TerminalErrorKind, TerminalExitReason, TerminalScope, TerminalSessionHandle, TerminalSessions,
    TerminalStartRequest, TerminalViewport,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-terminal-{name}-{stamp}"));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn scope(scratch: &Scratch) -> TerminalScope {
    TerminalScope::from_approved_worktree("project-a", "worktree-a", scratch.path()).unwrap()
}

fn viewport(rows: u16, columns: u16) -> TerminalViewport {
    TerminalViewport::new(rows, columns, 0, 0).unwrap()
}

fn wait_for_output(
    sessions: &mut TerminalSessions,
    handle: &TerminalSessionHandle,
    needle: &[u8],
) -> Vec<u8> {
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut output = Vec::new();
    while Instant::now() < deadline {
        let batch = sessions.read(handle).unwrap();
        output.extend_from_slice(&batch.bytes);
        if output.windows(needle.len()).any(|window| window == needle) {
            return output;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!(
        "terminal did not emit {:?}; output was {:?}",
        String::from_utf8_lossy(needle),
        String::from_utf8_lossy(&output)
    );
}

fn wait_for_exit(
    sessions: &mut TerminalSessions,
    handle: &TerminalSessionHandle,
) -> terminal::TerminalExitStatus {
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if let Some(status) = sessions.poll_exit(handle).unwrap() {
            return status;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!("terminal did not exit before the test deadline");
}

#[test]
fn structured_start_wire_shape_cannot_supply_native_process_authority() {
    let request = TerminalStartRequest {
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
        viewport: viewport(24, 80),
    };

    assert_eq!(
        serde_json::to_value(request).unwrap(),
        serde_json::json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "viewport": {
                "rows": 24,
                "columns": 80,
                "pixelWidth": 0,
                "pixelHeight": 0
            }
        })
    );
    assert!(
        serde_json::from_value::<TerminalStartRequest>(serde_json::json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "viewport": { "rows": 24, "columns": 80, "pixelWidth": 0, "pixelHeight": 0 },
            "cwd": "/outside",
            "command": "arbitrary",
            "environment": { "TOKEN": "secret" }
        }))
        .is_err()
    );
}

#[test]
fn one_pty_starts_emits_accepts_input_resizes_and_exits() {
    let scratch = Scratch::new("lifecycle");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();
    let script = concat!(
        "printf '__ZD_CWD__%s\\n' \"$PWD\"; ",
        "IFS= read -r line; ",
        "stty size; ",
        "printf '__ZD_INPUT__%s\\n' \"$line\"; ",
        "exit 7"
    );
    let handle = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "/bin/sh",
            &["-c", script],
        )
        .unwrap();

    let initial = wait_for_output(&mut sessions, &handle, b"__ZD_CWD__");
    assert!(String::from_utf8_lossy(&initial).contains(&scratch.path().to_string_lossy()[..]));

    sessions.resize(&handle, viewport(37, 101)).unwrap();
    sessions.write(&handle, "hello 👩🏽‍💻\n".as_bytes()).unwrap();

    let status = wait_for_exit(&mut sessions, &handle);
    let final_output = wait_for_output(&mut sessions, &handle, b"__ZD_INPUT__");
    let rendered = String::from_utf8_lossy(&final_output);

    assert_eq!(status.reason, TerminalExitReason::Exited);
    assert_eq!(status.code, Some(7));
    assert!(rendered.contains("37 101"), "output was {rendered:?}");
    assert!(rendered.contains("hello 👩🏽‍💻"), "output was {rendered:?}");
}

#[test]
fn output_arrival_signals_the_exact_session_without_polling() {
    let scratch = Scratch::new("output-signal");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();
    let (sender, signals) = mpsc::sync_channel(4);
    let handle = sessions
        .start_shell_with_output_signal(
            scope(&scratch),
            viewport(24, 80),
            Arc::new(move |session| {
                let _ = sender.try_send(session);
            }),
        )
        .unwrap();
    sessions
        .write(&handle, b"printf '__ZD_SIGNAL__'\n")
        .unwrap();

    let deadline = Instant::now() + Duration::from_secs(5);
    let mut output = Vec::new();
    while !output.windows(13).any(|bytes| bytes == b"__ZD_SIGNAL__") {
        let signaled = signals
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .expect("the PTY reader signals output arrival");
        assert_eq!(signaled, handle);
        output.extend(sessions.read(&handle).unwrap().bytes);
    }

    sessions.dispose(&handle).unwrap();
}

#[test]
fn structured_start_launches_and_disposes_the_user_shell() {
    let scratch = Scratch::new("user-shell");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();
    let handle = sessions
        .start_shell(scope(&scratch), viewport(24, 80))
        .unwrap();

    sessions.write(&handle, b"exit 0\n").unwrap();
    let status = wait_for_exit(&mut sessions, &handle);
    sessions.dispose(&handle).unwrap();

    assert_eq!(status.reason, TerminalExitReason::Exited);
    assert_eq!(status.code, Some(0));
    assert!(!sessions.contains(&handle));
}

#[test]
fn pending_output_is_bounded_and_reports_the_released_prefix() {
    let scratch = Scratch::new("bounded-output");
    let mut sessions = TerminalSessions::with_output_limit(32).unwrap();
    let handle = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "/bin/sh",
            &["-c", "printf 'abcdefghijklmnopqrstuvwxyz0123456789'"],
        )
        .unwrap();

    let status = wait_for_exit(&mut sessions, &handle);
    let batch = sessions.read(&handle).unwrap();

    assert_eq!(status.reason, TerminalExitReason::Exited);
    assert_eq!(batch.bytes.len(), 32);
    assert!(batch.dropped_before >= 4);
    assert_eq!(batch.offset, batch.dropped_before);
    assert!(batch.bytes.ends_with(b"456789"));
}

#[cfg(unix)]
#[test]
fn disposal_terminates_the_session_process_group_and_releases_the_handle() {
    let scratch = Scratch::new("cleanup");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();
    let script = "sleep 30 & child=$!; printf '__ZD_CHILD__%s\\n' \"$child\"; wait";
    let handle = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "/bin/sh",
            &["-c", script],
        )
        .unwrap();
    let output = wait_for_output(&mut sessions, &handle, b"__ZD_CHILD__");
    let child_pid = String::from_utf8_lossy(&output)
        .split("__ZD_CHILD__")
        .nth(1)
        .and_then(|suffix| suffix.lines().next())
        .map(str::trim)
        .and_then(|pid| pid.parse::<u32>().ok())
        .expect("the probe reports its descendant pid");

    let status = sessions.terminate(&handle).unwrap();
    sessions.dispose(&handle).unwrap();

    assert_eq!(status.reason, TerminalExitReason::Terminated);
    assert!(!sessions.contains(&handle));
    assert!(
        !Command::new("/bin/kill")
            .args(["-0", &child_pid.to_string()])
            .output()
            .expect("kill is available on the native test host")
            .status
            .success(),
        "descendant process {child_pid} survived terminal disposal"
    );
}

#[cfg(windows)]
#[test]
fn disposal_terminates_the_session_job_and_its_descendant() {
    let scratch = Scratch::new("windows-cleanup");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();
    let script = concat!(
        "$null = Read-Host; ",
        "$child = Start-Process -PassThru -WindowStyle Hidden powershell.exe ",
        "-ArgumentList '-NoLogo','-NoProfile','-Command','Start-Sleep -Seconds 30'; ",
        "Write-Output \"__ZD_CHILD__$($child.Id)\"; ",
        "Wait-Process -Id $child.Id"
    );
    let handle = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "powershell.exe",
            &["-NoLogo", "-NoProfile", "-Command", script],
        )
        .unwrap();
    sessions.write(&handle, b"ready\r\n").unwrap();
    let output = wait_for_output(&mut sessions, &handle, b"__ZD_CHILD__");
    let child_pid = String::from_utf8_lossy(&output)
        .split("__ZD_CHILD__")
        .nth(1)
        .and_then(|suffix| suffix.lines().next())
        .map(str::trim)
        .and_then(|pid| pid.parse::<u32>().ok())
        .expect("the probe reports its descendant pid");

    let status = sessions.terminate(&handle).unwrap();
    sessions.dispose(&handle).unwrap();

    assert_eq!(status.reason, TerminalExitReason::Terminated);
    assert!(!sessions.contains(&handle));
    let tasklist = Command::new("tasklist.exe")
        .args(["/FI", &format!("PID eq {child_pid}"), "/FO", "CSV", "/NH"])
        .output()
        .expect("tasklist is available on the native Windows test host");
    assert!(
        !String::from_utf8_lossy(&tasklist.stdout).contains(&child_pid.to_string()),
        "descendant process {child_pid} survived terminal disposal"
    );
}

#[test]
fn approved_scope_and_viewport_validation_fail_before_a_process_starts() {
    let scratch = Scratch::new("validation");
    let file = scratch.path().join("not-a-directory");
    std::fs::write(&file, "content").unwrap();

    assert!(TerminalScope::from_approved_worktree("", "worktree-a", scratch.path()).is_err());
    assert!(TerminalScope::from_approved_worktree("project-a", "", scratch.path()).is_err());
    assert!(TerminalScope::from_approved_worktree("project-a", "worktree-a", &file).is_err());
    assert!(TerminalViewport::new(0, 80, 0, 0).is_err());
    assert!(TerminalViewport::new(24, 0, 0, 0).is_err());
}

#[test]
fn a_spawn_failure_releases_the_pty_and_leaves_the_manager_usable() {
    let scratch = Scratch::new("spawn-failure");
    let mut sessions = TerminalSessions::with_output_limit(4 * 1024).unwrap();

    let error = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "/definitely-not-a-zd-terminal-program",
            &[],
        )
        .unwrap_err();
    assert_eq!(error.kind, TerminalErrorKind::Spawn);

    let handle = sessions
        .start_probe(
            scope(&scratch),
            viewport(24, 80),
            "/bin/sh",
            &["-c", "exit 0"],
        )
        .unwrap();
    assert_eq!(wait_for_exit(&mut sessions, &handle).code, Some(0));
}
