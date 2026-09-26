use std::path::{Path, PathBuf};
use std::process::Command;

use zd_host::{
    CreateThreadWorktreeRequest, CreateThreadWorktreeResult, HostService, WorktreeGrant,
    WorktreeRefusalKind,
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

fn approved(repository: &RepositoryFixture) -> (HostService, String) {
    let host = HostService::open_project(repository.path()).expect("approve fixture project");
    let project_id = host.launch_request().project.expect("approved project").id;
    (host, project_id)
}

fn request(project_id: &str, name: &str, branch: &str) -> CreateThreadWorktreeRequest {
    CreateThreadWorktreeRequest {
        project_id: project_id.to_string(),
        name: name.to_string(),
        branch: branch.to_string(),
        base_revision: None,
    }
}

fn created(result: CreateThreadWorktreeResult) -> WorktreeGrant {
    match result {
        CreateThreadWorktreeResult::Created { worktree } => worktree,
        other => panic!("expected a created worktree, got {other:?}"),
    }
}

#[test]
fn root_worktree_uses_the_checked_out_branch_as_its_label() {
    let repository = RepositoryFixture::new("root-label");
    repository.git(&["checkout", "-b", "feat/global-use"]);

    let (host, _) = approved(&repository);
    let grant = host.launch_request().project.expect("approved project");

    assert_eq!(grant.worktrees[0].name, "feat/global-use");
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
    let (host, project_id) = approved(&repository);

    let worktree =
        created(host.create_thread_worktree(request(&project_id, "review", "feature/review")));

    let expected = repository
        .parent
        .join("project-review")
        .canonicalize()
        .unwrap();
    assert_eq!(Path::new(&worktree.root), expected);
    assert_eq!(worktree.name, "feature/review");
    assert_eq!(
        Command::new("git")
            .args(["branch", "--show-current"])
            .current_dir(&worktree.root)
            .output()
            .unwrap()
            .stdout,
        b"feature/review\n"
    );
    let grant = host
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
    let (host, project_id) = approved(&repository);
    let mut worktree_request = request(&project_id, "older", "feature/older");
    worktree_request.base_revision = Some(base.clone());

    let worktree = created(host.create_thread_worktree(worktree_request));
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
    let (host, project_id) = approved(&repository);
    assert_eq!(
        refused(
            host.create_thread_worktree(request(&project_id, "../outside", "feature/outside",))
        ),
        WorktreeRefusalKind::InvalidName
    );
    assert_eq!(
        refused(host.create_thread_worktree(request(&project_id, "bad-ref", "bad branch"))),
        WorktreeRefusalKind::InvalidRevision
    );
    assert_eq!(
        refused(host.create_thread_worktree(request(
            "project-unknown",
            "review",
            "feature/review",
        ))),
        WorktreeRefusalKind::UnknownProject
    );

    std::fs::create_dir(repository.path().join("nested")).unwrap();
    let nested = HostService::open_project(&repository.path().join("nested")).unwrap();
    let nested_id = nested.launch_request().project.unwrap().id;
    assert_eq!(
        refused(nested.create_thread_worktree(request(&nested_id, "review", "feature/nested",))),
        WorktreeRefusalKind::NotRepository
    );
}

#[test]
fn destination_branch_collisions_and_locked_worktrees_are_specific() {
    let repository = RepositoryFixture::new("collision");
    let (host, project_id) = approved(&repository);
    let first =
        created(host.create_thread_worktree(request(&project_id, "review", "feature/review")));
    assert_eq!(
        refused(host.create_thread_worktree(request(&project_id, "another", "feature/review",))),
        WorktreeRefusalKind::Collision
    );

    repository.git(&["worktree", "lock", &first.root]);
    assert_eq!(
        refused(host.create_thread_worktree(request(&project_id, "review", "feature/review",))),
        WorktreeRefusalKind::Locked
    );
}

#[test]
fn a_plain_directory_is_not_mistaken_for_a_repository() {
    let repository = RepositoryFixture::new("plain");
    std::fs::remove_dir_all(repository.path().join(".git")).unwrap();
    let (host, project_id) = approved(&repository);

    assert_eq!(
        refused(host.create_thread_worktree(request(&project_id, "review", "feature/review",))),
        WorktreeRefusalKind::NotRepository
    );
}
