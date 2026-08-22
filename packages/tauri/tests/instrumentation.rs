#[allow(dead_code, unused_imports)]
#[path = "../src/instrumentation/mod.rs"]
mod instrumentation;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use instrumentation::{
    DiagnosticPolicy, DiagnosticRecordInput, DiagnosticService, ProcessSample, ProcessSampler,
};
use serde_json::{json, Value};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock moved before epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-diagnostics-{name}-{stamp}"));
        Self(path)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
        let _ = std::fs::remove_file(&self.0);
    }
}

#[derive(Default)]
struct SampleCount {
    count: Mutex<usize>,
    changed: Condvar,
}

impl SampleCount {
    fn value(&self) -> usize {
        *self.count.lock().expect("sample count")
    }

    fn wait_for(&self, minimum: usize) {
        let count = self.count.lock().expect("sample count");
        let (count, timeout) = self
            .changed
            .wait_timeout_while(count, Duration::from_secs(1), |count| *count < minimum)
            .expect("wait for samples");
        assert!(!timeout.timed_out(), "sampler did not reach {minimum}");
        assert!(*count >= minimum);
    }
}

struct CountingSampler(Arc<SampleCount>);

impl ProcessSampler for CountingSampler {
    fn sample(&self) -> Result<ProcessSample, String> {
        let mut count = self.0.count.lock().map_err(|_| "count unavailable")?;
        *count += 1;
        self.0.changed.notify_all();
        Ok(ProcessSample {
            cpu_percent: 12.5,
            resident_bytes: 8_388_608 + (*count as u64 * 1_048_576),
        })
    }
}

fn policy() -> DiagnosticPolicy {
    DiagnosticPolicy {
        sample_interval: Duration::from_millis(10),
        max_segment_bytes: 768,
        max_session_bytes: 32_768,
        max_total_bytes: 65_536,
        max_sessions: 3,
        retention: Duration::from_secs(60 * 60 * 24 * 7),
    }
}

fn service(root: &Path, count: Arc<SampleCount>) -> DiagnosticService {
    DiagnosticService::new(
        root.to_path_buf(),
        "0.1.0-test",
        policy(),
        Arc::new(CountingSampler(count)),
    )
}

fn input(value: Value) -> DiagnosticRecordInput {
    serde_json::from_value(value).expect("valid diagnostic input")
}

fn event(operation: &str) -> DiagnosticRecordInput {
    input(json!({
        "recordType": "event",
        "operation": operation,
        "outcome": "ok",
        "context": {
            "projectId": "project-a",
            "logicalPath": { "scope": "project", "depth": 3, "extension": "rs" }
        }
    }))
}

fn session_files(root: &Path, session_id: &str) -> Vec<PathBuf> {
    let mut files = std::fs::read_dir(root.join(session_id))
        .expect("session directory")
        .map(|entry| entry.expect("session entry").path())
        .collect::<Vec<_>>();
    files.sort();
    files
}

#[test]
fn default_off_constructs_no_directory_writer_timer_or_sample() {
    let scratch = Scratch::new("default-off");
    let count = Arc::new(SampleCount::default());
    let diagnostics = service(&scratch.0, count.clone());

    assert!(!scratch.0.exists());
    assert_eq!(count.value(), 0);
    assert_eq!(
        diagnostics.status(),
        instrumentation::DiagnosticStatus {
            enabled: false,
            session_id: None,
            background_sampling: false,
            problem: None,
        }
    );
    assert!(!diagnostics.record(event("workbench.launch")).recorded);
    assert!(!scratch.0.exists());
    assert_eq!(count.value(), 0);
}

#[test]
fn enable_records_versioned_ordered_evidence_and_disable_closes_cleanly() {
    let scratch = Scratch::new("session");
    let count = Arc::new(SampleCount::default());
    let diagnostics = service(&scratch.0, count.clone());

    let enabled = diagnostics.enable();
    assert!(enabled.enabled, "{:?}", enabled.problem);
    let session_id = enabled.session_id.expect("session id");
    assert!(diagnostics.record(event("workbench.launch")).recorded);
    assert!(
        diagnostics
            .record(input(json!({
                "recordType": "span",
                "operation": "file.open",
                "traceId": "trace-0001",
                "spanId": "span-0001",
                "durationUs": 125000,
                "outcome": "ok"
            })))
            .recorded
    );
    assert!(
        diagnostics
            .record(input(json!({
                "recordType": "error",
                "operation": "git.status",
                "code": "permission-denied"
            })))
            .recorded
    );
    count.wait_for(1);

    let disabled = diagnostics.disable();
    assert!(!disabled.enabled);
    assert!(!disabled.background_sampling);

    let manifest: Value = serde_json::from_slice(
        &std::fs::read(scratch.0.join(&session_id).join("manifest.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["format"], "zd-diagnostics");
    assert_eq!(manifest["closedCleanly"], true);
    assert!(manifest["endedAtUnixMs"].as_u64().is_some());

    let records = session_files(&scratch.0, &session_id)
        .into_iter()
        .filter(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("events-")
        })
        .flat_map(|path| {
            std::fs::read_to_string(path)
                .unwrap()
                .lines()
                .map(|line| serde_json::from_str::<Value>(line).unwrap())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();
    assert!(records.iter().any(|record| record["recordType"] == "event"));
    assert!(records.iter().any(|record| record["recordType"] == "span"));
    assert!(records.iter().any(|record| record["recordType"] == "error"));
    assert!(records
        .iter()
        .any(|record| record["recordType"] == "sample"));
    for (index, record) in records.iter().enumerate() {
        assert_eq!(record["schemaVersion"], 1);
        assert_eq!(record["sessionId"], session_id);
        assert_eq!(record["sequence"], (index + 1) as u64);
        assert!(record["monotonicUs"].as_u64().is_some());
    }
}

#[test]
fn disabling_wakes_and_joins_the_periodic_sampler() {
    let scratch = Scratch::new("sampler-stop");
    let count = Arc::new(SampleCount::default());
    let diagnostics = service(&scratch.0, count.clone());

    assert!(diagnostics.enable().enabled);
    count.wait_for(2);
    diagnostics.disable();
    let stopped_at = count.value();
    std::thread::sleep(Duration::from_millis(35));

    assert_eq!(count.value(), stopped_at);
    assert!(!diagnostics.status().background_sampling);
}

#[test]
fn rotation_and_retention_bound_files_and_session_count() {
    let scratch = Scratch::new("bounds");
    for index in 0..5 {
        let count = Arc::new(SampleCount::default());
        let diagnostics = service(&scratch.0, count);
        assert!(diagnostics.enable().enabled);
        for event_index in 0..12 {
            let outcome = diagnostics.record(event(&format!("file.open-{index}-{event_index}")));
            assert!(outcome.recorded, "{:?}", outcome.problem);
        }
        diagnostics.disable();
    }

    let sessions = std::fs::read_dir(&scratch.0)
        .unwrap()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_ok_and(|kind| kind.is_dir()))
        .collect::<Vec<_>>();
    assert!(sessions.len() <= policy().max_sessions);
    assert!(sessions.iter().all(|session| {
        session_files(&scratch.0, &session.file_name().to_string_lossy())
            .iter()
            .filter(|path| {
                path.file_name()
                    .unwrap()
                    .to_string_lossy()
                    .starts_with("events-")
            })
            .count()
            > 1
    }));
    let total_bytes = sessions
        .iter()
        .flat_map(|session| session_files(&scratch.0, &session.file_name().to_string_lossy()))
        .filter_map(|path| path.metadata().ok())
        .map(|metadata| metadata.len())
        .sum::<u64>();
    assert!(total_bytes <= policy().max_total_bytes);
}

#[test]
fn malformed_or_content_bearing_records_are_rejected_before_writing() {
    for unsafe_record in [
        json!({
            "recordType": "error",
            "operation": "terminal.spawn",
            "code": "failed",
            "message": "/Users/alice/private TOKEN=secret"
        }),
        json!({
            "recordType": "event",
            "operation": "terminal.output",
            "outcome": "ok",
            "transcript": "private output"
        }),
        json!({
            "recordType": "event",
            "operation": "contains private prose",
            "outcome": "ok"
        }),
    ] {
        assert!(serde_json::from_value::<DiagnosticRecordInput>(unsafe_record).is_err());
    }
}

#[test]
fn filesystem_and_corrupt_session_failures_are_visible_and_non_fatal() {
    let scratch = Scratch::new("failures");
    std::fs::write(&scratch.0, "not a directory").unwrap();
    let diagnostics = service(&scratch.0, Arc::new(SampleCount::default()));

    let failed = diagnostics.enable();
    assert!(!failed.enabled);
    assert!(failed.problem.is_some());
    assert!(!diagnostics.record(event("workbench.launch")).recorded);

    std::fs::remove_file(&scratch.0).unwrap();
    std::fs::create_dir_all(scratch.0.join("session-corrupt")).unwrap();
    std::fs::write(
        scratch.0.join("session-corrupt").join("manifest.json"),
        "{not json",
    )
    .unwrap();
    let catalog = diagnostics.catalog();
    assert_eq!(catalog.sessions.len(), 1);
    assert!(catalog.sessions[0].problem.is_some());

    let recovered = diagnostics.enable();
    assert!(recovered.enabled);
    assert!(recovered.problem.is_some());
    assert!(diagnostics.record(event("workbench.launch")).recorded);
    diagnostics.disable();
}

#[test]
fn a_writer_failure_after_enable_stops_sampling_without_blocking_the_caller() {
    let scratch = Scratch::new("writer-failure");
    let count = Arc::new(SampleCount::default());
    let mut quiet_policy = policy();
    quiet_policy.sample_interval = Duration::from_secs(60);
    let diagnostics = DiagnosticService::new(
        scratch.0.clone(),
        "0.1.0-test",
        quiet_policy,
        Arc::new(CountingSampler(count.clone())),
    );
    let enabled = diagnostics.enable();
    let session_id = enabled.session_id.unwrap();

    // The open first segment remains writable after the directory moves, but the
    // next bounded rotation cannot open a new segment at the vanished location.
    // This deterministically exercises the same writer path as disk-full or a
    // revoked permission without relying on platform permission quirks.
    std::fs::rename(scratch.0.join(&session_id), scratch.0.join("moved-session")).unwrap();
    let mut failure = None;
    for index in 0..20 {
        let outcome = diagnostics.record(event(&format!("file.open-{index}")));
        if !outcome.recorded {
            failure = outcome.problem;
            break;
        }
    }

    assert!(failure.is_some());
    assert!(diagnostics.status().problem.is_some());
    assert!(!diagnostics.status().background_sampling);
    assert!(!diagnostics.record(event("file.save")).recorded);
    assert!(!diagnostics.disable().enabled);
    assert_eq!(count.value(), 0);
}

#[test]
fn dropping_an_enabled_service_performs_the_same_clean_shutdown() {
    let scratch = Scratch::new("drop");
    let count = Arc::new(SampleCount::default());
    let session_id = {
        let diagnostics = service(&scratch.0, count.clone());
        let status = diagnostics.enable();
        count.wait_for(1);
        status.session_id.unwrap()
    };
    let stopped_at = count.value();
    std::thread::sleep(Duration::from_millis(25));

    assert_eq!(count.value(), stopped_at);
    let manifest: Value = serde_json::from_slice(
        &std::fs::read(scratch.0.join(session_id).join("manifest.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(manifest["closedCleanly"], true);
}
