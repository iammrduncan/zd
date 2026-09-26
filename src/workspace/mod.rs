mod search;
mod tree;

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};

use ignore::WalkBuilder;
use thiserror::Error;

pub use search::{SearchResult, SearchResults};
pub use tree::{EntryKind, TreeEntry, TreeView};

pub const MAX_TREE_ENTRIES: usize = 50_000;
pub const MAX_SEARCH_MATCHES: usize = 10_000;

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("workspace I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("workspace root is not a directory")]
    NotDirectory,
    #[error("path is outside the workspace")]
    OutsideProject,
    #[error("path traverses a symbolic link")]
    SymbolicLink,
    #[error("tree entry is not a directory")]
    NotTreeDirectory,
    #[error("search query is empty")]
    EmptyQuery,
    #[error("search expression is invalid: {0}")]
    InvalidRegex(#[from] regex::Error),
}

#[derive(Debug, Clone)]
pub struct Workspace {
    root: PathBuf,
    expanded: HashSet<PathBuf>,
}

#[derive(Debug, Clone)]
struct ScannedEntry {
    path: PathBuf,
    kind: EntryKind,
}

#[derive(Debug, Default)]
struct Scan {
    entries: Vec<ScannedEntry>,
    unreadable: usize,
}

impl Workspace {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, WorkspaceError> {
        let root = std::fs::canonicalize(root)?;
        if !root.is_dir() {
            return Err(WorkspaceError::NotDirectory);
        }
        Ok(Self {
            root,
            expanded: HashSet::new(),
        })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    pub fn tree(&self) -> TreeView {
        self.tree_with_limit(MAX_TREE_ENTRIES)
    }

    pub fn toggle_directory(&mut self, relative: &Path) -> Result<bool, WorkspaceError> {
        let is_directory = self
            .scan()
            .entries
            .iter()
            .any(|entry| entry.path == relative && entry.kind == EntryKind::Directory);
        if !is_directory {
            return Err(WorkspaceError::NotTreeDirectory);
        }
        if self.expanded.remove(relative) {
            Ok(false)
        } else {
            self.expanded.insert(relative.to_path_buf());
            Ok(true)
        }
    }

    pub fn resolve(&self, relative: &Path) -> Result<PathBuf, WorkspaceError> {
        if relative.is_absolute()
            || relative
                .components()
                .any(|component| !matches!(component, Component::Normal(_) | Component::CurDir))
        {
            return Err(WorkspaceError::OutsideProject);
        }

        let mut candidate = self.root.clone();
        for component in relative.components() {
            if let Component::Normal(component) = component {
                candidate.push(component);
                if std::fs::symlink_metadata(&candidate)?
                    .file_type()
                    .is_symlink()
                {
                    return Err(WorkspaceError::SymbolicLink);
                }
            }
        }
        let canonical = std::fs::canonicalize(candidate)?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::OutsideProject);
        }
        Ok(canonical)
    }

    fn scan(&self) -> Scan {
        let mut scan = Scan::default();
        let mut builder = WalkBuilder::new(&self.root);
        builder
            .hidden(true)
            .parents(true)
            .ignore(true)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .require_git(false)
            .follow_links(false);

        for result in builder.build() {
            let entry = match result {
                Ok(entry) => entry,
                Err(_) => {
                    scan.unreadable = scan.unreadable.saturating_add(1);
                    continue;
                }
            };
            if entry.path() == self.root {
                continue;
            }
            let Some(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() || (!file_type.is_dir() && !file_type.is_file()) {
                continue;
            }
            let Ok(path) = entry.path().strip_prefix(&self.root) else {
                continue;
            };
            scan.entries.push(ScannedEntry {
                path: path.to_path_buf(),
                kind: if file_type.is_dir() {
                    EntryKind::Directory
                } else {
                    EntryKind::File
                },
            });
        }
        scan
    }
}

fn entry_order(left: &ScannedEntry, right: &ScannedEntry) -> std::cmp::Ordering {
    left.kind
        .sort_rank()
        .cmp(&right.kind.sort_rank())
        .then_with(|| {
            left.path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase()
                .cmp(
                    &right
                        .path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_lowercase(),
                )
        })
        .then_with(|| left.path.cmp(&right.path))
}
