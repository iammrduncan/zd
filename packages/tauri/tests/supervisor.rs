#![cfg(unix)]

use std::fs;
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use zd_lib::supervisor::{Supervisor, SupervisorLaunch, SupervisorPhase};

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

#[test]
fn one_supervised_real_child_bootstraps_once_rearms_and_reaps() {
    let scratch = Scratch::new();
    let supervisor = Supervisor::default();
    let _guard = SupervisorGuard(&supervisor);

    let ready = supervisor
        .start(real_launch(&scratch))
        .expect("start supervisor");

    assert_eq!(ready.phase, SupervisorPhase::Ready);
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
