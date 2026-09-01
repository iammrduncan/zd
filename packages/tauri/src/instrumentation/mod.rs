//! Tauri adapters for host-owned diagnostics.

pub(crate) mod runtime;

pub use zd_host::instrumentation::{
    CurrentProcessSampler, DiagnosticCatalog, DiagnosticPolicy, DiagnosticRecordInput,
    DiagnosticService, DiagnosticSessionSummary, DiagnosticState, DiagnosticStatus,
    DiagnosticWriteOutcome, ProcessSample, ProcessSampler,
};
