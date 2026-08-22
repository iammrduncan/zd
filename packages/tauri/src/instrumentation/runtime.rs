use std::path::PathBuf;
use std::sync::Arc;

use tauri_plugin_opener::OpenerExt;

use super::{
    CurrentProcessSampler, DiagnosticPolicy, DiagnosticRecordInput, DiagnosticService,
    DiagnosticStatus, DiagnosticWriteOutcome, ProcessSampler,
};

/// The one native owner for the current diagnostic session.
pub struct DiagnosticState {
    service: DiagnosticService,
}

impl DiagnosticState {
    pub fn new(root: PathBuf, app_version: impl Into<String>) -> Result<Self, String> {
        Ok(Self::with_sampler(
            root,
            app_version,
            DiagnosticPolicy::default(),
            Arc::new(CurrentProcessSampler::new()?),
        ))
    }

    pub fn with_sampler(
        root: PathBuf,
        app_version: impl Into<String>,
        policy: DiagnosticPolicy,
        sampler: Arc<dyn ProcessSampler>,
    ) -> Self {
        Self {
            service: DiagnosticService::new(root, app_version, policy, sampler),
        }
    }

    pub fn status(&self) -> DiagnosticStatus {
        self.service.status()
    }

    pub fn enable(&self) -> DiagnosticStatus {
        self.service.enable()
    }

    pub fn shutdown(&self) -> DiagnosticStatus {
        self.service.disable()
    }

    pub fn record(&self, record: DiagnosticRecordInput) -> DiagnosticWriteOutcome {
        self.service.record(record)
    }

    pub fn reveal_directory(&self) -> Result<PathBuf, String> {
        let directory = self.service.directory();
        if !directory.is_dir() {
            return Err(
                "no diagnostic session exists; enable diagnostics before revealing it".to_string(),
            );
        }
        Ok(directory.to_path_buf())
    }
}

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
