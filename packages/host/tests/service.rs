use std::path::{Path, PathBuf};

use zd_host::{BoundedFileRead, FileTreeRequest, FileTreeResult, HostService, ResourceRef};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-host-{name}-{stamp}"));
        std::fs::create_dir_all(&path).expect("create scratch directory");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn join(&self, relative: &str) -> PathBuf {
        self.0.join(relative)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn startup_scope(host: &HostService) -> (String, String) {
    let launch = host.launch_request();
    let project = launch.project.expect("startup project grant");
    let worktree_id = launch.worktree_id.expect("startup worktree grant");
    (project.id, worktree_id)
}

#[test]
fn startup_project_drives_tree_and_bounded_file_authority() {
    let scratch = Scratch::new("startup");
    std::fs::create_dir_all(scratch.join("docs")).expect("create docs");
    std::fs::write(scratch.join("docs/notes.md"), "hello from the host\n").expect("write fixture");

    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    let grants = host.project_grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].id, project_id);
    assert_eq!(
        grants[0].root,
        scratch.path().canonicalize().unwrap().to_string_lossy()
    );

    let tree = host.file_tree_snapshot(&FileTreeRequest {
        project_id: project_id.clone(),
        worktree_id: worktree_id.clone(),
        previous_revision: None,
    });
    let FileTreeResult::Ready { entries, .. } = tree else {
        panic!("expected a ready tree, got {tree:?}");
    };
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "docs/notes.md"));

    let read = host.read_bounded_file(&ResourceRef {
        project_id,
        worktree_id,
        relative_path: "docs/notes.md".to_string(),
    });
    assert!(matches!(
        read,
        BoundedFileRead::Text { ref text, .. } if text == "hello from the host\n"
    ));
}

#[test]
fn startup_project_must_be_an_existing_directory() {
    let scratch = Scratch::new("invalid-root");
    let file = scratch.join("notes.md");
    std::fs::write(&file, "not a directory").expect("write fixture");

    assert!(HostService::open_project(&file).is_err());
    assert!(HostService::open_project(&scratch.join("missing")).is_err());
}

#[test]
fn resource_requests_cannot_supply_an_absolute_parent_or_foreign_scope() {
    let scratch = Scratch::new("path-input");
    std::fs::write(scratch.join("inside.md"), "inside").expect("write fixture");
    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    for relative_path in [
        "../outside.md".to_string(),
        scratch.join("inside.md").to_string_lossy().into_owned(),
    ] {
        let read = host.read_bounded_file(&ResourceRef {
            project_id: project_id.clone(),
            worktree_id: worktree_id.clone(),
            relative_path,
        });
        assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
    }

    let read = host.read_bounded_file(&ResourceRef {
        project_id: "another-project".to_string(),
        worktree_id,
        relative_path: "inside.md".to_string(),
    });
    assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
}

#[cfg(unix)]
#[test]
fn resource_symlinks_cannot_escape_the_startup_project() {
    let scratch = Scratch::new("symlink-root");
    let outside = Scratch::new("symlink-outside");
    std::fs::write(outside.join("secret.md"), "secret").expect("write outside fixture");
    std::os::unix::fs::symlink(outside.join("secret.md"), scratch.join("linked.md"))
        .expect("create symlink");
    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    let read = host.read_bounded_file(&ResourceRef {
        project_id,
        worktree_id,
        relative_path: "linked.md".to_string(),
    });
    assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
}
