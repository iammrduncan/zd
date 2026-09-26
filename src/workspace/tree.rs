use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::{ScannedEntry, Workspace, entry_order};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryKind {
    Directory,
    File,
}

impl EntryKind {
    pub(super) const fn sort_rank(self) -> u8 {
        match self {
            Self::Directory => 0,
            Self::File => 1,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeEntry {
    pub path: PathBuf,
    pub name: String,
    pub kind: EntryKind,
    pub depth: usize,
    pub expanded: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TreeView {
    pub entries: Vec<TreeEntry>,
    pub truncated: bool,
    pub unreadable: usize,
}

impl Workspace {
    pub fn tree_with_limit(&self, limit: usize) -> TreeView {
        let scan = self.scan();
        let mut children: HashMap<PathBuf, Vec<ScannedEntry>> = HashMap::new();
        for entry in scan.entries {
            let parent = entry.path.parent().unwrap_or_else(|| Path::new(""));
            children
                .entry(parent.to_path_buf())
                .or_default()
                .push(entry);
        }
        for siblings in children.values_mut() {
            siblings.sort_by(entry_order);
        }

        let mut entries = Vec::new();
        let mut truncated = false;
        self.append_visible(
            Path::new(""),
            0,
            limit,
            &children,
            &mut entries,
            &mut truncated,
        );
        TreeView {
            entries,
            truncated,
            unreadable: scan.unreadable,
        }
    }

    fn append_visible(
        &self,
        parent: &Path,
        depth: usize,
        limit: usize,
        children: &HashMap<PathBuf, Vec<ScannedEntry>>,
        visible: &mut Vec<TreeEntry>,
        truncated: &mut bool,
    ) {
        let Some(siblings) = children.get(parent) else {
            return;
        };
        for entry in siblings {
            if visible.len() >= limit {
                *truncated = true;
                return;
            }
            let expanded =
                entry.kind == EntryKind::Directory && self.expanded.contains(&entry.path);
            visible.push(TreeEntry {
                name: entry
                    .path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                path: entry.path.clone(),
                kind: entry.kind,
                depth,
                expanded,
            });
            if expanded {
                self.append_visible(&entry.path, depth + 1, limit, children, visible, truncated);
                if *truncated {
                    return;
                }
            }
        }
    }
}
