use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use zd_lib::instrumentation::{
    CurrentProcessSampler, DiagnosticPolicy, DiagnosticRecordInput, DiagnosticState, ProcessSample,
    ProcessSampler,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new() -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock moved before epoch")
            .as_nanos();
        Self(std::env::temp_dir().join(format!(
            "zd-diagnostic-runtime-{}-{stamp}",
            std::process::id()
        )))
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn the_production_sampler_reports_only_bounded_current_process_metrics() {
    let sampler = CurrentProcessSampler::new().expect("the current process has a native identity");

    let first = sampler
        .sample()
        .expect("the current process can be sampled");
    let second = sampler
        .sample()
        .expect("the current process remains sampleable");

    assert!(first.cpu_percent.is_finite());
    assert!((0.0..=10_000.0).contains(&first.cpu_percent));
    assert!(first.resident_bytes > 0);
    assert!(second.cpu_percent.is_finite());
    assert!(second.resident_bytes > 0);
}

#[test]
fn managed_state_stays_lazy_and_exposes_only_an_existing_diagnostic_directory() {
    let scratch = Scratch::new();
    let diagnostics = DiagnosticState::with_sampler(
        scratch.0.clone(),
        "0.1.0-test",
        DiagnosticPolicy {
            sample_interval: Duration::from_secs(60),
            ..DiagnosticPolicy::default()
        },
        Arc::new(|| {
            Ok(ProcessSample {
                cpu_percent: 0.0,
                resident_bytes: 1,
            })
        }),
    );

    assert!(!scratch.0.exists());
    assert!(diagnostics.reveal_directory().is_err());
    assert!(!diagnostics.status().enabled);

    assert!(diagnostics.enable().enabled);
    assert_eq!(diagnostics.reveal_directory().unwrap(), scratch.0);
    let record: DiagnosticRecordInput = serde_json::from_value(serde_json::json!({
        "recordType": "event",
        "operation": "workbench.launch",
        "outcome": "ok"
    }))
    .unwrap();
    assert!(diagnostics.record(record).recorded);

    assert!(!diagnostics.shutdown().enabled);
    assert!(!diagnostics.status().background_sampling);
}
