use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use axum::extract::ws::{Message, WebSocket};
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use subtle::ConstantTimeEq;
use tokio::sync::{OwnedSemaphorePermit, Semaphore};
use zd_host::instrumentation::{DiagnosticOutcome, DiagnosticRecordInput};
use zd_host::{
    BoundedFileRead, ClipboardImageMediaType, ClipboardImageRequest, CreateThreadWorktreeRequest,
    DurableStateApply, FileTreeMutationRequest, FileTreeRequest, GitCompareRequest, GitDiffRequest,
    GitHistoryRequest, GitScope, HostService, ResourceRef, EDITABLE_FILE_LIMIT_BYTES,
    MAX_CLIPBOARD_IMAGE_BYTES,
};

use crate::{
    MAX_MESSAGE_BYTES, MAX_REPORTED_DURATION_MICROS, MAX_RESPONSE_MESSAGE_BYTES, PROTOCOL_VERSION,
};

const MAX_CONCURRENT_HOST_JOBS: usize = 4;
const HOST_DIAGNOSTIC_SPAN_ID: &str = "host-dispatch";

#[derive(Clone)]
pub struct ProtocolState {
    pub host: Arc<HostService>,
    pub secret: Arc<[u8; 32]>,
    pub session_epoch: Arc<str>,
    pub controller_claimed: Arc<AtomicBool>,
    pub host_jobs: Arc<Semaphore>,
}

impl ProtocolState {
    pub fn host_jobs() -> Arc<Semaphore> {
        Arc::new(Semaphore::new(MAX_CONCURRENT_HOST_JOBS))
    }
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
    serialization_micros: u64,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectScopeParams {
    project_id: String,
    worktree_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WriteTextParams {
    project_id: String,
    worktree_id: String,
    relative_path: String,
    contents_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveImageParams {
    project_id: String,
    worktree_id: String,
    media_type: ClipboardImageMediaType,
    bytes_base64: String,
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
        let (result, queue_micros, handler_micros) =
            dispatch(&state, received_at, &request_id, &method, params).await;
        match result {
            Ok(result) => {
                if send_response(
                    &mut socket,
                    request_id,
                    method,
                    result,
                    queue_micros,
                    handler_micros,
                )
                .await
                .is_err()
                {
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

async fn dispatch(
    state: &ProtocolState,
    received_at: Instant,
    request_id: &str,
    method: &str,
    params: Value,
) -> (Result<Value, ProtocolFailure>, u64, u64) {
    let permit = match state.host_jobs.clone().acquire_owned().await {
        Ok(permit) => permit,
        Err(_) => {
            return (
                Err(host_failure("Host work is unavailable")),
                bounded_micros(received_at.elapsed()),
                0,
            )
        }
    };
    let queue_micros = bounded_micros(received_at.elapsed());
    let handler_started = Instant::now();
    let host = state.host.clone();
    let session_epoch = state.session_epoch.clone();
    let request_id = request_id.to_string();
    let method = method.to_string();
    let result = run_host_job(permit, move || {
        let result = dispatch_host(&host, &session_epoch, &method, params);
        record_request_diagnostic(&host, &request_id, &method, handler_started, &result);
        result
    })
    .await
    .unwrap_or_else(|_| Err(host_failure("Host work did not complete")));
    let handler_micros = bounded_micros(handler_started.elapsed());
    (result, queue_micros, handler_micros)
}

async fn run_host_job<T, F>(permit: OwnedSemaphorePermit, job: F) -> Result<T, ()>
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        job()
    })
    .await
    .map_err(|_| ())
}

fn dispatch_host(
    host: &HostService,
    session_epoch: &str,
    method: &str,
    params: Value,
) -> Result<Value, ProtocolFailure> {
    match method {
        "session.describe" => {
            parse_params::<EmptyParams>(params)?;
            let launch = host.launch_request();
            Ok(json!({
                "protocolVersion": PROTOCOL_VERSION,
                "sessionEpoch": session_epoch,
                "access": "read-write",
                "startupProjectId": launch.project.as_ref().map(|project| &project.id),
                "startupWorktreeId": launch.worktree_id,
                "startupRelativePath": launch.relative_path,
                "capabilities": {
                    "projectGrants": "read-only",
                    "fileTree": "read-only",
                    "fileRead": "read-only",
                    "fileWrite": "read-write",
                    "fileMutations": "read-write",
                    "clipboardImages": "read-write",
                    "projectImages": "read-only",
                    "fileWatch": "unavailable",
                    "git": "read-only",
                    "worktrees": "read-write",
                    "terminal": "unavailable",
                    "durableState": "read-write",
                    "themeFiles": "read-only",
                    "hostDiagnostics": "read-write",
                    "projectPicker": "unavailable",
                    "recentWorkspaces": "unavailable",
                },
            }))
        }
        "projectGrants.list" => {
            parse_params::<EmptyParams>(params)?;
            Ok(json!({ "projects": host.project_grants() }))
        }
        "state.describe" => {
            parse_params::<EmptyParams>(params)?;
            let bundle = host
                .describe_durable_state()
                .map_err(|_| durable_state_failure())?;
            serde_json::to_value(bundle).map_err(|_| durable_state_failure())
        }
        "state.apply" => {
            let request = parse_params::<DurableStateApply>(params)?;
            let outcome = host
                .apply_durable_state(&request)
                .map_err(|_| durable_state_failure())?;
            serde_json::to_value(outcome).map_err(|_| durable_state_failure())
        }
        "fileTree.snapshot" => {
            let request = parse_params::<FileTreeRequest>(params)?;
            serde_json::to_value(host.file_tree_snapshot(&request)).map_err(|_| ProtocolFailure {
                code: "host-failure",
                message: "The file tree result could not be returned",
            })
        }
        "file.readBounded" => {
            let params = parse_params::<ReadFileParams>(params)?;
            let resource = ResourceRef {
                project_id: params.project_id,
                worktree_id: params.worktree_id,
                relative_path: params.relative_path,
            };
            served_read(host.read_bounded_file(&resource))
        }
        "workspaceFiles.list" => {
            let params = parse_params::<ProjectScopeParams>(params)?;
            let listing = host
                .workspace_files(&params.project_id, &params.worktree_id)
                .map_err(|_| host_failure("The workspace file list is unavailable"))?;
            result_value(listing, "The workspace file list could not be returned")
        }
        "file.writeText" => {
            let params = parse_params::<WriteTextParams>(params)?;
            let bytes =
                decode_bounded_base64(&params.contents_base64, EDITABLE_FILE_LIMIT_BYTES as usize)?;
            let contents = String::from_utf8(bytes).map_err(|_| invalid_params())?;
            host.write_text_file(
                &ResourceRef {
                    project_id: params.project_id,
                    worktree_id: params.worktree_id,
                    relative_path: params.relative_path,
                },
                &contents,
            )
            .map_err(|_| host_failure("The file could not be written"))?;
            Ok(Value::Null)
        }
        "file.stamp" => {
            let params = parse_params::<ReadFileParams>(params)?;
            let stamp = host
                .file_stamp(&ResourceRef {
                    project_id: params.project_id,
                    worktree_id: params.worktree_id,
                    relative_path: params.relative_path,
                })
                .map_err(|_| host_failure("The file stamp is unavailable"))?;
            result_value(stamp, "The file stamp could not be returned")
        }
        "fileTree.mutate" => {
            let request = parse_params::<FileTreeMutationRequest>(params)?;
            result_value(
                host.mutate_file_tree(request),
                "The file mutation result could not be returned",
            )
        }
        "image.readProject" => {
            let params = parse_params::<ReadFileParams>(params)?;
            let image = host
                .read_project_image(&ResourceRef {
                    project_id: params.project_id,
                    worktree_id: params.worktree_id,
                    relative_path: params.relative_path,
                })
                .map_err(|_| host_failure("The project image is unavailable"))?;
            Ok(json!({
                "mediaType": image.media_type,
                "bytesBase64": STANDARD.encode(image.bytes),
            }))
        }
        "image.saveClipboard" => {
            let params = parse_params::<SaveImageParams>(params)?;
            let bytes = decode_bounded_base64(&params.bytes_base64, MAX_CLIPBOARD_IMAGE_BYTES)?;
            let saved = host
                .save_clipboard_image(&ClipboardImageRequest {
                    project_id: params.project_id,
                    worktree_id: params.worktree_id,
                    media_type: params.media_type,
                    bytes,
                })
                .map_err(|_| host_failure("The clipboard image could not be saved"))?;
            result_value(saved, "The clipboard image result could not be returned")
        }
        "git.status" => {
            let scope = parse_params::<GitScope>(params)?;
            result_value(host.git_status(scope), "Git status could not be returned")
        }
        "git.history" => {
            let request = parse_params::<GitHistoryRequest>(params)?;
            result_value(
                host.git_history(request),
                "Git history could not be returned",
            )
        }
        "git.compare" => {
            let request = parse_params::<GitCompareRequest>(params)?;
            result_value(
                host.git_compare(request),
                "Git comparison could not be returned",
            )
        }
        "git.diff" => {
            let request = parse_params::<GitDiffRequest>(params)?;
            result_value(host.git_diff(request), "Git diff could not be returned")
        }
        "worktree.create" => {
            let request = parse_params::<CreateThreadWorktreeRequest>(params)?;
            result_value(
                host.create_thread_worktree(request),
                "The worktree result could not be returned",
            )
        }
        "theme.list" => {
            parse_params::<EmptyParams>(params)?;
            let themes = host
                .theme_config_files()
                .map_err(|_| host_failure("Host themes are unavailable"))?;
            result_value(themes, "Host themes could not be returned")
        }
        "diagnostics.status" => {
            parse_params::<EmptyParams>(params)?;
            let status = host
                .diagnostics_status()
                .map_err(|_| host_failure("Host diagnostics are unavailable"))?;
            result_value(status, "Diagnostic status could not be returned")
        }
        "diagnostics.enable" => {
            parse_params::<EmptyParams>(params)?;
            let status = host
                .enable_diagnostics()
                .map_err(|_| host_failure("Host diagnostics are unavailable"))?;
            result_value(status, "Diagnostic status could not be returned")
        }
        "diagnostics.disable" => {
            parse_params::<EmptyParams>(params)?;
            let status = host
                .disable_diagnostics()
                .map_err(|_| host_failure("Host diagnostics are unavailable"))?;
            result_value(status, "Diagnostic status could not be returned")
        }
        "diagnostics.record" => {
            let record = parse_params::<DiagnosticRecordInput>(params)?;
            let outcome = host
                .record_diagnostic(record)
                .map_err(|_| host_failure("Host diagnostics are unavailable"))?;
            result_value(outcome, "Diagnostic record result could not be returned")
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
    serde_json::from_value(params).map_err(|_| invalid_params())
}

fn invalid_params() -> ProtocolFailure {
    ProtocolFailure {
        code: "invalid-params",
        message: "The request parameters are invalid",
    }
}

fn host_failure(message: &'static str) -> ProtocolFailure {
    ProtocolFailure {
        code: "host-failure",
        message,
    }
}

fn result_value(result: impl Serialize, message: &'static str) -> Result<Value, ProtocolFailure> {
    serde_json::to_value(result).map_err(|_| host_failure(message))
}

fn decode_bounded_base64(encoded: &str, decoded_limit: usize) -> Result<Vec<u8>, ProtocolFailure> {
    let encoded_limit = decoded_limit.div_ceil(3).saturating_mul(4);
    if encoded.len() > encoded_limit {
        return Err(invalid_params());
    }
    let decoded = STANDARD.decode(encoded).map_err(|_| invalid_params())?;
    if decoded.len() > decoded_limit {
        return Err(invalid_params());
    }
    Ok(decoded)
}

fn served_read(read: BoundedFileRead) -> Result<Value, ProtocolFailure> {
    match read {
        BoundedFileRead::Text {
            text,
            byte_length,
            writable,
            reason,
        } => Ok(json!({
            "status": "text",
            "textBase64": STANDARD.encode(text.as_bytes()),
            "byteLength": byte_length,
            "writable": writable,
            "reason": reason,
        })),
        other => result_value(other, "The file result could not be returned"),
    }
}

fn record_request_diagnostic(
    host: &HostService,
    request_id: &str,
    method: &str,
    started: Instant,
    result: &Result<Value, ProtocolFailure>,
) {
    if !valid_diagnostic_token(request_id) || !valid_diagnostic_token(method) {
        return;
    }
    let outcome = match result {
        Ok(_) => DiagnosticOutcome::Ok,
        Err(failure) if matches!(failure.code, "invalid-params" | "unknown-method") => {
            DiagnosticOutcome::Refused
        }
        Err(_) => DiagnosticOutcome::Failed,
    };
    let _ = host.record_diagnostic(DiagnosticRecordInput::Span {
        operation: method.to_string(),
        trace_id: request_id.to_string(),
        span_id: HOST_DIAGNOSTIC_SPAN_ID.to_string(),
        parent_span_id: None,
        duration_us: bounded_micros(started.elapsed()),
        outcome,
        context: None,
    });
}

fn valid_diagnostic_token(value: &str) -> bool {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    first.is_ascii_alphanumeric()
        && value.len() <= 96
        && bytes
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
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
            Ok(Message::Text(text)) if text.len() <= MAX_MESSAGE_BYTES => {
                return Some(text.as_str().to_string())
            }
            Ok(Message::Text(_)) => return None,
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

async fn send_response(
    socket: &mut WebSocket,
    request_id: String,
    method: String,
    result: Value,
    queue_micros: u64,
    handler_micros: u64,
) -> Result<(), ()> {
    let serialized = tokio::task::spawn_blocking(move || {
        let mut response = ResponseEnvelope {
            protocol_version: PROTOCOL_VERSION,
            message_type: "response",
            request_id,
            method,
            result,
            timing: HostTiming {
                queue_micros,
                handler_micros,
                serialization_micros: 0,
            },
        };
        let started = Instant::now();
        let provisional = serde_json::to_string(&response).map_err(|_| ())?;
        if provisional.len() > MAX_RESPONSE_MESSAGE_BYTES {
            return Err(());
        }
        response.timing.serialization_micros = bounded_micros(started.elapsed());
        let serialized = serde_json::to_string(&response).map_err(|_| ())?;
        (serialized.len() <= MAX_RESPONSE_MESSAGE_BYTES)
            .then_some(serialized)
            .ok_or(())
    })
    .await
    .map_err(|_| ())??;
    send_serialized(socket, serialized).await
}

async fn send(socket: &mut WebSocket, value: &impl Serialize) -> Result<(), ()> {
    let serialized = serde_json::to_string(value).map_err(|_| ())?;
    if serialized.len() > MAX_RESPONSE_MESSAGE_BYTES {
        return Err(());
    }
    send_serialized(socket, serialized).await
}

async fn send_serialized(socket: &mut WebSocket, serialized: String) -> Result<(), ()> {
    socket
        .send(Message::Text(serialized.into()))
        .await
        .map_err(|_| ())
}

#[cfg(test)]
mod tests {
    use super::run_host_job;
    use std::sync::Arc;
    use std::time::Duration;
    use tokio::sync::Semaphore;

    #[tokio::test(flavor = "current_thread")]
    async fn blocking_host_work_does_not_stall_the_async_executor() {
        let permits = Arc::new(Semaphore::new(1));
        let permit = permits.acquire_owned().await.unwrap();
        let job = run_host_job(permit, || {
            std::thread::sleep(Duration::from_millis(100));
            42
        });
        tokio::pin!(job);

        tokio::select! {
            result = &mut job => panic!("blocking job finished before readiness probe: {result:?}"),
            () = tokio::time::sleep(Duration::from_millis(10)) => {}
        }

        assert_eq!(job.await, Ok(42));
    }
}
