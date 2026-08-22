#![allow(dead_code)]

#[path = "../src/cli.rs"]
mod cli;
#[path = "../src/git/process.rs"]
mod git_process;
#[path = "../src/grants.rs"]
mod grants;
#[path = "../src/worktrees.rs"]
mod worktrees;

use std::path::{Path, PathBuf};
use std::process::Command;

use cli::{LaunchState, NativeOpenRequest};
use worktrees::{
    create_for, CreateThreadWorktreeRequest, CreateThreadWorktreeResult, WorktreeRefusalKind,
};

struct RepositoryFixture {
    parent: PathBuf,
    root: PathBuf,
}

impl RepositoryFixture {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time moves forward")
            .as_nanos();
        let parent = std::env::temp_dir().join(format!("zd-worktree-{name}-{stamp}"));
        let root = parent.join("project");
        std::fs::create_dir_all(&root).expect("create repository fixture");
        let fixture = Self { parent, root };
        fixture.git(&["init", "--initial-branch=main"]);
        fixture.git(&["config", "user.name", "Fixture Author"]);
        fixture.git(&["config", "user.email", "fixture@example.invalid"]);
        fixture.write("tracked.txt", "base\n");
        fixture.git(&["add", "tracked.txt"]);
        fixture.git(&["commit", "--quiet", "--message", "base"]);
        fixture
    }

    fn path(&self) -> &Path {
        &self.root
    }

    fn write(&self, relative: &str, contents: &str) {
        std::fs::write(self.root.join(relative), contents).expect("write fixture file");
    }

    fn git(&self, arguments: &[&str]) -> String {
        let output = Command::new("git")
            .args(arguments)
            .current_dir(&self.root)
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_TERMINAL_PROMPT", "0")
            .output()
            .expect("git is available for repository fixtures");
        assert!(
            output.status.success(),
            "git {arguments:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8(output.stdout)
            .expect("fixture Git output is UTF-8")
            .trim()
            .to_string()
    }
}

impl Drop for RepositoryFixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.parent);
    }
}

fn approved(repository: &RepositoryFixture) -> (LaunchState, String) {
    let launch = LaunchState::new(NativeOpenRequest {
        path: Some(repository.path().to_string_lossy().into_owned()),
    });
    let project_id = launch.current().project.expect("approved project").id;
    (launch, project_id)
}

fn request(project_id: &str, name: &str, branch: &str) -> CreateThreadWorktreeRequest {
    CreateThreadWorktreeRequest {
        project_id: project_id.to_string(),
        name: name.to_string(),
        branch: branch.to_string(),
        base_revision: None,
    }
}

fn created(result: CreateThreadWorktreeResult) -> grants::WorktreeGrant {
    match result {
        CreateThreadWorktreeResult::Created { worktree } => worktree,
        other => panic!("expected a created worktree, got {other:?}"),
    }
}

fn refused(result: CreateThreadWorktreeResult) -> WorktreeRefusalKind {
    match result {
        CreateThreadWorktreeResult::Refused { kind, .. } => kind,
        other => panic!("expected a refused worktree, got {other:?}"),
    }
}

#[test]
fn request_schema_never_accepts_a_destination_or_command() {
    let parsed: CreateThreadWorktreeRequest = serde_json::from_value(serde_json::json!({
        "projectId": "project-a",
        "name": "review",
        "branch": "feature/review",
        "baseRevision": null
    }))
    .expect("closed request parses");
    assert_eq!(parsed, request("project-a", "review", "feature/review"));

    assert!(
        serde_json::from_value::<CreateThreadWorktreeRequest>(serde_json::json!({
            "projectId": "project-a",
            "name": "review",
            "branch": "feature/review",
            "baseRevision": null,
            "destination": "/outside",
            "command": "sh"
        }))
        .is_err()
    );
}

#[test]
fn creation_derives_a_sibling_path_and_adds_one_project_scoped_grant() {
    let repository = RepositoryFixture::new("create");
    let (launch, project_id) = approved(&repository);

    let worktree = created(create_for(
        &launch,
        request(&project_id, "review", "feature/review"),
    ));

    let expected = repository
        .parent
        .join("project-review")
        .canonicalize()
        .unwrap();
    assert_eq!(Path::new(&worktree.root), expected);
    assert_eq!(worktree.name, "project-review");
    assert_eq!(
        Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(&worktree.root)
            .output()
            .unwrap()
            .stdout,
        b"feature/review\n"
    );
    let grant = launch
        .project_grants()
        .into_iter()
        .find(|project| project.id == project_id)
        .unwrap();
    assert_eq!(grant.worktrees.len(), 2);
    assert_eq!(grant.worktrees[1].id, worktree.id);
}

#[test]
fn explicit_base_revision_is_resolved_before_the_worktree_is_created() {
    let repository = RepositoryFixture::new("base");
    let base = repository.git(&["rev-parse", "HEAD"]);
    repository.write("tracked.txt", "new head\n");
    repository.git(&["commit", "--all", "--quiet", "--message", "new head"]);
    let (launch, project_id) = approved(&repository);
    let mut worktree_request = request(&project_id, "older", "feature/older");
    worktree_request.base_revision = Some(base.clone());

    let worktree = created(create_for(&launch, worktree_request));
    let head = Command::new("git")
        .args(["rev-parse", "HEAD"])
        .current_dir(&worktree.root)
        .output()
        .unwrap();

    assert!(head.status.success());
    assert_eq!(String::from_utf8(head.stdout).unwrap().trim(), base);
}

#[test]
fn invalid_names_revisions_unknown_projects_and_nested_scopes_are_refused() {
    let repository = RepositoryFixture::new("refusals");
    let (launch, project_id) = approved(&repository);
    assert_eq!(
        refused(create_for(
            &launch,
            request(&project_id, "../outside", "feature/outside"),
        )),
        WorktreeRefusalKind::InvalidName
    );
    assert_eq!(
        refused(create_for(
            &launch,
            request(&project_id, "bad-ref", "bad branch"),
        )),
        WorktreeRefusalKind::InvalidRevision
    );
    assert_eq!(
        refused(create_for(
            &launch,
            request("project-unknown", "review", "feature/review"),
        )),
        WorktreeRefusalKind::UnknownProject
    );

    std::fs::create_dir(repository.path().join("nested")).unwrap();
    let nested = LaunchState::new(NativeOpenRequest {
        path: Some(
            repository
                .path()
                .join("nested")
                .to_string_lossy()
                .into_owned(),
        ),
    });
    let nested_id = nested.current().project.unwrap().id;
    assert_eq!(
        refused(create_for(
            &nested,
            request(&nested_id, "review", "feature/nested"),
        )),
        WorktreeRefusalKind::NotRepository
    );
}

#[test]
fn destination_branch_collisions_and_locked_worktrees_are_specific() {
    let repository = RepositoryFixture::new("collision");
    let (launch, project_id) = approved(&repository);
    let first = created(create_for(
        &launch,
        request(&project_id, "review", "feature/review"),
    ));
    assert_eq!(
        refused(create_for(
            &launch,
            request(&project_id, "another", "feature/review"),
        )),
        WorktreeRefusalKind::Collision
    );

    repository.git(&["worktree", "lock", &first.root]);
    assert_eq!(
        refused(create_for(
            &launch,
            request(&project_id, "review", "feature/review"),
        )),
        WorktreeRefusalKind::Locked
    );
}

#[test]
fn a_plain_directory_is_not_mistaken_for_a_repository() {
    let repository = RepositoryFixture::new("plain");
    std::fs::remove_dir_all(repository.path().join(".git")).unwrap();
    let (launch, project_id) = approved(&repository);

    assert_eq!(
        refused(create_for(
            &launch,
            request(&project_id, "review", "feature/review"),
        )),
        WorktreeRefusalKind::NotRepository
    );
}
