use std::path::Path;
use std::sync::Mutex;

#[cfg(unix)]
use super::TerminalKeeperClient;
use super::{
    TerminalError, TerminalErrorKind, TerminalExitSignal, TerminalExitStatus, TerminalOutputBatch,
    TerminalOutputSignal, TerminalScope, TerminalSessionHandle, TerminalSessionSnapshot,
    TerminalSessions, TerminalViewport,
};

#[derive(Clone, Copy)]
pub(crate) enum TerminalMode {
    Local,
    Keeper,
}

pub(crate) enum TerminalRuntime {
    Local(Mutex<TerminalSessions>),
    #[cfg(unix)]
    Keeper(TerminalKeeperClient),
}

impl TerminalRuntime {
    pub(crate) fn local() -> Self {
        Self::Local(Mutex::new(TerminalSessions::default()))
    }

    pub(crate) fn open(mode: TerminalMode, state_directory: &Path) -> Result<Self, String> {
        match mode {
            TerminalMode::Local => Ok(Self::local()),
            TerminalMode::Keeper => {
                #[cfg(unix)]
                {
                    TerminalKeeperClient::connect_or_spawn(state_directory).map(Self::Keeper)
                }
                #[cfg(not(unix))]
                {
                    let _ = state_directory;
                    Ok(Self::local())
                }
            }
        }
    }

    pub(crate) fn start(
        &self,
        scope: TerminalScope,
        terminal_id: String,
        viewport: TerminalViewport,
        output_signal: Option<TerminalOutputSignal>,
        exit_signal: Option<TerminalExitSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .start_shell_with_id_and_signals(
                    scope,
                    terminal_id,
                    viewport,
                    output_signal,
                    exit_signal,
                ),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.start(scope, &terminal_id, viewport),
        }
    }

    pub(crate) fn reattach(
        &self,
        scope: &TerminalScope,
        terminal_id: &str,
        viewport: TerminalViewport,
    ) -> Result<Option<TerminalSessionHandle>, TerminalError> {
        match self {
            Self::Local(sessions) => {
                sessions
                    .lock()
                    .map_err(|_| unavailable())?
                    .reattach(scope, terminal_id, viewport)
            }
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.reattach(scope, terminal_id, viewport),
        }
    }

    pub(crate) fn write(
        &self,
        session: &TerminalSessionHandle,
        bytes: &[u8],
    ) -> Result<(), TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .write(session, bytes),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.write(session, bytes),
        }
    }

    pub(crate) fn resize(
        &self,
        session: &TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .resize(session, viewport),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.resize(session, viewport),
        }
    }

    pub(crate) fn read_from(
        &self,
        session: &TerminalSessionHandle,
        after_offset: Option<u64>,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .read_from(session, after_offset),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.read_from(session, after_offset),
        }
    }

    pub(crate) fn poll_exit(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .poll_exit(session),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.poll_exit(session),
        }
    }

    pub(crate) fn terminate(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        match self {
            Self::Local(sessions) => sessions
                .lock()
                .map_err(|_| unavailable())?
                .terminate(session),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.terminate(session),
        }
    }

    pub(crate) fn dispose(&self, session: &TerminalSessionHandle) -> Result<(), TerminalError> {
        match self {
            Self::Local(sessions) => sessions.lock().map_err(|_| unavailable())?.dispose(session),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.dispose(session),
        }
    }

    pub(crate) fn snapshot(&self) -> Result<Vec<TerminalSessionSnapshot>, TerminalError> {
        match self {
            Self::Local(sessions) => Ok(sessions.lock().map_err(|_| unavailable())?.snapshot()),
            #[cfg(unix)]
            Self::Keeper(keeper) => keeper.snapshot(),
        }
    }

    pub(crate) fn is_external(&self) -> bool {
        match self {
            Self::Local(_) => false,
            #[cfg(unix)]
            Self::Keeper(_) => true,
        }
    }
}

fn unavailable() -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::Io,
        "Terminal session state is unavailable",
    )
}
