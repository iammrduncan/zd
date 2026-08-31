use std::path::PathBuf;
use std::sync::Arc;

use zd_host::HostService;
use zd_server::{start, ServeArgs, ServerConfig};

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
    let host = Arc::new(HostService::open_project(arguments.project())?);
    let assets = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist");
    let server = start(host, ServerConfig::new(assets, arguments.port())).await?;

    println!("zd serve URL: {}", server.url());
    println!("zd serve secret: {}", server.secret());

    tokio::signal::ctrl_c()
        .await
        .map_err(|error| format!("could not wait for shutdown: {error}"))?;
    server.shutdown().await
}
