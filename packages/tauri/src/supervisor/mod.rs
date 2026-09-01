mod process;
mod validation;

use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::{mpsc, Arc, Condvar, Mutex, MutexGuard, Weak};
use std::time::{Duration, Instant};

pub use validation::{validate_readiness, ValidatedReadiness};

const STARTUP_WAIT: Duration = Duration::from_secs(11);
const SHUTDOWN_WAIT: Duration = Duration::from_secs(7);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SupervisorPhase {
    Idle,
    Starting,
    Ready,
    Stopping,
    Exited,
    Stopped,
    Failed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SupervisorSnapshot {
    pub generation: u64,
    pub phase: SupervisorPhase,
    pub origin: Option<String>,
    pub session_epoch: Option<String>,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DesktopBootstrap {
    pub origin: String,
    pub session_epoch: String,
    pub secret: String,
}

#[derive(Debug, Clone)]
pub struct SupervisorLaunch {
    pub(super) executable: PathBuf,
    pub(super) launch_path: Option<PathBuf>,
    pub(super) environment: Vec<(OsString, OsString)>,
}

impl SupervisorLaunch {
    pub fn new(executable: impl Into<PathBuf>, launch_path: Option<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
            launch_path,
            environment: Vec::new(),
        }
    }

    pub fn with_environment(mut self, name: impl AsRef<OsStr>, value: impl AsRef<OsStr>) -> Self {
        self.environment
            .push((name.as_ref().to_os_string(), value.as_ref().to_os_string()));
        self
    }

    fn validate(&self) -> Result<(), String> {
        if self
            .launch_path
            .as_deref()
            .is_some_and(|path| !path.is_absolute())
        {
            return Err("the desktop launch path must be absolute".to_string());
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub struct Supervisor {
    inner: Arc<Inner>,
}

impl Default for Supervisor {
    fn default() -> Self {
        Self {
            inner: Arc::new(Inner::default()),
        }
    }
}

impl Supervisor {
    pub fn start(&self, launch: SupervisorLaunch) -> Result<SupervisorSnapshot, String> {
        launch.validate()?;
        let (commands, receiver) = mpsc::channel();
        let generation = {
            let mut state = self.inner.lock();
            if state.command.is_some()
                || matches!(
                    state.phase,
                    SupervisorPhase::Starting | SupervisorPhase::Ready | SupervisorPhase::Stopping
                )
            {
                return Err("the desktop host process is already active".to_string());
            }
            state.generation = state.generation.saturating_add(1);
            state.phase = SupervisorPhase::Starting;
            state.readiness = None;
            state.bootstrap_available = false;
            state.problem = None;
            state.command = Some(commands);
            state.generation
        };

        let inner = Arc::downgrade(&self.inner);
        if std::thread::Builder::new()
            .name("zd-desktop-host-owner".to_string())
            .spawn(move || process::run(inner, generation, launch, receiver))
            .is_err()
        {
            self.inner.finish(
                generation,
                SupervisorPhase::Failed,
                Some("the desktop host process owner could not start".to_string()),
            );
        }

        let deadline = Instant::now() + STARTUP_WAIT;
        let mut state = self.inner.lock();
        while state.phase == SupervisorPhase::Starting {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                state.phase = SupervisorPhase::Stopping;
                let command = state.command.clone();
                self.inner.changed.notify_all();
                drop(state);
                if let Some(command) = command {
                    let _ = command.send(process::ProcessCommand::Shutdown);
                }
                return Err("the desktop host did not become ready before the deadline".to_string());
            }
            let waited = self.inner.changed.wait_timeout(state, remaining);
            let (next, _) = waited.unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
        }

        let snapshot = snapshot(&state);
        match state.phase {
            SupervisorPhase::Ready => Ok(snapshot),
            SupervisorPhase::Failed | SupervisorPhase::Exited => Err(state
                .problem
                .clone()
                .unwrap_or_else(|| "the desktop host failed before readiness".to_string())),
            SupervisorPhase::Stopping | SupervisorPhase::Stopped => {
                Err("the desktop host startup was cancelled".to_string())
            }
            SupervisorPhase::Idle | SupervisorPhase::Starting => {
                Err("the desktop host did not become ready".to_string())
            }
        }
    }

    pub fn snapshot(&self) -> SupervisorSnapshot {
        snapshot(&self.inner.lock())
    }

    pub fn take_bootstrap(&self) -> Result<DesktopBootstrap, String> {
        let mut state = self.inner.lock();
        if state.phase != SupervisorPhase::Ready || !state.bootstrap_available {
            return Err("the desktop bootstrap is unavailable".to_string());
        }
        let readiness = state
            .readiness
            .clone()
            .ok_or_else(|| "the desktop bootstrap is unavailable".to_string())?;
        state.bootstrap_available = false;
        Ok(DesktopBootstrap {
            origin: readiness.origin,
            session_epoch: readiness.session_epoch,
            secret: readiness.secret,
        })
    }

    pub fn rearm_bootstrap(&self, origin: &str) -> bool {
        let mut state = self.inner.lock();
        let matches_ready_host = state.phase == SupervisorPhase::Ready
            && state
                .readiness
                .as_ref()
                .is_some_and(|readiness| readiness.origin == origin);
        if matches_ready_host {
            state.bootstrap_available = true;
        }
        matches_ready_host
    }

    pub fn shutdown(&self) -> Result<(), String> {
        let command = {
            let mut state = self.inner.lock();
            if state.command.is_none() {
                state.phase = SupervisorPhase::Stopped;
                state.readiness = None;
                state.bootstrap_available = false;
                self.inner.changed.notify_all();
                return Ok(());
            }
            state.phase = SupervisorPhase::Stopping;
            state.command.clone()
        };
        if let Some(command) = command {
            let _ = command.send(process::ProcessCommand::Shutdown);
        }

        let deadline = Instant::now() + SHUTDOWN_WAIT;
        let mut state = self.inner.lock();
        while state.command.is_some() {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Err("the desktop host process did not stop before the deadline".to_string());
            }
            let waited = self.inner.changed.wait_timeout(state, remaining);
            let (next, _) = waited.unwrap_or_else(|poisoned| poisoned.into_inner());
            state = next;
        }
        state.phase = SupervisorPhase::Stopped;
        state.readiness = None;
        state.bootstrap_available = false;
        self.inner.changed.notify_all();
        Ok(())
    }
}

#[derive(Debug)]
pub(super) struct Inner {
    state: Mutex<State>,
    changed: Condvar,
}

impl Default for Inner {
    fn default() -> Self {
        Self {
            state: Mutex::new(State::default()),
            changed: Condvar::new(),
        }
    }
}

impl Inner {
    fn lock(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    pub(super) fn ready(&self, generation: u64, readiness: ValidatedReadiness) -> bool {
        let mut state = self.lock();
        if state.generation != generation || state.phase != SupervisorPhase::Starting {
            return false;
        }
        state.phase = SupervisorPhase::Ready;
        state.readiness = Some(readiness);
        state.bootstrap_available = true;
        self.changed.notify_all();
        true
    }

    pub(super) fn finish(&self, generation: u64, phase: SupervisorPhase, problem: Option<String>) {
        let mut state = self.lock();
        if state.generation != generation {
            return;
        }
        state.phase = phase;
        state.readiness = None;
        state.bootstrap_available = false;
        state.problem = problem;
        state.command = None;
        self.changed.notify_all();
    }
}

pub(super) fn with_inner<T>(inner: &Weak<Inner>, apply: impl FnOnce(&Inner) -> T) -> Option<T> {
    inner.upgrade().map(|inner| apply(&inner))
}

#[derive(Debug)]
struct State {
    generation: u64,
    phase: SupervisorPhase,
    readiness: Option<ValidatedReadiness>,
    bootstrap_available: bool,
    problem: Option<String>,
    command: Option<mpsc::Sender<process::ProcessCommand>>,
}

impl Default for State {
    fn default() -> Self {
        Self {
            generation: 0,
            phase: SupervisorPhase::Idle,
            readiness: None,
            bootstrap_available: false,
            problem: None,
            command: None,
        }
    }
}

fn snapshot(state: &State) -> SupervisorSnapshot {
    SupervisorSnapshot {
        generation: state.generation,
        phase: state.phase,
        origin: state
            .readiness
            .as_ref()
            .map(|readiness| readiness.origin.clone()),
        session_epoch: state
            .readiness
            .as_ref()
            .map(|readiness| readiness.session_epoch.clone()),
        problem: state.problem.clone(),
    }
}
