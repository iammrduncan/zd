//! Local, opt-in diagnostic evidence with a closed privacy boundary.

mod format;
mod retention;
mod sampler;
mod service;
mod state;
mod writer;

pub use format::{
    DiagnosticContext, DiagnosticOutcome, DiagnosticRecordInput, LogicalPathScope, ProcessSample,
    RedactedLogicalPath,
};
pub use retention::{DiagnosticCatalog, DiagnosticSessionSummary};
pub use sampler::CurrentProcessSampler;
pub use service::{
    DiagnosticPolicy, DiagnosticService, DiagnosticStatus, DiagnosticWriteOutcome, ProcessSampler,
};
pub use state::DiagnosticState;
