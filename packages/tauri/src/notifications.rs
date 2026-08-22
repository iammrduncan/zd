use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;

const SCHEMA_VERSION: u8 = 1;
const MAX_ID_BYTES: usize = 160;
const MAX_BODY_CHARS: usize = 240;
const MAX_TARGETS: usize = 256;
const MAX_PENDING_ACTIONS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationPermission {
    Granted,
    Denied,
    Prompt,
    Unsupported,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotificationAction {
    View,
    Close,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NativeNotificationAction {
    View,
    Close,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CompletionSound {
    Subtle,
    Bright,
    Gentle,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CompletionSoundRequest {
    pub sound: CompletionSound,
    pub volume: f64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ThreadNotificationRequestV1 {
    pub schema_version: u8,
    pub notification_id: String,
    pub event_id: String,
    pub project_id: String,
    pub worktree_id: String,
    pub thread_id: String,
    pub title: String,
    pub body: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NotificationActionV1 {
    pub schema_version: u8,
    pub notification_id: String,
    pub action: NotificationAction,
    pub project_id: String,
    pub worktree_id: String,
    pub thread_id: String,
}

#[derive(Clone, Debug)]
struct NotificationTarget {
    project_id: String,
    worktree_id: String,
    thread_id: String,
}

#[derive(Default)]
struct ActionStoreInner {
    order: VecDeque<String>,
    targets: HashMap<String, NotificationTarget>,
    pending: VecDeque<NotificationActionV1>,
}

/** Bounded runtime-only target recovery; notification content never enters this store. */
#[derive(Default)]
pub struct ActionStore {
    inner: Mutex<ActionStoreInner>,
}

impl ActionStore {
    pub fn remember(&self, request: &ThreadNotificationRequestV1) -> Result<(), String> {
        validate_notification_request(request)?;
        let mut inner = self
            .inner
            .lock()
            .map_err(|_| "notification action store is unavailable".to_owned())?;
        if inner.targets.contains_key(&request.notification_id) {
            inner.order.retain(|id| id != &request.notification_id);
        }
        inner.order.push_back(request.notification_id.clone());
        inner.targets.insert(
            request.notification_id.clone(),
            NotificationTarget {
                project_id: request.project_id.clone(),
                worktree_id: request.worktree_id.clone(),
                thread_id: request.thread_id.clone(),
            },
        );
        while inner.order.len() > MAX_TARGETS {
            if let Some(expired) = inner.order.pop_front() {
                inner.targets.remove(&expired);
            }
        }
        Ok(())
    }

    pub fn forget(&self, notification_id: &str) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        inner.order.retain(|id| id != notification_id);
        inner.targets.remove(notification_id);
    }

    pub fn record_action(
        &self,
        notification_id: &str,
        native: NativeNotificationAction,
    ) -> Option<NotificationActionV1> {
        let Ok(mut inner) = self.inner.lock() else {
            return None;
        };
        let target = inner.targets.remove(notification_id)?;
        inner.order.retain(|id| id != notification_id);
        let action = NotificationActionV1 {
            schema_version: SCHEMA_VERSION,
            notification_id: notification_id.to_owned(),
            action: match native {
                NativeNotificationAction::View => NotificationAction::View,
                NativeNotificationAction::Close => NotificationAction::Close,
            },
            project_id: target.project_id,
            worktree_id: target.worktree_id,
            thread_id: target.thread_id,
        };
        inner.pending.push_back(action.clone());
        while inner.pending.len() > MAX_PENDING_ACTIONS {
            inner.pending.pop_front();
        }
        Some(action)
    }

    pub fn drain(&self) -> Vec<NotificationActionV1> {
        let Ok(mut inner) = self.inner.lock() else {
            return Vec::new();
        };
        inner.pending.drain(..).collect()
    }
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_ID_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'))
}

pub fn validate_notification_request(request: &ThreadNotificationRequestV1) -> Result<(), String> {
    if request.schema_version != SCHEMA_VERSION {
        return Err("unsupported notification schema".into());
    }
    for (name, value) in [
        ("notificationId", request.notification_id.as_str()),
        ("eventId", request.event_id.as_str()),
        ("projectId", request.project_id.as_str()),
        ("worktreeId", request.worktree_id.as_str()),
        ("threadId", request.thread_id.as_str()),
    ] {
        if !valid_id(value) {
            return Err(format!("invalid {name}"));
        }
    }
    if request.notification_id != format!("attention:{}", request.event_id) {
        return Err("notification identity does not match its attention event".into());
    }
    if request.title != "zd" {
        return Err("notification title must identify zd".into());
    }
    if request.body.is_empty()
        || request.body.chars().count() > MAX_BODY_CHARS
        || request.body.chars().any(char::is_control)
    {
        return Err("notification body is invalid or over limit".into());
    }
    Ok(())
}

pub fn validate_sound_request(request: &CompletionSoundRequest) -> Result<(), String> {
    if !request.volume.is_finite() || !(0.0..=1.0).contains(&request.volume) {
        return Err("completion sound volume must be between zero and one".into());
    }
    Ok(())
}
