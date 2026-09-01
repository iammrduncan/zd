use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex, MutexGuard};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use serde::Serialize;

use super::format::{safe_token, unix_millis, ManifestLimits};
use super::retention::{apply_retention, catalog, DiagnosticCatalog};
use super::writer::SessionWriter;
use super::{DiagnosticRecordInput, ProcessSample};

static SESSION_IDENTITY: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticStatus {
    pub enabled: bool,
    pub session_id: Option<String>,
    pub background_sampling: bool,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticWriteOutcome {
    pub recorded: bool,
    pub problem: Option<String>,
}

#[derive(Debug, Clone)]
pub struct DiagnosticPolicy {
    pub sample_interval: Duration,
    pub max_segment_bytes: u64,
    pub max_session_bytes: u64,
    pub max_total_bytes: u64,
    pub max_sessions: usize,
    pub retention: Duration,
}

impl Default for DiagnosticPolicy {
    fn default() -> Self {
        Self {
            sample_interval: Duration::from_secs(30),
            max_segment_bytes: 1_048_576,
            max_session_bytes: 10_485_760,
            max_total_bytes: 52_428_800,
            max_sessions: 5,
            retention: Duration::from_secs(60 * 60 * 24 * 7),
        }
    }
}

impl DiagnosticPolicy {
    fn normalized(mut self) -> Self {
        self.sample_interval = self.sample_interval.max(Duration::from_millis(1));
        self.max_segment_bytes = self.max_segment_bytes.max(256);
        self.max_session_bytes = self
            .max_session_bytes
            .max(self.max_segment_bytes)
            .max(4_096);
        self.max_total_bytes = self.max_total_bytes.max(self.max_session_bytes);
        self.max_sessions = self.max_sessions.max(1);
        self
    }

    fn manifest_limits(&self) -> ManifestLimits {
        ManifestLimits {
            segment_bytes: self.max_segment_bytes,
            session_bytes: self.max_session_bytes,
            total_bytes: self.max_total_bytes,
            retained_sessions: self.max_sessions,
        }
    }
}

pub trait ProcessSampler: Send + Sync + 'static {
    fn sample(&self) -> Result<ProcessSample, String>;
}

impl<F> ProcessSampler for F
where
    F: Fn() -> Result<ProcessSample, String> + Send + Sync + 'static,
{
    fn sample(&self) -> Result<ProcessSample, String> {
        self()
    }
}

struct StopSignal {
    stopped: Mutex<bool>,
    changed: Condvar,
}

impl StopSignal {
    fn new() -> Self {
        Self {
            stopped: Mutex::new(false),
            changed: Condvar::new(),
        }
    }

    fn stop(&self) {
        *lock(&self.stopped) = true;
        self.changed.notify_all();
    }

    fn wait(&self, interval: Duration) -> bool {
        let stopped = lock(&self.stopped);
        if *stopped {
            return true;
        }
        let (stopped, _) = self
            .changed
            .wait_timeout_while(stopped, interval, |stopped| !*stopped)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        *stopped
    }
}

struct ActiveSession {
    writer: Arc<Mutex<SessionWriter>>,
    stop: Arc<StopSignal>,
    sampler_thread: Option<JoinHandle<()>>,
}

enum Lifecycle {
    Disabled { problem: Option<String> },
    Enabled(ActiveSession),
}

pub struct DiagnosticService {
    root: PathBuf,
    app_version: String,
    policy: DiagnosticPolicy,
    sampler: Arc<dyn ProcessSampler>,
    lifecycle: Mutex<Lifecycle>,
}

impl DiagnosticService {
    pub fn new(
        root: PathBuf,
        app_version: impl Into<String>,
        policy: DiagnosticPolicy,
        sampler: Arc<dyn ProcessSampler>,
    ) -> Self {
        let app_version = app_version.into();
        let app_version = if safe_token(&app_version) {
            app_version
        } else {
            "unknown".to_string()
        };
        Self {
            root,
            app_version,
            policy: policy.normalized(),
            sampler,
            lifecycle: Mutex::new(Lifecycle::Disabled { problem: None }),
        }
    }

    pub fn directory(&self) -> &Path {
        &self.root
    }

    pub fn status(&self) -> DiagnosticStatus {
        match &*lock(&self.lifecycle) {
            Lifecycle::Disabled { problem } => DiagnosticStatus {
                enabled: false,
                session_id: None,
                background_sampling: false,
                problem: problem.clone(),
            },
            Lifecycle::Enabled(active) => {
                let writer = lock(&active.writer);
                DiagnosticStatus {
                    enabled: true,
                    session_id: Some(writer.session_id().to_string()),
                    background_sampling: writer.accepting()
                        && active
                            .sampler_thread
                            .as_ref()
                            .is_some_and(|thread| !thread.is_finished()),
                    problem: writer.problem(),
                }
            }
        }
    }

    pub fn enable(&self) -> DiagnosticStatus {
        let mut lifecycle = lock(&self.lifecycle);
        if matches!(*lifecycle, Lifecycle::Enabled(_)) {
            drop(lifecycle);
            return self.status();
        }

        let now_ms = unix_millis();
        let warnings = apply_retention(
            &self.root,
            now_ms,
            self.policy.retention,
            self.policy.max_sessions,
            self.policy.max_total_bytes,
            self.policy.max_session_bytes,
        );
        let warning = warnings.first().cloned();
        let session_id = next_session_id(now_ms);
        let writer = match SessionWriter::create(
            &self.root,
            session_id,
            self.app_version.clone(),
            self.policy.manifest_limits(),
            warning,
        ) {
            Ok(writer) => Arc::new(Mutex::new(writer)),
            Err(problem) => {
                *lifecycle = Lifecycle::Disabled {
                    problem: Some(problem),
                };
                drop(lifecycle);
                return self.status();
            }
        };
        let stop = Arc::new(StopSignal::new());
        let sampler_thread = match spawn_sampler(
            writer.clone(),
            stop.clone(),
            self.sampler.clone(),
            self.policy.sample_interval,
        ) {
            Ok(thread) => thread,
            Err(problem) => {
                let close_problem = lock(&writer).close();
                *lifecycle = Lifecycle::Disabled {
                    problem: Some(close_problem.unwrap_or(problem)),
                };
                drop(lifecycle);
                return self.status();
            }
        };
        *lifecycle = Lifecycle::Enabled(ActiveSession {
            writer,
            stop,
            sampler_thread: Some(sampler_thread),
        });
        drop(lifecycle);
        self.status()
    }

    pub fn disable(&self) -> DiagnosticStatus {
        let active = {
            let mut lifecycle = lock(&self.lifecycle);
            match std::mem::replace(&mut *lifecycle, Lifecycle::Disabled { problem: None }) {
                Lifecycle::Disabled { problem } => {
                    *lifecycle = Lifecycle::Disabled { problem };
                    drop(lifecycle);
                    return self.status();
                }
                Lifecycle::Enabled(active) => active,
            }
        };

        active.stop.stop();
        let thread_problem = active
            .sampler_thread
            .and_then(|thread| thread.join().err())
            .map(|_| "diagnostic sampler did not close cleanly".to_string());
        let writer_problem = lock(&active.writer).close();
        let problem = writer_problem.or(thread_problem);
        *lock(&self.lifecycle) = Lifecycle::Disabled { problem };
        self.status()
    }

    pub fn record(&self, record: DiagnosticRecordInput) -> DiagnosticWriteOutcome {
        let (writer, stop) = match &*lock(&self.lifecycle) {
            Lifecycle::Disabled { problem } => {
                return DiagnosticWriteOutcome {
                    recorded: false,
                    problem: problem.clone(),
                }
            }
            Lifecycle::Enabled(active) => (active.writer.clone(), active.stop.clone()),
        };
        let result = lock(&writer).record_feature(&record);
        match result {
            Ok(()) => DiagnosticWriteOutcome {
                recorded: true,
                problem: None,
            },
            Err(problem) => {
                stop.stop();
                DiagnosticWriteOutcome {
                    recorded: false,
                    problem: Some(problem),
                }
            }
        }
    }

    pub fn catalog(&self) -> DiagnosticCatalog {
        catalog(&self.root)
    }
}

impl Drop for DiagnosticService {
    fn drop(&mut self) {
        let _ = self.disable();
    }
}

fn next_session_id(now_ms: u64) -> String {
    let identity = SESSION_IDENTITY.fetch_add(1, Ordering::Relaxed);
    format!(
        "session-{now_ms:013}-{:08x}-{identity:08x}",
        std::process::id()
    )
}

fn spawn_sampler(
    writer: Arc<Mutex<SessionWriter>>,
    stop: Arc<StopSignal>,
    sampler: Arc<dyn ProcessSampler>,
    interval: Duration,
) -> Result<JoinHandle<()>, String> {
    thread::Builder::new()
        .name("zd-diagnostic-sampler".to_string())
        .spawn(move || {
            while !stop.wait(interval) {
                let sample = match sampler.sample() {
                    Ok(sample) => sample,
                    Err(_) => {
                        let _ = lock(&writer)
                            .stop_with("diagnostic process sample is unavailable".to_string());
                        break;
                    }
                };
                if lock(&writer).record_sample(sample).is_err() {
                    break;
                }
            }
        })
        .map_err(|_| "diagnostic sampler could not start".to_string())
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}
