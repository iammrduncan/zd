#![cfg(unix)]

use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

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

fn drain_stderr(child: &mut Child) {
    let mut stderr = child.stderr.take().expect("capture served stderr");
    std::thread::spawn(move || {
        let mut buffer = [0_u8; 4 * 1024];
        while stderr.read(&mut buffer).is_ok_and(|read| read > 0) {}
    });
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
    drain_stderr(&mut child.0);
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
fn invalid_serve_arguments_exit_before_either_runtime_starts() {
    let output = Command::new(env!("CARGO_BIN_EXE_zd"))
        .args(["serve", "one", "two"])
        .output()
        .expect("run invalid CLI");

    assert!(!output.status.success());
    assert!(output.stdout.is_empty());
    assert!(String::from_utf8_lossy(&output.stderr).contains("accepts exactly one folder"));
}
