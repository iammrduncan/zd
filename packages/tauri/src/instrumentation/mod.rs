//! Local, opt-in diagnostic evidence with a closed privacy boundary.

mod format;
mod retention;
mod service;
mod writer;

pub use format::{DiagnosticRecordInput, ProcessSample};
pub use retention::{DiagnosticCatalog, DiagnosticSessionSummary};
pub use service::{
    DiagnosticPolicy, DiagnosticService, DiagnosticStatus, DiagnosticWriteOutcome, ProcessSampler,
};
