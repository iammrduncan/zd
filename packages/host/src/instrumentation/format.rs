use std::fmt;

use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u8 = 1;
pub const FORMAT_NAME: &str = "zd-diagnostics";
pub const MANIFEST_LIMIT_BYTES: u64 = 65_536;

const MAX_DURATION_US: u64 = 86_400_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DiagnosticOutcome {
    Ok,
    Cancelled,
    Refused,
    Failed,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogicalPathScope {
    Project,
    Redacted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RedactedLogicalPath {
    pub scope: LogicalPathScope,
    #[serde(deserialize_with = "bounded_depth")]
    pub depth: u16,
    #[serde(default, deserialize_with = "optional_extension")]
    pub extension: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DiagnosticContext {
    #[serde(default, deserialize_with = "optional_token")]
    pub project_id: Option<String>,
    #[serde(default, deserialize_with = "optional_token")]
    pub worktree_id: Option<String>,
    #[serde(default, deserialize_with = "optional_token")]
    pub thread_id: Option<String>,
    #[serde(default, deserialize_with = "optional_token")]
    pub thread_session_id: Option<String>,
    pub logical_path: Option<RedactedLogicalPath>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "recordType",
    rename_all = "lowercase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum DiagnosticRecordInput {
    Event {
        #[serde(deserialize_with = "token")]
        operation: String,
        outcome: DiagnosticOutcome,
        context: Option<DiagnosticContext>,
    },
    Span {
        #[serde(deserialize_with = "token")]
        operation: String,
        #[serde(deserialize_with = "token")]
        trace_id: String,
        #[serde(deserialize_with = "token")]
        span_id: String,
        #[serde(default, deserialize_with = "optional_token")]
        parent_span_id: Option<String>,
        #[serde(deserialize_with = "bounded_duration")]
        duration_us: u64,
        outcome: DiagnosticOutcome,
        context: Option<DiagnosticContext>,
    },
    Error {
        #[serde(deserialize_with = "token")]
        operation: String,
        #[serde(deserialize_with = "token")]
        code: String,
        context: Option<DiagnosticContext>,
    },
    State {
        #[serde(deserialize_with = "token")]
        operation: String,
        #[serde(deserialize_with = "token")]
        from: String,
        #[serde(deserialize_with = "token")]
        to: String,
        context: Option<DiagnosticContext>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProcessSample {
    pub cpu_percent: f64,
    pub resident_bytes: u64,
}

impl ProcessSample {
    pub fn is_bounded(self) -> bool {
        self.cpu_percent.is_finite() && (0.0..=10_000.0).contains(&self.cpu_percent)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredFeatureRecord<'a> {
    pub schema_version: u8,
    pub session_id: &'a str,
    pub sequence: u64,
    pub monotonic_us: u64,
    #[serde(flatten)]
    pub record: &'a DiagnosticRecordInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredSampleRecord<'a> {
    pub schema_version: u8,
    pub session_id: &'a str,
    pub sequence: u64,
    pub monotonic_us: u64,
    pub record_type: &'static str,
    pub cpu_percent: f64,
    pub resident_bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct DiagnosticManifest {
    pub schema_version: u8,
    pub format: String,
    pub session_id: String,
    pub app_version: String,
    pub started_at_unix_ms: u64,
    pub ended_at_unix_ms: Option<u64>,
    pub closed_cleanly: bool,
    pub monotonic_unit: String,
    pub event_files: String,
    pub privacy: ManifestPrivacy,
    pub limits: ManifestLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ManifestPrivacy {
    pub raw_content: bool,
    pub environment_values: bool,
    pub full_paths: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ManifestLimits {
    pub segment_bytes: u64,
    pub session_bytes: u64,
    pub total_bytes: u64,
    pub retained_sessions: usize,
}

pub(crate) fn safe_token(value: &str) -> bool {
    let mut bytes = value.bytes();
    let Some(first) = bytes.next() else {
        return false;
    };
    if !first.is_ascii_alphanumeric() || value.len() > 96 {
        return false;
    }
    bytes.all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'_' | b':' | b'-'))
}

fn token<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    safe_token(&value)
        .then_some(value)
        .ok_or_else(|| de::Error::custom("expected a bounded opaque token"))
}

fn optional_token<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    match value {
        Some(value) if !safe_token(&value) => {
            Err(de::Error::custom("expected a bounded opaque token"))
        }
        value => Ok(value),
    }
}

fn optional_extension<'de, D>(deserializer: D) -> Result<Option<String>, D::Error>
where
    D: Deserializer<'de>,
{
    let value = Option::<String>::deserialize(deserializer)?;
    match value {
        Some(value)
            if value.is_empty()
                || value.len() > 12
                || !value.bytes().all(|byte| byte.is_ascii_alphanumeric()) =>
        {
            Err(de::Error::custom("expected a bounded file extension"))
        }
        Some(value) => Ok(Some(value.to_ascii_lowercase())),
        None => Ok(None),
    }
}

fn bounded_depth<'de, D>(deserializer: D) -> Result<u16, D::Error>
where
    D: Deserializer<'de>,
{
    let value = u16::deserialize(deserializer)?;
    (value <= 255)
        .then_some(value)
        .ok_or_else(|| de::Error::custom("expected a bounded logical path depth"))
}

fn bounded_duration<'de, D>(deserializer: D) -> Result<u64, D::Error>
where
    D: Deserializer<'de>,
{
    let value = u64::deserialize(deserializer)?;
    (value <= MAX_DURATION_US)
        .then_some(value)
        .ok_or_else(|| de::Error::custom("expected a bounded duration"))
}

pub(crate) fn unix_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u128::from(u64::MAX)) as u64
}

pub(crate) fn io_problem(action: &str, error: &std::io::Error) -> String {
    struct Kind(std::io::ErrorKind);
    impl fmt::Display for Kind {
        fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            write!(formatter, "{:?}", self.0)
        }
    }
    format!(
        "diagnostic storage could not {action} ({})",
        Kind(error.kind())
    )
}
