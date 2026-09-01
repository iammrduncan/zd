use std::collections::VecDeque;
#[cfg(target_os = "macos")]
use std::path::Path;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use zd_host::{HostLaunchRequest, ProjectGrant};

use crate::supervisor::Supervisor;
use crate::{notifications, quick_access};

#[cfg(any(target_os = "macos", test))]
const MAX_PENDING_OPEN_INTENTS: usize = 64;
#[cfg(target_os = "macos")]
const OPEN_REQUESTED_EVENT: &str = "open-requested";

#[derive(Debug, Default)]
pub struct OpenIntentState(Mutex<VecDeque<HostLaunchRequest>>);

impl OpenIntentState {
    fn lock(&self) -> MutexGuard<'_, VecDeque<HostLaunchRequest>> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    #[cfg(any(target_os = "macos", test))]
    fn queue(&self, intent: HostLaunchRequest) {
        let mut pending = self.lock();
        pending.push_back(intent);
        while pending.len() > MAX_PENDING_OPEN_INTENTS {
            pending.pop_front();
        }
    }

    fn pending(&self) -> Option<HostLaunchRequest> {
        self.lock().front().cloned()
    }

    fn accept(&self) -> Option<HostLaunchRequest> {
        self.lock().pop_front()
    }

    fn has_pending(&self) -> bool {
        !self.lock().is_empty()
    }
}

fn authorize(
    window: &tauri::WebviewWindow,
    supervisor: &tauri::State<'_, Supervisor>,
) -> Result<(), String> {
    let url = window
        .url()
        .map_err(|_| "the desktop webview location is unavailable".to_string())?;
    if supervisor.authorizes_webview(window.label(), &url) {
        Ok(())
    } else {
        Err("the desktop shell refused this webview".to_string())
    }
}

fn picked_folder(window: &tauri::WebviewWindow, title: &str) -> Result<Option<PathBuf>, String> {
    window
        .dialog()
        .file()
        .set_title(title)
        .blocking_pick_folder()
        .map(|selected| {
            selected
                .into_path()
                .map_err(|_| "the selected project path is unavailable".to_string())
        })
        .transpose()
}

#[tauri::command]
pub async fn choose_project(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
) -> Result<Option<ProjectGrant>, String> {
    authorize(&window, &supervisor)?;
    let Some(path) = picked_folder(&window, "Open Project")? else {
        return Ok(None);
    };
    authorize(&window, &supervisor)?;
    supervisor.approve_project_path(&path).map(Some)
}

#[tauri::command]
pub async fn recover_project_grant(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    project_id: String,
) -> Result<Option<ProjectGrant>, String> {
    authorize(&window, &supervisor)?;
    let Some(path) = picked_folder(&window, "Locate Project Folder")? else {
        return Ok(None);
    };
    authorize(&window, &supervisor)?;
    supervisor.recover_project_path(project_id, &path).map(Some)
}

#[tauri::command]
pub fn has_pending_open_request(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, OpenIntentState>,
) -> Result<bool, String> {
    authorize(&window, &supervisor)?;
    Ok(state.has_pending())
}

#[tauri::command]
pub fn pending_open_request(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, OpenIntentState>,
) -> Result<Option<HostLaunchRequest>, String> {
    authorize(&window, &supervisor)?;
    Ok(state.pending())
}

#[tauri::command]
pub fn accept_open_request(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, OpenIntentState>,
) -> Result<Option<HostLaunchRequest>, String> {
    authorize(&window, &supervisor)?;
    Ok(state.accept())
}

#[cfg(target_os = "macos")]
pub fn queue_native_open(app: &tauri::AppHandle, path: &Path) {
    let supervisor = app.state::<Supervisor>().inner().clone();
    let app = app.clone();
    let path = path.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let intent = supervisor
            .approve_open_path(&path)
            .unwrap_or_else(|problem| HostLaunchRequest {
                project: None,
                worktree_id: None,
                relative_path: None,
                problem: Some(problem),
            });
        app.state::<OpenIntentState>().queue(intent);
        let _ = app.emit(OPEN_REQUESTED_EVENT, ());
    });
}

#[tauri::command]
pub fn register_global_summon(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    app: tauri::AppHandle,
    state: tauri::State<'_, quick_access::QuickAccessState>,
) -> Result<quick_access::GlobalShortcutRegistration, String> {
    authorize(&window, &supervisor)?;
    Ok(quick_access::register_global_summon(app, state))
}

#[tauri::command]
pub fn toggle_quick_access(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    app: tauri::AppHandle,
) -> Result<quick_access::WindowPresentation, String> {
    authorize(&window, &supervisor)?;
    quick_access::toggle_quick_access(app)
}

#[tauri::command]
pub fn hide_quick_access(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    app: tauri::AppHandle,
) -> Result<quick_access::WindowPresentation, String> {
    authorize(&window, &supervisor)?;
    quick_access::hide_quick_access(app)
}

#[tauri::command]
pub fn show_workbench(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    app: tauri::AppHandle,
) -> Result<quick_access::WindowPresentation, String> {
    authorize(&window, &supervisor)?;
    Ok(quick_access::show_workbench(app))
}

#[tauri::command]
pub async fn notification_permission(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, notifications::NotificationState>,
) -> Result<notifications::NotificationPermission, String> {
    authorize(&window, &supervisor)?;
    notifications::notification_permission(state).await
}

#[tauri::command]
pub async fn notification_request_permission(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, notifications::NotificationState>,
) -> Result<notifications::NotificationPermission, String> {
    authorize(&window, &supervisor)?;
    notifications::notification_request_permission(state).await
}

#[tauri::command]
pub fn show_thread_notification(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, notifications::NotificationState>,
    app: tauri::AppHandle,
    request: notifications::ThreadNotificationRequestV1,
) -> Result<notifications::NotificationPresentationResult, String> {
    authorize(&window, &supervisor)?;
    Ok(notifications::show_thread_notification(state, app, request))
}

#[tauri::command]
pub fn pending_notification_actions(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, notifications::NotificationState>,
) -> Result<Vec<notifications::NotificationActionV1>, String> {
    authorize(&window, &supervisor)?;
    Ok(notifications::pending_notification_actions(state))
}

#[tauri::command]
pub async fn play_completion_sound(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    state: tauri::State<'_, notifications::NotificationState>,
    app: tauri::AppHandle,
    request: notifications::CompletionSoundRequest,
) -> Result<notifications::CompletionSoundResult, String> {
    authorize(&window, &supervisor)?;
    notifications::play_completion_sound(state, app, request).await
}

#[tauri::command]
pub fn open_external(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
    app: tauri::AppHandle,
    url: String,
) -> Result<(), String> {
    authorize(&window, &supervisor)?;
    if !is_web_url(&url) {
        return Err("refused to open a non-web URL".to_string());
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn close_window(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
) -> Result<(), String> {
    authorize(&window, &supervisor)?;
    let owned = supervisor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || owned.shutdown())
        .await
        .map_err(|_| "the desktop host shutdown task failed".to_string())??;
    window.destroy().map_err(|error| error.to_string())
}

fn is_web_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    lowered.starts_with("http://") || lowered.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::{is_web_url, OpenIntentState, MAX_PENDING_OPEN_INTENTS};
    use zd_host::HostLaunchRequest;

    #[test]
    fn only_http_and_https_may_leave_the_desktop_shell() {
        assert!(is_web_url("https://example.com"));
        assert!(is_web_url(" HTTP://example.com "));
        for refused in [
            "file:///tmp/private",
            "javascript:alert(1)",
            "mailto:user@example.com",
        ] {
            assert!(!is_web_url(refused));
        }
    }

    #[test]
    fn native_open_intents_are_bounded_and_accepted_in_order() {
        let state = OpenIntentState::default();
        for index in 0..=MAX_PENDING_OPEN_INTENTS {
            state.queue(HostLaunchRequest {
                project: None,
                worktree_id: None,
                relative_path: Some(index.to_string()),
                problem: None,
            });
        }

        assert_eq!(state.pending().unwrap().relative_path.as_deref(), Some("1"));
        assert_eq!(state.accept().unwrap().relative_path.as_deref(), Some("1"));
        assert!(state.has_pending());
    }
}
