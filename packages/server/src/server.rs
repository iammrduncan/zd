use std::net::{Ipv4Addr, SocketAddr};
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use axum::extract::ws::WebSocketUpgrade;
use axum::extract::State;
use axum::http::header::{HOST, ORIGIN};
use axum::http::uri::Authority;
use axum::http::{HeaderMap, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::{any, get};
use axum::Router;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use zd_host::HostService;

use crate::assets::Assets;
use crate::protocol::{serve_socket, ProtocolState};
use crate::MAX_MESSAGE_BYTES;

pub struct ServerConfig {
    assets_root: PathBuf,
    port: u16,
}

impl ServerConfig {
    pub fn new(assets_root: PathBuf, port: u16) -> Self {
        Self { assets_root, port }
    }
}

pub struct RunningServer {
    address: SocketAddr,
    secret: String,
    shutdown: Option<oneshot::Sender<()>>,
    task: Option<JoinHandle<Result<(), String>>>,
}

impl RunningServer {
    pub fn address(&self) -> SocketAddr {
        self.address
    }

    pub fn url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub fn secret(&self) -> &str {
        &self.secret
    }

    pub async fn shutdown(mut self) -> Result<(), String> {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        let Some(task) = self.task.take() else {
            return Ok(());
        };
        task.await
            .map_err(|error| format!("server task did not finish: {error}"))?
    }
}

impl Drop for RunningServer {
    fn drop(&mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}

#[derive(Clone)]
struct AppState {
    assets: Assets,
    protocol: ProtocolState,
}

pub async fn start(host: Arc<HostService>, config: ServerConfig) -> Result<RunningServer, String> {
    let assets = Assets::open(&config.assets_root)?;
    let secret_bytes = Arc::new(random_bytes::<32>()?);
    let secret = URL_SAFE_NO_PAD.encode(secret_bytes.as_slice());
    let session_epoch = Arc::<str>::from(URL_SAFE_NO_PAD.encode(random_bytes::<16>()?));
    let state = AppState {
        assets,
        protocol: ProtocolState {
            host,
            secret: secret_bytes,
            session_epoch,
            controller_claimed: Arc::new(AtomicBool::new(false)),
        },
    };
    let router = Router::new()
        .route("/healthz", get(health))
        .route("/api/host", any(websocket))
        .fallback(get(asset))
        .with_state(state);
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, config.port))
        .await
        .map_err(|error| format!("could not bind the loopback listener: {error}"))?;
    let address = listener
        .local_addr()
        .map_err(|error| format!("could not inspect the loopback listener: {error}"))?;
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
    })
}

async fn health() -> StatusCode {
    StatusCode::NO_CONTENT
}

async fn asset(State(state): State<AppState>, uri: Uri) -> Response {
    state.assets.response(&uri).await
}

async fn websocket(
    State(state): State<AppState>,
    headers: HeaderMap,
    upgrade: WebSocketUpgrade,
) -> Response {
    if !valid_browser_authority(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    upgrade
        .write_buffer_size(8 * 1024)
        .max_write_buffer_size(2 * MAX_MESSAGE_BYTES)
        .max_frame_size(MAX_MESSAGE_BYTES)
        .max_message_size(MAX_MESSAGE_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state.protocol))
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
    if authority.host() != Ipv4Addr::LOCALHOST.to_string() || authority.port_u16().is_none() {
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
        && origin.query().is_none()
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes)
        .map_err(|error| format!("secure randomness is unavailable: {error}"))?;
    Ok(bytes)
}
