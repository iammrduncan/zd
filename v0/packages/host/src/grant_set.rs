//! Project-scoped persistence for the grants explicitly opened beside one startup project.

use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::atomic_write;

const SCHEMA_VERSION: u8 = 1;
const DIRECTORY: &str = "served-grants-v1";
const FILE_LIMIT_BYTES: u64 = 64 * 1024;
const MAX_PROJECTS: usize = 32;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredGrantSet {
    schema_version: u8,
    startup_project_id: String,
    project_ids: Vec<String>,
}

#[derive(Debug, Clone)]
pub(crate) struct GrantSetStore {
    startup_project_id: String,
    path: PathBuf,
    lock_path: PathBuf,
}

impl GrantSetStore {
    pub(crate) fn new(state_directory: &Path, startup_project_id: String) -> Result<Self, String> {
        validate_project_id(&startup_project_id)?;
        let directory = state_directory.join(DIRECTORY);
        Ok(Self {
            path: directory.join(format!("{startup_project_id}.json")),
            lock_path: directory.join(format!("{startup_project_id}.lock")),
            startup_project_id,
        })
    }

    pub(crate) fn startup_project_id(&self) -> &str {
        &self.startup_project_id
    }

    pub(crate) fn load(&self) -> Result<Vec<String>, String> {
        self.with_lock(|| self.load_unlocked())
    }

    pub(crate) fn add(&self, project_id: &str) -> Result<(), String> {
        validate_project_id(project_id)?;
        self.with_lock(|| {
            let mut project_ids = self.load_unlocked()?;
            if !project_ids.iter().any(|existing| existing == project_id) {
                project_ids.push(project_id.to_string());
            }
            self.save_unlocked(&project_ids)
        })
    }

    pub(crate) fn remove(&self, project_id: &str) -> Result<(), String> {
        validate_project_id(project_id)?;
        if project_id == self.startup_project_id {
            return Err(unavailable("startup project cannot be removed"));
        }
        self.with_lock(|| {
            let mut project_ids = self.load_unlocked()?;
            project_ids.retain(|existing| existing != project_id);
            self.save_unlocked(&project_ids)
        })
    }

    fn load_unlocked(&self) -> Result<Vec<String>, String> {
        let bytes = match std::fs::symlink_metadata(&self.path) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(unavailable("grant set cannot be a symbolic link"));
            }
            Ok(metadata) if metadata.len() > FILE_LIMIT_BYTES => {
                return Err(unavailable("grant set exceeds its byte limit"));
            }
            Ok(_) => {
                std::fs::read(&self.path).map_err(|_| unavailable("grant set cannot be read"))?
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(vec![self.startup_project_id.clone()]);
            }
            Err(_) => return Err(unavailable("grant set metadata cannot be read")),
        };
        let stored: StoredGrantSet =
            serde_json::from_slice(&bytes).map_err(|_| unavailable("grant set JSON is invalid"))?;
        validate(&stored, &self.startup_project_id)?;
        Ok(stored.project_ids)
    }

    fn save_unlocked(&self, project_ids: &[String]) -> Result<(), String> {
        let stored = StoredGrantSet {
            schema_version: SCHEMA_VERSION,
            startup_project_id: self.startup_project_id.clone(),
            project_ids: project_ids.to_vec(),
        };
        validate(&stored, &self.startup_project_id)?;
        let bytes = serde_json::to_vec_pretty(&stored)
            .map_err(|_| unavailable("grant set cannot be encoded"))?;
        if bytes.len() as u64 > FILE_LIMIT_BYTES {
            return Err(unavailable("grant set exceeds its byte limit"));
        }
        atomic_write::atomic_write(&self.path, &bytes)
            .map_err(|_| unavailable("grant set cannot be replaced"))
    }

    fn with_lock<T>(&self, operation: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        let directory = self
            .path
            .parent()
            .ok_or_else(|| unavailable("grant set directory is invalid"))?;
        std::fs::create_dir_all(directory)
            .map_err(|_| unavailable("grant set directory cannot be created"))?;
        let lock = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(&self.lock_path)
            .map_err(|_| unavailable("grant set lock cannot be opened"))?;
        File::lock(&lock).map_err(|_| unavailable("grant set lock failed"))?;
        operation()
    }
}

fn validate(stored: &StoredGrantSet, expected_startup: &str) -> Result<(), String> {
    if stored.schema_version != SCHEMA_VERSION
        || stored.startup_project_id != expected_startup
        || stored.project_ids.first().map(String::as_str) != Some(expected_startup)
        || !(1..=MAX_PROJECTS).contains(&stored.project_ids.len())
        || stored
            .project_ids
            .iter()
            .any(|project_id| validate_project_id(project_id).is_err())
        || stored.project_ids.iter().collect::<HashSet<_>>().len() != stored.project_ids.len()
    {
        return Err(unavailable("grant set schema or projects are invalid"));
    }
    Ok(())
}

fn validate_project_id(project_id: &str) -> Result<(), String> {
    let valid = project_id.strip_prefix("project-").is_some_and(|encoded| {
        encoded.len() == 32
            && encoded
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    });
    if valid {
        Ok(())
    } else {
        Err(unavailable("project identity is invalid"))
    }
}

fn unavailable(reason: &str) -> String {
    format!("served grant persistence is unavailable: {reason}")
}
