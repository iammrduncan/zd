//! Structured Git worktree creation for terminal-backed threads.
//!
//! The frontend supplies a project identity and path-free labels. Native code
//! derives the destination beside the approved project root, executes one fixed
//! Git operation, and adds the resulting canonical root to that project's grant.

use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::cli::LaunchState;
use crate::git_process::{run_git, GitOutput, GitRunError};
use crate::grants::WorktreeGrant;

const MAX_NAME_BYTES: usize = 128;
const MAX_REVISION_BYTES: usize = 512;
const OUTPUT_LIMIT: usize = 256 * 1024;
const OPERATION_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateThreadWorktreeRequest {
    pub project_id: String,
    pub name: String,
    pub branch: String,
    pub base_revision: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorktreeRefusalKind {
    UnknownProject,
    NotRepository,
    InvalidName,
    InvalidRevision,
    Collision,
    Locked,
    GitFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum CreateThreadWorktreeResult {
    Created {
        worktree: WorktreeGrant,
    },
    Refused {
        kind: WorktreeRefusalKind,
        reason: String,
    },
}

#[derive(Debug, Default)]
struct ListedWorktree {
    path: Option<PathBuf>,
    branch: Option<String>,
    locked: bool,
    prunable: bool,
}

fn refused(kind: WorktreeRefusalKind, reason: impl Into<String>) -> CreateThreadWorktreeResult {
    CreateThreadWorktreeResult::Refused {
        kind,
        reason: reason.into(),
    }
}

fn valid_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_BYTES
        && name != "."
        && name != ".."
        && !name.starts_with('.')
        && name
            .chars()
            .all(|character| character.is_alphanumeric() || matches!(character, '-' | '_' | '.'))
}

fn git(root: &Path, arguments: &[&str]) -> Result<GitOutput, CreateThreadWorktreeResult> {
    let arguments = arguments
        .iter()
        .map(|argument| (*argument).to_string())
        .collect::<Vec<_>>();
    run_git(root, &arguments, OUTPUT_LIMIT, OPERATION_TIMEOUT).map_err(|error| {
        let reason = match error {
            GitRunError::TimedOut => "Git worktree creation timed out",
            GitRunError::Io(_) => "Git is unavailable for worktree creation",
        };
        refused(WorktreeRefusalKind::GitFailed, reason)
    })
}

fn utf8_output(output: &GitOutput) -> Result<&str, CreateThreadWorktreeResult> {
    if output.stdout_truncated {
        return Err(refused(
            WorktreeRefusalKind::GitFailed,
            "Git worktree metadata exceeded its bounded output limit",
        ));
    }
    std::str::from_utf8(&output.stdout).map_err(|_| {
        refused(
            WorktreeRefusalKind::GitFailed,
            "Git returned undecodable worktree metadata",
        )
    })
}

fn repository_root(project_root: &Path) -> Result<PathBuf, CreateThreadWorktreeResult> {
    let output = git(project_root, &["rev-parse", "--show-toplevel"])?;
    if !output.status.success() {
        return Err(refused(
            WorktreeRefusalKind::NotRepository,
            "The approved project root is not a Git repository",
        ));
    }
    let reported = PathBuf::from(utf8_output(&output)?.trim());
    let reported = reported.canonicalize().map_err(|_| {
        refused(
            WorktreeRefusalKind::NotRepository,
            "The Git repository root is unavailable",
        )
    })?;
    let approved = project_root.canonicalize().map_err(|_| {
        refused(
            WorktreeRefusalKind::UnknownProject,
            "The approved project root is unavailable",
        )
    })?;
    if reported != approved {
        return Err(refused(
            WorktreeRefusalKind::NotRepository,
            "Worktrees require the approved project to be the repository root",
        ));
    }
    Ok(approved)
}

fn derived_destination(root: &Path, name: &str) -> Result<PathBuf, CreateThreadWorktreeResult> {
    let parent = root.parent().ok_or_else(|| {
        refused(
            WorktreeRefusalKind::GitFailed,
            "The project has no directory in which to create a sibling worktree",
        )
    })?;
    let project_name = root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            refused(
                WorktreeRefusalKind::GitFailed,
                "The project name cannot form a portable worktree destination",
            )
        })?;
    Ok(parent.join(format!("{project_name}-{name}")))
}

fn parse_worktrees(output: &GitOutput) -> Result<Vec<ListedWorktree>, CreateThreadWorktreeResult> {
    let text = utf8_output(output)?;
    let mut listed = Vec::new();
    let mut current = ListedWorktree::default();
    for field in text.split('\0') {
        if field.is_empty() {
            if current.path.is_some() {
                listed.push(current);
                current = ListedWorktree::default();
            }
        } else if let Some(path) = field.strip_prefix("worktree ") {
            current.path = Some(PathBuf::from(path));
        } else if let Some(branch) = field.strip_prefix("branch ") {
            current.branch = Some(branch.to_string());
        } else if field == "locked" || field.starts_with("locked ") {
            current.locked = true;
        } else if field == "prunable" || field.starts_with("prunable ") {
            current.prunable = true;
        }
    }
    if current.path.is_some() {
        listed.push(current);
    }
    Ok(listed)
}

fn existing_collision(
    root: &Path,
    destination: &Path,
    branch: &str,
) -> Result<Option<WorktreeRefusalKind>, CreateThreadWorktreeResult> {
    let output = git(root, &["worktree", "list", "--porcelain", "-z"])?;
    if !output.status.success() {
        return Err(refused(
            WorktreeRefusalKind::GitFailed,
            "Git could not inspect existing worktrees",
        ));
    }
    let full_branch = format!("refs/heads/{branch}");
    for listed in parse_worktrees(&output)? {
        let same_destination = listed.path.as_deref() == Some(destination);
        let same_branch = listed.branch.as_deref() == Some(full_branch.as_str());
        if same_destination || same_branch {
            return Ok(Some(if listed.locked {
                WorktreeRefusalKind::Locked
            } else {
                WorktreeRefusalKind::Collision
            }));
        }
        if listed.prunable && same_destination {
            return Ok(Some(WorktreeRefusalKind::Collision));
        }
    }
    Ok(None)
}

fn validate_revision(root: &Path, branch: &str) -> Result<String, CreateThreadWorktreeResult> {
    if branch.is_empty() || branch.len() > MAX_REVISION_BYTES {
        return Err(refused(
            WorktreeRefusalKind::InvalidRevision,
            "The worktree branch name is invalid",
        ));
    }
    let output = git(root, &["check-ref-format", "--branch", branch])?;
    if !output.status.success() {
        return Err(refused(
            WorktreeRefusalKind::InvalidRevision,
            "The worktree branch name is invalid",
        ));
    }
    Ok(format!("refs/heads/{branch}"))
}

fn resolve_base(root: &Path, revision: Option<&str>) -> Result<String, CreateThreadWorktreeResult> {
    let revision = revision.unwrap_or("HEAD");
    if revision.is_empty() || revision.len() > MAX_REVISION_BYTES {
        return Err(refused(
            WorktreeRefusalKind::InvalidRevision,
            "The base revision is invalid",
        ));
    }
    let commit_expression = format!("{revision}^{{commit}}");
    let output = git(
        root,
        &[
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            &commit_expression,
        ],
    )?;
    if !output.status.success() {
        return Err(refused(
            WorktreeRefusalKind::InvalidRevision,
            "The base revision does not identify a commit",
        ));
    }
    let commit = utf8_output(&output)?.trim();
    if commit.len() != 40 && commit.len() != 64 {
        return Err(refused(
            WorktreeRefusalKind::InvalidRevision,
            "Git returned an invalid base commit identity",
        ));
    }
    Ok(commit.to_string())
}

fn branch_exists(root: &Path, full_branch: &str) -> Result<bool, CreateThreadWorktreeResult> {
    let output = git(root, &["show-ref", "--verify", "--quiet", full_branch])?;
    match output.status.code() {
        Some(0) => Ok(true),
        Some(1) => Ok(false),
        _ => Err(refused(
            WorktreeRefusalKind::GitFailed,
            "Git could not inspect the requested worktree branch",
        )),
    }
}

#[cfg(windows)]
fn disabled_hooks_path() -> &'static str {
    "NUL"
}

#[cfg(not(windows))]
fn disabled_hooks_path() -> &'static str {
    "/dev/null"
}

fn create_worktree(
    root: &Path,
    destination: &Path,
    branch: &str,
    base_commit: &str,
) -> Result<(), CreateThreadWorktreeResult> {
    let destination = destination.to_str().ok_or_else(|| {
        refused(
            WorktreeRefusalKind::GitFailed,
            "The derived worktree destination is not portable UTF-8",
        )
    })?;
    let hooks = format!("core.hooksPath={}", disabled_hooks_path());
    let output = git(
        root,
        &[
            "-c",
            &hooks,
            "worktree",
            "add",
            "--no-track",
            "-b",
            branch,
            destination,
            base_commit,
        ],
    )?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    if stderr.contains("locked") {
        Err(refused(
            WorktreeRefusalKind::Locked,
            "The requested worktree is locked",
        ))
    } else if stderr.contains("already exists")
        || stderr.contains("already checked out")
        || stderr.contains("is already used")
    {
        Err(refused(
            WorktreeRefusalKind::Collision,
            "The requested worktree destination or branch already exists",
        ))
    } else {
        Err(refused(
            WorktreeRefusalKind::GitFailed,
            "Git could not create the requested worktree",
        ))
    }
}

pub fn create_for(
    launch: &LaunchState,
    request: CreateThreadWorktreeRequest,
) -> CreateThreadWorktreeResult {
    if !valid_name(&request.name) {
        return refused(
            WorktreeRefusalKind::InvalidName,
            "The worktree name must be one portable path-free label",
        );
    }
    let project_root = match launch.project_root(&request.project_id) {
        Ok(root) => root,
        Err(_) => {
            return refused(
                WorktreeRefusalKind::UnknownProject,
                "The project grant is unavailable",
            )
        }
    };
    let root = match repository_root(&project_root) {
        Ok(root) => root,
        Err(result) => return result,
    };
    let destination = match derived_destination(&root, &request.name) {
        Ok(destination) => destination,
        Err(result) => return result,
    };
    let full_branch = match validate_revision(&root, &request.branch) {
        Ok(branch) => branch,
        Err(result) => return result,
    };
    match existing_collision(&root, &destination, &request.branch) {
        Ok(Some(kind)) => {
            let reason = if kind == WorktreeRefusalKind::Locked {
                "The requested worktree is locked"
            } else {
                "The requested worktree destination or branch already exists"
            };
            return refused(kind, reason);
        }
        Ok(None) => {}
        Err(result) => return result,
    }
    if std::fs::symlink_metadata(&destination).is_ok() {
        return refused(
            WorktreeRefusalKind::Collision,
            "The derived worktree destination already exists",
        );
    }
    match branch_exists(&root, &full_branch) {
        Ok(true) => {
            return refused(
                WorktreeRefusalKind::Collision,
                "The requested worktree branch already exists",
            )
        }
        Ok(false) => {}
        Err(result) => return result,
    }
    let base = match resolve_base(&root, request.base_revision.as_deref()) {
        Ok(base) => base,
        Err(result) => return result,
    };
    if let Err(result) = create_worktree(&root, &destination, &request.branch, &base) {
        return result;
    }
    match launch.approve_worktree(&request.project_id, &destination) {
        Ok(worktree) => CreateThreadWorktreeResult::Created { worktree },
        Err(_) => refused(
            WorktreeRefusalKind::GitFailed,
            "The created worktree could not be added to the project grant",
        ),
    }
}

#[tauri::command]
pub fn create_thread_worktree(
    launch: tauri::State<'_, LaunchState>,
    request: CreateThreadWorktreeRequest,
) -> CreateThreadWorktreeResult {
    create_for(&launch, request)
}
