use tauri_plugin_opener::OpenerExt;

use super::{DiagnosticRecordInput, DiagnosticState, DiagnosticStatus, DiagnosticWriteOutcome};

#[tauri::command]
pub fn diagnostics_status(state: tauri::State<'_, DiagnosticState>) -> DiagnosticStatus {
    state.status()
}

#[tauri::command]
pub fn enable_diagnostics(state: tauri::State<'_, DiagnosticState>) -> DiagnosticStatus {
    state.enable()
}

#[tauri::command]
pub fn disable_diagnostics(state: tauri::State<'_, DiagnosticState>) -> DiagnosticStatus {
    state.shutdown()
}

#[tauri::command]
pub fn record_diagnostic(
    state: tauri::State<'_, DiagnosticState>,
    record: DiagnosticRecordInput,
) -> DiagnosticWriteOutcome {
    state.record(record)
}

#[tauri::command]
pub fn reveal_diagnostics(
    app: tauri::AppHandle,
    state: tauri::State<'_, DiagnosticState>,
) -> Result<(), String> {
    let directory = state.reveal_directory()?;
    app.opener()
        .open_path(directory.to_string_lossy(), None::<&str>)
        .map_err(|error| error.to_string())
}
