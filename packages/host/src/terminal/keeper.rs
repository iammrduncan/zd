use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::os::fd::AsRawFd;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::os::unix::net::{UnixListener, UnixStream};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::{
    TerminalError, TerminalErrorKind, TerminalExitStatus, TerminalOutputBatch, TerminalScope,
    TerminalSessionHandle, TerminalSessionSnapshot, TerminalSessions, TerminalViewport,
    MAX_INPUT_BYTES, TERMINAL_KEEPER_ARGUMENT,
};

const RUNTIME_DIRECTORY: &str = "terminal-keeper-v1";
const SOCKET_FILE: &str = "control.sock";
const LOCK_FILE: &str = "keeper.lock";
const MAX_REQUEST_BYTES: usize = 256 * 1024;
const MAX_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
const IO_TIMEOUT: Duration = Duration::from_secs(10);
const EMPTY_IDLE_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct KeeperScope {
    project_id: String,
    worktree_id: String,
    cwd: PathBuf,
}

impl From<TerminalScope> for KeeperScope {
    fn from(scope: TerminalScope) -> Self {
        Self {
            project_id: scope.project_id,
            worktree_id: scope.worktree_id,
            cwd: scope.cwd,
        }
    }
}

impl KeeperScope {
    fn approve(self) -> Result<TerminalScope, TerminalError> {
        TerminalScope::from_approved_worktree(self.project_id, self.worktree_id, self.cwd)
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum KeeperRequest {
    Ping,
    Start {
        scope: KeeperScope,
        terminal_id: String,
        viewport: TerminalViewport,
    },
    Reattach {
        scope: KeeperScope,
        terminal_id: String,
        viewport: TerminalViewport,
    },
    Write {
        session: TerminalSessionHandle,
        bytes_base64: String,
    },
    Resize {
        session: TerminalSessionHandle,
        viewport: TerminalViewport,
    },
    Read {
        session: TerminalSessionHandle,
        after_offset: Option<u64>,
    },
    PollExit {
        session: TerminalSessionHandle,
    },
    Terminate {
        session: TerminalSessionHandle,
    },
    Dispose {
        session: TerminalSessionHandle,
    },
    Snapshot,
    #[cfg(test)]
    Shutdown,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(
    tag = "result",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum KeeperResponse {
    Pong,
    Started {
        session: TerminalSessionHandle,
    },
    Reattached {
        session: Option<TerminalSessionHandle>,
    },
    Written,
    Resized,
    Output {
        offset: u64,
        dropped_before: u64,
        bytes_base64: String,
        read_error: Option<String>,
    },
    Exit {
        status: Option<TerminalExitStatus>,
    },
    Terminated {
        status: TerminalExitStatus,
    },
    Disposed,
    Snapshot {
        sessions: Vec<TerminalSessionSnapshot>,
    },
    #[cfg(test)]
    Stopped,
    Error {
        kind: TerminalErrorKind,
        message: String,
    },
}

impl From<TerminalError> for KeeperResponse {
    fn from(error: TerminalError) -> Self {
        Self::Error {
            kind: error.kind,
            message: error.message,
        }
    }
}

#[derive(Clone)]
pub struct TerminalKeeperClient {
    state_directory: PathBuf,
    socket: PathBuf,
}

impl TerminalKeeperClient {
    pub fn connect_or_spawn(state_directory: &Path) -> Result<Self, String> {
        let client = Self::in_state(state_directory)?;
        if client.ping().is_ok() {
            return Ok(client);
        }
        let executable = std::env::current_exe()
            .map_err(|_| "the terminal keeper executable is unavailable".to_string())?;
        let mut command = Command::new(executable);
        command
            .arg(TERMINAL_KEEPER_ARGUMENT)
            .arg(&client.state_directory)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .process_group(0);
        let mut child = command
            .spawn()
            .map_err(|_| "the terminal keeper process could not start".to_string())?;
        let _ = thread::Builder::new()
            .name("zd-terminal-keeper-reaper".to_string())
            .spawn(move || {
                let _ = child.wait();
            });
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        while Instant::now() < deadline {
            if client.ping().is_ok() {
                return Ok(client);
            }
            thread::sleep(Duration::from_millis(20));
        }
        Err("the terminal keeper did not become ready".to_string())
    }

    fn in_state(state_directory: &Path) -> Result<Self, String> {
        if !state_directory.is_absolute() {
            return Err("the terminal keeper state directory must be absolute".to_string());
        }
        fs::create_dir_all(state_directory)
            .map_err(|_| "the terminal keeper state directory is unavailable".to_string())?;
        let state_directory = state_directory
            .canonicalize()
            .map_err(|_| "the terminal keeper state directory is unavailable".to_string())?;
        let runtime = prepare_runtime_directory(&state_directory)?;
        Ok(Self {
            state_directory,
            socket: runtime.join(SOCKET_FILE),
        })
    }

    fn ping(&self) -> Result<(), TerminalError> {
        match self.invoke(&KeeperRequest::Ping)? {
            KeeperResponse::Pong => Ok(()),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn start(
        &self,
        scope: TerminalScope,
        terminal_id: &str,
        viewport: TerminalViewport,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        match self.invoke(&KeeperRequest::Start {
            scope: scope.into(),
            terminal_id: terminal_id.to_string(),
            viewport,
        })? {
            KeeperResponse::Started { session } => Ok(session),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn reattach(
        &self,
        scope: &TerminalScope,
        terminal_id: &str,
        viewport: TerminalViewport,
    ) -> Result<Option<TerminalSessionHandle>, TerminalError> {
        match self.invoke(&KeeperRequest::Reattach {
            scope: scope.clone().into(),
            terminal_id: terminal_id.to_string(),
            viewport,
        })? {
            KeeperResponse::Reattached { session } => Ok(session),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn write(
        &self,
        session: &TerminalSessionHandle,
        bytes: &[u8],
    ) -> Result<(), TerminalError> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal input is limited to {MAX_INPUT_BYTES} bytes per write"),
            ));
        }
        match self.invoke(&KeeperRequest::Write {
            session: session.clone(),
            bytes_base64: STANDARD.encode(bytes),
        })? {
            KeeperResponse::Written => Ok(()),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn resize(
        &self,
        session: &TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        match self.invoke(&KeeperRequest::Resize {
            session: session.clone(),
            viewport,
        })? {
            KeeperResponse::Resized => Ok(()),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn read_from(
        &self,
        session: &TerminalSessionHandle,
        after_offset: Option<u64>,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        match self.invoke(&KeeperRequest::Read {
            session: session.clone(),
            after_offset,
        })? {
            KeeperResponse::Output {
                offset,
                dropped_before,
                bytes_base64,
                read_error,
            } => {
                let bytes = STANDARD.decode(bytes_base64).map_err(|_| {
                    TerminalError::new(
                        TerminalErrorKind::Io,
                        "terminal keeper output encoding is invalid",
                    )
                })?;
                Ok(TerminalOutputBatch {
                    offset,
                    dropped_before,
                    bytes,
                    read_error,
                })
            }
            response => Err(unexpected_response(response)),
        }
    }

    pub fn poll_exit(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        match self.invoke(&KeeperRequest::PollExit {
            session: session.clone(),
        })? {
            KeeperResponse::Exit { status } => Ok(status),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn terminate(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        match self.invoke(&KeeperRequest::Terminate {
            session: session.clone(),
        })? {
            KeeperResponse::Terminated { status } => Ok(status),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn dispose(&self, session: &TerminalSessionHandle) -> Result<(), TerminalError> {
        match self.invoke(&KeeperRequest::Dispose {
            session: session.clone(),
        })? {
            KeeperResponse::Disposed => Ok(()),
            response => Err(unexpected_response(response)),
        }
    }

    pub fn snapshot(&self) -> Result<Vec<TerminalSessionSnapshot>, TerminalError> {
        match self.invoke(&KeeperRequest::Snapshot)? {
            KeeperResponse::Snapshot { sessions } => Ok(sessions),
            response => Err(unexpected_response(response)),
        }
    }

    fn invoke(&self, request: &KeeperRequest) -> Result<KeeperResponse, TerminalError> {
        let mut stream = UnixStream::connect(&self.socket).map_err(keeper_io)?;
        stream
            .set_read_timeout(Some(IO_TIMEOUT))
            .map_err(keeper_io)?;
        stream
            .set_write_timeout(Some(IO_TIMEOUT))
            .map_err(keeper_io)?;
        write_frame(&mut stream, request, MAX_REQUEST_BYTES).map_err(keeper_io)?;
        let response =
            read_frame::<KeeperResponse>(&mut stream, MAX_RESPONSE_BYTES).map_err(keeper_io)?;
        match response {
            KeeperResponse::Error { kind, message } => Err(TerminalError::new(kind, message)),
            response => Ok(response),
        }
    }

    #[cfg(test)]
    fn shutdown(&self) -> Result<(), TerminalError> {
        match self.invoke(&KeeperRequest::Shutdown)? {
            KeeperResponse::Stopped => Ok(()),
            response => Err(unexpected_response(response)),
        }
    }
}

pub fn run_terminal_keeper(state_directory: &Path) -> Result<(), String> {
    run_terminal_keeper_with_idle(state_directory, EMPTY_IDLE_TIMEOUT)
}

fn run_terminal_keeper_with_idle(
    state_directory: &Path,
    empty_idle_timeout: Duration,
) -> Result<(), String> {
    let client = TerminalKeeperClient::in_state(state_directory)?;
    let runtime = client
        .socket
        .parent()
        .expect("the keeper socket has a runtime directory")
        .to_path_buf();
    let Some(_lock) = KeeperLock::acquire(&runtime.join(LOCK_FILE))? else {
        return Ok(());
    };
    if client.socket.exists() {
        fs::remove_file(&client.socket)
            .map_err(|_| "the stale terminal keeper socket could not be removed".to_string())?;
    }
    let listener = UnixListener::bind(&client.socket)
        .map_err(|_| "the terminal keeper socket could not be opened".to_string())?;
    fs::set_permissions(&client.socket, fs::Permissions::from_mode(0o600)).map_err(|_| {
        "the terminal keeper socket permissions could not be restricted".to_string()
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|_| "the terminal keeper socket could not become nonblocking".to_string())?;
    let _socket_cleanup = SocketCleanup(client.socket.clone());
    let sessions = Arc::new(Mutex::new(TerminalSessions::default()));
    let stopping = Arc::new(AtomicBool::new(false));
    let active_clients = Arc::new(AtomicUsize::new(0));
    let mut last_request = Instant::now();
    while !stopping.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((stream, _)) => {
                last_request = Instant::now();
                let sessions = Arc::clone(&sessions);
                let stopping = Arc::clone(&stopping);
                let client_counter = Arc::clone(&active_clients);
                active_clients.fetch_add(1, Ordering::AcqRel);
                if thread::Builder::new()
                    .name("zd-terminal-keeper-client".to_string())
                    .spawn(move || {
                        let _active = ActiveClient(client_counter);
                        serve_connection(stream, sessions, stopping);
                    })
                    .is_err()
                {
                    active_clients.fetch_sub(1, Ordering::AcqRel);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                let empty = sessions
                    .lock()
                    .map(|sessions| sessions.is_empty())
                    .unwrap_or(false);
                if empty
                    && active_clients.load(Ordering::Acquire) == 0
                    && last_request.elapsed() >= empty_idle_timeout
                {
                    break;
                }
                thread::sleep(Duration::from_millis(10));
            }
            Err(_) => return Err("the terminal keeper socket failed".to_string()),
        }
    }
    Ok(())
}

struct ActiveClient(Arc<AtomicUsize>);

impl Drop for ActiveClient {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

fn serve_connection(
    mut stream: UnixStream,
    sessions: Arc<Mutex<TerminalSessions>>,
    _stopping: Arc<AtomicBool>,
) {
    let response = match read_frame::<KeeperRequest>(&mut stream, MAX_REQUEST_BYTES) {
        Ok(KeeperRequest::Ping) => KeeperResponse::Pong,
        #[cfg(test)]
        Ok(KeeperRequest::Shutdown) => {
            _stopping.store(true, Ordering::Release);
            KeeperResponse::Stopped
        }
        Ok(request) => dispatch(request, &sessions),
        Err(error) => KeeperResponse::Error {
            kind: TerminalErrorKind::InvalidInput,
            message: error.to_string(),
        },
    };
    let _ = write_frame(&mut stream, &response, MAX_RESPONSE_BYTES);
}

fn dispatch(request: KeeperRequest, sessions: &Mutex<TerminalSessions>) -> KeeperResponse {
    let mut sessions = match sessions.lock() {
        Ok(sessions) => sessions,
        Err(_) => {
            return KeeperResponse::Error {
                kind: TerminalErrorKind::Io,
                message: "terminal keeper state is unavailable".to_string(),
            };
        }
    };
    let result = match request {
        KeeperRequest::Start {
            scope,
            terminal_id,
            viewport,
        } => scope.approve().and_then(|scope| {
            sessions
                .start_shell_with_id(scope, terminal_id, viewport)
                .map(|session| KeeperResponse::Started { session })
        }),
        KeeperRequest::Reattach {
            scope,
            terminal_id,
            viewport,
        } => scope.approve().and_then(|scope| {
            sessions
                .reattach(&scope, &terminal_id, viewport)
                .map(|session| KeeperResponse::Reattached { session })
        }),
        KeeperRequest::Write {
            session,
            bytes_base64,
        } => decode_input(&bytes_base64)
            .and_then(|bytes| sessions.write(&session, &bytes))
            .map(|()| KeeperResponse::Written),
        KeeperRequest::Resize { session, viewport } => sessions
            .resize(&session, viewport)
            .map(|()| KeeperResponse::Resized),
        KeeperRequest::Read {
            session,
            after_offset,
        } => sessions
            .read_from(&session, after_offset)
            .map(|output| KeeperResponse::Output {
                offset: output.offset,
                dropped_before: output.dropped_before,
                bytes_base64: STANDARD.encode(output.bytes),
                read_error: output.read_error,
            }),
        KeeperRequest::PollExit { session } => sessions
            .poll_exit(&session)
            .map(|status| KeeperResponse::Exit { status }),
        KeeperRequest::Terminate { session } => sessions
            .terminate(&session)
            .map(|status| KeeperResponse::Terminated { status }),
        KeeperRequest::Dispose { session } => sessions
            .dispose(&session)
            .map(|()| KeeperResponse::Disposed),
        KeeperRequest::Snapshot => Ok(KeeperResponse::Snapshot {
            sessions: sessions.snapshot(),
        }),
        KeeperRequest::Ping => unreachable!("handled before dispatch"),
        #[cfg(test)]
        KeeperRequest::Shutdown => unreachable!("handled before dispatch"),
    };
    result.unwrap_or_else(KeeperResponse::from)
}

fn decode_input(value: &str) -> Result<Vec<u8>, TerminalError> {
    let bytes = STANDARD.decode(value).map_err(|_| {
        TerminalError::new(
            TerminalErrorKind::InvalidInput,
            "terminal keeper input encoding is invalid",
        )
    })?;
    if bytes.len() > MAX_INPUT_BYTES {
        return Err(TerminalError::new(
            TerminalErrorKind::InvalidInput,
            format!("terminal input is limited to {MAX_INPUT_BYTES} bytes per write"),
        ));
    }
    Ok(bytes)
}

fn prepare_runtime_directory(state_directory: &Path) -> Result<PathBuf, String> {
    let runtime = state_directory.join(RUNTIME_DIRECTORY);
    if let Ok(metadata) = fs::symlink_metadata(&runtime) {
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err("the terminal keeper runtime path is invalid".to_string());
        }
    } else {
        fs::create_dir(&runtime)
            .map_err(|_| "the terminal keeper runtime directory is unavailable".to_string())?;
    }
    fs::set_permissions(&runtime, fs::Permissions::from_mode(0o700)).map_err(|_| {
        "the terminal keeper runtime permissions could not be restricted".to_string()
    })?;
    runtime
        .canonicalize()
        .map_err(|_| "the terminal keeper runtime directory is unavailable".to_string())
}

struct KeeperLock {
    _file: File,
}

impl KeeperLock {
    fn acquire(path: &Path) -> Result<Option<Self>, String> {
        let file = OpenOptions::new()
            .create(true)
            .read(true)
            .write(true)
            .mode(0o600)
            .custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW)
            .open(path)
            .map_err(|_| "the terminal keeper lock is unavailable".to_string())?;
        fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|_| {
            "the terminal keeper lock permissions could not be restricted".to_string()
        })?;
        // SAFETY: `file` owns this valid descriptor for at least as long as the lock guard.
        let acquired = unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) };
        if acquired == 0 {
            file.set_len(0)
                .and_then(|()| (&file).write_all(std::process::id().to_string().as_bytes()))
                .map_err(|_| "the terminal keeper lock could not be recorded".to_string())?;
            return Ok(Some(Self { _file: file }));
        }
        if io::Error::last_os_error().kind() == io::ErrorKind::WouldBlock {
            Ok(None)
        } else {
            Err("the terminal keeper lock could not be acquired".to_string())
        }
    }
}

struct SocketCleanup(PathBuf);

impl Drop for SocketCleanup {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}

fn write_frame<T: Serialize>(stream: &mut UnixStream, value: &T, maximum: usize) -> io::Result<()> {
    let payload = serde_json::to_vec(value)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
    if payload.is_empty() || payload.len() > maximum || payload.len() > u32::MAX as usize {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "terminal keeper frame exceeds its bound",
        ));
    }
    stream.write_all(&(payload.len() as u32).to_be_bytes())?;
    stream.write_all(&payload)?;
    stream.flush()
}

fn read_frame<T: DeserializeOwned>(stream: &mut UnixStream, maximum: usize) -> io::Result<T> {
    let mut prefix = [0_u8; 4];
    stream.read_exact(&mut prefix)?;
    let length = u32::from_be_bytes(prefix) as usize;
    if length == 0 || length > maximum {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "terminal keeper frame exceeds its bound",
        ));
    }
    let mut payload = vec![0_u8; length];
    stream.read_exact(&mut payload)?;
    serde_json::from_slice(&payload)
        .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))
}

fn keeper_io(error: io::Error) -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::Io,
        format!("terminal keeper communication failed: {error}"),
    )
}

fn unexpected_response(response: KeeperResponse) -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::Io,
        format!("terminal keeper returned an unexpected response: {response:?}"),
    )
}

#[cfg(test)]
pub(super) struct TestKeeper {
    client: TerminalKeeperClient,
    thread: Option<thread::JoinHandle<Result<(), String>>>,
}

#[cfg(test)]
impl TestKeeper {
    pub(super) fn start(state_directory: &Path) -> Result<Self, String> {
        Self::start_with_idle(state_directory, EMPTY_IDLE_TIMEOUT)
    }

    pub(super) fn start_with_idle(
        state_directory: &Path,
        empty_idle_timeout: Duration,
    ) -> Result<Self, String> {
        let client = TerminalKeeperClient::in_state(state_directory)?;
        let owned_state = state_directory.to_path_buf();
        let thread = thread::Builder::new()
            .name("zd-terminal-keeper-test".to_string())
            .spawn(move || run_terminal_keeper_with_idle(&owned_state, empty_idle_timeout))
            .map_err(|_| "the test terminal keeper could not start".to_string())?;
        let deadline = Instant::now() + CONNECT_TIMEOUT;
        while Instant::now() < deadline {
            if client.ping().is_ok() {
                return Ok(Self {
                    client,
                    thread: Some(thread),
                });
            }
            thread::sleep(Duration::from_millis(10));
        }
        Err("the test terminal keeper did not become ready".to_string())
    }

    pub(super) fn client(&self) -> TerminalKeeperClient {
        self.client.clone()
    }

    pub(super) fn wait_for_exit(&mut self, timeout: Duration) -> bool {
        let deadline = Instant::now() + timeout;
        while Instant::now() < deadline {
            if self
                .thread
                .as_ref()
                .is_some_and(|thread| thread.is_finished())
            {
                return self
                    .thread
                    .take()
                    .and_then(|thread| thread.join().ok())
                    .is_some_and(|result| result.is_ok());
            }
            thread::sleep(Duration::from_millis(10));
        }
        false
    }
}

#[cfg(test)]
impl Drop for TestKeeper {
    fn drop(&mut self) {
        let _ = self.client.shutdown();
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}
