//! Local, opt-in diagnostic evidence with a closed privacy boundary.

mod format;
mod retention;
pub(crate) mod runtime;
mod sampler;
mod service;
mod writer;

pub use format::{DiagnosticRecordInput, ProcessSample};
pub use retention::{DiagnosticCatalog, DiagnosticSessionSummary};
pub use runtime::{
    diagnostics_status, disable_diagnostics, enable_diagnostics, record_diagnostic,
    reveal_diagnostics, DiagnosticState,
};
pub use sampler::CurrentProcessSampler;
pub use service::{
    DiagnosticPolicy, DiagnosticService, DiagnosticStatus, DiagnosticWriteOutcome, ProcessSampler,
};
