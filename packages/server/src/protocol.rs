use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use subtle::ConstantTimeEq;
use zd_host::{BoundedFileRead, DurableStateApply, FileTreeRequest, HostService, ResourceRef};

use crate::{MAX_REPORTED_DURATION_MICROS, MAX_RESPONSE_MESSAGE_BYTES, PROTOCOL_VERSION};

#[derive(Clone)]
pub struct ProtocolState {
    pub host: Arc<HostService>,
    pub secret: Arc<[u8; 32]>,
    pub session_epoch: Arc<str>,
    pub controller_claimed: Arc<AtomicBool>,
}

#[derive(Debug, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum ClientMessage {
    Authenticate {
        protocol_version: u16,
        secret: String,
    },
    Request {
        protocol_version: u16,
        request_id: String,
        method: String,
        params: Value,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Authenticated<'a> {
    protocol_version: u16,
    #[serde(rename = "type")]
    message_type: &'static str,
    session_epoch: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ResponseEnvelope {
    protocol_version: u16,
    #[serde(rename = "type")]
    message_type: &'static str,
    request_id: String,
    method: String,
    result: Value,
    timing: HostTiming,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEnvelope<'a> {
    protocol_version: u16,
    #[serde(rename = "type")]
    message_type: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    request_id: Option<&'a str>,
    code: &'static str,
    message: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HostTiming {
    queue_micros: u64,
    handler_micros: u64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyParams {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadFileParams {
    project_id: String,
    worktree_id: String,
    relative_path: String,
}

struct ProtocolFailure {
    code: &'static str,
    message: &'static str,
}

struct ControllerLease(Arc<AtomicBool>);

impl Drop for ControllerLease {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}

pub async fn serve_socket(mut socket: WebSocket, state: ProtocolState) {
    let Some(message) = receive_text(&mut socket).await else {
        return;
    };
    let authenticated = match serde_json::from_str::<ClientMessage>(&message) {
        Ok(ClientMessage::Authenticate {
            protocol_version,
            secret,
        }) => authenticate(&state, protocol_version, &secret),
        Ok(ClientMessage::Request { .. }) => Err(ProtocolFailure {
            code: "authentication-required",
            message: "Authenticate before requesting host state",
        }),
        Err(_) => Err(ProtocolFailure {
            code: "invalid-message",
            message: "The authentication message is invalid",
        }),
    };
    let lease = match authenticated {
        Ok(lease) => lease,
        Err(failure) => {
            let _ = send_error(&mut socket, None, failure).await;
            let _ = socket.close().await;
            return;
        }
    };
    let accepted = Authenticated {
        protocol_version: PROTOCOL_VERSION,
        message_type: "authenticated",
        session_epoch: &state.session_epoch,
    };
    if send(&mut socket, &accepted).await.is_err() {
        return;
    }

    while let Some(message) = receive_text(&mut socket).await {
        let received_at = Instant::now();
        let request = match serde_json::from_str::<ClientMessage>(&message) {
            Ok(ClientMessage::Request {
                protocol_version,
                request_id,
                method,
                params,
            }) => (protocol_version, request_id, method, params),
            Ok(ClientMessage::Authenticate { .. }) => {
                let _ = send_error(
                    &mut socket,
                    None,
                    ProtocolFailure {
                        code: "already-authenticated",
                        message: "This controller is already authenticated",
                    },
                )
                .await;
                continue;
            }
            Err(_) => {
                let _ = send_error(
                    &mut socket,
                    None,
                    ProtocolFailure {
                        code: "invalid-message",
                        message: "The request message is invalid",
                    },
                )
                .await;
                break;
            }
        };
        let (protocol_version, request_id, method, params) = request;
        if protocol_version != PROTOCOL_VERSION {
            let _ = send_error(
                &mut socket,
                valid_request_id(&request_id).then_some(request_id.as_str()),
                ProtocolFailure {
                    code: "unsupported-protocol",
                    message: "The protocol version is not supported",
                },
            )
            .await;
            break;
        }
        if !valid_request_id(&request_id) {
            let _ = send_error(
                &mut socket,
                None,
                ProtocolFailure {
                    code: "invalid-request-id",
                    message: "The request ID is invalid",
                },
            )
            .await;
            continue;
        }
        let handler_started = Instant::now();
        let queue_micros = bounded_micros(received_at.elapsed());
        let result = dispatch(&state, &method, params);
        let handler_micros = bounded_micros(handler_started.elapsed());
        match result {
            Ok(result) => {
                let response = ResponseEnvelope {
                    protocol_version: PROTOCOL_VERSION,
                    message_type: "response",
                    request_id,
                    method,
                    result,
                    timing: HostTiming {
                        queue_micros,
                        handler_micros,
                    },
                };
                if send(&mut socket, &response).await.is_err() {
                    break;
                }
            }
            Err(failure) => {
                if send_error(&mut socket, Some(&request_id), failure)
                    .await
                    .is_err()
                {
                    break;
                }
            }
        }
    }
    drop(lease);
    let _ = socket.close().await;
}

fn authenticate(
    state: &ProtocolState,
    protocol_version: u16,
    supplied: &str,
) -> Result<ControllerLease, ProtocolFailure> {
    if protocol_version != PROTOCOL_VERSION {
        return Err(ProtocolFailure {
            code: "unsupported-protocol",
            message: "The protocol version is not supported",
        });
    }
    let decoded = URL_SAFE_NO_PAD.decode(supplied).unwrap_or_default();
    if !bool::from(state.secret.as_slice().ct_eq(decoded.as_slice())) {
        return Err(ProtocolFailure {
            code: "authentication-failed",
            message: "The process secret was not accepted",
        });
    }
    state
        .controller_claimed
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| ProtocolFailure {
            code: "controller-unavailable",
            message: "Another controller is already connected",
        })?;
    Ok(ControllerLease(state.controller_claimed.clone()))
}

fn dispatch(state: &ProtocolState, method: &str, params: Value) -> Result<Value, ProtocolFailure> {
    match method {
        "session.describe" => {
            parse_params::<EmptyParams>(params)?;
            let launch = state.host.launch_request();
            Ok(json!({
                "protocolVersion": PROTOCOL_VERSION,
                "sessionEpoch": state.session_epoch.as_ref(),
                "access": "read-only",
                "startupProjectId": launch.project.as_ref().map(|project| &project.id),
                "startupWorktreeId": launch.worktree_id,
                "startupRelativePath": launch.relative_path,
                "capabilities": {
                    "projectGrants": "read-only",
                    "fileTree": "read-only",
                    "fileRead": "read-only",
                    "fileWrite": "unavailable",
                    "fileMutations": "unavailable",
                    "fileWatch": "unavailable",
                    "git": "unavailable",
                    "terminal": "unavailable",
                    "durableState": "read-write",
                    "projectPicker": "unavailable",
                    "recentWorkspaces": "unavailable",
                },
            }))
        }
        "projectGrants.list" => {
            parse_params::<EmptyParams>(params)?;
            Ok(json!({ "projects": state.host.project_grants() }))
        }
        "state.describe" => {
            parse_params::<EmptyParams>(params)?;
            let bundle = state
                .host
                .describe_durable_state()
                .map_err(|_| durable_state_failure())?;
            serde_json::to_value(bundle).map_err(|_| durable_state_failure())
        }
        "state.apply" => {
            let request = parse_params::<DurableStateApply>(params)?;
            let outcome = state
                .host
                .apply_durable_state(&request)
                .map_err(|_| durable_state_failure())?;
            serde_json::to_value(outcome).map_err(|_| durable_state_failure())
        }
        "fileTree.snapshot" => {
            let request = parse_params::<FileTreeRequest>(params)?;
            serde_json::to_value(state.host.file_tree_snapshot(&request)).map_err(|_| {
                ProtocolFailure {
                    code: "host-failure",
                    message: "The file tree result could not be returned",
                }
            })
        }
        "file.readBounded" => {
            let params = parse_params::<ReadFileParams>(params)?;
            let resource = ResourceRef {
                project_id: params.project_id,
                worktree_id: params.worktree_id,
                relative_path: params.relative_path,
            };
            let read = served_read(state.host.read_bounded_file(&resource));
            serde_json::to_value(read).map_err(|_| ProtocolFailure {
                code: "host-failure",
                message: "The file result could not be returned",
            })
        }
        _ => Err(ProtocolFailure {
            code: "unknown-method",
            message: "The requested host method is unavailable",
        }),
    }
}

fn durable_state_failure() -> ProtocolFailure {
    ProtocolFailure {
        code: "durable-state-unavailable",
        message: "Durable state is unavailable",
    }
}

fn parse_params<T: for<'de> Deserialize<'de>>(params: Value) -> Result<T, ProtocolFailure> {
    serde_json::from_value(params).map_err(|_| ProtocolFailure {
        code: "invalid-params",
        message: "The request parameters are invalid",
    })
}

fn served_read(read: BoundedFileRead) -> BoundedFileRead {
    match read {
        BoundedFileRead::Text {
            text, byte_length, ..
        } => BoundedFileRead::Text {
            text,
            byte_length,
            writable: false,
            reason: Some("Served workbenches are read-only".to_string()),
        },
        other => other,
    }
}

fn valid_request_id(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 64
        && request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

fn bounded_micros(duration: std::time::Duration) -> u64 {
    duration
        .as_micros()
        .min(u128::from(MAX_REPORTED_DURATION_MICROS)) as u64
}

async fn receive_text(socket: &mut WebSocket) -> Option<String> {
    loop {
        match socket.next().await? {
            Ok(Message::Text(text)) => return Some(text.as_str().to_string()),
            Ok(Message::Ping(payload)) => {
                if socket.send(Message::Pong(payload)).await.is_err() {
                    return None;
                }
            }
            Ok(Message::Close(_)) | Err(_) => return None,
            Ok(_) => {
                let _ = send_error(
                    socket,
                    None,
                    ProtocolFailure {
                        code: "invalid-message",
                        message: "Only text protocol messages are accepted",
                    },
                )
                .await;
                return None;
            }
        }
    }
}

async fn send_error(
    socket: &mut WebSocket,
    request_id: Option<&str>,
    failure: ProtocolFailure,
) -> Result<(), ()> {
    send(
        socket,
        &ErrorEnvelope {
            protocol_version: PROTOCOL_VERSION,
            message_type: "error",
            request_id,
            code: failure.code,
            message: failure.message,
        },
    )
    .await
}

async fn send(socket: &mut WebSocket, value: &impl Serialize) -> Result<(), ()> {
    let serialized = serde_json::to_string(value).map_err(|_| ())?;
    if serialized.len() > MAX_RESPONSE_MESSAGE_BYTES {
        return Err(());
    }
    socket
        .send(Message::Text(serialized.into()))
        .await
        .map_err(|_| ())
}
