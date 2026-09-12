use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{DefaultBodyLimit, Json, State};
use axum::http::header::{CACHE_CONTROL, HOST, ORIGIN, SET_COOKIE};
use axum::http::uri::Authority;
use axum::http::{HeaderMap, HeaderValue, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get, post};
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::Deserialize;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use zd_host::terminal::{TerminalAvailability, TerminalSessionSnapshot};
use zd_host::HostService;

use crate::assets::Assets;
use crate::pairing::BrowserPairing;
use crate::protocol::{serve_socket, ProtocolState};
use crate::{HostEvent, SessionRuntime, PROTOCOL_VERSION};
use crate::{MAX_MESSAGE_BYTES, MAX_RESPONSE_MESSAGE_BYTES};

pub struct ServerConfig {
    assets_root: PathBuf,
    state_directory: PathBuf,
    bind: Ipv4Addr,
    port: u16,
    secret: Option<String>,
}

impl ServerConfig {
    pub fn new(
        assets_root: PathBuf,
        state_directory: PathBuf,
        bind: Ipv4Addr,
        port: u16,
        secret: Option<String>,
    ) -> Self {
        Self {
            assets_root,
            state_directory,
            bind,
            port,
            secret,
        }
    }
}

pub struct RunningServer {
    address: SocketAddr,
    secret: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<Result<(), String>>>,
    host: Arc<HostService>,
    runtime: Arc<SessionRuntime>,
    terminal_events: Option<TerminalEventPump>,
}

impl RunningServer {
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    pub fn url(&self) -> String {
        let ip = if self.address.ip().is_unspecified() {
            IpAddr::V4(Ipv4Addr::LOCALHOST)
        } else {
            self.address.ip()
        };
        format!("http://{}", SocketAddr::new(ip, self.address.port()))
    }

    pub fn secret(&self) -> &str {
        &self.secret
    }

    pub fn session_epoch(&self) -> Arc<str> {
        self.runtime.epoch()
    }

    pub async fn shutdown(mut self) -> Result<(), String> {
        self.runtime.begin_shutdown();
        if let Some(events) = self.terminal_events.take() {
            events.stop();
        }
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let Some(task) = self.task.take() else {
            return Ok(());
        };
        task.await
            .map_err(|error| format!("server task did not finish: {error}"))??;
        let host = Arc::clone(&self.host);
        tokio::task::spawn_blocking(move || host.shutdown_runtime())
            .await
            .map_err(|error| format!("host cleanup task did not finish: {error}"))?
            .map_err(|_| "host runtime cleanup did not finish".to_string())
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        self.runtime.begin_shutdown();
        if let Some(events) = self.terminal_events.take() {
            events.stop();
        }
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }
        let _ = self.host.shutdown_runtime();
    }
}

#[derive(Clone)]
struct AppState {
    assets: Assets,
    pairing: BrowserPairing,
    protocol: ProtocolState,
}

pub async fn start(host: Arc<HostService>, config: ServerConfig) -> Result<RunningServer, String> {
    let secret = match config.secret {
        Some(secret) if secret.is_empty() => {
            return Err("a fixed serve secret must not be empty".to_string());
        }
        Some(secret) => {
            if !crate::cli::fixed_secret_bind_allowed(config.bind) {
                return Err(
                    "a fixed serve secret requires a loopback or Tailscale bind".to_string()
                );
            }
            secret
        }
        None => URL_SAFE_NO_PAD.encode(random_bytes::<32>()?),
    };
    let assets = Assets::open(&config.assets_root)?;
    let pairing = BrowserPairing::open(&config.state_directory)?;
    let session_epoch = Arc::<str>::from(URL_SAFE_NO_PAD.encode(random_bytes::<16>()?));
    let runtime = Arc::new(SessionRuntime::new(session_epoch));
    let terminal_events = if host.terminal_runtime_is_external() {
        Some(TerminalEventPump::start(
            Arc::clone(&host),
            Arc::clone(&runtime),
        )?)
    } else {
        None
    };
    let state = AppState {
        assets,
        pairing,
        protocol: ProtocolState {
            host: Arc::clone(&host),
            secret: Arc::from(secret.as_str()),
            runtime: Arc::clone(&runtime),
            host_jobs: ProtocolState::host_jobs(),
        },
    };
    let router = Router::new()
        .route("/healthz", get(health))
        .route(
            "/api/pair",
            post(pair_browser).layer(DefaultBodyLimit::max(MAX_PAIRING_BODY_BYTES)),
        )
        .route("/api/host", any(websocket))
        .fallback(get(asset))
        .with_state(state);
    let listener = TcpListener::bind((config.bind, config.port))
        .await
        .map_err(|error| format!("could not bind the served listener: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("could not inspect the served listener: {error}"))?;
    let (shutdown, stopped) = oneshot::channel();
    let task = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = stopped.await;
            })
            .await
            .map_err(|error| format!("served host failed: {error}"))
    });
    Ok(RunningServer {
        address,
        secret,
        shutdown: Some(shutdown),
        task: Some(task),
        host,
        runtime,
        terminal_events,
    })
}

struct TerminalEventPump {
    stopping: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}

impl TerminalEventPump {
    fn start(host: Arc<HostService>, runtime: Arc<SessionRuntime>) -> Result<Self, String> {
        let stopping = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stopping);
        let thread = thread::Builder::new()
            .name("zd-terminal-event-pump".to_string())
            .spawn(move || {
                let mut observer = TerminalEventObserver::default();
                while !worker_stop.load(Ordering::Acquire) {
                    if let Ok(snapshot) = host.terminal_snapshot() {
                        for event in observer.observe(&snapshot) {
                            runtime.publish(event);
                        }
                    }
                    thread::sleep(Duration::from_millis(16));
                }
            })
            .map_err(|_| "the terminal event pump could not start".to_string())?;
        Ok(Self {
            stopping,
            thread: Some(thread),
        })
    }

    fn stop(mut self) {
        self.stopping.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for TerminalEventPump {
    fn drop(&mut self) {
        self.stopping.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[derive(Default)]
struct TerminalEventObserver {
    observed: HashMap<String, (u64, TerminalAvailability)>,
}

impl TerminalEventObserver {
    fn observe(&mut self, snapshot: &[TerminalSessionSnapshot]) -> Vec<HostEvent> {
        let mut events = Vec::new();
        let mut present = std::collections::HashSet::new();
        for terminal in snapshot {
            let session = &terminal.session;
            present.insert(session.session_id.clone());
            let previous = self.observed.insert(
                session.session_id.clone(),
                (terminal.next_offset, terminal.availability),
            );
            let previous_offset = previous.map_or(terminal.retained_from, |value| value.0);
            if terminal.next_offset > previous_offset {
                events.push(HostEvent::TerminalOutputReady {
                    session_id: session.session_id.clone(),
                    project_id: session.project_id.clone(),
                    worktree_id: session.worktree_id.clone(),
                });
            }
            if terminal.availability == TerminalAvailability::Exited
                && previous.is_none_or(|value| value.1 != TerminalAvailability::Exited)
            {
                events.push(HostEvent::TerminalExited {
                    session_id: session.session_id.clone(),
                    project_id: session.project_id.clone(),
                    worktree_id: session.worktree_id.clone(),
                });
            }
        }
        self.observed
            .retain(|session_id, _| present.contains(session_id));
        events
    }
}

async fn health() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn asset(State(state): State<AppState>, uri: Uri) -> Response {
    state.assets.response(&uri).await
}

const MAX_PAIRING_BODY_BYTES: usize = 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PairingRequest {
    protocol_version: u16,
    secret: String,
}

async fn pair_browser(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PairingRequest>,
) -> Response {
    if !valid_browser_authority(&headers)
        || request.protocol_version != PROTOCOL_VERSION
        || !state.protocol.accepts_secret(&request.secret)
    {
        return no_store(StatusCode::FORBIDDEN);
    }
    let Ok(cookie) = HeaderValue::from_str(&state.pairing.set_cookie_value()) else {
        return no_store(StatusCode::INTERNAL_SERVER_ERROR);
    };
    let mut response = no_store(StatusCode::NO_CONTENT);
    response.headers_mut().insert(SET_COOKIE, cookie);
    response
}

fn no_store(status: StatusCode) -> Response {
    let mut response = status.into_response();
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !valid_browser_authority(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let browser_paired = state.pairing.accepts_cookie(&headers);
    upgrade
        .write_buffer_size(8 * 1024)
        .max_write_buffer_size(2 * MAX_RESPONSE_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state.protocol, browser_paired))
}

fn valid_browser_authority(headers: &HeaderMap) -> bool {
    if headers.keys().any(|name| {
        matches!(
            name.as_str(),
            "forwarded" | "x-forwarded-for" | "x-forwarded-host" | "x-forwarded-proto"
        )
    }) {
        return false;
    }
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let Ok(authority) = host.parse::<Authority>() else {
        return false;
    };
    if authority.port_u16().is_none() {
        return false;
    }
    let Some(origin) = headers.get(ORIGIN).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let Ok(origin) = origin.parse::<Uri>() else {
        return false;
    };
    origin.scheme_str() == Some("http")
        && origin
            .authority()
            .is_some_and(|origin_authority| origin_authority == &authority)
        && origin.path() == "/"
        && origin.query().is_none()
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("secure randomness is unavailable: {error}"))?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use zd_host::terminal::{
        TerminalExitReason, TerminalExitStatus, TerminalSessionHandle, TerminalSessionSnapshot,
    };

    use super::*;

    fn snapshot(next_offset: u64, availability: TerminalAvailability) -> TerminalSessionSnapshot {
        TerminalSessionSnapshot {
            session: TerminalSessionHandle {
                session_id: "terminal-a".to_string(),
                project_id: "project-a".to_string(),
                worktree_id: "worktree-a".to_string(),
            },
            retained_from: 0,
            next_offset,
            availability,
            exit: (availability == TerminalAvailability::Exited).then_some(TerminalExitStatus {
                reason: TerminalExitReason::Exited,
                code: Some(0),
                signal: None,
            }),
        }
    }

    #[test]
    fn external_terminal_observation_emits_only_output_and_exit_edges() {
        let mut observer = TerminalEventObserver::default();

        assert!(observer
            .observe(&[snapshot(0, TerminalAvailability::Running)])
            .is_empty());
        assert_eq!(
            observer.observe(&[snapshot(4, TerminalAvailability::Running)]),
            vec![HostEvent::TerminalOutputReady {
                session_id: "terminal-a".to_string(),
                project_id: "project-a".to_string(),
                worktree_id: "worktree-a".to_string(),
            }]
        );
        assert!(observer
            .observe(&[snapshot(4, TerminalAvailability::Running)])
            .is_empty());
        assert_eq!(
            observer.observe(&[snapshot(4, TerminalAvailability::Exited)]),
            vec![HostEvent::TerminalExited {
                session_id: "terminal-a".to_string(),
                project_id: "project-a".to_string(),
                worktree_id: "worktree-a".to_string(),
            }]
        );
        assert!(observer
            .observe(&[snapshot(4, TerminalAvailability::Exited)])
            .is_empty());
    }
}
