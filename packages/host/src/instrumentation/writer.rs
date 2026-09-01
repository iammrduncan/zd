use std::fs::{self, File, OpenOptions};
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use std::time::Instant;

use serde::Serialize;

use super::format::{
    io_problem, unix_millis, DiagnosticManifest, DiagnosticRecordInput, ManifestLimits,
    ManifestPrivacy, ProcessSample, StoredFeatureRecord, StoredSampleRecord, FORMAT_NAME,
    SCHEMA_VERSION,
};

const CLOSED_MANIFEST_RESERVE_BYTES: u64 = 64;

pub(crate) struct SessionWriter {
    directory: PathBuf,
    manifest: DiagnosticManifest,
    started: Instant,
    file: Option<BufWriter<File>>,
    segment_index: u32,
    segment_bytes: u64,
    session_bytes: u64,
    sequence: u64,
    max_segment_bytes: u64,
    max_session_bytes: u64,
    closed: bool,
    warning: Option<String>,
    failure: Option<String>,
}

impl SessionWriter {
    pub(crate) fn create(
        root: &Path,
        session_id: String,
        app_version: String,
        limits: ManifestLimits,
        warning: Option<String>,
    ) -> Result<Self, String> {
        fs::create_dir_all(root).map_err(|error| io_problem("create its directory", &error))?;
        let directory = root.join(&session_id);
        fs::create_dir(&directory).map_err(|error| io_problem("create a session", &error))?;
        let started_at_unix_ms = unix_millis();
        let manifest = DiagnosticManifest {
            schema_version: SCHEMA_VERSION,
            format: FORMAT_NAME.to_string(),
            session_id,
            app_version,
            started_at_unix_ms,
            ended_at_unix_ms: None,
            closed_cleanly: false,
            monotonic_unit: "microseconds".to_string(),
            event_files: "events-*.ndjson".to_string(),
            privacy: ManifestPrivacy {
                raw_content: false,
                environment_values: false,
                full_paths: false,
            },
            limits: limits.clone(),
        };
        if let Err(problem) = write_manifest(&directory, &manifest) {
            let _ = fs::remove_dir(&directory);
            return Err(problem);
        }
        let manifest_bytes = match fs::metadata(directory.join("manifest.json")) {
            Ok(metadata) => metadata.len().saturating_add(CLOSED_MANIFEST_RESERVE_BYTES),
            Err(error) => {
                let _ = fs::remove_file(directory.join("manifest.json"));
                let _ = fs::remove_dir(&directory);
                return Err(io_problem("inspect its manifest", &error));
            }
        };
        let file = match open_segment(&directory, 1) {
            Ok(file) => file,
            Err(problem) => {
                let _ = fs::remove_file(directory.join("manifest.json"));
                let _ = fs::remove_dir(&directory);
                return Err(problem);
            }
        };
        Ok(Self {
            directory,
            manifest,
            started: Instant::now(),
            file: Some(BufWriter::new(file)),
            segment_index: 1,
            segment_bytes: 0,
            session_bytes: manifest_bytes,
            sequence: 0,
            max_segment_bytes: limits.segment_bytes,
            max_session_bytes: limits.session_bytes,
            closed: false,
            warning,
            failure: None,
        })
    }

    pub(crate) fn session_id(&self) -> &str {
        &self.manifest.session_id
    }

    pub(crate) fn accepting(&self) -> bool {
        !self.closed && self.failure.is_none() && self.file.is_some()
    }

    pub(crate) fn problem(&self) -> Option<String> {
        self.failure.clone().or_else(|| self.warning.clone())
    }

    pub(crate) fn record_feature(&mut self, record: &DiagnosticRecordInput) -> Result<(), String> {
        let next_sequence = self.sequence.saturating_add(1);
        let session_id = self.manifest.session_id.clone();
        let stored = StoredFeatureRecord {
            schema_version: SCHEMA_VERSION,
            session_id: &session_id,
            sequence: next_sequence,
            monotonic_us: self.monotonic_us(),
            record,
        };
        self.write_record(&stored, next_sequence)
    }

    pub(crate) fn record_sample(&mut self, sample: ProcessSample) -> Result<(), String> {
        if !sample.is_bounded() {
            return self.stop_with("diagnostic process sample was outside its bounds".to_string());
        }
        let next_sequence = self.sequence.saturating_add(1);
        let session_id = self.manifest.session_id.clone();
        let stored = StoredSampleRecord {
            schema_version: SCHEMA_VERSION,
            session_id: &session_id,
            sequence: next_sequence,
            monotonic_us: self.monotonic_us(),
            record_type: "sample",
            cpu_percent: sample.cpu_percent,
            resident_bytes: sample.resident_bytes,
        };
        self.write_record(&stored, next_sequence)
    }

    pub(crate) fn stop_with(&mut self, problem: String) -> Result<(), String> {
        self.failure = Some(problem.clone());
        Err(problem)
    }

    fn monotonic_us(&self) -> u64 {
        self.started.elapsed().as_micros().min(u128::from(u64::MAX)) as u64
    }

    fn write_record<T: Serialize>(&mut self, record: &T, next_sequence: u64) -> Result<(), String> {
        if self.closed {
            return Err("diagnostic writer is closed".to_string());
        }
        if let Some(problem) = &self.failure {
            return Err(problem.clone());
        }
        let mut line = match serde_json::to_vec(record) {
            Ok(line) => line,
            Err(_) => return self.stop_with("diagnostic record could not be encoded".to_string()),
        };
        line.push(b'\n');
        let line_bytes = line.len() as u64;
        if line_bytes > self.max_segment_bytes {
            return self.stop_with("diagnostic record exceeded the segment limit".to_string());
        }
        if self.session_bytes.saturating_add(line_bytes) > self.max_session_bytes {
            return self.stop_with("diagnostic session reached its storage limit".to_string());
        }
        if self.segment_bytes > 0
            && self.segment_bytes.saturating_add(line_bytes) > self.max_segment_bytes
        {
            self.rotate()?;
        }

        let write_result = self
            .file
            .as_mut()
            .ok_or_else(|| "diagnostic writer is closed".to_string())
            .and_then(|file| {
                file.write_all(&line)
                    .and_then(|()| file.flush())
                    .map_err(|error| io_problem("commit a record", &error))
            });
        if let Err(problem) = write_result {
            return self.stop_with(problem);
        }
        self.segment_bytes = self.segment_bytes.saturating_add(line_bytes);
        self.session_bytes = self.session_bytes.saturating_add(line_bytes);
        self.sequence = next_sequence;
        Ok(())
    }

    fn rotate(&mut self) -> Result<(), String> {
        if let Some(mut file) = self.file.take() {
            if let Err(error) = file.flush() {
                return self.stop_with(io_problem("flush a segment", &error));
            }
        }
        let next_index = self.segment_index.saturating_add(1);
        match open_segment(&self.directory, next_index) {
            Ok(file) => {
                self.file = Some(BufWriter::new(file));
                self.segment_index = next_index;
                self.segment_bytes = 0;
                Ok(())
            }
            Err(problem) => self.stop_with(problem),
        }
    }

    pub(crate) fn close(&mut self) -> Option<String> {
        if self.closed {
            return self.problem();
        }
        self.closed = true;
        let mut close_problem = self.failure.clone();
        if let Some(mut file) = self.file.take() {
            if let Err(error) = file.flush() {
                close_problem = Some(io_problem("flush the active segment", &error));
            }
        }
        self.manifest.ended_at_unix_ms = Some(unix_millis());
        self.manifest.closed_cleanly = close_problem.is_none();
        if let Err(problem) = write_manifest(&self.directory, &self.manifest) {
            close_problem = Some(problem);
        }
        self.failure = close_problem.clone();
        close_problem.or_else(|| self.warning.clone())
    }
}

fn open_segment(directory: &Path, index: u32) -> Result<File, String> {
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(directory.join(format!("events-{index:05}.ndjson")))
        .map_err(|error| io_problem("open an event segment", &error))
}

fn write_manifest(directory: &Path, manifest: &DiagnosticManifest) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|_| "diagnostic manifest could not be encoded".to_string())?;
    let temporary = directory.join("manifest.json.tmp");
    let destination = directory.join("manifest.json");
    fs::write(&temporary, bytes).map_err(|error| io_problem("write its manifest", &error))?;
    match fs::remove_file(&destination) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(io_problem("replace its manifest", &error)),
    }
    fs::rename(&temporary, &destination).map_err(|error| io_problem("commit its manifest", &error))
}
