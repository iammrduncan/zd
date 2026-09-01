use std::path::PathBuf;

use serde::Serialize;
use tauri::ipc::CapabilityBuilder;
use tauri::{Emitter, Manager};

use crate::installed_smoke::InstalledSmoke;
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
    let executable = crate::executables::console_for_desktop()?;
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "the main desktop webview is unavailable".to_string())?;
    let supervisor = app.state::<Supervisor>().inner().clone();
    let installed_smoke = app.state::<InstalledSmoke>().inner().clone();
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
            if let Err(problem) =
                install_origin_capability(&app, ready.generation, origin, installed_smoke.enabled())
            {
                let _ = supervisor.shutdown();
                emit_status(&window, "failed", Some(problem));
                return;
            }
            let mut url = match tauri::Url::parse(origin) {
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
            installed_smoke.decorate_url(&mut url);
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
    installed_smoke: bool,
) -> Result<(), String> {
    let mut capability = CapabilityBuilder::new(format!("desktop-served-{generation}"))
        .remote(format!("{origin}/*"))
        .window("main")
        .permission("allow-desktop-bootstrap")
        .permission("allow-desktop-shell")
        .permission("core:event:allow-listen")
        .permission("core:event:allow-unlisten")
        .permission("core:window:allow-is-focused")
        .permission("core:window:allow-start-dragging");
    if installed_smoke {
        capability = capability.permission("core:event:allow-emit");
    }
    app.add_capability(capability)
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
    if phase == "failed" {
        let message = problem
            .as_deref()
            .unwrap_or("The local workbench host could not start.");
        let _ = window.eval(startup_status_script(message));
    }
    let _ = window.emit(HOST_STATUS_EVENT, DesktopHostStatus { phase, problem });
}

fn startup_status_script(message: &str) -> String {
    let message =
        serde_json::to_string(message).unwrap_or_else(|_| "\"zd could not start\"".into());
    format!(
        "document.getElementById('zd-startup-status')?.replaceChildren(document.createTextNode({message}));"
    )
}

#[cfg(test)]
mod tests {
    use super::{should_prevent_close, startup_status_script};
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

    #[test]
    fn startup_failure_text_is_serialized_before_native_evaluation() {
        let script = startup_status_script("failed </script> ' \" safely");

        assert!(script.contains("failed </script> ' \\\" safely"));
        assert!(script.contains("document.createTextNode"));
        assert!(!script.contains("innerHTML"));
    }
}
