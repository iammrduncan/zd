#![cfg(unix)]

use std::fs;
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use zd_lib::supervisor::{Supervisor, SupervisorLaunch, SupervisorPhase};
use zd_server::{
    WrapperReadiness, MAX_WRAPPER_FRAME_BYTES, PROTOCOL_VERSION, WRAPPER_PROTOCOL_VERSION,
};

struct SupervisorGuard<'a>(&'a Supervisor);

impl Drop for SupervisorGuard<'_> {
    fn drop(&mut self) {
        let _ = self.0.shutdown();
    }
}

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time moved backwards")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("zd-supervisor-{stamp}"));
        fs::create_dir_all(&root).expect("create supervisor scratch root");
        Self(root)
    }

    fn join(&self, path: impl AsRef<Path>) -> PathBuf {
        self.0.join(path)
    }

    fn fake_launch(&self, name: &str, body: &str) -> (SupervisorLaunch, PathBuf) {
        let executable = self.join(format!("{name}.sh"));
        let process_id = self.join(format!("{name}.pid"));
        fs::write(&executable, format!("#!/bin/sh\nset -eu\n{body}\n"))
            .expect("write fake wrapper child");
        let mut permissions = fs::metadata(&executable)
            .expect("inspect fake wrapper child")
            .permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&executable, permissions).expect("make fake wrapper child executable");
        (
            SupervisorLaunch::new(executable, None)
                .with_environment("ZD_TEST_PID_FILE", process_id.as_os_str()),
            process_id,
        )
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn real_launch(scratch: &Scratch) -> SupervisorLaunch {
    let project = scratch.join("project");
    let assets = scratch.join("assets");
    let state = scratch.join("state");
    fs::create_dir_all(&project).expect("create supervisor project");
    fs::create_dir_all(&assets).expect("create supervisor assets");
    fs::create_dir_all(&state).expect("create supervisor state");
    fs::write(
        assets.join("index.html"),
        "<!doctype html><title>supervisor</title>",
    )
    .expect("write supervisor index");
    SupervisorLaunch::new(env!("CARGO_BIN_EXE_zd"), Some(project))
        .with_environment("ZD_TEST_ASSETS_DIR", assets.as_os_str())
        .with_environment("ZD_TEST_STATE_DIR", state.as_os_str())
}

fn readiness_line() -> String {
    serde_json::to_string(&WrapperReadiness {
        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        host_protocol_version: PROTOCOL_VERSION,
        origin: "http://127.0.0.1:4100".to_string(),
        session_epoch: "YWFhYWFhYWFhYWFhYWFhYQ".to_string(),
        secret: "a".repeat(43),
    })
    .expect("encode fake wrapper readiness")
}

fn process_id(path: &Path) -> u32 {
    fs::read_to_string(path)
        .expect("read fake wrapper child process identity")
        .trim()
        .parse()
        .expect("parse fake wrapper child process identity")
}

fn process_exists(process_id: u32) -> bool {
    Command::new("kill")
        .args(["-0", &process_id.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .is_ok_and(|status| status.success())
}

fn kill_process(process_id: u32) {
    let status = Command::new("kill")
        .args(["-KILL", &process_id.to_string()])
        .status()
        .expect("signal fake wrapper child");
    assert!(status.success(), "fake wrapper child was not running");
}

#[test]
fn one_supervised_real_child_bootstraps_once_rearms_and_reaps() {
    let scratch = Scratch::new();
    let supervisor = Supervisor::default();
    let _guard = SupervisorGuard(&supervisor);
    let ready_observer = supervisor.clone();
    let waited_ready = std::thread::spawn(move || ready_observer.wait_for_ready());

    let ready = supervisor
        .start(real_launch(&scratch))
        .expect("start supervisor");

    assert_eq!(ready.phase, SupervisorPhase::Ready);
    assert_eq!(waited_ready.join().unwrap(), ready);
    assert_eq!(ready.generation, 1);
    let origin = ready.origin.expect("ready origin");
    let served_url = tauri::Url::parse(&format!("{origin}/")).expect("served URL");
    assert!(origin.starts_with("http://127.0.0.1:"));
    assert!(TcpStream::connect(origin.trim_start_matches("http://")).is_ok());
    assert!(supervisor.authorizes_webview("main", &served_url));
    assert!(!supervisor.authorizes_webview("other", &served_url));
    assert!(
        !supervisor.authorizes_webview("main", &tauri::Url::parse("http://127.0.0.1:9/").unwrap())
    );
    let first = supervisor
        .take_bootstrap_for("main", &served_url)
        .expect("take first bootstrap");
    assert_eq!(first.origin, origin);
    assert_eq!(first.session_epoch, ready.session_epoch.unwrap());
    assert_eq!(first.secret.len(), 43);
    assert!(supervisor.take_bootstrap_for("main", &served_url).is_err());
    assert!(supervisor.take_bootstrap_for("other", &served_url).is_err());
    assert!(supervisor.rearm_bootstrap_for("main", &served_url));
    assert_eq!(
        supervisor
            .take_bootstrap_for("main", &served_url)
            .expect("take reload bootstrap"),
        first
    );
    assert!(supervisor
        .recover_project_path("not a project id".to_string(), Path::new("/tmp"))
        .is_err());
    assert!(supervisor
        .approve_project_path(&PathBuf::from(format!("/{}", "x".repeat(9 * 1024))))
        .is_err());
    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Ready);
    let selected_root = scratch.join("selected-project");
    fs::create_dir_all(&selected_root).expect("create selected project");
    let selected = supervisor
        .approve_project_path(&selected_root)
        .expect("approve selected project in child");
    let selected_file = selected_root.join("selected.md");
    fs::write(&selected_file, "selected\n").expect("write selected file");
    let intent = supervisor
        .approve_open_path(&selected_file)
        .expect("approve selected file in child");
    assert_eq!(intent.project.as_ref(), Some(&selected));
    assert_eq!(intent.relative_path.as_deref(), Some("selected.md"));
    assert!(supervisor.start(real_launch(&scratch)).is_err());

    let observer = supervisor.clone();
    let terminal = std::thread::spawn(move || observer.wait_for_terminal(1));
    supervisor.shutdown().expect("stop supervised child");

    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Stopped);
    assert_eq!(terminal.join().unwrap().phase, SupervisorPhase::Stopped);
    assert!(!supervisor.authorizes_webview("main", &served_url));
    assert!(TcpStream::connect(origin.trim_start_matches("http://")).is_err());
}

#[test]
fn an_early_child_exit_fails_without_waiting_for_the_startup_deadline() {
    let supervisor = Supervisor::default();
    let _guard = SupervisorGuard(&supervisor);
    let started = Instant::now();

    let problem = supervisor
        .start(SupervisorLaunch::new("/bin/true", None))
        .expect_err("early exit must fail startup");

    assert!(started.elapsed() < Duration::from_secs(2));
    assert!(problem.contains("before readiness"));
    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Failed);
}

#[test]
fn malformed_partial_and_oversized_readiness_fail_and_reap_the_child() {
    let scratch = Scratch::new();
    let cases = [
        ("malformed", "not-json\n".to_string()),
        ("partial", "{".to_string()),
        (
            "oversized",
            format!("{}\n", "x".repeat(MAX_WRAPPER_FRAME_BYTES + 1)),
        ),
    ];

    for (name, output) in cases {
        let body = format!(
            "IFS= read -r startup\nprintf '%s\\n' \"$$\" > \"$ZD_TEST_PID_FILE\"\nprintf '%s' '{}'",
            output.replace('\\', "\\\\").replace('\'', "'\\''")
        );
        let (launch, process_file) = scratch.fake_launch(name, &body);
        let supervisor = Supervisor::default();

        let problem = supervisor
            .start(launch)
            .expect_err("invalid readiness must fail startup");

        assert!(
            problem.contains("invalid") || problem.contains("closed"),
            "unexpected {name} readiness problem: {problem}"
        );
        assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Failed);
        assert!(!process_exists(process_id(&process_file)));
    }
}

#[test]
fn silent_startup_enforces_the_ten_second_deadline_and_reaps_the_child() {
    let scratch = Scratch::new();
    let (launch, process_file) = scratch.fake_launch(
        "silent",
        "IFS= read -r startup\nprintf '%s\\n' \"$$\" > \"$ZD_TEST_PID_FILE\"\nwhile IFS= read -r control; do :; done",
    );
    let supervisor = Supervisor::default();
    let started = Instant::now();

    let problem = supervisor
        .start(launch)
        .expect_err("silent child must time out");

    let elapsed = started.elapsed();
    assert!(
        elapsed >= Duration::from_millis(9_500),
        "elapsed: {elapsed:?}"
    );
    assert!(elapsed < Duration::from_secs(12), "elapsed: {elapsed:?}");
    assert!(problem.contains("readiness"));
    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Failed);
    assert!(!process_exists(process_id(&process_file)));
}

#[test]
fn stderr_and_stdout_bursts_larger_than_pipe_capacity_do_not_deadlock() {
    let scratch = Scratch::new();
    let readiness = readiness_line();
    let body = format!(
        "IFS= read -r startup\nprintf '%s\\n' \"$$\" > \"$ZD_TEST_PID_FILE\"\ni=0\nwhile [ \"$i\" -lt 4096 ]; do\n  printf '%s\\n' 'bounded fake diagnostic output for pipe drainage' >&2\n  i=$((i + 1))\ndone\nprintf '%s\\n' '{readiness}'\nsleep 1\ni=0\nwhile [ \"$i\" -lt 4096 ]; do\n  printf '%s\\n' '{readiness}'\n  i=$((i + 1))\ndone\nwhile IFS= read -r control; do :; done"
    );
    let (launch, process_file) = scratch.fake_launch("pipe-bursts", &body);
    let supervisor = Supervisor::default();
    let ready = supervisor.start(launch).expect("drain startup pipe burst");
    let started = Instant::now();

    let terminal = supervisor.wait_for_terminal(ready.generation);

    assert!(started.elapsed() < Duration::from_secs(4));
    assert_eq!(terminal.phase, SupervisorPhase::Exited);
    assert!(terminal
        .problem
        .as_deref()
        .is_some_and(|problem| problem.contains("unexpected output")));
    assert!(!process_exists(process_id(&process_file)));
}

#[test]
fn a_ready_child_crash_is_reaped_and_does_not_restart() {
    let scratch = Scratch::new();
    let starts = scratch.join("crash.starts");
    let readiness = readiness_line();
    let body = format!(
        "IFS= read -r startup\nprintf '%s\\n' \"$$\" > \"$ZD_TEST_PID_FILE\"\nprintf '%s\\n' started >> '{}'\nprintf '%s\\n' '{readiness}'\nwhile IFS= read -r control; do :; done",
        starts.to_string_lossy()
    );
    let (launch, process_file) = scratch.fake_launch("crash", &body);
    let supervisor = Supervisor::default();
    let ready = supervisor.start(launch).expect("start crash fixture");
    let child_process_id = process_id(&process_file);

    kill_process(child_process_id);
    let terminal = supervisor.wait_for_terminal(ready.generation);
    std::thread::sleep(Duration::from_millis(200));

    assert_eq!(terminal.phase, SupervisorPhase::Exited);
    assert_eq!(supervisor.snapshot().generation, ready.generation);
    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Exited);
    assert_eq!(fs::read_to_string(starts).unwrap(), "started\n");
    assert!(!process_exists(child_process_id));
}

#[test]
fn an_unresponsive_child_is_force_stopped_after_five_seconds() {
    let scratch = Scratch::new();
    let readiness = readiness_line();
    let body = format!(
        "IFS= read -r startup\nprintf '%s\\n' \"$$\" > \"$ZD_TEST_PID_FILE\"\nprintf '%s\\n' '{readiness}'\nwhile IFS= read -r control; do :; done"
    );
    let (launch, process_file) = scratch.fake_launch("unresponsive", &body);
    let supervisor = Supervisor::default();
    supervisor
        .start(launch)
        .expect("start unresponsive fixture");
    let child_process_id = process_id(&process_file);
    let started = Instant::now();

    supervisor.shutdown().expect("force stop wrapper child");

    let elapsed = started.elapsed();
    assert!(
        elapsed >= Duration::from_millis(4_500),
        "elapsed: {elapsed:?}"
    );
    assert!(elapsed < Duration::from_secs(7), "elapsed: {elapsed:?}");
    assert_eq!(supervisor.snapshot().phase, SupervisorPhase::Stopped);
    assert!(!process_exists(child_process_id));
}
