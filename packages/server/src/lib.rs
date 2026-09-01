//! Loopback HTTP and WebSocket adapter for [`zd_host::HostService`].

mod assets;
mod cli;
mod protocol;
mod server;

pub use cli::ServeArgs;
pub use server::{start, RunningServer, ServerConfig};

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_RESPONSE_MESSAGE_BYTES: usize = MAX_MESSAGE_BYTES;
pub const MAX_REPORTED_DURATION_MICROS: u64 = 60_000_000;

/// The same application configuration directory selected by the Tauri shell.
pub fn platform_state_directory() -> Result<std::path::PathBuf, String> {
    dirs::config_dir()
        .map(|directory| directory.join("com.zensuite.zd"))
        .ok_or_else(|| "the operating system configuration directory is unavailable".to_string())
}
