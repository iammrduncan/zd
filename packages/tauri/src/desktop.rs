use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::CapabilityBuilder;
use tauri::{Emitter, Manager};

use crate::supervisor::{
    DesktopBootstrap, Supervisor, SupervisorLaunch, SupervisorPhase, SupervisorSnapshot,
};

const HOST_STATUS_EVENT: &str = "desktop-host-status";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopHostStatus {
    phase: &'static str,
    problem: Option<String>,
}

#[tauri::command]
pub fn take_desktop_bootstrap(
    window: tauri::WebviewWindow,
    supervisor: tauri::State<'_, Supervisor>,
) -> Result<DesktopBootstrap, String> {
    let url = window
        .url()
        .map_err(|_| "the desktop webview location is unavailable".to_string())?;
    supervisor.take_bootstrap_for(window.label(), &url)
}

pub fn start(app: tauri::AppHandle, launch_path: Option<PathBuf>) -> Result<(), String> {
    let executable = std::env::current_exe()
        .map_err(|_| "the desktop host executable is unavailable".to_string())?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "the main desktop webview is unavailable".to_string())?;
    let supervisor = app.state::<Supervisor>().inner().clone();
    std::thread::Builder::new()
        .name("zd-desktop-host-startup".to_string())
        .spawn(move || {
            let ready = match supervisor.start(SupervisorLaunch::new(executable, launch_path)) {
                Ok(ready) => ready,
                Err(problem) => {
                    emit_status(&window, "failed", Some(problem));
                    return;
                }
            };
            let Some(origin) = ready.origin.as_deref() else {
                let _ = supervisor.shutdown();
                emit_status(
                    &window,
                    "failed",
                    Some("the desktop host did not report an origin".to_string()),
                );
                return;
            };
            if let Err(problem) = install_origin_capability(&app, ready.generation, origin) {
                let _ = supervisor.shutdown();
                emit_status(&window, "failed", Some(problem));
                return;
            }
            let url = match tauri::Url::parse(origin) {
                Ok(url) => url,
                Err(_) => {
                    let _ = supervisor.shutdown();
                    emit_status(
                        &window,
                        "failed",
                        Some("the desktop host origin could not be opened".to_string()),
                    );
                    return;
                }
            };
            if window.navigate(url).is_err() {
                let _ = supervisor.shutdown();
                emit_status(
                    &window,
                    "failed",
                    Some("the desktop host page could not be opened".to_string()),
                );
                return;
            }

            report_terminal_state(&window, supervisor.wait_for_terminal(ready.generation));
        })
        .map(|_| ())
        .map_err(|_| "the desktop host startup task could not start".to_string())
}

pub fn page_started(webview: &tauri::Webview, url: &tauri::Url) {
    let supervisor = webview.app_handle().state::<Supervisor>();
    let _ = supervisor.rearm_bootstrap_for(webview.label(), url);
}

fn install_origin_capability(
    app: &tauri::AppHandle,
    generation: u64,
    origin: &str,
) -> Result<(), String> {
    app.add_capability(
        CapabilityBuilder::new(format!("desktop-served-{generation}"))
            .remote(format!("{origin}/*"))
            .window("main")
            .permission("allow-desktop-bootstrap")
            .permission("allow-desktop-shell")
            .permission("core:event:allow-listen")
            .permission("core:event:allow-unlisten")
            .permission("core:window:allow-is-focused")
            .permission("core:window:allow-start-dragging"),
    )
    .map_err(|_| "the desktop host capability could not be installed".to_string())
}

fn report_terminal_state(window: &tauri::WebviewWindow, snapshot: SupervisorSnapshot) {
    match snapshot.phase {
        SupervisorPhase::Exited => emit_status(window, "disconnected", snapshot.problem),
        SupervisorPhase::Failed => emit_status(window, "failed", snapshot.problem),
        _ => {}
    }
}

pub(super) fn should_prevent_close(phase: SupervisorPhase) -> bool {
    phase == SupervisorPhase::Ready
}

fn emit_status(window: &tauri::WebviewWindow, phase: &'static str, problem: Option<String>) {
    let _ = window.emit(HOST_STATUS_EVENT, DesktopHostStatus { phase, problem });
}

#[cfg(test)]
mod tests {
    use super::should_prevent_close;
    use crate::supervisor::SupervisorPhase;

    #[test]
    fn only_a_ready_workbench_defers_close_to_the_frontend_guard() {
        assert!(should_prevent_close(SupervisorPhase::Ready));
        for phase in [
            SupervisorPhase::Idle,
            SupervisorPhase::Starting,
            SupervisorPhase::Stopping,
            SupervisorPhase::Exited,
            SupervisorPhase::Stopped,
            SupervisorPhase::Failed,
        ] {
            assert!(!should_prevent_close(phase), "blocked {phase:?}");
        }
    }
}
