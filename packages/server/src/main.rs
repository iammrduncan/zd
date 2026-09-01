use std::path::PathBuf;
use std::sync::Arc;

use zd_host::HostService;
use zd_server::{platform_state_directory, start, ServeArgs, ServerConfig};

#[tokio::main]
async fn main() {
    if let Err(problem) = run().await {
        eprintln!("zd serve: {problem}");
        std::process::exit(1);
    }
}

async fn run() -> Result<(), String> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let arguments = ServeArgs::parse(&arguments)?;
    let state_directory = match arguments.state_directory() {
        Some(directory) => directory.to_path_buf(),
        None => platform_state_directory()?,
    };
    let host = Arc::new(HostService::open_project_with_state(
        arguments.project(),
        &state_directory,
    )?);
    let assets = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist");
    let server = start(host, ServerConfig::new(assets, arguments.port())).await?;

    println!("zd serve URL: {}", server.url());
    println!("zd serve secret: {}", server.secret());

    tokio::signal::ctrl_c()
        .await
        .map_err(|error| format!("could not wait for shutdown: {error}"))?;
    server.shutdown().await
}
