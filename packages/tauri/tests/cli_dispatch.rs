#![cfg(unix)]

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use zd_server::{WrapperReadiness, WrapperStartup, PROTOCOL_VERSION, WRAPPER_PROTOCOL_VERSION};

struct ChildGuard(Child);

impl Drop for ChildGuard {
    fn drop(&mut self) {
        if self.0.try_wait().ok().flatten().is_none() {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time moved backwards")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("zd-cli-dispatch-{stamp}"));
        fs::create_dir_all(&root).expect("create CLI scratch root");
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

fn read_lines(child: &mut Child) -> mpsc::Receiver<String> {
    let stdout = child.stdout.take().expect("capture served stdout");
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if sender.send(line).is_err() {
                break;
            }
        }
    });
    receiver
}

fn drain_stderr(child: &mut Child) -> mpsc::Receiver<Vec<u8>> {
    let stderr = child.stderr.take().expect("capture served stderr");
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        let mut output = Vec::new();
        let _ = stderr.take(16 * 1024).read_to_end(&mut output);
        let _ = sender.send(output);
    });
    receiver
}

fn request(origin: &str, path: &str) -> String {
    let authority = origin
        .strip_prefix("http://")
        .expect("served origin uses HTTP");
    let mut stream = TcpStream::connect(authority).expect("connect to served listener");
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .expect("bound response wait");
    write!(
        stream,
        "GET {path} HTTP/1.1\r\nHost: {authority}\r\nConnection: close\r\n\r\n"
    )
    .expect("write served request");
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .expect("read served response");
    response
}

fn wait_for_exit(child: &mut Child) {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        if child.try_wait().expect("inspect served child").is_some() {
            return;
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            panic!("served child did not stop after SIGTERM");
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn wait_for_contents(path: &Path, expected: &str) {
    let deadline = Instant::now() + Duration::from_secs(2);
    loop {
        match fs::read_to_string(path) {
            Ok(contents) if contents == expected => return,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => panic!("read desktop arguments: {error}"),
        }
        assert!(
            Instant::now() < deadline,
            "desktop arguments did not finish writing"
        );
        std::thread::sleep(Duration::from_millis(10));
    }
}

#[test]
fn release_topology_has_distinct_console_and_desktop_executables() {
    let console = Path::new(env!("CARGO_BIN_EXE_zd"));
    let desktop = Path::new(env!("CARGO_BIN_EXE_zd-desktop"));

    assert_ne!(console, desktop);
    assert_eq!(
        console.file_name().and_then(|name| name.to_str()),
        Some("zd")
    );
    assert_eq!(
        desktop.file_name().and_then(|name| name.to_str()),
        Some("zd-desktop")
    );
}

#[test]
fn ordinary_zd_launches_the_desktop_role_and_returns() {
    let scratch = Scratch::new();
    let desktop = scratch.join("fake-zd-desktop");
    let record = scratch.join("desktop-arguments.txt");
    fs::write(
        &desktop,
        "#!/bin/sh\nset -eu\n: > \"$ZD_TEST_DESKTOP_RECORD\"\nsleep 0.05\nprintf '%s\\n' \"$@\" > \"$ZD_TEST_DESKTOP_RECORD\"\n",
    )
    .expect("write fake desktop executable");
    let mut permissions = fs::metadata(&desktop)
        .expect("inspect fake desktop executable")
        .permissions();
    permissions.set_mode(0o700);
    fs::set_permissions(&desktop, permissions).expect("make fake desktop executable runnable");
    let invocation = scratch.join("invocation");
    fs::create_dir_all(&invocation).expect("create invocation directory");

    let output = Command::new(env!("CARGO_BIN_EXE_zd"))
        .arg("project/notes.md")
        .current_dir(&invocation)
        .env("ZD_TEST_DESKTOP_EXECUTABLE", &desktop)
        .env("ZD_TEST_DESKTOP_RECORD", &record)
        .output()
        .expect("run console desktop launch");

    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(output.stdout.is_empty());
    assert!(output.stderr.is_empty());
    wait_for_contents(
        &record,
        &format!("{}\n", invocation.join("project/notes.md").display()),
    );
}

#[test]
fn shipped_zd_dispatches_foreground_serve_and_releases_its_listener() {
    let scratch = Scratch::new();
    let project = scratch.join("project");
    let assets = scratch.join("assets");
    let state = scratch.join("state");
    fs::create_dir_all(&project).expect("create served project");
    fs::create_dir_all(&assets).expect("create served assets");
    fs::create_dir_all(&state).expect("create served state directory");
    fs::write(
        assets.join("index.html"),
        "<!doctype html><title>fixture</title>",
    )
    .expect("write fixture index");
    fs::write(assets.join("fixture.txt"), "fixture-ready").expect("write fixture asset");

    let child = Command::new(env!("CARGO_BIN_EXE_zd"))
        .args(["serve", project.to_str().expect("UTF-8 project")])
        .args(["--bind", "127.0.0.1", "--port", "0"])
        .env("ZD_TEST_STATE_DIR", &state)
        .env("ZD_TEST_ASSETS_DIR", &assets)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start shipped serve command");
    let mut child = ChildGuard(child);
    let lines = read_lines(&mut child.0);
    let _errors = drain_stderr(&mut child.0);
    let origin = lines
        .recv_timeout(Duration::from_secs(10))
        .expect("receive served URL")
        .strip_prefix("zd serve URL: ")
        .expect("separate URL line")
        .to_string();
    let secret = lines
        .recv_timeout(Duration::from_secs(2))
        .expect("receive served secret")
        .strip_prefix("zd serve secret: ")
        .expect("separate secret line")
        .to_string();

    assert_eq!(secret.len(), 43);
    assert!(!origin.contains(&secret));
    let health = request(&origin, "/healthz");
    assert!(health.starts_with("HTTP/1.1 204"), "{health}");
    let fixture = request(&origin, "/fixture.txt");
    assert!(fixture.starts_with("HTTP/1.1 200"), "{fixture}");
    assert!(fixture.ends_with("fixture-ready"), "{fixture}");

    let status = Command::new("kill")
        .args(["-TERM", &child.0.id().to_string()])
        .status()
        .expect("send SIGTERM to served child");
    assert!(status.success());
    wait_for_exit(&mut child.0);
    assert!(TcpStream::connect(origin.trim_start_matches("http://")).is_err());
}

#[test]
fn private_wrapper_child_reports_once_and_stops_when_its_parent_channel_closes() {
    let scratch = Scratch::new();
    let project = scratch.join("project");
    let assets = scratch.join("assets");
    let state = scratch.join("state");
    fs::create_dir_all(&project).expect("create wrapper project");
    fs::create_dir_all(&assets).expect("create wrapper assets");
    fs::create_dir_all(&state).expect("create wrapper state directory");
    fs::write(
        assets.join("index.html"),
        "<!doctype html><title>wrapper</title>",
    )
    .expect("write wrapper index");

    let child = Command::new(env!("CARGO_BIN_EXE_zd"))
        .arg("__zd-wrapper-child")
        .env("ZD_TEST_STATE_DIR", &state)
        .env("ZD_TEST_ASSETS_DIR", &assets)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("start private wrapper child");
    let mut child = ChildGuard(child);
    let mut control = child.0.stdin.take().expect("capture wrapper control input");
    let lines = read_lines(&mut child.0);
    let errors = drain_stderr(&mut child.0);
    serde_json::to_writer(
        &mut control,
        &WrapperStartup {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
            application_version: env!("CARGO_PKG_VERSION").to_string(),
            launch_path: Some(project.to_string_lossy().into_owned()),
        },
    )
    .expect("write wrapper startup frame");
    control
        .write_all(b"\n")
        .expect("finish wrapper startup frame");
    control.flush().expect("flush wrapper startup frame");

    let readiness_line = lines
        .recv_timeout(Duration::from_secs(10))
        .expect("receive private wrapper readiness");
    let readiness: WrapperReadiness =
        serde_json::from_str(&readiness_line).expect("decode private wrapper readiness");
    assert_eq!(readiness.wrapper_protocol_version, WRAPPER_PROTOCOL_VERSION);
    assert_eq!(readiness.application_version, env!("CARGO_PKG_VERSION"));
    assert_eq!(readiness.host_protocol_version, PROTOCOL_VERSION);
    assert!(readiness.origin.starts_with("http://127.0.0.1:"));
    assert!(!readiness.session_epoch.is_empty());
    assert_eq!(readiness.secret.len(), 43);
    assert!(!readiness.origin.contains(&readiness.secret));
    assert!(matches!(
        lines.recv_timeout(Duration::from_millis(100)),
        Err(mpsc::RecvTimeoutError::Timeout)
    ));
    assert!(request(&readiness.origin, "/healthz").starts_with("HTTP/1.1 204"));

    #[cfg(target_os = "linux")]
    {
        let process = format!("/proc/{}/", child.0.id());
        let cmdline = fs::read(format!("{process}cmdline")).expect("read wrapper child arguments");
        let environment =
            fs::read(format!("{process}environ")).expect("read wrapper child environment");
        assert!(!cmdline
            .windows(readiness.secret.len())
            .any(|part| part == readiness.secret.as_bytes()));
        assert!(!environment
            .windows(readiness.secret.len())
            .any(|part| part == readiness.secret.as_bytes()));
    }

    drop(control);
    wait_for_exit(&mut child.0);

    assert!(TcpStream::connect(readiness.origin.trim_start_matches("http://")).is_err());
    assert!(errors
        .recv_timeout(Duration::from_secs(2))
        .expect("collect wrapper stderr")
        .is_empty());
    assert!(lines.recv_timeout(Duration::from_millis(100)).is_err());
}

#[test]
fn invalid_serve_arguments_exit_before_either_runtime_starts() {
    let output = Command::new(env!("CARGO_BIN_EXE_zd"))
        .args(["serve", "one", "two"])
        .output()
        .expect("run invalid CLI");

    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("accepts exactly one folder"));
}
