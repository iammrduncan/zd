#![allow(dead_code)]

#[path = "../src/cli.rs"]
mod cli;
#[path = "../src/file_tree.rs"]
mod file_tree;
#[path = "../src/git/process.rs"]
mod git_process;
#[path = "../src/grants.rs"]
mod grants;

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use file_tree::{
    snapshot_in, FileTreeEntry, FileTreeEntryKind, FileTreeRequest, FileTreeResult, TreeLimits,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-file-tree-{name}-{stamp}"));
        std::fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn join(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn request(previous_revision: Option<String>) -> FileTreeRequest {
    FileTreeRequest {
        project_id: "project-a".to_string(),
        worktree_id: "worktree-a".to_string(),
        previous_revision,
    }
}

fn generous_limits() -> TreeLimits {
    TreeLimits {
        max_entries: 20_000,
        max_ignored_entries: 256,
        max_depth: 64,
    }
}

#[test]
fn tauri_command_compiles_against_native_grant_state() {
    let launch = cli::LaunchState::new(cli::NativeOpenRequest { path: None });
    assert!(launch.root("project-a", "worktree-a").is_err());
    let _command = file_tree::file_tree_snapshot;
}

fn ready(result: FileTreeResult) -> (String, Vec<FileTreeEntry>, bool, bool) {
    match result {
        FileTreeResult::Ready {
            revision,
            entries,
            truncated,
            ignored_truncated,
            ..
        } => (revision, entries, truncated, ignored_truncated),
        other => panic!("expected a ready tree, got {other:?}"),
    }
}

#[test]
fn wire_request_has_only_scope_and_revision_authority() {
    let parsed: FileTreeRequest = serde_json::from_value(serde_json::json!({
        "projectId": "project-a",
        "worktreeId": "worktree-a",
        "previousRevision": null
    }))
    .unwrap();
    assert_eq!(parsed, request(None));

    assert!(
        serde_json::from_value::<FileTreeRequest>(serde_json::json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "previousRevision": null,
            "root": "/outside",
            "followLinks": true
        }))
        .is_err()
    );
}

#[test]
fn traversal_is_recursive_portable_and_directories_first() {
    let scratch = Scratch::new("ordering");
    std::fs::create_dir_all(scratch.join("alpha/nested")).unwrap();
    std::fs::create_dir_all(scratch.join("Beta")).unwrap();
    std::fs::write(scratch.join("z.txt"), "z").unwrap();
    std::fs::write(scratch.join("A.md"), "a").unwrap();
    std::fs::write(scratch.join("alpha/nested/code.rs"), "fn main() {}").unwrap();

    let (_, entries, truncated, _) = ready(snapshot_in(
        scratch.path(),
        &request(None),
        generous_limits(),
    ));
    let root: Vec<_> = entries
        .iter()
        .filter(|entry| entry.parent_path.is_none())
        .map(|entry| (entry.relative_path.as_str(), entry.kind))
        .collect();

    assert_eq!(
        root,
        vec![
            ("alpha", FileTreeEntryKind::Directory),
            ("Beta", FileTreeEntryKind::Directory),
            ("A.md", FileTreeEntryKind::File),
            ("z.txt", FileTreeEntryKind::File),
        ]
    );
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "alpha/nested/code.rs"));
    assert!(!truncated);
}

#[test]
fn ignored_directories_expose_bounded_children_for_expansion() {
    let scratch = Scratch::new("ignored");
    std::fs::create_dir_all(scratch.join("docs/screenshots")).unwrap();
    std::fs::write(scratch.join("docs/screenshots/capture.png"), "generated").unwrap();
    std::fs::write(scratch.join("keep.rs"), "fn main() {}").unwrap();
    std::fs::write(scratch.join(".gitignore"), "docs/screenshots\n").unwrap();

    let (_, entries, _, ignored_truncated) = ready(snapshot_in(
        scratch.path(),
        &request(None),
        generous_limits(),
    ));
    let screenshots = entries
        .iter()
        .find(|entry| entry.relative_path == "docs/screenshots")
        .unwrap();

    assert!(screenshots.ignored);
    assert_eq!(screenshots.kind, FileTreeEntryKind::Directory);
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "docs/screenshots/capture.png"));
    assert!(!ignored_truncated);
}

#[test]
fn ignored_outlines_have_their_own_hard_limit() {
    let scratch = Scratch::new("ignored-limit");
    std::fs::write(scratch.join(".gitignore"), "ignored-*\n").unwrap();
    for index in 0..40 {
        std::fs::create_dir(scratch.join(&format!("ignored-{index:02}"))).unwrap();
    }

    let (_, entries, truncated, ignored_truncated) = ready(snapshot_in(
        scratch.path(),
        &request(None),
        TreeLimits {
            max_entries: 100,
            max_ignored_entries: 7,
            max_depth: 8,
        },
    ));

    assert_eq!(entries.iter().filter(|entry| entry.ignored).count(), 7);
    assert!(!truncated);
    assert!(ignored_truncated);
}

#[test]
fn traversal_and_symlinks_are_bounded() {
    let scratch = Scratch::new("bounds");
    std::fs::create_dir_all(scratch.join("deep/one/two/three")).unwrap();
    for index in 0..30 {
        std::fs::write(scratch.join(&format!("file-{index:02}.txt")), "x").unwrap();
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(scratch.path(), scratch.join("00-loop")).unwrap();

    let (_, entries, truncated, _) = ready(snapshot_in(
        scratch.path(),
        &request(None),
        TreeLimits {
            max_entries: 9,
            max_ignored_entries: 2,
            max_depth: 2,
        },
    ));

    assert_eq!(entries.len(), 9);
    assert!(truncated);
    assert!(!entries
        .iter()
        .any(|entry| entry.relative_path == "deep/one/two"));
    #[cfg(unix)]
    assert_eq!(
        entries
            .iter()
            .find(|entry| entry.relative_path == "00-loop")
            .map(|entry| entry.kind),
        Some(FileTreeEntryKind::Symlink)
    );
}

#[test]
fn a_revision_skips_an_unchanged_payload_and_moves_after_disk_changes() {
    let scratch = Scratch::new("revision");
    std::fs::write(scratch.join("notes.md"), "one").unwrap();
    let (revision, _, _, _) = ready(snapshot_in(
        scratch.path(),
        &request(None),
        generous_limits(),
    ));

    let unchanged = snapshot_in(
        scratch.path(),
        &request(Some(revision.clone())),
        generous_limits(),
    );
    assert!(matches!(unchanged, FileTreeResult::Unchanged { .. }));

    std::fs::write(scratch.join("notes.md"), "one plus more").unwrap();
    let (changed, _, _, _) = ready(snapshot_in(
        scratch.path(),
        &request(Some(revision.clone())),
        generous_limits(),
    ));
    assert_ne!(changed, revision);

    std::fs::write(scratch.join("new.txt"), "new").unwrap();
    let (_, entries, _, _) = ready(snapshot_in(
        scratch.path(),
        &request(Some(changed)),
        generous_limits(),
    ));
    assert!(entries.iter().any(|entry| entry.relative_path == "new.txt"));
}

#[test]
fn empty_missing_and_non_directory_roots_are_explicit() {
    let scratch = Scratch::new("states");
    assert!(matches!(
        snapshot_in(scratch.path(), &request(None), generous_limits()),
        FileTreeResult::Empty { .. }
    ));
    assert!(matches!(
        snapshot_in(&scratch.join("missing"), &request(None), generous_limits()),
        FileTreeResult::Missing { .. }
    ));
    std::fs::write(scratch.join("file"), "not a directory").unwrap();
    assert!(matches!(
        snapshot_in(&scratch.join("file"), &request(None), generous_limits()),
        FileTreeResult::NotDirectory { .. }
    ));
}

#[test]
fn large_tree_scan_is_capped_and_measured() {
    let scratch = Scratch::new("large");
    for directory in 0..32 {
        let relative = format!("src/{directory:02}");
        std::fs::create_dir_all(scratch.join(&relative)).unwrap();
        for file in 0..128 {
            std::fs::write(
                scratch.join(&format!("{relative}/module-{file:03}.rs")),
                "pub fn value() -> usize { 1 }\n",
            )
            .unwrap();
        }
    }
    let started = Instant::now();
    let result = snapshot_in(
        scratch.path(),
        &request(None),
        TreeLimits {
            max_entries: 2_048,
            max_ignored_entries: 32,
            max_depth: 16,
        },
    );
    let wall = started.elapsed();
    let (_, entries, truncated, _) = ready(result);

    eprintln!(
        "file-tree fixture: {} entries from 4,096 files in {:?}",
        entries.len(),
        wall
    );
    assert_eq!(entries.len(), 2_048);
    assert!(truncated);
    assert!(wall < Duration::from_secs(10));
}
