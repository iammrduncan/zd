use std::io::Read;
use std::path::Path;
use std::time::Duration;

use crate::cli::LaunchState;
use crate::git_process::run_git;
use crate::grants::ResourceRef;

use super::status::stable_id;
use super::types::{
    GitAvailability, GitChangeState, GitCompareRequest, GitDiff, GitDiffBuffer, GitDiffRequest,
    GitDiffSource,
};
use super::{
    compare_for, current_head, failure_from_run, resolve_scope, status_for, Failure,
    RepositoryScope,
};

const DIFF_FILE_LIMIT: u64 = 8 * 1024 * 1024;
const DIFF_PREVIEW_LIMIT: usize = 64 * 1024;
const DIFF_TIMEOUT: Duration = Duration::from_secs(10);

fn identity(scope: &super::types::GitScope, path: &str, revision: &str) -> String {
    stable_id(scope, &format!("buffer:{revision}"), path)
}

fn missing(request: &GitDiffRequest, path: &str, revision: &str) -> GitDiffBuffer {
    GitDiffBuffer::Missing {
        identity: identity(&request.scope, path, revision),
        path: path.to_string(),
        revision: revision.to_string(),
    }
}

fn unavailable(
    request: &GitDiffRequest,
    path: &str,
    revision: &str,
    problem: impl Into<String>,
) -> GitDiffBuffer {
    GitDiffBuffer::Unavailable {
        identity: identity(&request.scope, path, revision),
        path: path.to_string(),
        revision: revision.to_string(),
        problem: problem.into(),
    }
}

fn content(
    request: &GitDiffRequest,
    path: &str,
    revision: &str,
    byte_length: u64,
    mut bytes: Vec<u8>,
) -> GitDiffBuffer {
    let identity = identity(&request.scope, path, revision);
    if byte_length > DIFF_FILE_LIMIT || bytes.len() as u64 > DIFF_FILE_LIMIT {
        bytes.truncate(DIFF_PREVIEW_LIMIT.min(bytes.len()));
        let preview = (!bytes.contains(&0))
            .then(|| String::from_utf8(bytes).ok())
            .flatten();
        return GitDiffBuffer::OverLimit {
            identity,
            path: path.to_string(),
            revision: revision.to_string(),
            byte_length,
            limit: DIFF_FILE_LIMIT,
            preview,
        };
    }
    if bytes.contains(&0) {
        return GitDiffBuffer::Binary {
            identity,
            path: path.to_string(),
            revision: revision.to_string(),
            byte_length,
        };
    }
    match String::from_utf8(bytes) {
        Ok(text) => GitDiffBuffer::Text {
            identity,
            path: path.to_string(),
            revision: revision.to_string(),
            text,
            byte_length,
        },
        Err(_) => GitDiffBuffer::Undecodable {
            identity,
            path: path.to_string(),
            revision: revision.to_string(),
            byte_length,
        },
    }
}

fn read_working_for(state: &LaunchState, request: &GitDiffRequest, path: &str) -> GitDiffBuffer {
    let revision = "working-tree";
    let resource = ResourceRef {
        project_id: request.scope.project_id.clone(),
        worktree_id: request.scope.worktree_id.clone(),
        relative_path: path.to_string(),
    };
    let resolved = match state.resolve(&resource) {
        Ok(path) => path,
        Err(_) => return unavailable(request, path, revision, "File authority is unavailable"),
    };
    read_file(request, &resolved, path, revision)
}

fn read_file(
    request: &GitDiffRequest,
    resolved: &Path,
    path: &str,
    revision: &str,
) -> GitDiffBuffer {
    let metadata = match std::fs::metadata(resolved) {
        Ok(metadata) if metadata.is_file() => metadata,
        Ok(_) => return unavailable(request, path, revision, "The change is not a regular file"),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return missing(request, path, revision)
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return GitDiffBuffer::Denied {
                identity: identity(&request.scope, path, revision),
                path: path.to_string(),
                revision: revision.to_string(),
            }
        }
        Err(_) => return unavailable(request, path, revision, "The change could not be read"),
    };
    let byte_length = metadata.len();
    let mut file = match std::fs::File::open(resolved) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return GitDiffBuffer::Denied {
                identity: identity(&request.scope, path, revision),
                path: path.to_string(),
                revision: revision.to_string(),
            }
        }
        Err(_) => return unavailable(request, path, revision, "The change could not be read"),
    };
    let retained = if byte_length > DIFF_FILE_LIMIT {
        DIFF_PREVIEW_LIMIT as u64
    } else {
        DIFF_FILE_LIMIT + 1
    };
    let mut bytes = Vec::with_capacity(retained.min(byte_length) as usize);
    if (&mut file).take(retained).read_to_end(&mut bytes).is_err() {
        return unavailable(request, path, revision, "The change could not be read");
    }
    content(request, path, revision, byte_length, bytes)
}

fn repository_path(repository: &RepositoryScope, path: &str) -> String {
    format!("{}{}", repository.prefix, path)
}

fn read_blob(
    repository: &RepositoryScope,
    request: &GitDiffRequest,
    path: &str,
    revision: &str,
) -> GitDiffBuffer {
    let object = format!("{revision}:{}", repository_path(repository, path));
    let size_arguments = vec!["cat-file".to_string(), "-s".to_string(), object.clone()];
    let size = match run_git(&repository.root, &size_arguments, 64, DIFF_TIMEOUT) {
        Ok(output) if output.status.success() => String::from_utf8(output.stdout)
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok()),
        Ok(_) => return missing(request, path, revision),
        Err(error) => return unavailable(request, path, revision, failure_from_run(error).problem),
    };
    let Some(byte_length) = size else {
        return unavailable(request, path, revision, "Git returned an invalid blob size");
    };
    let retained = if byte_length > DIFF_FILE_LIMIT {
        DIFF_PREVIEW_LIMIT
    } else {
        DIFF_FILE_LIMIT as usize + 1
    };
    let arguments = vec!["cat-file".to_string(), "blob".to_string(), object];
    match run_git(&repository.root, &arguments, retained, DIFF_TIMEOUT) {
        Ok(output) if output.status.success() => {
            content(request, path, revision, byte_length, output.stdout)
        }
        Ok(_) => missing(request, path, revision),
        Err(error) => unavailable(request, path, revision, failure_from_run(error).problem),
    }
}

fn diff_failure(request: GitDiffRequest, failure: Failure) -> GitDiff {
    let change_id = match &request.source {
        GitDiffSource::WorkingTree { change_id } | GitDiffSource::Comparison { change_id, .. } => {
            change_id
        }
    };
    GitDiff {
        scope: request.scope.clone(),
        availability: failure.availability,
        base: unavailable(&request, change_id, "base", &failure.problem),
        head: unavailable(&request, change_id, "head", &failure.problem),
        problem: Some(failure.problem),
    }
}

pub fn diff_for(state: &LaunchState, request: GitDiffRequest) -> GitDiff {
    let repository = match resolve_scope(state, &request.scope) {
        Ok(repository) => repository,
        Err(failure) => return diff_failure(request, failure),
    };
    match request.source.clone() {
        GitDiffSource::WorkingTree { change_id } => {
            let status = status_for(state, request.scope.clone());
            if status.availability != GitAvailability::Available {
                return diff_failure(
                    request,
                    Failure {
                        availability: status.availability,
                        problem: status
                            .problem
                            .unwrap_or_else(|| "Git status is unavailable".into()),
                    },
                );
            }
            let Some(change) = status.entries.iter().find(|entry| entry.id == change_id) else {
                return diff_failure(
                    request,
                    Failure {
                        availability: GitAvailability::Available,
                        problem: "The selected change is no longer available".to_string(),
                    },
                );
            };
            if change.state == GitChangeState::Ignored || change.submodule {
                return diff_failure(
                    request,
                    Failure {
                        availability: GitAvailability::Available,
                        problem: "This change does not have a text diff".to_string(),
                    },
                );
            }
            let head = match current_head(&repository.root) {
                Ok(head) => head,
                Err(failure) => return diff_failure(request, failure),
            };
            let base_path = change.previous_path.as_deref().unwrap_or(&change.path);
            let base = if matches!(
                change.state,
                GitChangeState::Added | GitChangeState::Untracked
            ) || head.is_none()
            {
                missing(&request, base_path, head.as_deref().unwrap_or("unborn"))
            } else {
                read_blob(
                    &repository,
                    &request,
                    base_path,
                    head.as_deref().expect("checked above"),
                )
            };
            let head_buffer = if change.state == GitChangeState::Deleted {
                missing(&request, &change.path, "working-tree")
            } else {
                read_working_for(state, &request, &change.path)
            };
            GitDiff {
                scope: request.scope,
                availability: GitAvailability::Available,
                base,
                head: head_buffer,
                problem: None,
            }
        }
        GitDiffSource::Comparison {
            base_commit_id,
            head_commit_id,
            change_id,
        } => {
            let comparison = compare_for(
                state,
                GitCompareRequest {
                    scope: request.scope.clone(),
                    base_commit_id: base_commit_id.clone(),
                    head_commit_id: head_commit_id.clone(),
                },
            );
            if comparison.availability != GitAvailability::Available || comparison.problem.is_some()
            {
                return diff_failure(
                    request,
                    Failure {
                        availability: comparison.availability,
                        problem: comparison
                            .problem
                            .unwrap_or_else(|| "Git comparison is unavailable".into()),
                    },
                );
            }
            let Some(change) = comparison
                .entries
                .iter()
                .find(|entry| entry.id == change_id)
            else {
                return diff_failure(
                    request,
                    Failure {
                        availability: GitAvailability::Available,
                        problem: "The selected comparison change is no longer available"
                            .to_string(),
                    },
                );
            };
            if change.submodule {
                return diff_failure(
                    request,
                    Failure {
                        availability: GitAvailability::Available,
                        problem: "Submodule changes do not have a text diff".to_string(),
                    },
                );
            }
            let base_path = change.previous_path.as_deref().unwrap_or(&change.path);
            let base = if change.state == GitChangeState::Added {
                missing(&request, base_path, &base_commit_id)
            } else {
                read_blob(&repository, &request, base_path, &base_commit_id)
            };
            let head = if change.state == GitChangeState::Deleted {
                missing(&request, &change.path, &head_commit_id)
            } else {
                read_blob(&repository, &request, &change.path, &head_commit_id)
            };
            GitDiff {
                scope: request.scope,
                availability: GitAvailability::Available,
                base,
                head,
                problem: None,
            }
        }
    }
}
