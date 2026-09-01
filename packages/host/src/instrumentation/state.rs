use std::path::PathBuf;
use std::sync::Arc;

use super::{
    CurrentProcessSampler, DiagnosticPolicy, DiagnosticRecordInput, DiagnosticService,
    DiagnosticStatus, DiagnosticWriteOutcome, ProcessSampler,
};

/// The one native owner for the current diagnostic session.
pub struct DiagnosticState {
    service: DiagnosticService,
}

impl std::fmt::Debug for DiagnosticState {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter
            .debug_struct("DiagnosticState")
            .finish_non_exhaustive()
    }
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
