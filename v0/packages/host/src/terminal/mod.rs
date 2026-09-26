//! Bounded, project-scoped native pseudoterminal sessions.
//!
//! This module owns processes and bytes. The eventual Tauri integration may
//! expose these structured operations, but it must resolve a native project
//! grant before constructing `TerminalScope`; it must never add a generic
//! command/argv/environment endpoint.

#[cfg(unix)]
mod keeper;
mod output;
mod process;
mod runtime;
#[cfg(test)]
mod tests;

#[cfg(unix)]
pub use keeper::run_terminal_keeper;
#[cfg(unix)]
pub(crate) use keeper::TerminalKeeperClient;
pub(crate) use runtime::{TerminalMode, TerminalRuntime};

pub const TERMINAL_KEEPER_ARGUMENT: &str = "__zd-terminal-keeper";

use std::collections::HashMap;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use output::BoundedOutput;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use process::OutputReader;
use serde::{de, Deserialize, Deserializer, Serialize};

pub const DEFAULT_OUTPUT_LIMIT_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_OUTPUT_LIMIT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_INPUT_BYTES: usize = 64 * 1024;
pub const MAX_TERMINAL_SESSIONS: usize = 32;
pub type TerminalOutputSignal = Arc<dyn Fn(TerminalSessionHandle) + Send + Sync + 'static>;
pub type TerminalExitSignal = Arc<dyn Fn(TerminalSessionHandle) + Send + Sync + 'static>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalErrorKind {
    InvalidScope,
    InvalidViewport,
    InvalidInput,
    UnknownSession,
    Spawn,
    Io,
    NotOwner,
    IncompatibleKeeper,
    AlreadyExists,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalError {
    pub kind: TerminalErrorKind,
    pub message: String,
}

impl TerminalError {
    pub fn new(kind: TerminalErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }
}

impl fmt::Display for TerminalError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for TerminalError {}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalScope {
    pub project_id: String,
    pub worktree_id: String,
    cwd: PathBuf,
}

impl TerminalScope {
    /// Construct only after the native grant store resolves `worktree_id`.
    pub fn from_approved_worktree(
        project_id: impl Into<String>,
        worktree_id: impl Into<String>,
        approved_root: impl AsRef<Path>,
    ) -> Result<Self, TerminalError> {
        let project_id = valid_identity("project", project_id.into())?;
        let worktree_id = valid_identity("worktree", worktree_id.into())?;
        let requested = approved_root.as_ref();
        let cwd = requested.canonicalize().map_err(|error| {
            TerminalError::new(
                TerminalErrorKind::InvalidScope,
                format!(
                    "{} is not an available worktree: {error}",
                    requested.display()
                ),
            )
        })?;
        if !cwd.is_dir() {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidScope,
                format!("{} is not a worktree directory", requested.display()),
            ));
        }
        Ok(Self {
            project_id,
            worktree_id,
            cwd,
        })
    }
}

fn valid_identity(kind: &str, identity: String) -> Result<String, TerminalError> {
    if identity.is_empty() || identity.len() > 256 || identity.contains('\0') {
        return Err(TerminalError::new(
            TerminalErrorKind::InvalidScope,
            format!("{kind} identity is invalid"),
        ));
    }
    Ok(identity)
}

fn valid_terminal_identity(identity: String) -> Result<String, TerminalError> {
    if identity.is_empty() || identity.len() > 256 || identity.contains('\0') {
        return Err(TerminalError::new(
            TerminalErrorKind::InvalidInput,
            "terminal identity is invalid",
        ));
    }
    Ok(identity)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalViewport {
    rows: u16,
    columns: u16,
    pixel_width: u16,
    pixel_height: u16,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct TerminalViewportWire {
    rows: u16,
    columns: u16,
    pixel_width: u16,
    pixel_height: u16,
}

impl<'de> Deserialize<'de> for TerminalViewport {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let wire = TerminalViewportWire::deserialize(deserializer)?;
        Self::new(wire.rows, wire.columns, wire.pixel_width, wire.pixel_height)
            .map_err(de::Error::custom)
    }
}

/// The complete start authority accepted from the webview.
///
/// Cwd, executable, arguments, and environment are deliberately impossible to
/// deserialize here. Native grant resolution supplies the cwd and this module
/// starts only the user's configured shell.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalStartRequest {
    pub project_id: String,
    pub worktree_id: String,
    pub terminal_id: String,
    pub viewport: TerminalViewport,
}

impl TerminalViewport {
    pub fn new(
        rows: u16,
        columns: u16,
        pixel_width: u16,
        pixel_height: u16,
    ) -> Result<Self, TerminalError> {
        if rows == 0 || columns == 0 {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidViewport,
                "terminal rows and columns must be greater than zero",
            ));
        }
        Ok(Self {
            rows,
            columns,
            pixel_width,
            pixel_height,
        })
    }

    fn pty_size(self) -> PtySize {
        PtySize {
            rows: self.rows,
            cols: self.columns,
            pixel_width: self.pixel_width,
            pixel_height: self.pixel_height,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TerminalSessionHandle {
    pub session_id: String,
    pub project_id: String,
    pub worktree_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputBatch {
    pub offset: u64,
    pub next_offset: u64,
    pub dropped_before: u64,
    pub bytes: Vec<u8>,
    pub read_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalExitReason {
    Exited,
    Terminated,
    Disposed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitStatus {
    pub reason: TerminalExitReason,
    pub code: Option<u32>,
    pub signal: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalAvailability {
    Running,
    Exited,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSessionSnapshot {
    pub session: TerminalSessionHandle,
    pub retained_from: u64,
    pub next_offset: u64,
    pub availability: TerminalAvailability,
    pub exit: Option<TerminalExitStatus>,
}

/// Terminal session records. The map lock is held only to insert, remove, or
/// borrow a session handle; per-session work runs under that session's own
/// lock so one busy or wedged terminal never serializes the others.
pub struct TerminalSessions {
    next_identity: AtomicU64,
    output_limit_bytes: usize,
    session_limit: usize,
    sessions: Mutex<HashMap<String, Arc<Mutex<TerminalSession>>>>,
}

impl Default for TerminalSessions {
    fn default() -> Self {
        Self::with_output_limit(DEFAULT_OUTPUT_LIMIT_BYTES)
            .expect("the built-in terminal output limit is valid")
    }
}

impl TerminalSessions {
    pub fn with_output_limit(output_limit_bytes: usize) -> Result<Self, TerminalError> {
        Self::with_limits(output_limit_bytes, MAX_TERMINAL_SESSIONS)
    }

    fn with_limits(output_limit_bytes: usize, session_limit: usize) -> Result<Self, TerminalError> {
        if output_limit_bytes == 0 || output_limit_bytes > MAX_OUTPUT_LIMIT_BYTES {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal output limit must be from 1 to {MAX_OUTPUT_LIMIT_BYTES} bytes"),
            ));
        }
        if session_limit == 0 || session_limit > MAX_TERMINAL_SESSIONS {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal sessions are limited to {MAX_TERMINAL_SESSIONS}"),
            ));
        }
        Ok(Self {
            next_identity: AtomicU64::new(1),
            output_limit_bytes,
            session_limit,
            sessions: Mutex::new(HashMap::new()),
        })
    }

    #[cfg(test)]
    fn with_session_limit(session_limit: usize) -> Result<Self, TerminalError> {
        Self::with_limits(DEFAULT_OUTPUT_LIMIT_BYTES, session_limit)
    }

    pub fn start_shell(
        &self,
        scope: TerminalScope,
        viewport: TerminalViewport,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = self.next_terminal_identity();
        let command = CommandBuilder::new_default_prog();
        self.start_command(scope, terminal_id, viewport, command, None, None)
    }

    pub fn start_shell_with_id(
        &self,
        scope: TerminalScope,
        terminal_id: impl Into<String>,
        viewport: TerminalViewport,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = valid_terminal_identity(terminal_id.into())?;
        let command = CommandBuilder::new_default_prog();
        self.start_command(scope, terminal_id, viewport, command, None, None)
    }

    pub fn start_shell_with_output_signal(
        &self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        output_signal: TerminalOutputSignal,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = self.next_terminal_identity();
        let command = CommandBuilder::new_default_prog();
        self.start_command(
            scope,
            terminal_id,
            viewport,
            command,
            Some(output_signal),
            None,
        )
    }

    pub fn start_shell_with_signals(
        &self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        output_signal: Option<TerminalOutputSignal>,
        exit_signal: Option<TerminalExitSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = self.next_terminal_identity();
        let command = CommandBuilder::new_default_prog();
        self.start_command(
            scope,
            terminal_id,
            viewport,
            command,
            output_signal,
            exit_signal,
        )
    }

    pub fn start_shell_with_id_and_signals(
        &self,
        scope: TerminalScope,
        terminal_id: impl Into<String>,
        viewport: TerminalViewport,
        output_signal: Option<TerminalOutputSignal>,
        exit_signal: Option<TerminalExitSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = valid_terminal_identity(terminal_id.into())?;
        let command = CommandBuilder::new_default_prog();
        self.start_command(
            scope,
            terminal_id,
            viewport,
            command,
            output_signal,
            exit_signal,
        )
    }

    #[cfg(test)]
    pub fn start_probe(
        &self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        program: &str,
        arguments: &[&str],
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let terminal_id = self.next_terminal_identity();
        let mut command = CommandBuilder::new(program);
        command.args(arguments);
        self.start_command(scope, terminal_id, viewport, command, None, None)
    }

    fn start_command(
        &self,
        scope: TerminalScope,
        terminal_id: String,
        viewport: TerminalViewport,
        mut command: CommandBuilder,
        output_signal: Option<TerminalOutputSignal>,
        exit_signal: Option<TerminalExitSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        {
            let map = self.map();
            if map.len() >= self.session_limit {
                return Err(TerminalError::new(
                    TerminalErrorKind::InvalidInput,
                    format!("terminal sessions are limited to {}", self.session_limit),
                ));
            }
            if map.contains_key(&terminal_id) {
                return Err(already_exists(&terminal_id));
            }
        }
        command.cwd(&scope.cwd);
        command.env("TERM", "xterm-256color");
        command.env("COLORTERM", "truecolor");
        command.env("TERM_PROGRAM", "zd");

        let pair = native_pty_system()
            .openpty(viewport.pty_size())
            .map_err(|error| TerminalError::new(TerminalErrorKind::Spawn, error.to_string()))?;
        let reader = pair
            .master
            .try_clone_reader()
            .map_err(|error| TerminalError::new(TerminalErrorKind::Io, error.to_string()))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|error| TerminalError::new(TerminalErrorKind::Io, error.to_string()))?;
        let handle = TerminalSessionHandle {
            session_id: terminal_id,
            project_id: scope.project_id,
            worktree_id: scope.worktree_id,
        };
        let output = Arc::new(Mutex::new(BoundedOutput::new(self.output_limit_bytes)));
        let output_reader = OutputReader::start(
            reader,
            Arc::clone(&output),
            handle.clone(),
            output_signal,
            exit_signal,
        )?;
        let child = match pair.slave.spawn_command(command) {
            Ok(child) => child,
            Err(error) => {
                drop(pair.slave);
                drop(writer);
                drop(pair.master);
                output_reader.join()?;
                return Err(TerminalError::new(
                    TerminalErrorKind::Spawn,
                    error.to_string(),
                ));
            }
        };
        drop(pair.slave);
        let process_tree = match process::ProcessTree::attach(pair.master.as_ref(), child.as_ref())
        {
            Ok(process_tree) => process_tree,
            Err(error) => {
                let mut child = child;
                let _ = child.kill();
                drop(writer);
                drop(pair.master);
                let _ = child.wait();
                output_reader.join()?;
                return Err(error);
            }
        };

        let mut session = TerminalSession {
            handle: handle.clone(),
            master: Some(pair.master),
            writer: Some(writer),
            child: Some(child),
            process_tree,
            output,
            output_reader: Some(output_reader),
            exit: None,
        };
        {
            let mut map = self.map();
            if map.contains_key(&handle.session_id) {
                drop(map);
                let _ = session.terminate(TerminalExitReason::Disposed);
                return Err(already_exists(&handle.session_id));
            }
            if map.len() >= self.session_limit {
                drop(map);
                let _ = session.terminate(TerminalExitReason::Disposed);
                return Err(TerminalError::new(
                    TerminalErrorKind::InvalidInput,
                    format!("terminal sessions are limited to {}", self.session_limit),
                ));
            }
            map.insert(handle.session_id.clone(), Arc::new(Mutex::new(session)));
        }
        Ok(handle)
    }

    pub fn reattach(
        &self,
        scope: &TerminalScope,
        terminal_id: &str,
        viewport: TerminalViewport,
    ) -> Result<Option<TerminalSessionHandle>, TerminalError> {
        let terminal_id = valid_terminal_identity(terminal_id.to_string())?;
        let Some(session) = self.map().get(&terminal_id).cloned() else {
            return Ok(None);
        };
        let mut session = lock_session(&session);
        if session.handle.project_id != scope.project_id
            || session.handle.worktree_id != scope.worktree_id
        {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidScope,
                "terminal identity belongs to a different approved scope",
            ));
        }
        let handle = session.handle.clone();
        if session.poll_exit()?.is_none() {
            session
                .running_master()?
                .resize(viewport.pty_size())
                .map_err(|error| {
                    TerminalError::new(
                        TerminalErrorKind::Io,
                        format!("terminal resize failed: {error}"),
                    )
                })?;
        }
        Ok(Some(handle))
    }

    fn next_terminal_identity(&self) -> String {
        let identity = self.next_identity.fetch_add(1, Ordering::Relaxed);
        format!("session-{identity:016x}")
    }

    pub fn contains(&self, handle: &TerminalSessionHandle) -> bool {
        self.session(handle).is_ok()
    }

    fn is_empty(&self) -> bool {
        self.map().is_empty()
    }

    pub fn snapshot(&self) -> Vec<TerminalSessionSnapshot> {
        let sessions: Vec<Arc<Mutex<TerminalSession>>> = self.map().values().cloned().collect();
        let mut snapshot = sessions
            .iter()
            .map(|session| {
                let mut session = lock_session(session);
                let (availability, exit) = match session.poll_exit() {
                    Ok(Some(exit)) => (TerminalAvailability::Exited, Some(exit)),
                    Ok(None) => (TerminalAvailability::Running, None),
                    Err(_) => (TerminalAvailability::Unavailable, None),
                };
                let (retained_from, next_offset) = session
                    .output
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner())
                    .offsets();
                TerminalSessionSnapshot {
                    session: session.handle.clone(),
                    retained_from,
                    next_offset,
                    availability,
                    exit,
                }
            })
            .collect::<Vec<_>>();
        snapshot.sort_by(|left, right| left.session.session_id.cmp(&right.session.session_id));
        snapshot
    }

    pub fn write(&self, handle: &TerminalSessionHandle, bytes: &[u8]) -> Result<(), TerminalError> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal input is limited to {MAX_INPUT_BYTES} bytes per write"),
            ));
        }
        let session = self.session(handle)?;
        let mut session = lock_session(&session);
        let writer = session.running_writer()?.as_mut();
        writer
            .write_all(bytes)
            .and_then(|()| writer.flush())
            .map_err(|error| TerminalError::new(TerminalErrorKind::Io, error.to_string()))
    }

    pub fn resize(
        &self,
        handle: &TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        let session = self.session(handle)?;
        let session = lock_session(&session);
        session
            .running_master()?
            .resize(viewport.pty_size())
            .map_err(|error| {
                TerminalError::new(
                    TerminalErrorKind::Io,
                    format!("terminal resize failed: {error}"),
                )
            })
    }

    pub fn read(
        &self,
        handle: &TerminalSessionHandle,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        let session = self.session(handle)?;
        let session = lock_session(&session);
        let mut output = session
            .output
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Ok(output.drain())
    }

    pub fn read_from(
        &self,
        handle: &TerminalSessionHandle,
        after_offset: Option<u64>,
        limit: usize,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        let session = self.session(handle)?;
        let session = lock_session(&session);
        let output = session
            .output
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Ok(output.read_from(after_offset, limit))
    }

    pub fn poll_exit(
        &self,
        handle: &TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        let session = self.session(handle)?;
        let mut session = lock_session(&session);
        session.poll_exit()
    }

    pub fn terminate(
        &self,
        handle: &TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        let session = self.session(handle)?;
        let mut session = lock_session(&session);
        session.terminate(TerminalExitReason::Terminated)
    }

    pub fn dispose(&self, handle: &TerminalSessionHandle) -> Result<(), TerminalError> {
        let Some(session) = self.map().get(&handle.session_id).cloned() else {
            return Ok(());
        };
        if lock_session(&session).handle != *handle {
            return Err(unknown_session(handle));
        }
        // Disposal always releases the record: a teardown error must not leave
        // a ghost session the caller can reattach to but never close.
        self.map().remove(&handle.session_id);
        let mut session = lock_session(&session);
        session.terminate(TerminalExitReason::Disposed).map(|_| ())
    }

    /// Stop and release every process, reader, writer, and buffered byte owned by
    /// this manager. One failed session never strands the rest.
    pub fn shutdown(&self) -> Result<(), TerminalError> {
        let sessions: Vec<Arc<Mutex<TerminalSession>>> =
            self.map().drain().map(|(_, session)| session).collect();
        let mut first_error = None;
        for session in sessions {
            let mut session = lock_session(&session);
            if let Err(error) = session.terminate(TerminalExitReason::Disposed) {
                first_error.get_or_insert(error);
            }
        }
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn map(&self) -> MutexGuard<'_, HashMap<String, Arc<Mutex<TerminalSession>>>> {
        self.sessions
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn session(
        &self,
        handle: &TerminalSessionHandle,
    ) -> Result<Arc<Mutex<TerminalSession>>, TerminalError> {
        let session = self
            .map()
            .get(&handle.session_id)
            .cloned()
            .ok_or_else(|| unknown_session(handle))?;
        if lock_session(&session).handle == *handle {
            Ok(session)
        } else {
            Err(unknown_session(handle))
        }
    }
}

fn lock_session(session: &Arc<Mutex<TerminalSession>>) -> MutexGuard<'_, TerminalSession> {
    session
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

impl Drop for TerminalSessions {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn already_exists(terminal_id: &str) -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::AlreadyExists,
        format!("terminal identity {terminal_id} already exists"),
    )
}

fn unknown_session(handle: &TerminalSessionHandle) -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::UnknownSession,
        format!("unknown terminal session {}", handle.session_id),
    )
}

struct TerminalSession {
    handle: TerminalSessionHandle,
    master: Option<Box<dyn MasterPty + Send>>,
    writer: Option<Box<dyn Write + Send>>,
    child: Option<Box<dyn Child + Send + Sync>>,
    process_tree: process::ProcessTree,
    output: Arc<Mutex<BoundedOutput>>,
    output_reader: Option<OutputReader>,
    exit: Option<TerminalExitStatus>,
}

impl TerminalSession {
    fn running_writer(&mut self) -> Result<&mut Box<dyn Write + Send>, TerminalError> {
        self.writer.as_mut().ok_or_else(|| {
            TerminalError::new(TerminalErrorKind::Io, "terminal process has already exited")
        })
    }

    fn running_master(&self) -> Result<&(dyn MasterPty + Send), TerminalError> {
        self.master.as_deref().ok_or_else(|| {
            TerminalError::new(TerminalErrorKind::Io, "terminal process has already exited")
        })
    }

    fn poll_exit(&mut self) -> Result<Option<TerminalExitStatus>, TerminalError> {
        if let Some(exit) = &self.exit {
            return Ok(Some(exit.clone()));
        }
        let Some(status) = self
            .child
            .as_mut()
            .expect("a running terminal owns its child")
            .try_wait()
            .map_err(|error| TerminalError::new(TerminalErrorKind::Io, error.to_string()))?
        else {
            return Ok(None);
        };
        self.finish(TerminalExitReason::Exited, status)?;
        Ok(self.exit.clone())
    }

    fn terminate(
        &mut self,
        reason: TerminalExitReason,
    ) -> Result<TerminalExitStatus, TerminalError> {
        if let Some(exit) = &self.exit {
            return Ok(exit.clone());
        }
        let status = process::terminate(
            self.child
                .as_mut()
                .expect("a running terminal owns its child")
                .as_mut(),
            &mut self.process_tree,
        )?;
        self.finish(reason, status)?;
        Ok(self.exit.clone().expect("finish records terminal exit"))
    }

    fn finish(
        &mut self,
        reason: TerminalExitReason,
        status: portable_pty::ExitStatus,
    ) -> Result<(), TerminalError> {
        self.process_tree.cleanup_descendants()?;
        self.writer.take();
        self.master.take();
        self.child.take();
        self.exit = Some(TerminalExitStatus {
            reason,
            code: status.signal().is_none().then(|| status.exit_code()),
            signal: status.signal().map(str::to_string),
        });
        if let Some(reader) = self.output_reader.take() {
            reader.join_bounded();
        }
        Ok(())
    }
}
