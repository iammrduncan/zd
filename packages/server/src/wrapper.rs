use std::io::{self, BufRead, BufReader, Read, Write};
use std::net::Ipv4Addr;
use std::path::Path;
use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use zd_host::HostService;

use crate::foreground::{assets_directory, state_directory};
use crate::{start, ServerConfig, PROTOCOL_VERSION};

pub const WRAPPER_PROTOCOL_VERSION: u16 = 1;
pub const MAX_WRAPPER_FRAME_BYTES: usize = 16 * 1024;

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
    Shutdown { wrapper_protocol_version: u16 },
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
        HostService::open_desktop_with_state(launch_path, &state_directory)
            .map_err(|_| "the trusted desktop launch could not be approved".to_string())?,
    );
    let server = start(
        host,
        ServerConfig::new(assets_directory()?, Ipv4Addr::LOCALHOST, 0),
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
        let _ = finished.send(wait_for_shutdown(&mut input));
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

fn wait_for_shutdown<R: BufRead>(input: &mut R) -> Result<(), String> {
    let Some(control) = read_frame::<WrapperControl, _>(input)? else {
        return Ok(());
    };
    match control {
        WrapperControl::Shutdown {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        } => Ok(()),
        WrapperControl::Shutdown { .. } => {
            Err("the wrapper control version is incompatible".to_string())
        }
    }
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
        assert!(wait_for_shutdown(&mut Cursor::new(Vec::<u8>::new())).is_ok());
        let mut encoded = Vec::new();
        write_frame(
            &mut encoded,
            &WrapperControl::Shutdown {
                wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
            },
        )
        .unwrap();
        assert!(wait_for_shutdown(&mut Cursor::new(encoded)).is_ok());
    }
}
