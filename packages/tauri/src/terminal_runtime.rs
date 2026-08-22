//! The only Tauri boundary for native terminal sessions.
//!
//! The webview supplies stable grant identities and viewport/input data. This
//! module resolves the cwd from `LaunchState`; it never accepts a path,
//! executable, argument list, or environment map.

use std::sync::{Mutex, MutexGuard};

use serde::Serialize;

use crate::cli::LaunchState;
use crate::terminal::{
    TerminalError, TerminalErrorKind, TerminalExitStatus, TerminalOutputBatch, TerminalScope,
    TerminalSessionHandle, TerminalSessions, TerminalStartRequest, TerminalViewport,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputResponse {
    pub session: TerminalSessionHandle,
    pub offset: u64,
    pub dropped_before: u64,
    pub bytes: Vec<u8>,
    pub read_error: Option<String>,
}

impl TerminalOutputResponse {
    fn from_batch(session: TerminalSessionHandle, batch: TerminalOutputBatch) -> Self {
        Self {
            session,
            offset: batch.offset,
            dropped_before: batch.dropped_before,
            bytes: batch.bytes,
            read_error: batch.read_error,
        }
    }
}

#[derive(Default)]
pub struct TerminalState(Mutex<TerminalSessions>);

impl TerminalState {
    fn sessions(&self) -> Result<MutexGuard<'_, TerminalSessions>, TerminalError> {
        self.0.lock().map_err(|_| {
            TerminalError::new(
                TerminalErrorKind::Io,
                "native terminal session state is unavailable",
            )
        })
    }

    fn start(
        &self,
        launch: &LaunchState,
        request: TerminalStartRequest,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let root = launch
            .root(&request.project_id, &request.worktree_id)
            .map_err(|problem| TerminalError::new(TerminalErrorKind::InvalidScope, problem))?;
        let scope =
            TerminalScope::from_approved_worktree(request.project_id, request.worktree_id, root)?;
        self.sessions()?.start_shell(scope, request.viewport)
    }

    fn write(&self, session: TerminalSessionHandle, bytes: Vec<u8>) -> Result<(), TerminalError> {
        self.sessions()?.write(&session, &bytes)
    }

    fn resize(
        &self,
        session: TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        self.sessions()?.resize(&session, viewport)
    }

    fn read(
        &self,
        session: TerminalSessionHandle,
    ) -> Result<TerminalOutputResponse, TerminalError> {
        let batch = self.sessions()?.read(&session)?;
        Ok(TerminalOutputResponse::from_batch(session, batch))
    }

    fn poll_exit(
        &self,
        session: TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        self.sessions()?.poll_exit(&session)
    }

    fn terminate(
        &self,
        session: TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        self.sessions()?.terminate(&session)
    }

    fn dispose(&self, session: TerminalSessionHandle) -> Result<(), TerminalError> {
        self.sessions()?.dispose(&session)
    }

    pub fn shutdown(&self) {
        if let Ok(mut sessions) = self.0.lock() {
            let _ = sessions.shutdown();
        }
    }
}

#[tauri::command]
pub fn terminal_start(
    state: tauri::State<'_, TerminalState>,
    launch: tauri::State<'_, LaunchState>,
    request: TerminalStartRequest,
) -> Result<TerminalSessionHandle, TerminalError> {
    state.start(&launch, request)
}

#[tauri::command]
pub fn terminal_write(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
    bytes: Vec<u8>,
) -> Result<(), TerminalError> {
    state.write(session, bytes)
}

#[tauri::command]
pub fn terminal_resize(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
    viewport: TerminalViewport,
) -> Result<(), TerminalError> {
    state.resize(session, viewport)
}

#[tauri::command]
pub fn terminal_read(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
) -> Result<TerminalOutputResponse, TerminalError> {
    state.read(session)
}

#[tauri::command]
pub fn terminal_poll_exit(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
) -> Result<Option<TerminalExitStatus>, TerminalError> {
    state.poll_exit(session)
}

#[tauri::command]
pub fn terminal_terminate(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
) -> Result<TerminalExitStatus, TerminalError> {
    state.terminate(session)
}

#[tauri::command]
pub fn terminal_dispose(
    state: tauri::State<'_, TerminalState>,
    session: TerminalSessionHandle,
) -> Result<(), TerminalError> {
    state.dispose(session)
}

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};

    use crate::cli::{LaunchState, NativeOpenRequest};
    use crate::terminal::{TerminalErrorKind, TerminalStartRequest, TerminalViewport};

    use super::TerminalState;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-terminal-runtime-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn request(launch: &LaunchState) -> TerminalStartRequest {
        let current = launch.current();
        TerminalStartRequest {
            project_id: current.project.unwrap().id,
            worktree_id: current.worktree_id.unwrap(),
            viewport: TerminalViewport::new(24, 80, 0, 0).unwrap(),
        }
    }

    #[test]
    fn state_resolves_only_native_approved_scopes_and_disposes_idempotently() {
        let scratch = Scratch::new();
        let launch = LaunchState::new(NativeOpenRequest {
            path: Some(scratch.path().to_string_lossy().into_owned()),
        });
        let state = TerminalState::default();
        let handle = state.start(&launch, request(&launch)).unwrap();

        state.dispose(handle.clone()).unwrap();
        state.dispose(handle).unwrap();

        let mut outside = request(&launch);
        outside.project_id = "project-not-approved".to_string();
        assert_eq!(
            state.start(&launch, outside).unwrap_err().kind,
            TerminalErrorKind::InvalidScope
        );
    }

    #[test]
    fn shutdown_releases_every_session_handle() {
        let scratch = Scratch::new();
        let launch = LaunchState::new(NativeOpenRequest {
            path: Some(scratch.path().to_string_lossy().into_owned()),
        });
        let state = TerminalState::default();
        let handle = state.start(&launch, request(&launch)).unwrap();

        state.shutdown();

        assert_eq!(
            state.poll_exit(handle).unwrap_err().kind,
            TerminalErrorKind::UnknownSession
        );
    }
}
