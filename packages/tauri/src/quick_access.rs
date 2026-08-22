//! Native global summon and the presentation lifetime of the one root window.

use std::sync::Mutex;

use tauri::{Emitter, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SUMMON_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
const PRESENTATION_EVENT: &str = "window-presentation-changed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WindowPresentation {
    Ordinary,
    QuickAccess,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalShortcutRegistration {
    pub supported: bool,
    pub registered: bool,
    pub shortcut: String,
    pub problem: Option<String>,
}

impl Default for GlobalShortcutRegistration {
    fn default() -> Self {
        Self {
            supported: true,
            registered: false,
            shortcut: SUMMON_SHORTCUT.to_string(),
            problem: None,
        }
    }
}

#[derive(Debug)]
struct QuickAccessModel {
    presentation: WindowPresentation,
    quick_access_ready: bool,
}

impl Default for QuickAccessModel {
    fn default() -> Self {
        Self {
            presentation: WindowPresentation::Ordinary,
            quick_access_ready: false,
        }
    }
}

impl QuickAccessModel {
    fn toggle_target(&self) -> WindowPresentation {
        match self.presentation {
            WindowPresentation::Ordinary => WindowPresentation::QuickAccess,
            WindowPresentation::QuickAccess => WindowPresentation::Ordinary,
        }
    }

    fn focus_lost_target(&self) -> Option<WindowPresentation> {
        (self.presentation == WindowPresentation::QuickAccess && self.quick_access_ready)
            .then_some(WindowPresentation::Ordinary)
    }
}

#[derive(Debug, Default)]
pub struct QuickAccessState {
    model: Mutex<QuickAccessModel>,
    ordinary_position: Mutex<Option<PhysicalPosition<i32>>>,
    registration: Mutex<Option<GlobalShortcutRegistration>>,
}

fn lock_problem(name: &str) -> String {
    format!("quick-access {name} state is unavailable")
}

fn presentation(state: &QuickAccessState) -> Result<WindowPresentation, String> {
    state
        .model
        .lock()
        .map(|model| model.presentation)
        .map_err(|_| lock_problem("presentation"))
}

fn set_presentation(state: &QuickAccessState, next: WindowPresentation) -> Result<(), String> {
    state
        .model
        .lock()
        .map(|mut model| {
            model.presentation = next;
            model.quick_access_ready = false;
        })
        .map_err(|_| lock_problem("presentation"))
}

fn mark_quick_access_ready(state: &QuickAccessState) -> Result<(), String> {
    state
        .model
        .lock()
        .map(|mut model| {
            if model.presentation == WindowPresentation::QuickAccess {
                model.quick_access_ready = true;
            }
        })
        .map_err(|_| lock_problem("presentation"))
}

fn emit_presentation(app: &tauri::AppHandle, presentation: WindowPresentation) {
    let _ = app.emit(PRESENTATION_EVENT, presentation);
}

fn centre_on_pointer_monitor(window: &tauri::WebviewWindow) {
    let Ok(pointer) = window.cursor_position() else {
        return;
    };
    let Ok(Some(monitor)) = window.monitor_from_point(pointer.x, pointer.y) else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };
    let area = monitor.work_area();
    let x = area.position.x + (area.size.width.saturating_sub(size.width) / 2) as i32;
    let y = area.position.y + (area.size.height.saturating_sub(size.height) / 2) as i32;
    let _ = window.set_position(PhysicalPosition::new(x, y));
}

fn restore_ordinary_position(state: &QuickAccessState, window: &tauri::WebviewWindow) {
    if let Ok(mut ordinary_position) = state.ordinary_position.lock() {
        if let Some(position) = ordinary_position.take() {
            let _ = window.set_position(position);
        }
    }
}

fn show_quick_access(app: &tauri::AppHandle) -> Result<WindowPresentation, String> {
    let state = app.state::<QuickAccessState>();
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "the root workbench window is unavailable".to_string())?;

    {
        let mut ordinary_position = state
            .ordinary_position
            .lock()
            .map_err(|_| lock_problem("position"))?;
        if ordinary_position.is_none() {
            *ordinary_position = window.outer_position().ok();
        }
    }

    set_presentation(&state, WindowPresentation::QuickAccess)?;
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(true);
    centre_on_pointer_monitor(&window);
    if let Err(error) = window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus())
    {
        let _ = set_presentation(&state, WindowPresentation::Ordinary);
        #[cfg(target_os = "macos")]
        let _ = window.set_visible_on_all_workspaces(false);
        restore_ordinary_position(&state, &window);
        return Err(error.to_string());
    }
    mark_quick_access_ready(&state)?;
    emit_presentation(app, WindowPresentation::QuickAccess);
    Ok(WindowPresentation::QuickAccess)
}

fn hide_quick_access_for(app: &tauri::AppHandle) -> Result<WindowPresentation, String> {
    let state = app.state::<QuickAccessState>();
    if presentation(&state)? == WindowPresentation::Ordinary {
        return Ok(WindowPresentation::Ordinary);
    }
    let window = app
        .get_webview_window("main")
        .ok_or_else(|| "the root workbench window is unavailable".to_string())?;

    set_presentation(&state, WindowPresentation::Ordinary)?;
    if let Err(error) = window.hide() {
        let _ = set_presentation(&state, WindowPresentation::QuickAccess);
        let _ = mark_quick_access_ready(&state);
        return Err(error.to_string());
    }
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(false);
    restore_ordinary_position(&state, &window);
    emit_presentation(app, WindowPresentation::Ordinary);
    Ok(WindowPresentation::Ordinary)
}

#[tauri::command]
pub fn register_global_summon(
    app: tauri::AppHandle,
    state: tauri::State<'_, QuickAccessState>,
) -> GlobalShortcutRegistration {
    let mut registered = match state.registration.lock() {
        Ok(registered) => registered,
        Err(_) => {
            return GlobalShortcutRegistration {
                problem: Some(lock_problem("registration")),
                ..GlobalShortcutRegistration::default()
            };
        }
    };
    if let Some(status) = registered.as_ref() {
        return status.clone();
    }

    let result = app
        .global_shortcut()
        .on_shortcut(SUMMON_SHORTCUT, |app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            let state = app.state::<QuickAccessState>();
            let target = state
                .model
                .lock()
                .map(|model| model.toggle_target())
                .unwrap_or(WindowPresentation::QuickAccess);
            let _ = match target {
                WindowPresentation::Ordinary => hide_quick_access_for(app),
                WindowPresentation::QuickAccess => show_quick_access(app),
            };
        });
    let status = match result {
        Ok(()) => GlobalShortcutRegistration {
            registered: true,
            ..GlobalShortcutRegistration::default()
        },
        Err(error) => GlobalShortcutRegistration {
            problem: Some(error.to_string()),
            ..GlobalShortcutRegistration::default()
        },
    };
    *registered = Some(status.clone());
    status
}

#[tauri::command]
pub fn toggle_quick_access(app: tauri::AppHandle) -> Result<WindowPresentation, String> {
    let state = app.state::<QuickAccessState>();
    match presentation(&state)? {
        WindowPresentation::Ordinary => show_quick_access(&app),
        WindowPresentation::QuickAccess => hide_quick_access_for(&app),
    }
}

#[tauri::command]
pub fn hide_quick_access(app: tauri::AppHandle) -> Result<WindowPresentation, String> {
    hide_quick_access_for(&app)
}

#[tauri::command]
pub fn show_workbench(app: tauri::AppHandle) -> WindowPresentation {
    show_ordinary(&app);
    WindowPresentation::Ordinary
}

pub fn window_focus_changed(window: &tauri::Window, focused: bool) {
    if focused {
        return;
    }
    let app = window.app_handle();
    let state = app.state::<QuickAccessState>();
    let should_hide = state
        .model
        .lock()
        .ok()
        .and_then(|model| model.focus_lost_target())
        .is_some();
    if should_hide {
        let _ = hide_quick_access_for(app);
    }
}

/// Re-enter ordinary presentation for Dock activation or an explicit file open.
pub fn show_ordinary(app: &tauri::AppHandle) {
    let state = app.state::<QuickAccessState>();
    if presentation(&state).ok() == Some(WindowPresentation::QuickAccess) {
        let _ = set_presentation(&state, WindowPresentation::Ordinary);
    }
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    #[cfg(target_os = "macos")]
    let _ = window.set_visible_on_all_workspaces(false);
    restore_ordinary_position(&state, &window);
    let _ = window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus());
    emit_presentation(app, WindowPresentation::Ordinary);
}

#[cfg(test)]
mod tests {
    use super::{QuickAccessModel, WindowPresentation, SUMMON_SHORTCUT};
    use tauri_plugin_global_shortcut::Shortcut;

    #[test]
    fn the_documented_summon_chord_parses_for_the_native_plugin() {
        let shortcut = SUMMON_SHORTCUT.parse::<Shortcut>();
        assert!(shortcut.is_ok());
    }

    #[test]
    fn repeated_summon_toggles_one_presentation() {
        let mut model = QuickAccessModel::default();
        assert_eq!(model.toggle_target(), WindowPresentation::QuickAccess);
        model.presentation = WindowPresentation::QuickAccess;
        assert_eq!(model.toggle_target(), WindowPresentation::Ordinary);
    }

    #[test]
    fn focus_loss_hides_only_quick_access() {
        let mut model = QuickAccessModel::default();
        assert_eq!(model.focus_lost_target(), None);
        model.presentation = WindowPresentation::QuickAccess;
        assert_eq!(model.focus_lost_target(), None);
        model.quick_access_ready = true;
        assert_eq!(
            model.focus_lost_target(),
            Some(WindowPresentation::Ordinary)
        );
    }

    #[test]
    fn presentation_serializes_to_the_frontend_contract() {
        assert_eq!(
            serde_json::to_string(&WindowPresentation::QuickAccess).unwrap(),
            "\"quick-access\""
        );
        assert_eq!(
            serde_json::to_string(&WindowPresentation::Ordinary).unwrap(),
            "\"ordinary\""
        );
    }
}
