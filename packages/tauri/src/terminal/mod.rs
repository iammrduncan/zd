//! Bounded, project-scoped native pseudoterminal sessions.
//!
//! This module owns processes and bytes. The eventual Tauri integration may
//! expose these structured operations, but it must resolve a native project
//! grant before constructing `TerminalScope`; it must never add a generic
//! command/argv/environment endpoint.

mod output;
mod process;

use std::collections::HashMap;
use std::fmt;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use output::BoundedOutput;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use process::OutputReader;
use serde::{de, Deserialize, Deserializer, Serialize};

pub const DEFAULT_OUTPUT_LIMIT_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_OUTPUT_LIMIT_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_INPUT_BYTES: usize = 64 * 1024;
pub type TerminalOutputSignal = Arc<dyn Fn(TerminalSessionHandle) + Send + Sync + 'static>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum TerminalErrorKind {
    InvalidScope,
    InvalidViewport,
    InvalidInput,
    UnknownSession,
    Spawn,
    Io,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalError {
    pub kind: TerminalErrorKind,
    pub message: String,
}

impl TerminalError {
    pub(crate) fn new(kind: TerminalErrorKind, message: impl Into<String>) -> Self {
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputBatch {
    pub offset: u64,
    pub dropped_before: u64,
    pub bytes: Vec<u8>,
    pub read_error: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TerminalExitReason {
    Exited,
    Terminated,
    Disposed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitStatus {
    pub reason: TerminalExitReason,
    pub code: Option<u32>,
    pub signal: Option<String>,
}

pub struct TerminalSessions {
    next_identity: u64,
    output_limit_bytes: usize,
    sessions: HashMap<String, TerminalSession>,
}

impl Default for TerminalSessions {
    fn default() -> Self {
        Self::with_output_limit(DEFAULT_OUTPUT_LIMIT_BYTES)
            .expect("the built-in terminal output limit is valid")
    }
}

impl TerminalSessions {
    pub fn with_output_limit(output_limit_bytes: usize) -> Result<Self, TerminalError> {
        if output_limit_bytes == 0 || output_limit_bytes > MAX_OUTPUT_LIMIT_BYTES {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal output limit must be from 1 to {MAX_OUTPUT_LIMIT_BYTES} bytes"),
            ));
        }
        Ok(Self {
            next_identity: 1,
            output_limit_bytes,
            sessions: HashMap::new(),
        })
    }

    pub fn start_shell(
        &mut self,
        scope: TerminalScope,
        viewport: TerminalViewport,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let command = CommandBuilder::new_default_prog();
        self.start_command(scope, viewport, command, None)
    }

    pub fn start_shell_with_output_signal(
        &mut self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        output_signal: TerminalOutputSignal,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let command = CommandBuilder::new_default_prog();
        self.start_command(scope, viewport, command, Some(output_signal))
    }

    #[cfg(test)]
    pub fn start_probe(
        &mut self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        program: &str,
        arguments: &[&str],
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let mut command = CommandBuilder::new(program);
        command.args(arguments);
        self.start_command(scope, viewport, command, None)
    }

    fn start_command(
        &mut self,
        scope: TerminalScope,
        viewport: TerminalViewport,
        mut command: CommandBuilder,
        output_signal: Option<TerminalOutputSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
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
            session_id: format!("session-{:016x}", self.next_identity),
            project_id: scope.project_id,
            worktree_id: scope.worktree_id,
        };
        self.next_identity = self.next_identity.saturating_add(1);
        let output = Arc::new(Mutex::new(BoundedOutput::new(self.output_limit_bytes)));
        let output_reader =
            OutputReader::start(reader, Arc::clone(&output), handle.clone(), output_signal)?;
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

        self.sessions.insert(
            handle.session_id.clone(),
            TerminalSession {
                handle: handle.clone(),
                master: Some(pair.master),
                writer: Some(writer),
                child: Some(child),
                process_tree,
                output,
                output_reader: Some(output_reader),
                exit: None,
            },
        );
        Ok(handle)
    }

    pub fn contains(&self, handle: &TerminalSessionHandle) -> bool {
        self.session(handle).is_ok()
    }

    pub fn write(
        &mut self,
        handle: &TerminalSessionHandle,
        bytes: &[u8],
    ) -> Result<(), TerminalError> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(TerminalError::new(
                TerminalErrorKind::InvalidInput,
                format!("terminal input is limited to {MAX_INPUT_BYTES} bytes per write"),
            ));
        }
        let session = self.session_mut(handle)?;
        let writer = session.running_writer()?.as_mut();
        writer
            .write_all(bytes)
            .and_then(|()| writer.flush())
            .map_err(|error| TerminalError::new(TerminalErrorKind::Io, error.to_string()))
    }

    pub fn resize(
        &mut self,
        handle: &TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        let session = self.session_mut(handle)?;
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
        &mut self,
        handle: &TerminalSessionHandle,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        let session = self.session_mut(handle)?;
        let mut output = session
            .output
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        Ok(output.drain())
    }

    pub fn poll_exit(
        &mut self,
        handle: &TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        let session = self.session_mut(handle)?;
        session.poll_exit()
    }

    pub fn terminate(
        &mut self,
        handle: &TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        self.session_mut(handle)?
            .terminate(TerminalExitReason::Terminated)
    }

    pub fn dispose(&mut self, handle: &TerminalSessionHandle) -> Result<(), TerminalError> {
        let Some(session) = self.sessions.get(&handle.session_id) else {
            return Ok(());
        };
        if session.handle != *handle {
            return Err(unknown_session(handle));
        }
        self.sessions
            .get_mut(&handle.session_id)
            .expect("the checked terminal session exists")
            .terminate(TerminalExitReason::Disposed)?;
        self.sessions.remove(&handle.session_id);
        Ok(())
    }

    /// Stop and release every process, reader, writer, and buffered byte owned by
    /// this manager. One failed session never strands the rest.
    pub fn shutdown(&mut self) -> Result<(), TerminalError> {
        let mut first_error = None;
        for session in self.sessions.values_mut() {
            if let Err(error) = session.terminate(TerminalExitReason::Disposed) {
                first_error.get_or_insert(error);
            }
        }
        self.sessions.clear();
        match first_error {
            Some(error) => Err(error),
            None => Ok(()),
        }
    }

    fn session(&self, handle: &TerminalSessionHandle) -> Result<&TerminalSession, TerminalError> {
        self.sessions
            .get(&handle.session_id)
            .filter(|session| session.handle == *handle)
            .ok_or_else(|| unknown_session(handle))
    }

    fn session_mut(
        &mut self,
        handle: &TerminalSessionHandle,
    ) -> Result<&mut TerminalSession, TerminalError> {
        self.sessions
            .get_mut(&handle.session_id)
            .filter(|session| session.handle == *handle)
            .ok_or_else(|| unknown_session(handle))
    }
}

impl Drop for TerminalSessions {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
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
            reader.join()?;
        }
        Ok(())
    }
}
