use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;

use zd_host::HostService;

use crate::{platform_state_directory, start, ServeArgs, ServerConfig};

pub fn run_foreground(arguments: ServeArgs) -> Result<(), String> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("could not start the served runtime: {error}"))?
        .block_on(run(arguments))
}

async fn run(arguments: ServeArgs) -> Result<(), String> {
    let state_directory = state_directory()?;
    let host = Arc::new(HostService::open_project_with_state(
        arguments.project(),
        &state_directory,
    )?);
    let assets = assets_directory()?;
    let server = start(
        host,
        ServerConfig::new(assets, arguments.bind(), arguments.port()),
    )
    .await?;

    {
        let stdout = io::stdout();
        let mut output = stdout.lock();
        writeln!(output, "zd serve URL: {}", server.url())
            .and_then(|_| writeln!(output, "zd serve secret: {}", server.secret()))
            .and_then(|_| output.flush())
            .map_err(|error| format!("could not report served readiness: {error}"))?;
    }

    wait_for_shutdown_signal().await?;
    server.shutdown().await
}

pub(crate) fn state_directory() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(directory) = std::env::var_os("ZD_TEST_STATE_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            return Err("ZD_TEST_STATE_DIR must be an absolute test path".to_string());
        }
        return Ok(directory);
    }
    platform_state_directory()
}

pub(crate) fn assets_directory() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(directory) = std::env::var_os("ZD_TEST_ASSETS_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            return Err("ZD_TEST_ASSETS_DIR must be an absolute test path".to_string());
        }
        return Ok(directory);
    }
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist"))
}

#[cfg(unix)]
async fn wait_for_shutdown_signal() -> Result<(), String> {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate())
        .map_err(|error| format!("could not listen for shutdown: {error}"))?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            result.map_err(|error| format!("could not wait for shutdown: {error}"))
        }
        _ = terminate.recv() => Ok(()),
    }
}

#[cfg(not(unix))]
async fn wait_for_shutdown_signal() -> Result<(), String> {
    tokio::signal::ctrl_c()
        .await
        .map_err(|error| format!("could not wait for shutdown: {error}"))
}
