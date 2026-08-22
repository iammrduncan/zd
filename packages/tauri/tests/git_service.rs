#![allow(dead_code)]

#[path = "../src/cli.rs"]
mod cli;
#[path = "../src/git.rs"]
mod git;
#[path = "../src/git/process.rs"]
mod git_process;
#[path = "../src/grants.rs"]
mod grants;

use std::path::{Path, PathBuf};
use std::process::Command;

use cli::{LaunchState, NativeOpenRequest};
use git::types::GitChangeState;
use git::{
    compare_for, history_for, status_for, GitAvailability, GitCompareRequest, GitHistoryRequest,
    GitScope,
};

struct RepositoryFixture(PathBuf);

impl RepositoryFixture {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time moves forward")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("zd-git-{name}-{stamp}"));
        std::fs::create_dir_all(&root).expect("create repository fixture");
        let fixture = Self(root);
        fixture.git(&["init", "--initial-branch=main"]);
        fixture.git(&["config", "user.name", "Fixture Author"]);
        fixture.git(&["config", "user.email", "fixture@example.invalid"]);
        fixture
    }

    fn plain_directory(name: &str) -> Self {
        let fixture = Self::new(name);
        std::fs::remove_dir_all(fixture.0.join(".git")).expect("remove repository metadata");
        fixture
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn write(&self, relative: &str, contents: &str) {
        let path = self.0.join(relative);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create fixture parent");
        }
        std::fs::write(path, contents).expect("write fixture file");
    }

    fn remove(&self, relative: &str) {
        std::fs::remove_file(self.0.join(relative)).expect("remove fixture file");
    }

    fn git(&self, arguments: &[&str]) -> String {
        let output = Command::new("git")
            .args(arguments)
            .current_dir(&self.0)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .output()
            .expect("git is available for repository fixtures");
        assert!(
            output.status.success(),
            "git {arguments:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("fixture git output is UTF-8")
            .trim()
            .to_string()
    }

    fn commit_all(&self, message: &str) -> String {
        self.git(&["add", "--all"]);
        self.git(&["commit", "--quiet", "--message", message]);
        self.git(&["rev-parse", "HEAD"])
    }
}

impl Drop for RepositoryFixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn approved_scope(root: &Path) -> (LaunchState, GitScope) {
    let launch = LaunchState::new(NativeOpenRequest {
        path: Some(root.to_string_lossy().into_owned()),
    });
    let request = launch.current();
    let project = request.project.expect("fixture project is approved");
    let worktree_id = request.worktree_id.expect("fixture worktree is approved");
    (
        launch,
        GitScope {
            project_id: project.id,
            worktree_id,
        },
    )
}

#[test]
fn status_represents_every_required_working_tree_state_with_stable_identities() {
    let repository = RepositoryFixture::new("status");
    let submodule = RepositoryFixture::new("submodule-source");
    submodule.write("tracked.txt", "base\n");
    submodule.commit_all("submodule base");
    repository.git(&[
        "-c",
        "protocol.file.allow=always",
        "submodule",
        "add",
        "--quiet",
        submodule.path().to_str().expect("UTF-8 fixture path"),
        "modules/local",
    ]);
    repository.write(".gitignore", "ignored/\n");
    repository.write("added-later.txt", "base\n");
    repository.write("conflicted.txt", "base\n");
    repository.write("deleted.txt", "base\n");
    repository.write("modified.txt", "base\n");
    repository.write("rename-me.txt", "base\n");
    repository.commit_all("base");

    repository.git(&["switch", "--quiet", "--create", "other"]);
    repository.write("conflicted.txt", "other\n");
    repository.commit_all("other conflict");
    repository.git(&["switch", "--quiet", "main"]);
    repository.write("conflicted.txt", "main\n");
    repository.commit_all("main conflict");
    let merge = Command::new("git")
        .args(["merge", "other"])
        .current_dir(repository.path())
        .output()
        .expect("run conflicting merge");
    assert!(!merge.status.success(), "fixture merge must conflict");

    repository.write("staged-added.txt", "added\n");
    repository.git(&["add", "staged-added.txt"]);
    repository.write("modified.txt", "changed\n");
    repository.remove("deleted.txt");
    repository.git(&["mv", "rename-me.txt", "renamed.txt"]);
    repository.write("untracked.txt", "new\n");
    repository.write("ignored/cache.txt", "ignored\n");

    repository.write("modules/local/tracked.txt", "dirty\n");

    let (launch, scope) = approved_scope(repository.path());
    let first = status_for(&launch, scope.clone());
    let second = status_for(&launch, scope.clone());

    assert_eq!(first.availability, GitAvailability::Available);
    assert!(!first.truncated, "the small fixture is complete");
    let states = |path: &str| {
        first
            .entries
            .iter()
            .find(|entry| entry.path == path)
            .unwrap_or_else(|| panic!("missing {path:?} in {:#?}", first.entries))
    };
    assert_eq!(states("staged-added.txt").state, GitChangeState::Added);
    assert_eq!(states("modified.txt").state, GitChangeState::Modified);
    assert_eq!(states("deleted.txt").state, GitChangeState::Deleted);
    assert_eq!(states("renamed.txt").state, GitChangeState::Renamed);
    assert_eq!(
        states("renamed.txt").previous_path.as_deref(),
        Some("rename-me.txt")
    );
    assert_eq!(states("conflicted.txt").state, GitChangeState::Conflicted);
    assert_eq!(states("untracked.txt").state, GitChangeState::Untracked);
    assert_eq!(states("ignored/").state, GitChangeState::Ignored);
    assert!(states("modules/local").submodule);
    assert_eq!(
        first
            .entries
            .iter()
            .map(|entry| &entry.id)
            .collect::<Vec<_>>(),
        second
            .entries
            .iter()
            .map(|entry| &entry.id)
            .collect::<Vec<_>>()
    );
    assert!(first
        .entries
        .iter()
        .all(|entry| !entry.id.contains(repository.path().to_str().unwrap())));

    drop(submodule);
}

#[test]
fn ignored_directories_are_reported_as_one_bounded_entry() {
    let repository = RepositoryFixture::new("ignored-bound");
    repository.write(".gitignore", "vendor/\n");
    repository.commit_all("ignore vendor");
    for index in 0..2_000 {
        repository.write(
            &format!("vendor/package-{index}/artifact.js"),
            "generated\n",
        );
    }
    let (launch, scope) = approved_scope(repository.path());

    let started = std::time::Instant::now();
    let snapshot = status_for(&launch, scope);
    let elapsed = started.elapsed();
    let ignored: Vec<_> = snapshot
        .entries
        .iter()
        .filter(|entry| entry.state == GitChangeState::Ignored)
        .collect();

    assert_eq!(snapshot.availability, GitAvailability::Available);
    assert_eq!(ignored.len(), 1);
    assert_eq!(ignored[0].path, "vendor/");
    eprintln!(
        "ignored-bound status: {} files, {} entries, {elapsed:?}",
        2_000,
        snapshot.entries.len()
    );
}

#[test]
fn repository_state_is_honest_for_non_repository_revoked_and_missing_scopes() {
    let directory = RepositoryFixture::plain_directory("non-repository");
    let (launch, scope) = approved_scope(directory.path());
    assert_eq!(
        status_for(&launch, scope.clone()).availability,
        GitAvailability::NonRepository
    );

    let unknown = GitScope {
        project_id: "project-not-approved".to_string(),
        worktree_id: "worktree-not-approved".to_string(),
    };
    assert_eq!(
        status_for(&launch, unknown).availability,
        GitAvailability::Denied
    );

    std::fs::remove_dir_all(directory.path()).expect("make approved scope unavailable");
    assert_eq!(
        status_for(&launch, scope).availability,
        GitAvailability::Unavailable
    );
}

#[test]
fn request_schemas_refuse_paths_commands_and_unknown_fields() {
    assert!(serde_json::from_value::<GitScope>(serde_json::json!({
        "projectId": "project-a",
        "worktreeId": "worktree-a",
        "path": "/not/approved"
    }))
    .is_err());
    assert!(
        serde_json::from_value::<GitCompareRequest>(serde_json::json!({
            "scope": { "projectId": "project-a", "worktreeId": "worktree-a" },
            "baseCommitId": "a".repeat(40),
            "headCommitId": "b".repeat(40),
            "command": "status"
        }))
        .is_err()
    );
    assert!(
        serde_json::from_value::<GitHistoryRequest>(serde_json::json!({
            "scope": { "projectId": "project-a", "worktreeId": "worktree-a" },
            "cursor": null,
            "pageSize": 20,
            "arguments": ["--all"]
        }))
        .is_err()
    );
}

#[test]
fn status_history_and_comparison_never_escape_a_nested_grant() {
    let repository = RepositoryFixture::new("nested-scope");
    repository.write("inside/inside.txt", "one\n");
    repository.write("outside.txt", "one\n");
    let before = repository.commit_all("base");
    repository.write("inside/inside.txt", "two\n");
    repository.write("outside.txt", "two\n");
    let after = repository.commit_all("both change");
    repository.write("inside/visible.txt", "visible\n");
    repository.write("hidden.txt", "hidden\n");

    let (launch, scope) = approved_scope(&repository.path().join("inside"));
    let status = status_for(&launch, scope.clone());
    let history = history_for(
        &launch,
        GitHistoryRequest {
            scope: scope.clone(),
            cursor: None,
            page_size: Some(20),
        },
    );
    let comparison = compare_for(
        &launch,
        GitCompareRequest {
            scope,
            base_commit_id: before,
            head_commit_id: after,
        },
    );

    assert_eq!(status.entries.len(), 1);
    assert_eq!(status.entries[0].path, "visible.txt");
    assert_eq!(history.commits.len(), 2);
    assert_eq!(comparison.entries.len(), 1);
    assert_eq!(comparison.entries[0].path, "inside.txt");
    let serialized = serde_json::to_string(&(status, history, comparison)).unwrap();
    assert!(!serialized.contains("outside.txt"));
    assert!(!serialized.contains("hidden.txt"));
    assert!(!serialized.contains(repository.path().to_str().unwrap()));
}

#[test]
fn history_pages_are_bounded_and_keep_a_frozen_head_across_refreshes() {
    let repository = RepositoryFixture::new("history");
    let mut expected = Vec::new();
    for index in 0..5 {
        repository.write("history.txt", &format!("{index}\n"));
        expected.push(repository.commit_all(&format!("commit {index}")));
    }
    let (launch, scope) = approved_scope(repository.path());
    let started = std::time::Instant::now();
    let first = history_for(
        &launch,
        GitHistoryRequest {
            scope: scope.clone(),
            cursor: None,
            page_size: Some(2),
        },
    );
    let first_page_elapsed = started.elapsed();
    repository.write("history.txt", "new head\n");
    repository.commit_all("arrived after page one");
    let second = history_for(
        &launch,
        GitHistoryRequest {
            scope,
            cursor: first.next_cursor.clone(),
            page_size: Some(2),
        },
    );

    assert_eq!(first.availability, GitAvailability::Available);
    assert_eq!(first.commits.len(), 2);
    assert!(first.next_cursor.is_some());
    assert_eq!(second.commits.len(), 2);
    let returned: Vec<_> = first
        .commits
        .iter()
        .chain(second.commits.iter())
        .map(|commit| commit.id.as_str())
        .collect();
    let expected: Vec<_> = expected.iter().rev().take(4).map(String::as_str).collect();
    assert_eq!(returned, expected);
    assert!(first
        .commits
        .iter()
        .all(|commit| commit.subject.starts_with("commit ")));
    eprintln!(
        "history page: {} returned, {first_page_elapsed:?}",
        first.commits.len()
    );
}

#[test]
fn comparison_accepts_only_full_commit_ids_and_reports_renames_deletes_and_additions() {
    let repository = RepositoryFixture::new("comparison");
    repository.write("rename-me.txt", "rename\n");
    repository.write("delete-me.txt", "delete\n");
    let before = repository.commit_all("before");
    repository.git(&["mv", "rename-me.txt", "renamed.txt"]);
    repository.remove("delete-me.txt");
    repository.write("added.txt", "added\n");
    let after = repository.commit_all("after");
    let (launch, scope) = approved_scope(repository.path());

    let started = std::time::Instant::now();
    let comparison = compare_for(
        &launch,
        GitCompareRequest {
            scope: scope.clone(),
            base_commit_id: before,
            head_commit_id: after,
        },
    );
    let elapsed = started.elapsed();

    assert_eq!(comparison.availability, GitAvailability::Available);
    assert_eq!(comparison.entries.len(), 3);
    assert_eq!(
        comparison
            .entries
            .iter()
            .find(|entry| entry.path == "renamed.txt")
            .expect("rename entry")
            .previous_path
            .as_deref(),
        Some("rename-me.txt")
    );
    assert!(comparison
        .entries
        .iter()
        .any(|entry| entry.path == "delete-me.txt" && entry.state == GitChangeState::Deleted));
    assert!(comparison
        .entries
        .iter()
        .any(|entry| entry.path == "added.txt" && entry.state == GitChangeState::Added));
    eprintln!(
        "comparison: {} entries, {elapsed:?}",
        comparison.entries.len()
    );

    let rejected = compare_for(
        &launch,
        GitCompareRequest {
            scope,
            base_commit_id: "HEAD~1".to_string(),
            head_commit_id: "HEAD".to_string(),
        },
    );
    assert_eq!(rejected.availability, GitAvailability::Available);
    assert!(rejected.entries.is_empty());
    assert!(rejected
        .problem
        .as_deref()
        .is_some_and(|problem| problem.contains("full commit")));
}
