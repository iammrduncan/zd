#![allow(
    dead_code,
    reason = "each integration-test crate uses a different subset of these shared helpers"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use http::header::{HeaderName, HeaderValue, ORIGIN};
use serde_json::{json, Value};
use tokio::net::TcpStream;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::{client_async, MaybeTlsStream, WebSocketStream};
use zd_host::HostService;
use zd_server::{start, RunningServer, ServerConfig};

pub struct Scratch(PathBuf);

impl Scratch {
    pub fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-server-{name}-{stamp}"));
        std::fs::create_dir_all(&path).expect("create scratch directory");
        Self(path)
    }

    pub fn path(&self) -> &Path {
        &self.0
    }

    pub fn join(&self, relative: &str) -> PathBuf {
        self.0.join(relative)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

pub struct TestServer {
    pub project: Scratch,
    pub state: Scratch,
    pub assets: Scratch,
    pub running: RunningServer,
}

impl TestServer {
    pub async fn start(name: &str) -> Self {
        let project = Scratch::new(&format!("{name}-project"));
        let state = Scratch::new(&format!("{name}-state"));
        let assets = Scratch::new(&format!("{name}-assets"));
        std::fs::create_dir_all(assets.join("assets")).expect("create assets directory");
        std::fs::write(
            assets.join("index.html"),
            "<!doctype html><main id=\"zd-workbench\">served app</main>",
        )
        .expect("write index asset");
        std::fs::write(
            assets.join("assets/app.123.js"),
            "export const app = 'zd';\n",
        )
        .expect("write JavaScript asset");
        std::fs::write(project.join("notes.md"), "hello from a real host\n")
            .expect("write project fixture");
        git(
            project.path(),
            &["init", "--quiet", "--initial-branch=main"],
        );
        git(project.path(), &["config", "user.name", "Fixture Author"]);
        git(
            project.path(),
            &["config", "user.email", "fixture@example.invalid"],
        );
        git(project.path(), &["add", "notes.md"]);
        git(
            project.path(),
            &["commit", "--quiet", "--message", "fixture base"],
        );
        let host = Arc::new(
            HostService::open_project_with_state(project.path(), state.path())
                .expect("approve persisted project"),
        );
        let running = start(host, ServerConfig::new(assets.path().to_path_buf(), 0))
            .await
            .expect("start served host");
        Self {
            project,
            state,
            assets,
            running,
        }
    }

    pub fn authority(&self) -> String {
        self.running.address().to_string()
    }

    pub fn http_url(&self, path: &str) -> String {
        format!("http://{}{}", self.authority(), path)
    }

    pub async fn shutdown(self) {
        self.running.shutdown().await.expect("stop served host");
    }
}

pub fn git(root: &Path, arguments: &[&str]) -> String {
    let output = Command::new("git")
        .args(arguments)
        .current_dir(root)
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_TERMINAL_PROMPT", "0")
        .output()
        .expect("run fixture Git");
    assert!(
        output.status.success(),
        "git {arguments:?} failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8(output.stdout)
        .expect("fixture Git output is UTF-8")
        .trim()
        .to_string()
}

pub type Socket = WebSocketStream<MaybeTlsStream<TcpStream>>;

pub async fn connect(
    server: &TestServer,
    request_authority: &str,
    origin: Option<&str>,
    headers: &[(&str, &str)],
) -> Result<Socket, tokio_tungstenite::tungstenite::Error> {
    let request_url = format!("ws://{request_authority}/api/host");
    let mut request = request_url
        .into_client_request()
        .expect("valid WebSocket request");
    if let Some(origin) = origin {
        request.headers_mut().insert(
            ORIGIN,
            HeaderValue::from_str(origin).expect("valid Origin header"),
        );
    }
    for (name, value) in headers {
        request.headers_mut().insert(
            HeaderName::from_bytes(name.as_bytes()).expect("valid header name"),
            HeaderValue::from_str(value).expect("valid header value"),
        );
    }
    let stream = TcpStream::connect(server.running.address())
        .await
        .expect("connect to actual listener");
    client_async(request, MaybeTlsStream::Plain(stream))
        .await
        .map(|(socket, _)| socket)
}

pub async fn connect_same_origin(server: &TestServer) -> Socket {
    let authority = server.authority();
    connect(
        server,
        &authority,
        Some(&format!("http://{authority}")),
        &[],
    )
    .await
    .expect("same-origin WebSocket connects")
}

pub async fn send_json(socket: &mut Socket, value: Value) {
    socket
        .send(Message::Text(value.to_string().into()))
        .await
        .expect("send JSON message");
}

pub async fn receive_json(socket: &mut Socket) -> Value {
    loop {
        let message = socket
            .next()
            .await
            .expect("server returns a message")
            .expect("server message is valid");
        match message {
            Message::Text(text) => {
                return serde_json::from_str(&text).expect("server message is JSON")
            }
            Message::Ping(payload) => socket
                .send(Message::Pong(payload))
                .await
                .expect("answer ping"),
            Message::Close(frame) => panic!("server closed before JSON response: {frame:?}"),
            _ => {}
        }
    }
}

pub async fn authenticate(server: &TestServer, socket: &mut Socket) -> Value {
    send_json(
        socket,
        json!({
            "protocolVersion": 1,
            "type": "authenticate",
            "secret": server.running.secret(),
        }),
    )
    .await;
    receive_json(socket).await
}

pub async fn request(socket: &mut Socket, id: &str, method: &str, params: Value) -> Value {
    send_json(
        socket,
        json!({
            "protocolVersion": 1,
            "type": "request",
            "requestId": id,
            "method": method,
            "params": params,
        }),
    )
    .await;
    receive_json(socket).await
}
