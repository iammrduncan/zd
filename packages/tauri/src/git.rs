//! Read-only Git status and history for native-approved project/worktree scopes.
//!
//! The webview supplies opaque grant identities, bounded cursors, and full commit
//! identities. It cannot supply a directory, executable, argument vector, or path.

#[path = "git/history.rs"]
mod history;
#[path = "git/process.rs"]
mod process;
#[path = "git/status.rs"]
mod status;
#[path = "git/types.rs"]
mod types;

use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::cli::LaunchState;
use history::{
    full_commit_id, page_size, parse_comparison, parse_cursor, parse_history, HistoryCursor,
    MAX_HISTORY_OFFSET,
};
use process::{run_git, GitRunError};
use status::parse_status;

pub use types::{
    GitAvailability, GitChangeState, GitCompareRequest, GitComparison, GitHistoryPage,
    GitHistoryRequest, GitScope, GitStatusSnapshot,
};

const PROBE_OUTPUT_LIMIT: usize = 16 * 1024;
const STATUS_OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
const HISTORY_OUTPUT_LIMIT: usize = 2 * 1024 * 1024;
const COMPARISON_OUTPUT_LIMIT: usize = 8 * 1024 * 1024;
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);
const STATUS_TIMEOUT: Duration = Duration::from_secs(20);
const HISTORY_TIMEOUT: Duration = Duration::from_secs(10);
const COMPARISON_TIMEOUT: Duration = Duration::from_secs(15);

struct RepositoryScope {
    root: PathBuf,
    prefix: String,
}

struct Failure {
    availability: GitAvailability,
    problem: String,
}

fn failure_from_run(error: GitRunError) -> Failure {
    match error {
        GitRunError::Io(std::io::ErrorKind::PermissionDenied) => Failure {
            availability: GitAvailability::Denied,
            problem: "Git access was denied".to_string(),
        },
        GitRunError::TimedOut => Failure {
            availability: GitAvailability::Unavailable,
            problem: "Git did not finish within the bounded refresh time".to_string(),
        },
        GitRunError::Io(_) => Failure {
            availability: GitAvailability::Unavailable,
            problem: "Git is unavailable".to_string(),
        },
    }
}

fn failure_from_stderr(stderr: &[u8]) -> Failure {
    let message = String::from_utf8_lossy(stderr).to_ascii_lowercase();
    if message.contains("not a git repository") {
        Failure {
            availability: GitAvailability::NonRepository,
            problem: "This project is not a Git repository".to_string(),
        }
    } else if message.contains("permission denied")
        || message.contains("access is denied")
        || message.contains("dubious ownership")
    {
        Failure {
            availability: GitAvailability::Denied,
            problem: "Git access was denied".to_string(),
        }
    } else {
        Failure {
            availability: GitAvailability::Unavailable,
            problem: "Git data is unavailable".to_string(),
        }
    }
}

fn repository_scope(root: PathBuf) -> Result<RepositoryScope, Failure> {
    match std::fs::metadata(&root) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => {
            return Err(Failure {
                availability: GitAvailability::Unavailable,
                problem: "The approved worktree is not a directory".to_string(),
            })
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err(Failure {
                availability: GitAvailability::Denied,
                problem: "The approved worktree cannot be read".to_string(),
            })
        }
        Err(_) => {
            return Err(Failure {
                availability: GitAvailability::Unavailable,
                problem: "The approved worktree is unavailable".to_string(),
            })
        }
    }
    let arguments = ["rev-parse", "--is-inside-work-tree", "--show-prefix"]
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let output =
        run_git(&root, &arguments, PROBE_OUTPUT_LIMIT, PROBE_TIMEOUT).map_err(failure_from_run)?;
    if !output.status.success() {
        return Err(failure_from_stderr(&output.stderr));
    }
    let text = std::str::from_utf8(&output.stdout).map_err(|_| Failure {
        availability: GitAvailability::Unavailable,
        problem: "Git returned invalid repository metadata".to_string(),
    })?;
    let mut lines = text.split('\n');
    if lines.next() != Some("true") {
        return Err(Failure {
            availability: GitAvailability::NonRepository,
            problem: "This project is not a Git working tree".to_string(),
        });
    }
    let prefix = lines.next().unwrap_or_default().to_string();
    Ok(RepositoryScope { root, prefix })
}

fn resolve_scope(state: &LaunchState, scope: &GitScope) -> Result<RepositoryScope, Failure> {
    let root = state
        .root(&scope.project_id, &scope.worktree_id)
        .map_err(|_| Failure {
            availability: GitAvailability::Denied,
            problem: "Git authority is unavailable for this project/worktree".to_string(),
        })?;
    repository_scope(root)
}

fn status_failure(scope: GitScope, failure: Failure) -> GitStatusSnapshot {
    GitStatusSnapshot {
        scope,
        availability: failure.availability,
        entries: Vec::new(),
        truncated: false,
        problem: Some(failure.problem),
    }
}

pub fn status_for(state: &LaunchState, scope: GitScope) -> GitStatusSnapshot {
    let repository = match resolve_scope(state, &scope) {
        Ok(repository) => repository,
        Err(failure) => return status_failure(scope, failure),
    };
    let arguments = [
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
        "--ignored=matching",
        "--ignore-submodules=none",
        "--",
        ".",
    ]
    .into_iter()
    .map(str::to_string)
    .collect::<Vec<_>>();
    let output = match run_git(
        &repository.root,
        &arguments,
        STATUS_OUTPUT_LIMIT,
        STATUS_TIMEOUT,
    ) {
        Ok(output) => output,
        Err(error) => return status_failure(scope, failure_from_run(error)),
    };
    if !output.status.success() {
        return status_failure(scope, failure_from_stderr(&output.stderr));
    }
    match parse_status(
        &output.stdout,
        &scope,
        &repository.prefix,
        output.stdout_truncated,
    ) {
        Ok(parsed) => GitStatusSnapshot {
            scope,
            availability: GitAvailability::Available,
            entries: parsed.entries,
            truncated: parsed.truncated,
            problem: parsed
                .truncated
                .then(|| "Git status reached its bounded result limit".to_string()),
        },
        Err(problem) => status_failure(
            scope,
            Failure {
                availability: GitAvailability::Unavailable,
                problem,
            },
        ),
    }
}

fn history_failure(scope: GitScope, failure: Failure) -> GitHistoryPage {
    GitHistoryPage {
        scope,
        availability: failure.availability,
        commits: Vec::new(),
        next_cursor: None,
        truncated: false,
        problem: Some(failure.problem),
    }
}

fn verify_commit(root: &Path, commit: &str) -> Result<bool, Failure> {
    let arguments = vec![
        "rev-parse".to_string(),
        "--verify".to_string(),
        "--quiet".to_string(),
        format!("{commit}^{{commit}}"),
    ];
    let output =
        run_git(root, &arguments, PROBE_OUTPUT_LIMIT, PROBE_TIMEOUT).map_err(failure_from_run)?;
    Ok(output.status.success())
}

pub fn history_for(state: &LaunchState, request: GitHistoryRequest) -> GitHistoryPage {
    let scope = request.scope.clone();
    let repository = match resolve_scope(state, &scope) {
        Ok(repository) => repository,
        Err(failure) => return history_failure(scope, failure),
    };
    let cursor = match request.cursor.as_deref() {
        Some(value) => match parse_cursor(value) {
            Ok(cursor) => cursor,
            Err(problem) => {
                return history_failure(
                    scope,
                    Failure {
                        availability: GitAvailability::Available,
                        problem,
                    },
                )
            }
        },
        None => {
            let head = match current_head(&repository.root) {
                Ok(Some(head)) => head,
                Ok(None) => {
                    return GitHistoryPage {
                        scope,
                        availability: GitAvailability::Available,
                        commits: Vec::new(),
                        next_cursor: None,
                        truncated: false,
                        problem: None,
                    }
                }
                Err(failure) => return history_failure(scope, failure),
            };
            HistoryCursor { head, offset: 0 }
        }
    };
    match verify_commit(&repository.root, &cursor.head) {
        Ok(true) => {}
        Ok(false) => {
            return history_failure(
                scope,
                Failure {
                    availability: GitAvailability::Available,
                    problem: "The history cursor no longer identifies a commit".to_string(),
                },
            )
        }
        Err(failure) => return history_failure(scope, failure),
    }
    let requested = page_size(&request);
    let remaining = MAX_HISTORY_OFFSET.saturating_sub(cursor.offset);
    let limit = requested.min(remaining);
    if limit == 0 {
        return GitHistoryPage {
            scope,
            availability: GitAvailability::Available,
            commits: Vec::new(),
            next_cursor: None,
            truncated: true,
            problem: Some("Git history reached its bounded traversal limit".to_string()),
        };
    }
    let arguments = vec![
        "log".to_string(),
        "--topo-order".to_string(),
        format!("--max-count={}", limit + 1),
        format!("--skip={}", cursor.offset),
        "--format=%x1e%H%x1f%P%x1f%an%x1f%at%x1f%s".to_string(),
        cursor.head.clone(),
        "--".to_string(),
        ".".to_string(),
    ];
    let output = match run_git(
        &repository.root,
        &arguments,
        HISTORY_OUTPUT_LIMIT,
        HISTORY_TIMEOUT,
    ) {
        Ok(output) => output,
        Err(error) => return history_failure(scope, failure_from_run(error)),
    };
    if !output.status.success() {
        return history_failure(scope, failure_from_stderr(&output.stderr));
    }
    let mut commits = match parse_history(&output.stdout) {
        Ok(commits) => commits,
        Err(problem) => {
            return history_failure(
                scope,
                Failure {
                    availability: GitAvailability::Unavailable,
                    problem,
                },
            )
        }
    };
    let more = commits.len() > limit || output.stdout_truncated;
    commits.truncate(limit);
    let next_offset = cursor.offset + commits.len();
    let at_bound = next_offset >= MAX_HISTORY_OFFSET;
    GitHistoryPage {
        scope,
        availability: GitAvailability::Available,
        commits,
        next_cursor: (more && !at_bound).then(|| format!("{}:{next_offset}", cursor.head)),
        truncated: output.stdout_truncated || (more && at_bound),
        problem: (output.stdout_truncated || (more && at_bound))
            .then(|| "Git history reached its bounded traversal limit".to_string()),
    }
}

fn current_head(root: &Path) -> Result<Option<String>, Failure> {
    let arguments = ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]
        .into_iter()
        .map(str::to_string)
        .collect::<Vec<_>>();
    let output =
        run_git(root, &arguments, PROBE_OUTPUT_LIMIT, PROBE_TIMEOUT).map_err(failure_from_run)?;
    if !output.status.success() {
        return Ok(None);
    }
    let head = String::from_utf8(output.stdout)
        .map_err(|_| Failure {
            availability: GitAvailability::Unavailable,
            problem: "Git returned an invalid commit identity".to_string(),
        })?
        .trim()
        .to_ascii_lowercase();
    if !full_commit_id(&head) {
        return Err(Failure {
            availability: GitAvailability::Unavailable,
            problem: "Git returned an invalid commit identity".to_string(),
        });
    }
    Ok(Some(head))
}

fn comparison_failure(request: GitCompareRequest, failure: Failure) -> GitComparison {
    GitComparison {
        scope: request.scope,
        availability: failure.availability,
        base_commit_id: request.base_commit_id,
        head_commit_id: request.head_commit_id,
        entries: Vec::new(),
        truncated: false,
        problem: Some(failure.problem),
    }
}

pub fn compare_for(state: &LaunchState, request: GitCompareRequest) -> GitComparison {
    if !full_commit_id(&request.base_commit_id) || !full_commit_id(&request.head_commit_id) {
        return comparison_failure(
            request,
            Failure {
                availability: GitAvailability::Available,
                problem: "Comparison requires full commit identities".to_string(),
            },
        );
    }
    let repository = match resolve_scope(state, &request.scope) {
        Ok(repository) => repository,
        Err(failure) => return comparison_failure(request, failure),
    };
    let commits = [
        request.base_commit_id.clone(),
        request.head_commit_id.clone(),
    ];
    for commit in &commits {
        match verify_commit(&repository.root, commit) {
            Ok(true) => {}
            Ok(false) => {
                return comparison_failure(
                    request,
                    Failure {
                        availability: GitAvailability::Available,
                        problem: "A comparison commit is unavailable".to_string(),
                    },
                )
            }
            Err(failure) => return comparison_failure(request, failure),
        }
    }
    let arguments = vec![
        "diff".to_string(),
        "--raw".to_string(),
        "-z".to_string(),
        "--no-abbrev".to_string(),
        "--no-ext-diff".to_string(),
        "--no-textconv".to_string(),
        "--find-renames=50%".to_string(),
        request.base_commit_id.clone(),
        request.head_commit_id.clone(),
        "--".to_string(),
        ".".to_string(),
    ];
    let output = match run_git(
        &repository.root,
        &arguments,
        COMPARISON_OUTPUT_LIMIT,
        COMPARISON_TIMEOUT,
    ) {
        Ok(output) => output,
        Err(error) => return comparison_failure(request, failure_from_run(error)),
    };
    if !output.status.success() {
        return comparison_failure(request, failure_from_stderr(&output.stderr));
    }
    match parse_comparison(
        &output.stdout,
        &request.scope,
        &repository.prefix,
        &request.base_commit_id,
        &request.head_commit_id,
        output.stdout_truncated,
    ) {
        Ok(parsed) => GitComparison {
            scope: request.scope,
            availability: GitAvailability::Available,
            base_commit_id: request.base_commit_id,
            head_commit_id: request.head_commit_id,
            entries: parsed.entries,
            truncated: parsed.truncated,
            problem: parsed
                .truncated
                .then(|| "Git comparison reached its bounded result limit".to_string()),
        },
        Err(problem) => comparison_failure(
            request,
            Failure {
                availability: GitAvailability::Unavailable,
                problem,
            },
        ),
    }
}

#[tauri::command]
pub fn git_status(state: tauri::State<'_, LaunchState>, scope: GitScope) -> GitStatusSnapshot {
    status_for(&state, scope)
}

#[tauri::command]
pub fn git_history_page(
    state: tauri::State<'_, LaunchState>,
    request: GitHistoryRequest,
) -> GitHistoryPage {
    history_for(&state, request)
}

#[tauri::command]
pub fn git_compare(
    state: tauri::State<'_, LaunchState>,
    request: GitCompareRequest,
) -> GitComparison {
    compare_for(&state, request)
}
