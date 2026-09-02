use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::Ipv4Addr;
use std::path::Path;
use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use zd_host::{HostLaunchRequest, HostService, ProjectGrant};

use crate::foreground::{assets_directory, state_directory};
use crate::{start, ServerConfig, PROTOCOL_VERSION};

pub const WRAPPER_PROTOCOL_VERSION: u16 = 1;
pub const MAX_WRAPPER_FRAME_BYTES: usize = 16 * 1024;
pub const MAX_WRAPPER_PATH_BYTES: usize = 8 * 1024;
pub const MAX_WRAPPER_IDENTITY_BYTES: usize = 160;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WrapperStartup {
    pub wrapper_protocol_version: u16,
    pub application_version: String,
    pub launch_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WrapperReadiness {
    pub wrapper_protocol_version: u16,
    pub application_version: String,
    pub host_protocol_version: u16,
    pub origin: String,
    pub session_epoch: String,
    pub secret: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum WrapperControl {
    Shutdown {
        wrapper_protocol_version: u16,
    },
    ApproveProject {
        wrapper_protocol_version: u16,
        request_id: String,
        path: String,
    },
    RecoverProject {
        wrapper_protocol_version: u16,
        request_id: String,
        project_id: String,
        path: String,
    },
    ApproveOpen {
        wrapper_protocol_version: u16,
        request_id: String,
        path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case", deny_unknown_fields)]
pub enum WrapperResponse {
    ProjectApproved {
        wrapper_protocol_version: u16,
        request_id: String,
        project: ProjectGrant,
    },
    OpenApproved {
        wrapper_protocol_version: u16,
        request_id: String,
        intent: HostLaunchRequest,
    },
    Refused {
        wrapper_protocol_version: u16,
        request_id: String,
        problem: String,
    },
}

pub fn run_wrapper_child() -> Result<(), String> {
    let runtime = tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|_| "the wrapper child runtime could not start".to_string())?;
    runtime.block_on(run())
}

async fn run() -> Result<(), String> {
    let mut input = BufReader::new(io::stdin());
    let startup = read_frame::<WrapperStartup, _>(&mut input)?
        .ok_or_else(|| "the wrapper startup frame is missing".to_string())?;
    validate_startup(&startup)?;
    let state_directory = state_directory()?;
    let launch_path = startup.launch_path.as_deref().map(Path::new);
    let host = Arc::new(
        HostService::open_desktop_with_terminal_keeper(launch_path, &state_directory)
            .map_err(|_| "the trusted desktop launch could not be approved".to_string())?,
    );
    let server = start(
        Arc::clone(&host),
        ServerConfig::new(assets_directory()?, state_directory, Ipv4Addr::LOCALHOST, 0),
    )
    .await?;
    let readiness = WrapperReadiness {
        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        host_protocol_version: PROTOCOL_VERSION,
        origin: server.url(),
        session_epoch: server.session_epoch().to_string(),
        secret: server.secret().to_string(),
    };
    if let Err(problem) = write_frame(&mut io::stdout().lock(), &readiness) {
        let _ = server.shutdown().await;
        return Err(problem);
    }

    let (finished, wait) = oneshot::channel();
    std::thread::spawn(move || {
        let _ = finished.send(run_controls(&mut input, &mut io::stdout().lock(), &host));
    });
    let control = wait
        .await
        .map_err(|_| "the wrapper control reader stopped unexpectedly".to_string())?;
    let shutdown = server.shutdown().await;
    control.and(shutdown)
}

fn validate_startup(startup: &WrapperStartup) -> Result<(), String> {
    if startup.wrapper_protocol_version != WRAPPER_PROTOCOL_VERSION
        || startup.application_version != env!("CARGO_PKG_VERSION")
    {
        return Err("the wrapper startup version is incompatible".to_string());
    }
    if startup
        .launch_path
        .as_deref()
        .is_some_and(|path| !Path::new(path).is_absolute())
    {
        return Err("the wrapper startup path is not absolute".to_string());
    }
    Ok(())
}

fn run_controls<R: BufRead, W: Write>(
    input: &mut R,
    output: &mut W,
    host: &HostService,
) -> Result<(), String> {
    while let Some(control) = read_frame::<WrapperControl, _>(input)? {
        match control {
            WrapperControl::Shutdown {
                wrapper_protocol_version,
            } => {
                validate_control_version(wrapper_protocol_version)?;
                return Ok(());
            }
            WrapperControl::ApproveProject {
                wrapper_protocol_version,
                request_id,
                path,
            } => {
                validate_control(wrapper_protocol_version, &request_id, &path)?;
                let response = match host.approve_trusted_project(Path::new(&path)) {
                    Ok(project) => WrapperResponse::ProjectApproved {
                        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                        request_id,
                        project,
                    },
                    Err(_) => refused(request_id, "the trusted project could not be approved"),
                };
                write_frame(output, &response)?;
            }
            WrapperControl::RecoverProject {
                wrapper_protocol_version,
                request_id,
                project_id,
                path,
            } => {
                validate_control(wrapper_protocol_version, &request_id, &path)?;
                if !valid_control_token(&project_id, MAX_WRAPPER_IDENTITY_BYTES) {
                    return Err("the wrapper project identity is invalid".to_string());
                }
                let response = match host.recover_trusted_project(&project_id, Path::new(&path)) {
                    Ok(project) => WrapperResponse::ProjectApproved {
                        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                        request_id,
                        project,
                    },
                    Err(_) => refused(request_id, "the trusted project could not be recovered"),
                };
                write_frame(output, &response)?;
            }
            WrapperControl::ApproveOpen {
                wrapper_protocol_version,
                request_id,
                path,
            } => {
                validate_control(wrapper_protocol_version, &request_id, &path)?;
                let response = match host.approve_trusted_open(Path::new(&path)) {
                    Ok(intent) => WrapperResponse::OpenApproved {
                        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                        request_id,
                        intent,
                    },
                    Err(_) => refused(request_id, "the trusted path could not be opened"),
                };
                write_frame(output, &response)?;
            }
        }
    }
    Ok(())
}

fn refused(request_id: String, problem: &str) -> WrapperResponse {
    WrapperResponse::Refused {
        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        request_id,
        problem: problem.to_string(),
    }
}

fn validate_control_version(version: u16) -> Result<(), String> {
    if version == WRAPPER_PROTOCOL_VERSION {
        Ok(())
    } else {
        Err("the wrapper control version is incompatible".to_string())
    }
}

fn validate_control(version: u16, request_id: &str, path: &str) -> Result<(), String> {
    validate_control_version(version)?;
    if !valid_control_token(request_id, 64) {
        return Err("the wrapper control request identity is invalid".to_string());
    }
    if path.len() > MAX_WRAPPER_PATH_BYTES || path.contains('\0') || !Path::new(path).is_absolute()
    {
        return Err("the wrapper control path is invalid".to_string());
    }
    Ok(())
}

fn valid_control_token(value: &str, limit: usize) -> bool {
    !value.is_empty()
        && value.len() <= limit
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn read_frame<T: DeserializeOwned, R: BufRead>(input: &mut R) -> Result<Option<T>, String> {
    let mut bytes = Vec::new();
    let read = Read::by_ref(input)
        .take((MAX_WRAPPER_FRAME_BYTES + 1) as u64)
        .read_until(b'\n', &mut bytes)
        .map_err(|_| "the private wrapper channel could not be read".to_string())?;
    if read == 0 {
        return Ok(None);
    }
    if bytes.len() > MAX_WRAPPER_FRAME_BYTES {
        return Err("the private wrapper frame is too large".to_string());
    }
    if bytes.pop() != Some(b'\n') {
        return Err("the private wrapper frame is incomplete".to_string());
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| "the private wrapper frame is invalid".to_string())
}

fn write_frame<T: Serialize, W: Write>(output: &mut W, frame: &T) -> Result<(), String> {
    let bytes = serde_json::to_vec(frame)
        .map_err(|_| "the private wrapper frame could not be encoded".to_string())?;
    if bytes.len() + 1 > MAX_WRAPPER_FRAME_BYTES {
        return Err("the private wrapper frame is too large".to_string());
    }
    output
        .write_all(&bytes)
        .and_then(|_| output.write_all(b"\n"))
        .and_then(|_| output.flush())
        .map_err(|_| "the private wrapper channel could not be written".to_string())
}

#[cfg(test)]
mod tests {
    use std::io::Cursor;

    use super::*;

    fn startup() -> WrapperStartup {
        WrapperStartup {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
            application_version: env!("CARGO_PKG_VERSION").to_string(),
            launch_path: Some("/work/notes/plan.md".to_string()),
        }
    }

    #[test]
    fn startup_and_readiness_use_one_bounded_closed_json_line() {
        let expected = startup();
        let mut encoded = Vec::new();
        write_frame(&mut encoded, &expected).unwrap();

        assert_eq!(
            read_frame(&mut Cursor::new(encoded)).unwrap(),
            Some(expected)
        );
        assert!(read_frame::<WrapperStartup, _>(&mut Cursor::new(
            b"{\"wrapperProtocolVersion\":1,\"applicationVersion\":\"0.2.10\",\"launchPath\":null,\"extra\":true}\n"
        ))
        .is_err());
        assert!(read_frame::<WrapperStartup, _>(&mut Cursor::new(b"{}".as_slice())).is_err());
        let oversized = vec![b'x'; MAX_WRAPPER_FRAME_BYTES + 1];
        assert!(read_frame::<WrapperStartup, _>(&mut Cursor::new(oversized)).is_err());
    }

    #[test]
    fn startup_requires_exact_versions_and_an_absolute_optional_path() {
        assert!(validate_startup(&startup()).is_ok());
        assert!(validate_startup(&WrapperStartup {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION + 1,
            ..startup()
        })
        .is_err());
        assert!(validate_startup(&WrapperStartup {
            launch_path: Some("relative/project".to_string()),
            ..startup()
        })
        .is_err());
    }

    #[test]
    fn eof_and_one_exact_shutdown_frame_stop_the_child() {
        let host = HostService::open_project(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
        assert!(run_controls(&mut Cursor::new(Vec::<u8>::new()), &mut Vec::new(), &host).is_ok());
        let mut encoded = Vec::new();
        write_frame(
            &mut encoded,
            &WrapperControl::Shutdown {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
            },
        )
        .unwrap();
        assert!(run_controls(&mut Cursor::new(encoded), &mut Vec::new(), &host).is_ok());
    }

    #[test]
    fn trusted_controls_return_correlated_typed_results_and_sanitized_refusals() {
        let server_root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let workspace_root = server_root.parent().expect("workspace packages directory");
        let host_root = workspace_root.join("host");
        let app_root = workspace_root.join("app");
        let host = HostService::open_project(server_root).expect("open wrapper test host");
        let mut approve = Vec::new();
        write_frame(
            &mut approve,
            &WrapperControl::ApproveProject {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-1".to_string(),
                path: host_root.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        let mut approved_output = Vec::new();

        run_controls(&mut Cursor::new(approve), &mut approved_output, &host).unwrap();

        let approved = read_frame::<WrapperResponse, _>(&mut Cursor::new(approved_output))
            .unwrap()
            .expect("project approval response");
        let WrapperResponse::ProjectApproved {
            request_id,
            project,
            ..
        } = approved
        else {
            panic!("expected a project approval response");
        };
        assert_eq!(request_id, "request-1");
        assert_eq!(project.root, host_root.to_string_lossy());

        let refused_path = server_root
            .join("does-not-exist-private-path")
            .join("selected.txt");
        let mut controls = Vec::new();
        write_frame(
            &mut controls,
            &WrapperControl::RecoverProject {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-2".to_string(),
                project_id: project.id,
                path: app_root.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        write_frame(
            &mut controls,
            &WrapperControl::ApproveOpen {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-3".to_string(),
                path: refused_path.to_string_lossy().into_owned(),
            },
        )
        .unwrap();
        let mut output = Vec::new();

        run_controls(&mut Cursor::new(controls), &mut output, &host).unwrap();

        let mut responses = Cursor::new(output);
        let recovered = read_frame::<WrapperResponse, _>(&mut responses)
            .unwrap()
            .expect("project recovery response");
        assert!(matches!(
            recovered,
            WrapperResponse::ProjectApproved {
                request_id,
                project,
                ..
            } if request_id == "request-2" && project.root == app_root.to_string_lossy()
        ));
        let refused = read_frame::<WrapperResponse, _>(&mut responses)
            .unwrap()
            .expect("open refusal response");
        assert!(matches!(
            &refused,
            WrapperResponse::Refused {
                request_id,
                problem,
                ..
            } if request_id == "request-3" && !problem.contains("does-not-exist-private-path")
        ));
    }

    #[test]
    fn trusted_controls_require_exact_versions_ids_and_absolute_paths() {
        let host = HostService::open_project(Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
        for control in [
            WrapperControl::ApproveOpen {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION + 1,
                request_id: "request-1".to_string(),
                path: "/tmp/file".to_string(),
            },
            WrapperControl::ApproveOpen {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "contains spaces".to_string(),
                path: "/tmp/file".to_string(),
            },
            WrapperControl::ApproveOpen {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-3".to_string(),
                path: "relative/file".to_string(),
            },
            WrapperControl::ApproveOpen {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-4".to_string(),
                path: format!("/{}", "x".repeat(MAX_WRAPPER_PATH_BYTES)),
            },
            WrapperControl::RecoverProject {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
                request_id: "request-5".to_string(),
                project_id: "contains spaces".to_string(),
                path: "/tmp/project".to_string(),
            },
        ] {
            let mut encoded = Vec::new();
            write_frame(&mut encoded, &control).unwrap();
            assert!(run_controls(&mut Cursor::new(encoded), &mut Vec::new(), &host).is_err());
        }
    }
}
