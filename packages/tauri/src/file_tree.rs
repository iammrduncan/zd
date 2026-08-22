//! Bounded, deterministic snapshots of one approved project/worktree tree.
//!
//! The webview supplies only opaque grant identities. Traversal starts from the
//! native grant store, never from a path supplied over IPC. Refresh is explicit
//! and revisioned: callers can coalesce filesystem signals without leaving an
//! idle watcher or polling loop behind.

use std::collections::{hash_map::DefaultHasher, HashSet};
use std::hash::{Hash, Hasher};
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

use crate::cli::LaunchState;

const DEFAULT_MAX_ENTRIES: usize = 20_000;
const DEFAULT_MAX_IGNORED_ENTRIES: usize = 256;
const DEFAULT_MAX_DEPTH: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileTreeRequest {
    pub project_id: String,
    pub worktree_id: String,
    pub previous_revision: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileTreeEntryKind {
    Directory,
    File,
    Symlink,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeEntry {
    pub relative_path: String,
    pub parent_path: Option<String>,
    pub name: String,
    pub kind: FileTreeEntryKind,
    pub ignored: bool,
    pub byte_length: Option<u64>,
    pub modified: Option<u64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum FileTreeResult {
    Ready {
        project_id: String,
        worktree_id: String,
        revision: String,
        entries: Vec<FileTreeEntry>,
        truncated: bool,
        ignored_truncated: bool,
        unreadable_directories: usize,
        elapsed_micros: u64,
    },
    Unchanged {
        project_id: String,
        worktree_id: String,
        revision: String,
        elapsed_micros: u64,
    },
    Empty {
        project_id: String,
        worktree_id: String,
        revision: String,
        elapsed_micros: u64,
    },
    Missing {
        project_id: String,
        worktree_id: String,
    },
    Denied {
        project_id: String,
        worktree_id: String,
    },
    NotDirectory {
        project_id: String,
        worktree_id: String,
    },
    Unavailable {
        project_id: String,
        worktree_id: String,
        problem: String,
    },
}

#[derive(Debug, Clone, Copy)]
pub struct TreeLimits {
    pub max_entries: usize,
    pub max_ignored_entries: usize,
    pub max_depth: usize,
}

impl Default for TreeLimits {
    fn default() -> Self {
        Self {
            max_entries: DEFAULT_MAX_ENTRIES,
            max_ignored_entries: DEFAULT_MAX_IGNORED_ENTRIES,
            max_depth: DEFAULT_MAX_DEPTH,
        }
    }
}

#[derive(Debug)]
struct Scan {
    entries: Vec<FileTreeEntry>,
    revision: String,
    truncated: bool,
    ignored_truncated: bool,
    unreadable_directories: usize,
}

/// Tauri integration seam. The root registers this exact command after adding
/// `mod file_tree;` to the native shell.
#[tauri::command]
pub fn file_tree_snapshot(
    launch: tauri::State<'_, LaunchState>,
    request: FileTreeRequest,
) -> FileTreeResult {
    let root = match launch.root(&request.project_id, &request.worktree_id) {
        Ok(root) => root,
        Err(_) => {
            return FileTreeResult::Unavailable {
                project_id: request.project_id,
                worktree_id: request.worktree_id,
                problem: "File-tree authority is unavailable".to_string(),
            }
        }
    };
    snapshot_in(&root, &request, TreeLimits::default())
}

pub fn snapshot_in(root: &Path, request: &FileTreeRequest, limits: TreeLimits) -> FileTreeResult {
    let started = Instant::now();
    let result = snapshot_in_inner(root, request, limits);
    let elapsed = started.elapsed().as_micros().min(u128::from(u64::MAX)) as u64;
    with_elapsed(result, elapsed)
}

fn snapshot_in_inner(root: &Path, request: &FileTreeRequest, limits: TreeLimits) -> FileTreeResult {
    let metadata = match std::fs::metadata(root) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return scope_result(request, FileTreeState::Missing)
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return scope_result(request, FileTreeState::Denied)
        }
        Err(_) => return scope_result(request, FileTreeState::Unavailable),
    };
    if !metadata.is_dir() {
        return scope_result(request, FileTreeState::NotDirectory);
    }
    if limits.max_entries == 0 || limits.max_depth == 0 {
        return FileTreeResult::Unavailable {
            project_id: request.project_id.clone(),
            worktree_id: request.worktree_id.clone(),
            problem: "File-tree traversal limits are invalid".to_string(),
        };
    }

    let scan = match scan_tree(root, limits) {
        Ok(scan) => scan,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return scope_result(request, FileTreeState::Denied)
        }
        Err(_) => return scope_result(request, FileTreeState::Unavailable),
    };

    if request.previous_revision.as_deref() == Some(&scan.revision) {
        return FileTreeResult::Unchanged {
            project_id: request.project_id.clone(),
            worktree_id: request.worktree_id.clone(),
            revision: scan.revision,
            elapsed_micros: 0,
        };
    }
    if scan.entries.is_empty() {
        return FileTreeResult::Empty {
            project_id: request.project_id.clone(),
            worktree_id: request.worktree_id.clone(),
            revision: scan.revision,
            elapsed_micros: 0,
        };
    }
    FileTreeResult::Ready {
        project_id: request.project_id.clone(),
        worktree_id: request.worktree_id.clone(),
        revision: scan.revision,
        entries: scan.entries,
        truncated: scan.truncated,
        ignored_truncated: scan.ignored_truncated,
        unreadable_directories: scan.unreadable_directories,
        elapsed_micros: 0,
    }
}

#[derive(Debug, Clone, Copy)]
enum FileTreeState {
    Missing,
    Denied,
    NotDirectory,
    Unavailable,
}

fn scope_result(request: &FileTreeRequest, state: FileTreeState) -> FileTreeResult {
    let project_id = request.project_id.clone();
    let worktree_id = request.worktree_id.clone();
    match state {
        FileTreeState::Missing => FileTreeResult::Missing {
            project_id,
            worktree_id,
        },
        FileTreeState::Denied => FileTreeResult::Denied {
            project_id,
            worktree_id,
        },
        FileTreeState::NotDirectory => FileTreeResult::NotDirectory {
            project_id,
            worktree_id,
        },
        FileTreeState::Unavailable => FileTreeResult::Unavailable {
            project_id,
            worktree_id,
            problem: "The project tree could not be read".to_string(),
        },
    }
}

fn with_elapsed(result: FileTreeResult, elapsed_micros: u64) -> FileTreeResult {
    match result {
        FileTreeResult::Ready {
            project_id,
            worktree_id,
            revision,
            entries,
            truncated,
            ignored_truncated,
            unreadable_directories,
            ..
        } => FileTreeResult::Ready {
            project_id,
            worktree_id,
            revision,
            entries,
            truncated,
            ignored_truncated,
            unreadable_directories,
            elapsed_micros,
        },
        FileTreeResult::Unchanged {
            project_id,
            worktree_id,
            revision,
            ..
        } => FileTreeResult::Unchanged {
            project_id,
            worktree_id,
            revision,
            elapsed_micros,
        },
        FileTreeResult::Empty {
            project_id,
            worktree_id,
            revision,
            ..
        } => FileTreeResult::Empty {
            project_id,
            worktree_id,
            revision,
            elapsed_micros,
        },
        state => state,
    }
}

fn scan_tree(root: &Path, limits: TreeLimits) -> std::io::Result<Scan> {
    // Prove the root itself is readable before the ignore walker turns a root
    // permission failure into an iterator error with less precise context.
    std::fs::read_dir(root)?;

    let mut builder = WalkBuilder::new(root);
    builder
        .hidden(false)
        .ignore(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .follow_links(false)
        .max_depth(Some(limits.max_depth))
        .sort_by_file_name(|left, right| {
            left.to_string_lossy()
                .to_lowercase()
                .cmp(&right.to_string_lossy().to_lowercase())
                .then_with(|| left.cmp(right))
        })
        .filter_entry(|entry| entry.depth() == 0 || entry.file_name() != ".git");

    let mut entries = Vec::new();
    let mut included = HashSet::new();
    let mut included_directories = Vec::new();
    let mut unreadable_directories = 0;
    let mut truncated = false;
    let mut hasher = DefaultHasher::new();

    for walked in builder.build() {
        let walked = match walked {
            Ok(walked) => walked,
            Err(_) => {
                unreadable_directories += 1;
                continue;
            }
        };
        if walked.depth() == 0 {
            included.insert(root.to_path_buf());
            included_directories.push(root.to_path_buf());
            continue;
        }
        if entries.len() == limits.max_entries {
            truncated = true;
            break;
        }

        let path = walked.path().to_path_buf();
        let entry = tree_entry(root, &path, false)?;
        hash_entry(&mut hasher, &entry, &path);
        if entry.kind == FileTreeEntryKind::Directory {
            included_directories.push(path.clone());
        }
        included.insert(path);
        entries.push(entry);
    }

    let mut ignored_truncated = false;
    if !truncated && limits.max_ignored_entries > 0 {
        'directories: for directory in included_directories {
            let depth = directory
                .strip_prefix(root)
                .map_or(0, |relative| relative.components().count());
            if depth >= limits.max_depth {
                continue;
            }
            let mut children = match std::fs::read_dir(&directory) {
                Ok(children) => children.filter_map(Result::ok).collect::<Vec<_>>(),
                Err(_) => {
                    unreadable_directories += 1;
                    continue;
                }
            };
            children.sort_by(|left, right| {
                left.file_name()
                    .to_string_lossy()
                    .to_lowercase()
                    .cmp(&right.file_name().to_string_lossy().to_lowercase())
                    .then_with(|| left.file_name().cmp(&right.file_name()))
            });
            for child in children {
                let path = child.path();
                if included.contains(&path) || child.file_name() == ".git" {
                    continue;
                }
                let ignored_count = entries.iter().filter(|entry| entry.ignored).count();
                if ignored_count == limits.max_ignored_entries {
                    ignored_truncated = true;
                    break 'directories;
                }
                let entry = tree_entry(root, &path, true)?;
                hash_entry(&mut hasher, &entry, &path);
                entries.push(entry);
            }
        }
    }

    entries.sort_by(entry_order);
    truncated.hash(&mut hasher);
    ignored_truncated.hash(&mut hasher);
    unreadable_directories.hash(&mut hasher);
    let revision = format!("{:016x}", hasher.finish());
    Ok(Scan {
        entries,
        revision,
        truncated,
        ignored_truncated,
        unreadable_directories,
    })
}

fn tree_entry(root: &Path, path: &Path, ignored: bool) -> std::io::Result<FileTreeEntry> {
    let metadata = std::fs::symlink_metadata(path)?;
    let kind = if metadata.file_type().is_symlink() {
        FileTreeEntryKind::Symlink
    } else if metadata.is_dir() {
        FileTreeEntryKind::Directory
    } else {
        FileTreeEntryKind::File
    };
    let relative_path = portable_relative(root, path);
    let parent_path = path
        .parent()
        .filter(|parent| *parent != root)
        .map(|parent| portable_relative(root, parent));
    Ok(FileTreeEntry {
        relative_path,
        parent_path,
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        kind,
        ignored,
        byte_length: (kind == FileTreeEntryKind::File).then_some(metadata.len()),
        modified: modified_millis(metadata.modified().ok()),
    })
}

fn portable_relative(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/")
}

fn modified_millis(modified: Option<SystemTime>) -> Option<u64> {
    modified
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
}

fn hash_entry(hasher: &mut DefaultHasher, entry: &FileTreeEntry, path: &Path) {
    entry.relative_path.hash(hasher);
    entry.kind.hash(hasher);
    entry.ignored.hash(hasher);
    entry.byte_length.hash(hasher);
    std::fs::symlink_metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .hash(hasher);
}

fn entry_order(left: &FileTreeEntry, right: &FileTreeEntry) -> std::cmp::Ordering {
    left.parent_path
        .cmp(&right.parent_path)
        .then_with(|| entry_kind_order(left.kind).cmp(&entry_kind_order(right.kind)))
        .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
        .then_with(|| left.name.cmp(&right.name))
}

fn entry_kind_order(kind: FileTreeEntryKind) -> u8 {
    match kind {
        FileTreeEntryKind::Directory => 0,
        FileTreeEntryKind::File | FileTreeEntryKind::Symlink => 1,
    }
}
