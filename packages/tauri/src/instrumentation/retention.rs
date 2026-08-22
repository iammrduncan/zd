use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use super::format::{DiagnosticManifest, MANIFEST_LIMIT_BYTES, SCHEMA_VERSION};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticSessionSummary {
    pub session_id: String,
    pub started_at_unix_ms: Option<u64>,
    pub ended_at_unix_ms: Option<u64>,
    pub closed_cleanly: bool,
    pub size_bytes: u64,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticCatalog {
    pub sessions: Vec<DiagnosticSessionSummary>,
    pub problems: Vec<String>,
}

struct SessionEntry {
    path: PathBuf,
    summary: DiagnosticSessionSummary,
    removable: bool,
}

fn direct_file_bytes(directory: &Path) -> Result<u64, String> {
    let entries = fs::read_dir(directory).map_err(|error| {
        format!(
            "could not inspect a diagnostic session ({:?})",
            error.kind()
        )
    })?;
    let mut bytes = 0_u64;
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "could not inspect a diagnostic session ({:?})",
                error.kind()
            )
        })?;
        let file_type = entry.file_type().map_err(|error| {
            format!(
                "could not inspect a diagnostic session ({:?})",
                error.kind()
            )
        })?;
        if file_type.is_symlink() {
            return Err("diagnostic sessions cannot contain symbolic links".to_string());
        }
        if file_type.is_file() {
            let length = entry
                .metadata()
                .map_err(|error| {
                    format!(
                        "could not inspect a diagnostic session ({:?})",
                        error.kind()
                    )
                })?
                .len();
            bytes = bytes.saturating_add(length);
        } else {
            return Err("diagnostic sessions can contain only direct files".to_string());
        }
    }
    Ok(bytes)
}

fn read_manifest(directory: &Path) -> Result<DiagnosticManifest, String> {
    let path = directory.join("manifest.json");
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| "diagnostic manifest is missing or unreadable".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("diagnostic manifest is not a regular file".to_string());
    }
    if metadata.len() > MANIFEST_LIMIT_BYTES {
        return Err("diagnostic manifest exceeds the 65,536-byte limit".to_string());
    }
    let source =
        fs::read(&path).map_err(|_| "diagnostic manifest is missing or unreadable".to_string())?;
    if source.len() as u64 > MANIFEST_LIMIT_BYTES {
        return Err("diagnostic manifest exceeds the 65,536-byte limit".to_string());
    }
    let manifest: DiagnosticManifest = serde_json::from_slice(&source)
        .map_err(|_| "diagnostic manifest is invalid".to_string())?;
    if manifest.schema_version != SCHEMA_VERSION || manifest.session_id != directory_name(directory)
    {
        return Err("diagnostic manifest identity or version is invalid".to_string());
    }
    Ok(manifest)
}

fn directory_name(directory: &Path) -> String {
    directory
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn session_entries(root: &Path) -> Result<Vec<SessionEntry>, String> {
    let metadata = match fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!(
                "could not inspect the diagnostic directory ({:?})",
                error.kind()
            ))
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err("the diagnostic storage location is not a regular directory".to_string());
    }

    let entries = fs::read_dir(root).map_err(|error| {
        format!(
            "could not inspect the diagnostic directory ({:?})",
            error.kind()
        )
    })?;
    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            format!(
                "could not inspect the diagnostic directory ({:?})",
                error.kind()
            )
        })?;
        let session_id = entry.file_name().to_string_lossy().into_owned();
        if !session_id.starts_with("session-") {
            continue;
        }
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(_) => {
                sessions.push(SessionEntry {
                    path,
                    summary: DiagnosticSessionSummary {
                        session_id,
                        started_at_unix_ms: None,
                        ended_at_unix_ms: None,
                        closed_cleanly: false,
                        size_bytes: 0,
                        problem: Some("diagnostic session type is unreadable".to_string()),
                    },
                    removable: false,
                });
                continue;
            }
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            sessions.push(SessionEntry {
                path,
                summary: DiagnosticSessionSummary {
                    session_id,
                    started_at_unix_ms: None,
                    ended_at_unix_ms: None,
                    closed_cleanly: false,
                    size_bytes: 0,
                    problem: Some("diagnostic session is not a regular directory".to_string()),
                },
                removable: false,
            });
            continue;
        }

        let size = direct_file_bytes(&path);
        let manifest = read_manifest(&path);
        let (started_at_unix_ms, ended_at_unix_ms, closed_cleanly, manifest_problem) =
            match manifest {
                Ok(manifest) => (
                    Some(manifest.started_at_unix_ms),
                    manifest.ended_at_unix_ms,
                    manifest.closed_cleanly,
                    None,
                ),
                Err(problem) => (None, None, false, Some(problem)),
            };
        let (size_bytes, size_problem) = match size {
            Ok(bytes) => (bytes, None),
            Err(problem) => (0, Some(problem)),
        };
        sessions.push(SessionEntry {
            path,
            summary: DiagnosticSessionSummary {
                session_id,
                started_at_unix_ms,
                ended_at_unix_ms,
                closed_cleanly,
                size_bytes,
                problem: manifest_problem.or(size_problem),
            },
            removable: true,
        });
    }
    sessions.sort_by(|left, right| {
        left.summary
            .started_at_unix_ms
            .unwrap_or(0)
            .cmp(&right.summary.started_at_unix_ms.unwrap_or(0))
            .then_with(|| left.summary.session_id.cmp(&right.summary.session_id))
    });
    Ok(sessions)
}

pub(crate) fn catalog(root: &Path) -> DiagnosticCatalog {
    match session_entries(root) {
        Ok(entries) => DiagnosticCatalog {
            sessions: entries.into_iter().map(|entry| entry.summary).collect(),
            problems: Vec::new(),
        },
        Err(problem) => DiagnosticCatalog {
            sessions: Vec::new(),
            problems: vec![problem],
        },
    }
}

pub(crate) fn apply_retention(
    root: &Path,
    now_ms: u64,
    retention: Duration,
    max_sessions: usize,
    max_total_bytes: u64,
    reserve_bytes: u64,
) -> Vec<String> {
    let mut entries = match session_entries(root) {
        Ok(entries) => entries,
        Err(problem) => return vec![problem],
    };
    let mut problems = entries
        .iter()
        .filter_map(|entry| entry.summary.problem.clone())
        .collect::<Vec<_>>();
    let retention_ms = retention.as_millis().min(u128::from(u64::MAX)) as u64;
    let oldest_allowed = now_ms.saturating_sub(retention_ms);

    for entry in &mut entries {
        let expired = entry
            .summary
            .started_at_unix_ms
            .is_some_and(|started| started < oldest_allowed);
        if expired && entry.removable {
            match fs::remove_dir_all(&entry.path) {
                Ok(()) => entry.removable = false,
                Err(error) => problems.push(format!(
                    "could not remove an expired diagnostic session ({:?})",
                    error.kind()
                )),
            }
        }
    }
    entries.retain(|entry| entry.path.exists());

    let keep_before_new = max_sessions.saturating_sub(1);
    let allowed_existing_bytes = max_total_bytes.saturating_sub(reserve_bytes);
    loop {
        let total = entries
            .iter()
            .map(|entry| entry.summary.size_bytes)
            .sum::<u64>();
        if entries.len() <= keep_before_new && total <= allowed_existing_bytes {
            break;
        }
        let Some(index) = entries.iter().position(|entry| entry.removable) else {
            problems.push("diagnostic retention could not satisfy its storage limit".to_string());
            break;
        };
        let entry = entries.remove(index);
        if let Err(error) = fs::remove_dir_all(entry.path) {
            problems.push(format!(
                "could not remove an old diagnostic session ({:?})",
                error.kind()
            ));
        }
    }
    problems
}

#[cfg(test)]
mod tests {
    use super::apply_retention;
    use std::path::PathBuf;
    use std::time::Duration;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "zd-retention-{}",
                super::super::format::unix_millis()
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn corrupt_direct_sessions_are_removed_when_capacity_requires_it() {
        let scratch = Scratch::new();
        for name in ["session-a", "session-b"] {
            let directory = scratch.0.join(name);
            std::fs::create_dir(&directory).unwrap();
            std::fs::write(directory.join("manifest.json"), "invalid").unwrap();
        }

        let problems = apply_retention(
            &scratch.0,
            u64::MAX,
            Duration::from_secs(u64::MAX),
            1,
            1_024,
            512,
        );

        assert!(!problems.is_empty());
        assert_eq!(std::fs::read_dir(&scratch.0).unwrap().count(), 0);
    }
}
