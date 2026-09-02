//! Bounded remote directory browsing with server-issued opaque handles.

use std::collections::{HashMap, HashSet};
use std::ffi::OsStr;
use std::path::{Component, Path, PathBuf};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::grants::canonical_directory;

const RANDOM_ID_BYTES: usize = 16;
const MAX_DIRECTORY_ID_BYTES: usize = 64;
const MAX_SEARCH_QUERY_BYTES: usize = 256;
const MAX_SCANNED_ENTRIES: usize = 4096;
const MAX_VISIBLE_DIRECTORIES: usize = 512;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPickerDirectory {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPickerEntry {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectPickerSnapshot {
    pub session_id: String,
    pub directory: ProjectPickerDirectory,
    pub parent_id: Option<String>,
    pub directories: Vec<ProjectPickerEntry>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPickerDirectoryRequest {
    pub session_id: String,
    pub directory_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPickerCancelRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectPickerSearchRequest {
    pub session_id: String,
    pub query: String,
}

#[derive(Default)]
pub(crate) struct ProjectPickerState {
    session: Option<ProjectPickerSession>,
}

struct ProjectPickerSession {
    id: String,
    current_directory: PathBuf,
    directories: HashMap<String, PathBuf>,
}

impl ProjectPickerState {
    pub(crate) fn start(
        &mut self,
        starting_directory: &Path,
    ) -> Result<ProjectPickerSnapshot, String> {
        let starting_directory = canonical_directory(starting_directory).map_err(|_| {
            "The remote project browser could not open its starting folder.".to_string()
        })?;
        let session_id = opaque_id("picker")?;
        let (snapshot, directories) = snapshot(&session_id, &starting_directory, None)?;
        self.session = Some(ProjectPickerSession {
            id: session_id,
            current_directory: starting_directory,
            directories,
        });
        Ok(snapshot)
    }

    pub(crate) fn open(
        &mut self,
        request: &ProjectPickerDirectoryRequest,
    ) -> Result<ProjectPickerSnapshot, String> {
        let directory = self.resolve(request)?;
        let (snapshot, directories) = snapshot(&request.session_id, &directory, None)?;
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| "The remote project browser session is unavailable.".to_string())?;
        if session.id != request.session_id {
            return Err("The remote project browser session is unavailable.".to_string());
        }
        session.current_directory = directory;
        session.directories = directories;
        Ok(snapshot)
    }

    pub(crate) fn search(
        &mut self,
        request: &ProjectPickerSearchRequest,
    ) -> Result<ProjectPickerSnapshot, String> {
        if request.session_id.len() > MAX_DIRECTORY_ID_BYTES
            || request.query.len() > MAX_SEARCH_QUERY_BYTES
        {
            return Err("The remote project browser filter is invalid.".to_string());
        }
        let session = self
            .session
            .as_ref()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| "The remote project browser session is unavailable.".to_string())?;
        let directory = session.current_directory.clone();
        let query = request.query.trim();
        let query = (!query.is_empty()).then_some(query);
        let (snapshot, directories) = snapshot(&request.session_id, &directory, query)?;
        let session = self
            .session
            .as_mut()
            .ok_or_else(|| "The remote project browser session is unavailable.".to_string())?;
        session.directories = directories;
        Ok(snapshot)
    }

    pub(crate) fn resolve(
        &self,
        request: &ProjectPickerDirectoryRequest,
    ) -> Result<PathBuf, String> {
        if request.session_id.len() > MAX_DIRECTORY_ID_BYTES
            || request.directory_id.len() > MAX_DIRECTORY_ID_BYTES
        {
            return Err("The remote project browser selection is invalid.".to_string());
        }
        let session = self
            .session
            .as_ref()
            .filter(|session| session.id == request.session_id)
            .ok_or_else(|| "The remote project browser session is unavailable.".to_string())?;
        session
            .directories
            .get(&request.directory_id)
            .cloned()
            .ok_or_else(|| "The remote project browser selection is invalid.".to_string())
    }

    pub(crate) fn finish(&mut self, session_id: &str) {
        if self
            .session
            .as_ref()
            .is_some_and(|session| session.id == session_id)
        {
            self.session = None;
        }
    }

    pub(crate) fn cancel(&mut self, request: &ProjectPickerCancelRequest) -> Result<(), String> {
        if request.session_id.len() > MAX_DIRECTORY_ID_BYTES {
            return Err("The remote project browser session is invalid.".to_string());
        }
        let Some(session) = self.session.as_ref() else {
            return Ok(());
        };
        if session.id != request.session_id {
            return Err("The remote project browser session is unavailable.".to_string());
        }
        self.session = None;
        Ok(())
    }
}

fn snapshot(
    session_id: &str,
    directory: &Path,
    query: Option<&str>,
) -> Result<(ProjectPickerSnapshot, HashMap<String, PathBuf>), String> {
    let mut directories_by_id = HashMap::new();
    let directory_id = insert_directory(&mut directories_by_id, directory.to_path_buf())?;
    let parent = directory.parent().filter(|parent| *parent != directory);
    let parent_id = parent
        .map(|parent| insert_directory(&mut directories_by_id, parent.to_path_buf()))
        .transpose()?;

    let mut visible = Vec::new();
    let normalized_query = query.map(str::to_lowercase);
    let mut truncated = false;
    if let Some((name, path)) = query.and_then(|query| exact_child(directory, query)) {
        visible.push((name, path));
    } else {
        let mut seen = HashSet::new();
        let entries = std::fs::read_dir(directory)
            .map_err(|_| "This remote folder cannot be opened.".to_string())?;
        for (scanned, entry) in entries.enumerate() {
            if scanned >= MAX_SCANNED_ENTRIES {
                truncated = true;
                break;
            }
            let Ok(entry) = entry else {
                continue;
            };
            let path = entry.path();
            if !std::fs::metadata(&path).is_ok_and(|metadata| metadata.is_dir()) {
                continue;
            }
            let Ok(path) = canonical_directory(&path) else {
                continue;
            };
            if path == directory || !seen.insert(path.clone()) {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if normalized_query
                .as_ref()
                .is_some_and(|query| !name.to_lowercase().contains(query))
            {
                continue;
            }
            visible.push((name, path));
        }
    }
    visible.sort_by(|left, right| {
        left.0
            .to_lowercase()
            .cmp(&right.0.to_lowercase())
            .then_with(|| left.0.cmp(&right.0))
    });
    if visible.len() > MAX_VISIBLE_DIRECTORIES {
        visible.truncate(MAX_VISIBLE_DIRECTORIES);
        truncated = true;
    }
    let directories = visible
        .into_iter()
        .map(|(name, path)| {
            let id = insert_directory(&mut directories_by_id, path)?;
            Ok(ProjectPickerEntry { id, name })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let current = ProjectPickerDirectory {
        id: directory_id,
        name: directory_name(directory),
        path: directory.to_string_lossy().into_owned(),
    };
    Ok((
        ProjectPickerSnapshot {
            session_id: session_id.to_string(),
            directory: current,
            parent_id,
            directories,
            truncated,
        },
        directories_by_id,
    ))
}

fn exact_child(directory: &Path, query: &str) -> Option<(String, PathBuf)> {
    let mut components = Path::new(query).components();
    let Component::Normal(name) = components.next()? else {
        return None;
    };
    if components.next().is_some() || name != OsStr::new(query) {
        return None;
    }
    let path = directory.join(name);
    if !std::fs::metadata(&path).is_ok_and(|metadata| metadata.is_dir()) {
        return None;
    }
    let path = canonical_directory(&path).ok()?;
    (path != directory).then(|| (query.to_string(), path))
}

fn insert_directory(
    directories: &mut HashMap<String, PathBuf>,
    path: PathBuf,
) -> Result<String, String> {
    for _ in 0..4 {
        let id = opaque_id("directory")?;
        if !directories.contains_key(&id) {
            directories.insert(id.clone(), path);
            return Ok(id);
        }
    }
    Err("The remote project browser could not allocate a directory handle.".to_string())
}

fn opaque_id(kind: &str) -> Result<String, String> {
    let mut bytes = [0_u8; RANDOM_ID_BYTES];
    getrandom::fill(&mut bytes).map_err(|_| {
        "Secure randomness is unavailable for the remote project browser.".to_string()
    })?;
    Ok(format!("{kind}-{}", URL_SAFE_NO_PAD.encode(bytes)))
}

fn directory_name(path: &Path) -> String {
    path.file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the clock follows the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("zd-project-picker-{}-{stamp}", std::process::id()));
            std::fs::create_dir_all(path.join("alpha")).expect("create alpha directory");
            std::fs::create_dir_all(path.join("beta")).expect("create beta directory");
            std::fs::write(path.join("not-a-project.txt"), "file").expect("write ordinary file");
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn only_issued_directory_handles_can_navigate_or_select() {
        let scratch = Scratch::new();
        let mut picker = ProjectPickerState::default();
        let initial = picker.start(&scratch.0).expect("start picker");
        assert_eq!(
            initial
                .directories
                .iter()
                .map(|directory| directory.name.as_str())
                .collect::<Vec<_>>(),
            ["alpha", "beta"]
        );
        assert!(initial
            .directories
            .iter()
            .all(|directory| !directory.id.contains(&directory.name)));

        let forged = ProjectPickerDirectoryRequest {
            session_id: initial.session_id.clone(),
            directory_id: scratch.0.join("alpha").to_string_lossy().into_owned(),
        };
        assert!(picker.resolve(&forged).is_err());

        let alpha = initial
            .directories
            .iter()
            .find(|directory| directory.name == "alpha")
            .expect("alpha handle");
        let opened = picker
            .open(&ProjectPickerDirectoryRequest {
                session_id: initial.session_id,
                directory_id: alpha.id.clone(),
            })
            .expect("open alpha");
        assert_eq!(
            opened.directory.path,
            scratch.0.join("alpha").to_string_lossy()
        );
    }
}
