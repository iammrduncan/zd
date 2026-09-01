//! Direct HTTP and WebSocket adapter for [`zd_host::HostService`].

mod assets;
mod cli;
mod foreground;
mod protocol;
mod server;
mod session;

pub use cli::ServeArgs;
pub use foreground::run_foreground;
pub use server::{start, RunningServer, ServerConfig};
#[doc(hidden)]
pub use session::{
    EventEnvelope, HostEvent, JournalUsage, ReplayDecision, ResyncReason, SessionRuntime,
    SessionSnapshot, CONTROLLER_DISCONNECT_GRACE, MAX_EVENT_JOURNAL_BYTES,
    MAX_EVENT_JOURNAL_EVENTS,
};

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_RESPONSE_MESSAGE_BYTES: usize = MAX_MESSAGE_BYTES;
pub const MAX_REPORTED_DURATION_MICROS: u64 = 60_000_000;
pub const HEARTBEAT_INTERVAL: std::time::Duration = std::time::Duration::from_secs(10);
pub const HEARTBEAT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// The same application configuration directory selected by the Tauri shell.
pub fn platform_state_directory() -> Result<std::path::PathBuf, String> {
    dirs::config_dir()
        .map(|directory| directory.join("com.zensuite.zd"))
        .ok_or_else(|| "the operating system configuration directory is unavailable".to_string())
}
