use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

#[cfg(target_os = "macos")]
mod macos;

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

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum NotificationPresentationStatus {
    Presented,
    Denied,
    Unsupported,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NotificationPresentationResult {
    pub status: NotificationPresentationStatus,
    pub problem: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CompletionSoundStatus {
    Played,
    Unsupported,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionSoundResult {
    pub status: CompletionSoundStatus,
    pub problem: Option<String>,
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

struct ActionRouter {
    app: tauri::AppHandle,
    store: Arc<ActionStore>,
}

impl ActionRouter {
    fn deliver(&self, notification_id: &str, native: NativeNotificationAction) {
        let Some(action) = self.store.record_action(notification_id, native) else {
            return;
        };
        let _ = self.app.emit("notification-action", action);
    }
}

pub struct NotificationState {
    store: Arc<ActionStore>,
    capabilities: NativeAttentionCapabilities,
}

#[derive(Clone, Debug, Default)]
struct NativeAttentionCapabilities {
    notification_problem: Option<String>,
    sound_problem: Option<String>,
    development_notifications: bool,
}

impl NativeAttentionCapabilities {
    fn with_notification_problem(problem: String) -> Self {
        Self {
            notification_problem: Some(problem),
            sound_problem: None,
            development_notifications: false,
        }
    }

    #[cfg(any(target_os = "macos", test))]
    fn for_macos(notification_problem: Option<String>, development: bool) -> Self {
        match notification_problem {
            Some(_) if development => Self {
                notification_problem: None,
                sound_problem: None,
                development_notifications: true,
            },
            Some(problem) => Self::with_notification_problem(problem),
            None => Self::default(),
        }
    }

    #[cfg(not(target_os = "macos"))]
    fn unsupported(problem: String) -> Self {
        Self {
            notification_problem: Some(problem.clone()),
            sound_problem: Some(problem),
            development_notifications: false,
        }
    }

    fn notification_problem(&self) -> Option<&str> {
        self.notification_problem.as_deref()
    }

    fn sound_problem(&self) -> Option<&str> {
        self.sound_problem.as_deref()
    }

    fn uses_development_notifications(&self) -> bool {
        self.development_notifications
    }
}

impl NotificationState {
    pub fn new(app: tauri::AppHandle) -> Self {
        let store = Arc::new(ActionStore::default());
        #[cfg(target_os = "macos")]
        let notification_problem = macos::install(Arc::new(ActionRouter {
            app,
            store: Arc::clone(&store),
        }))
        .err();
        #[cfg(target_os = "macos")]
        let capabilities =
            NativeAttentionCapabilities::for_macos(notification_problem, tauri::is_dev());
        #[cfg(not(target_os = "macos"))]
        let capabilities = {
            let _ = app;
            NativeAttentionCapabilities::unsupported(
                "desktop attention is unavailable on this platform".into(),
            )
        };
        Self {
            store,
            capabilities,
        }
    }
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

#[cfg(target_os = "macos")]
async fn platform_permission() -> NotificationPermission {
    tauri::async_runtime::spawn_blocking(macos::permission)
        .await
        .unwrap_or(NotificationPermission::Unsupported)
}

#[cfg(not(target_os = "macos"))]
async fn platform_permission() -> NotificationPermission {
    NotificationPermission::Unsupported
}

#[cfg(target_os = "macos")]
async fn platform_request_permission() -> NotificationPermission {
    tauri::async_runtime::spawn_blocking(macos::request_permission)
        .await
        .unwrap_or(NotificationPermission::Unsupported)
}

#[cfg(not(target_os = "macos"))]
async fn platform_request_permission() -> NotificationPermission {
    NotificationPermission::Unsupported
}

#[tauri::command]
pub async fn notification_permission(
    state: tauri::State<'_, NotificationState>,
) -> Result<NotificationPermission, String> {
    if state.capabilities.uses_development_notifications() {
        return Ok(NotificationPermission::Granted);
    }
    if state.capabilities.notification_problem().is_some() {
        return Ok(NotificationPermission::Unsupported);
    }
    Ok(platform_permission().await)
}

#[tauri::command]
pub async fn notification_request_permission(
    state: tauri::State<'_, NotificationState>,
) -> Result<NotificationPermission, String> {
    if state.capabilities.uses_development_notifications() {
        return Ok(NotificationPermission::Granted);
    }
    if state.capabilities.notification_problem().is_some() {
        return Ok(NotificationPermission::Unsupported);
    }
    Ok(platform_request_permission().await)
}

#[tauri::command]
pub fn show_thread_notification(
    state: tauri::State<'_, NotificationState>,
    app: tauri::AppHandle,
    request: ThreadNotificationRequestV1,
) -> NotificationPresentationResult {
    if let Some(problem) = state.capabilities.notification_problem() {
        return NotificationPresentationResult {
            status: NotificationPresentationStatus::Unsupported,
            problem: Some(problem.into()),
        };
    }
    if let Err(problem) = state.store.remember(&request) {
        return NotificationPresentationResult {
            status: NotificationPresentationStatus::Failed,
            problem: Some(problem),
        };
    }

    if state.capabilities.uses_development_notifications() {
        use tauri_plugin_notification::NotificationExt;

        let shown = app
            .notification()
            .builder()
            .title(&request.title)
            .body(&request.body)
            .show();
        state.store.forget(&request.notification_id);
        return match shown {
            Ok(()) => NotificationPresentationResult {
                status: NotificationPresentationStatus::Presented,
                problem: None,
            },
            Err(error) => NotificationPresentationResult {
                status: NotificationPresentationStatus::Failed,
                problem: Some(error.to_string()),
            },
        };
    }

    #[cfg(target_os = "macos")]
    let presented = macos::show(&request);
    #[cfg(not(target_os = "macos"))]
    let presented: Result<(), String> = Err("desktop notifications are unavailable".into());
    match presented {
        Ok(()) => NotificationPresentationResult {
            status: NotificationPresentationStatus::Presented,
            problem: None,
        },
        Err(problem) => {
            state.store.forget(&request.notification_id);
            NotificationPresentationResult {
                status: NotificationPresentationStatus::Failed,
                problem: Some(problem),
            }
        }
    }
}

#[tauri::command]
pub fn pending_notification_actions(
    state: tauri::State<'_, NotificationState>,
) -> Vec<NotificationActionV1> {
    state.store.drain()
}

#[tauri::command]
pub async fn play_completion_sound(
    state: tauri::State<'_, NotificationState>,
    app: tauri::AppHandle,
    request: CompletionSoundRequest,
) -> Result<CompletionSoundResult, String> {
    if let Err(problem) = validate_sound_request(&request) {
        return Ok(CompletionSoundResult {
            status: CompletionSoundStatus::Failed,
            problem: Some(problem),
        });
    }
    if let Some(problem) = state.capabilities.sound_problem() {
        return Ok(CompletionSoundResult {
            status: CompletionSoundStatus::Unsupported,
            problem: Some(problem.into()),
        });
    }

    #[cfg(target_os = "macos")]
    let played = macos::play_sound_on_main(&app, request).await;
    #[cfg(not(target_os = "macos"))]
    let played: Result<(), String> = Err("completion sounds are unavailable".into());
    Ok(match played {
        Ok(()) => CompletionSoundResult {
            status: CompletionSoundStatus::Played,
            problem: None,
        },
        Err(problem) => CompletionSoundResult {
            status: CompletionSoundStatus::Failed,
            problem: Some(problem),
        },
    })
}

#[cfg(test)]
mod capability_tests {
    use super::NativeAttentionCapabilities;

    #[test]
    fn notification_install_failure_does_not_disable_completion_sounds() {
        let capabilities = NativeAttentionCapabilities::with_notification_problem(
            "notifications require an application bundle".into(),
        );

        assert!(capabilities.notification_problem().is_some());
        assert_eq!(capabilities.sound_problem(), None);
    }

    #[test]
    fn development_fallback_keeps_desktop_notifications_enabled() {
        let capabilities = NativeAttentionCapabilities::for_macos(
            Some("notifications require an application bundle".into()),
            true,
        );

        assert_eq!(capabilities.notification_problem(), None);
        assert!(capabilities.uses_development_notifications());
    }
}
