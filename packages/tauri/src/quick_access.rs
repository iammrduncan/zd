//! Native global summon and the presentation lifetime of the one root window.

use std::{sync::Mutex, time::Duration};

use tauri::{Emitter, Manager, PhysicalPosition};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub const SUMMON_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
const PRESENTATION_EVENT: &str = "window-presentation-changed";
const FOCUS_SETTLE_DELAY: Duration = Duration::from_millis(250);
const FOCUS_LOSS_DELAY: Duration = Duration::from_millis(120);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum QuickAccessShowStep {
    Hide,
    MoveToActiveSpace,
    CentreOnPointerMonitor,
    Unminimize,
    Show,
    Focus,
}

fn quick_access_show_steps() -> &'static [QuickAccessShowStep] {
    use QuickAccessShowStep::*;
    &[
        Hide,
        MoveToActiveSpace,
        CentreOnPointerMonitor,
        Unminimize,
        Show,
        Focus,
    ]
}

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
    focus_revision: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct FocusTicket(u64);

impl Default for QuickAccessModel {
    fn default() -> Self {
        Self {
            presentation: WindowPresentation::Ordinary,
            quick_access_ready: false,
            focus_revision: 0,
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

    fn set_presentation(&mut self, next: WindowPresentation) {
        self.presentation = next;
        self.quick_access_ready = false;
        self.focus_revision = self.focus_revision.wrapping_add(1);
    }

    fn begin_focus_settle(&mut self) -> Option<FocusTicket> {
        self.focus_revision = self.focus_revision.wrapping_add(1);
        if self.presentation != WindowPresentation::QuickAccess {
            return None;
        }
        self.quick_access_ready = false;
        Some(FocusTicket(self.focus_revision))
    }

    fn finish_focus_settle(&mut self, ticket: FocusTicket) -> bool {
        if self.presentation != WindowPresentation::QuickAccess || self.focus_revision != ticket.0 {
            return false;
        }
        self.quick_access_ready = true;
        true
    }

    fn begin_focus_loss(&mut self) -> Option<FocusTicket> {
        self.focus_revision = self.focus_revision.wrapping_add(1);
        (self.presentation == WindowPresentation::QuickAccess && self.quick_access_ready)
            .then_some(FocusTicket(self.focus_revision))
    }

    fn focus_loss_is_current(&self, ticket: FocusTicket) -> bool {
        self.presentation == WindowPresentation::QuickAccess
            && self.quick_access_ready
            && self.focus_revision == ticket.0
    }

    fn restore_quick_access_ready(&mut self) {
        if self.presentation == WindowPresentation::QuickAccess {
            self.quick_access_ready = true;
        }
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
            model.set_presentation(next);
        })
        .map_err(|_| lock_problem("presentation"))
}

fn restore_quick_access_ready(state: &QuickAccessState) -> Result<(), String> {
    state
        .model
        .lock()
        .map(|mut model| {
            model.restore_quick_access_ready();
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

#[cfg(target_os = "macos")]
fn set_move_to_active_space(window: &tauri::WebviewWindow, enabled: bool) -> Result<(), String> {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    let _main_thread = MainThreadMarker::new()
        .ok_or_else(|| "quick-access Space changes require the main thread".to_string())?;
    let raw_window = window.ns_window().map_err(|error| error.to_string())?;
    if raw_window.is_null() {
        return Err("the root workbench native window is unavailable".to_string());
    }
    // SAFETY: Tauri owns this non-null NSWindow for the WebviewWindow lifetime,
    // and AppKit access above is restricted to the main thread.
    let native_window = unsafe { &*raw_window.cast::<NSWindow>() };
    let mut behavior = native_window.collectionBehavior();
    behavior.remove(
        NSWindowCollectionBehavior::CanJoinAllSpaces
            | NSWindowCollectionBehavior::MoveToActiveSpace,
    );
    if enabled {
        behavior.insert(NSWindowCollectionBehavior::MoveToActiveSpace);
    }
    native_window.setCollectionBehavior(behavior);
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn set_move_to_active_space(_window: &tauri::WebviewWindow, _enabled: bool) -> Result<(), String> {
    Ok(())
}

fn execute_quick_access_show(window: &tauri::WebviewWindow) -> Result<(), String> {
    use QuickAccessShowStep::*;
    for step in quick_access_show_steps() {
        match step {
            Hide => window.hide().map_err(|error| error.to_string())?,
            MoveToActiveSpace => set_move_to_active_space(window, true)?,
            CentreOnPointerMonitor => centre_on_pointer_monitor(window),
            Unminimize => window.unminimize().map_err(|error| error.to_string())?,
            Show => window.show().map_err(|error| error.to_string())?,
            Focus => window.set_focus().map_err(|error| error.to_string())?,
        }
    }
    Ok(())
}

fn schedule_focus_settle(app: tauri::AppHandle, ticket: FocusTicket) {
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(FOCUS_SETTLE_DELAY);
        let dispatcher = app.clone();
        let _ = dispatcher.run_on_main_thread(move || {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            if window.is_focused().ok() != Some(true) {
                return;
            }
            let state = app.state::<QuickAccessState>();
            if let Ok(mut model) = state.model.lock() {
                model.finish_focus_settle(ticket);
            };
        });
    });
}

fn schedule_focus_loss(app: tauri::AppHandle, ticket: FocusTicket) {
    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(FOCUS_LOSS_DELAY);
        let dispatcher = app.clone();
        let _ = dispatcher.run_on_main_thread(move || {
            let Some(window) = app.get_webview_window("main") else {
                return;
            };
            if window.is_focused().ok() != Some(false) {
                return;
            }
            let state = app.state::<QuickAccessState>();
            let current = state
                .model
                .lock()
                .map(|model| model.focus_loss_is_current(ticket))
                .unwrap_or(false);
            if current {
                let _ = hide_quick_access_for(&app);
            }
        });
    });
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
    if let Err(error) = execute_quick_access_show(&window) {
        let _ = set_presentation(&state, WindowPresentation::Ordinary);
        let _ = set_move_to_active_space(&window, false);
        restore_ordinary_position(&state, &window);
        let _ = window
            .unminimize()
            .and_then(|_| window.show())
            .and_then(|_| window.set_focus());
        return Err(error);
    }
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
        let _ = restore_quick_access_ready(&state);
        return Err(error.to_string());
    }
    let _ = set_move_to_active_space(&window, false);
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
    let app = window.app_handle();
    let state = app.state::<QuickAccessState>();
    let ticket = state.model.lock().ok().and_then(|mut model| {
        if focused {
            model.begin_focus_settle()
        } else {
            model.begin_focus_loss()
        }
    });
    if let Some(ticket) = ticket {
        if focused {
            schedule_focus_settle(app.clone(), ticket);
        } else {
            schedule_focus_loss(app.clone(), ticket);
        }
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
    let _ = set_move_to_active_space(&window, false);
    restore_ordinary_position(&state, &window);
    let _ = window
        .unminimize()
        .and_then(|_| window.show())
        .and_then(|_| window.set_focus());
    emit_presentation(app, WindowPresentation::Ordinary);
}

#[cfg(test)]
mod tests {
    use super::{
        quick_access_show_steps, QuickAccessModel, QuickAccessShowStep, WindowPresentation,
        SUMMON_SHORTCUT,
    };
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
    fn quick_access_is_hidden_and_moved_before_its_one_visible_frame() {
        use QuickAccessShowStep::*;
        assert_eq!(
            quick_access_show_steps(),
            [
                Hide,
                MoveToActiveSpace,
                CentreOnPointerMonitor,
                Unminimize,
                Show,
                Focus,
            ]
        );
    }

    #[test]
    fn focus_loss_hides_only_quick_access() {
        let mut model = QuickAccessModel::default();
        assert_eq!(model.begin_focus_loss(), None);
        model.set_presentation(WindowPresentation::QuickAccess);
        assert_eq!(model.begin_focus_loss(), None);
        let focus = model.begin_focus_settle().unwrap();
        assert!(model.finish_focus_settle(focus));
        assert!(model.begin_focus_loss().is_some());
    }

    #[test]
    fn transient_space_focus_events_cannot_arm_or_hide_quick_access() {
        let mut model = QuickAccessModel::default();
        model.presentation = WindowPresentation::QuickAccess;

        let transitional_focus = model.begin_focus_settle().unwrap();
        assert_eq!(model.begin_focus_loss(), None);
        assert!(!model.finish_focus_settle(transitional_focus));

        let stable_focus = model.begin_focus_settle().unwrap();
        assert!(model.finish_focus_settle(stable_focus));
        let transient_loss = model.begin_focus_loss().unwrap();
        assert!(model.begin_focus_settle().is_some());
        assert!(!model.focus_loss_is_current(transient_loss));
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
