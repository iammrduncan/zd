use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tokio::sync::{broadcast, watch};
use zd_host::file_tree_watch::FileTreeWatchSnapshot;
use zd_host::terminal::TerminalSessionSnapshot;
use zd_host::HostService;

use crate::PROTOCOL_VERSION;

pub const MAX_EVENT_JOURNAL_EVENTS: usize = 1_024;
pub const MAX_EVENT_JOURNAL_BYTES: usize = 1_024 * 1_024;
pub const CONTROLLER_DISCONNECT_GRACE: Duration = Duration::from_secs(30);
const OUTBOUND_EVENT_CAPACITY: usize = 256;
const MAX_RETIRED_CONTROLLER_IDS: usize = 64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResyncReason {
    OutboundOverflow,
    ControllerGraceExpired,
}

impl ResyncReason {
    fn wire(self) -> &'static str {
        match self {
            Self::OutboundOverflow => "outbound-overflow",
            Self::ControllerGraceExpired => "controller-grace-expired",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostEvent {
    FileTreeChanged {
        project_id: String,
        worktree_id: String,
        watch_id: String,
    },
    FileTreeUnavailable {
        project_id: String,
        worktree_id: String,
        watch_id: String,
    },
    TerminalOutputReady {
        session_id: String,
        project_id: String,
        worktree_id: String,
    },
    TerminalExited {
        session_id: String,
        project_id: String,
        worktree_id: String,
    },
    SessionResyncRequired {
        reason: ResyncReason,
    },
}

impl HostEvent {
    fn wire(self) -> (&'static str, Value) {
        match self {
            Self::FileTreeChanged {
                project_id,
                worktree_id,
                watch_id,
            } => (
                "fileTree.changed",
                json!({
                    "projectId": project_id,
                    "worktreeId": worktree_id,
                    "watchId": watch_id,
                }),
            ),
            Self::FileTreeUnavailable {
                project_id,
                worktree_id,
                watch_id,
            } => (
                "fileTree.unavailable",
                json!({
                    "projectId": project_id,
                    "worktreeId": worktree_id,
                    "watchId": watch_id,
                }),
            ),
            Self::TerminalOutputReady {
                session_id,
                project_id,
                worktree_id,
            } => (
                "terminal.outputReady",
                json!({
                    "session": {
                        "sessionId": session_id,
                        "projectId": project_id,
                        "worktreeId": worktree_id,
                    },
                }),
            ),
            Self::TerminalExited {
                session_id,
                project_id,
                worktree_id,
            } => (
                "terminal.exited",
                json!({
                    "session": {
                        "sessionId": session_id,
                        "projectId": project_id,
                        "worktreeId": worktree_id,
                    },
                }),
            ),
            Self::SessionResyncRequired { reason } => {
                ("session.resyncRequired", json!({ "reason": reason.wire() }))
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EventEnvelope {
    protocol_version: u16,
    #[serde(rename = "type")]
    message_type: &'static str,
    session_epoch: String,
    sequence: u64,
    event: &'static str,
    payload: Value,
}

impl EventEnvelope {
    pub fn sequence(&self) -> u64 {
        self.sequence
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReplayDecision {
    Replay(Vec<EventEnvelope>),
    ResyncRequired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct JournalUsage {
    pub events: usize,
    pub bytes: usize,
}

struct JournalEntry {
    envelope: EventEnvelope,
    serialized_bytes: usize,
}

#[derive(Default)]
struct JournalState {
    sequence: u64,
    serialized_bytes: usize,
    entries: VecDeque<JournalEntry>,
}

#[derive(Default)]
struct LifecycleState {
    active_controller: Option<ActiveController>,
    retired_controller_ids: VecDeque<String>,
    cleanup_in_progress: bool,
    generation: u64,
    shutting_down: bool,
}

struct ActiveController {
    generation: u64,
    controller_id: Option<String>,
}

pub(crate) enum ControllerClaimError {
    Replaced,
    Unavailable,
}

pub(crate) enum ControllerClaimEnd {
    Replaced,
    ServerShutdown,
}

#[derive(Clone, Copy)]
struct ControllerSignal {
    generation: u64,
    shutting_down: bool,
}

pub(crate) struct ControllerClaim {
    generation: u64,
    changes: watch::Receiver<ControllerSignal>,
}

impl ControllerClaim {
    pub(crate) fn generation(&self) -> u64 {
        self.generation
    }

    pub(crate) async fn ended(&mut self) -> ControllerClaimEnd {
        loop {
            let signal = *self.changes.borrow_and_update();
            if signal.shutting_down {
                return ControllerClaimEnd::ServerShutdown;
            }
            if signal.generation != self.generation {
                return ControllerClaimEnd::Replaced;
            }
            if self.changes.changed().await.is_err() {
                return ControllerClaimEnd::ServerShutdown;
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub session_epoch: String,
    pub sequence: u64,
    pub resource_status: String,
    pub watches: Vec<FileTreeWatchSnapshot>,
    pub terminals: Vec<TerminalSessionSnapshot>,
}

pub struct SessionRuntime {
    epoch: Arc<str>,
    journal: Mutex<JournalState>,
    lifecycle: Mutex<LifecycleState>,
    controller_generation: watch::Sender<ControllerSignal>,
    events: broadcast::Sender<EventEnvelope>,
}

impl SessionRuntime {
    pub fn new(epoch: impl Into<Arc<str>>) -> Self {
        let (events, _) = broadcast::channel(OUTBOUND_EVENT_CAPACITY);
        let (controller_generation, _) = watch::channel(ControllerSignal {
            generation: 0,
            shutting_down: false,
        });
        Self {
            epoch: epoch.into(),
            journal: Mutex::new(JournalState::default()),
            lifecycle: Mutex::new(LifecycleState::default()),
            controller_generation,
            events,
        }
    }

    pub fn epoch(&self) -> Arc<str> {
        Arc::clone(&self.epoch)
    }

    pub fn current_sequence(&self) -> u64 {
        self.journal
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .sequence
    }

    pub fn publish(&self, event: HostEvent) -> EventEnvelope {
        let (event, payload) = event.wire();
        let envelope = {
            let mut journal = self
                .journal
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            journal.sequence = journal
                .sequence
                .checked_add(1)
                .expect("a served process cannot exhaust 64-bit event identities");
            let envelope = EventEnvelope {
                protocol_version: PROTOCOL_VERSION,
                message_type: "event",
                session_epoch: self.epoch.to_string(),
                sequence: journal.sequence,
                event,
                payload,
            };
            let serialized_bytes = serde_json::to_vec(&envelope).map_or(0, |wire| wire.len());
            journal.serialized_bytes = journal.serialized_bytes.saturating_add(serialized_bytes);
            journal.entries.push_back(JournalEntry {
                envelope: envelope.clone(),
                serialized_bytes,
            });
            while journal.entries.len() > MAX_EVENT_JOURNAL_EVENTS
                || journal.serialized_bytes > MAX_EVENT_JOURNAL_BYTES
            {
                let Some(released) = journal.entries.pop_front() else {
                    break;
                };
                journal.serialized_bytes = journal
                    .serialized_bytes
                    .saturating_sub(released.serialized_bytes);
            }
            envelope
        };
        let _ = self.events.send(envelope.clone());
        envelope
    }

    pub fn replay(&self, epoch: &str, after_sequence: u64) -> ReplayDecision {
        if epoch != self.epoch.as_ref() {
            return ReplayDecision::ResyncRequired;
        }
        let journal = self
            .journal
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if after_sequence > journal.sequence {
            return ReplayDecision::ResyncRequired;
        }
        if after_sequence == journal.sequence {
            return ReplayDecision::Replay(Vec::new());
        }
        let Some(expected) = after_sequence.checked_add(1) else {
            return ReplayDecision::ResyncRequired;
        };
        if journal
            .entries
            .front()
            .is_none_or(|entry| entry.envelope.sequence > expected)
        {
            return ReplayDecision::ResyncRequired;
        }
        let events = journal
            .entries
            .iter()
            .filter(|entry| entry.envelope.sequence > after_sequence)
            .map(|entry| entry.envelope.clone())
            .collect::<Vec<_>>();
        if events
            .first()
            .is_none_or(|event| event.sequence != expected)
            || events
                .last()
                .is_none_or(|event| event.sequence != journal.sequence)
        {
            return ReplayDecision::ResyncRequired;
        }
        ReplayDecision::Replay(events)
    }

    pub fn subscribe(&self) -> broadcast::Receiver<EventEnvelope> {
        self.events.subscribe()
    }

    pub fn claim_controller(&self) -> bool {
        self.claim_controller_with_id(None).is_ok()
    }

    pub(crate) fn claim_controller_with_id(
        &self,
        controller_id: Option<&str>,
    ) -> Result<ControllerClaim, ControllerClaimError> {
        let mut lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if lifecycle.cleanup_in_progress || lifecycle.shutting_down {
            return Err(ControllerClaimError::Unavailable);
        }
        if controller_id.is_some_and(|candidate| {
            lifecycle
                .retired_controller_ids
                .iter()
                .any(|retired| retired == candidate)
        }) {
            return Err(ControllerClaimError::Replaced);
        }
        if let Some(active) = &lifecycle.active_controller {
            match controller_id {
                None if active.controller_id.is_some() => {
                    return Err(ControllerClaimError::Replaced)
                }
                None => return Err(ControllerClaimError::Unavailable),
                Some(candidate) if active.controller_id.as_deref() == Some(candidate) => {}
                Some(_) => {
                    if let Some(retired) = active.controller_id.clone() {
                        lifecycle
                            .retired_controller_ids
                            .retain(|value| value != &retired);
                        lifecycle.retired_controller_ids.push_back(retired);
                        while lifecycle.retired_controller_ids.len() > MAX_RETIRED_CONTROLLER_IDS {
                            lifecycle.retired_controller_ids.pop_front();
                        }
                    }
                }
            }
        }
        lifecycle.generation = lifecycle.generation.saturating_add(1);
        let generation = lifecycle.generation;
        lifecycle.active_controller = Some(ActiveController {
            generation,
            controller_id: controller_id.map(str::to_string),
        });
        drop(lifecycle);
        self.controller_generation.send_replace(ControllerSignal {
            generation,
            shutting_down: false,
        });
        Ok(ControllerClaim {
            generation,
            changes: self.controller_generation.subscribe(),
        })
    }

    pub fn controller_disconnected(self: &Arc<Self>, host: Arc<HostService>) {
        let generation = self
            .lifecycle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .active_controller
            .as_ref()
            .map_or(0, |active| active.generation);
        self.controller_claim_disconnected(generation, host);
    }

    pub(crate) fn controller_claim_disconnected(
        self: &Arc<Self>,
        controller_generation: u64,
        host: Arc<HostService>,
    ) {
        let generation = {
            let mut lifecycle = self
                .lifecycle
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if lifecycle.shutting_down
                || lifecycle
                    .active_controller
                    .as_ref()
                    .is_none_or(|active| active.generation != controller_generation)
            {
                return;
            }
            lifecycle.active_controller = None;
            lifecycle.generation = lifecycle.generation.saturating_add(1);
            lifecycle.generation
        };
        self.controller_generation.send_replace(ControllerSignal {
            generation,
            shutting_down: false,
        });
        let runtime = Arc::clone(self);
        let deadline = tokio::time::Instant::now() + CONTROLLER_DISCONNECT_GRACE;
        tokio::spawn(async move {
            tokio::time::sleep_until(deadline).await;
            if !runtime.begin_grace_cleanup(generation) {
                return;
            }
            let cleanup_host = Arc::clone(&host);
            let _ = tokio::task::spawn_blocking(move || cleanup_host.shutdown_runtime()).await;
            runtime.complete_grace_cleanup(generation);
        });
    }

    pub fn authoritative_snapshot(&self, host: &HostService) -> Result<SessionSnapshot, String> {
        let sequence = self.current_sequence();
        let watches = host.file_tree_watch_snapshot();
        let terminals = host
            .terminal_snapshot()
            .map_err(|_| "Terminal session state is unavailable".to_string())?;
        Ok(SessionSnapshot {
            session_epoch: self.epoch.to_string(),
            sequence,
            resource_status: "active".to_string(),
            watches,
            terminals,
        })
    }

    pub fn begin_shutdown(&self) {
        let mut lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        lifecycle.shutting_down = true;
        lifecycle.active_controller = None;
        lifecycle.generation = lifecycle.generation.saturating_add(1);
        let generation = lifecycle.generation;
        drop(lifecycle);
        self.controller_generation.send_replace(ControllerSignal {
            generation,
            shutting_down: true,
        });
    }

    pub fn journal_usage(&self) -> JournalUsage {
        let journal = self
            .journal
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        JournalUsage {
            events: journal.entries.len(),
            bytes: journal.serialized_bytes,
        }
    }

    fn begin_grace_cleanup(&self, generation: u64) -> bool {
        let mut lifecycle = self
            .lifecycle
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if lifecycle.generation != generation
            || lifecycle.active_controller.is_some()
            || lifecycle.cleanup_in_progress
            || lifecycle.shutting_down
        {
            return false;
        }
        lifecycle.cleanup_in_progress = true;
        true
    }

    fn complete_grace_cleanup(&self, generation: u64) {
        {
            let mut lifecycle = self
                .lifecycle
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            if lifecycle.generation != generation || lifecycle.shutting_down {
                lifecycle.cleanup_in_progress = false;
                return;
            }
            lifecycle.cleanup_in_progress = false;
        }
        self.publish(HostEvent::SessionResyncRequired {
            reason: ResyncReason::ControllerGraceExpired,
        });
    }
}
