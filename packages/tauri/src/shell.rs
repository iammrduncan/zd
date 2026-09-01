use crate::supervisor::Supervisor;
use crate::{fs, notifications, quick_access};

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
    fs::open_external(app, url)
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
