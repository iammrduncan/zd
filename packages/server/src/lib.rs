//! Loopback HTTP and WebSocket adapter for [`zd_host::HostService`].

mod assets;
mod protocol;
mod server;

pub use server::{start, RunningServer, ServerConfig};

pub const PROTOCOL_VERSION: u16 = 1;
pub const MAX_MESSAGE_BYTES: usize = 64 * 1024;
pub const MAX_REPORTED_DURATION_MICROS: u64 = 60_000_000;
