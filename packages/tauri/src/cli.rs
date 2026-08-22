//! Turns the command line into a launch request.
//!
//! The three forms from the workbench vision:
//!   `zd .`      open the current folder
//!   `zd <file>` open that file, creating it later if it does not exist
//!   `zd`        home screen
//!
//! Launching from Spotlight, the Dock, or the Start menu arrives here with no
//! arguments and behaves like bare `zd`.

use std::collections::VecDeque;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::grants::{GrantStore, ProjectGrant, ResourceRef};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeOpenRequest {
    /// Absolute native path, or `None` for the workbench home.
    pub path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub project: Option<ProjectGrant>,
    pub worktree_id: Option<String>,
    pub relative_path: Option<String>,
    pub problem: Option<String>,
}

#[derive(Debug)]
struct LaunchSession {
    current: LaunchRequest,
    pending: VecDeque<LaunchRequest>,
    grants: GrantStore,
}

/// The one native source of truth for what this window may open.
///
/// Finder can ask an already-running macOS application to open another file.
/// That request stays pending until the document confirms switching will not
/// discard unsaved work. Its grant is additive; accepting changes only the
/// native active launch request, under the same lock that owns the pending queue.
#[derive(Debug)]
pub struct LaunchState(Mutex<LaunchSession>);

impl LaunchState {
    pub fn new(current: NativeOpenRequest) -> Self {
        let mut grants = GrantStore::default();
        let current = resolve_open_request(&mut grants, current);
        Self(Mutex::new(LaunchSession {
            current,
            pending: VecDeque::new(),
            grants,
        }))
    }

    pub fn current(&self) -> LaunchRequest {
        self.0
            .lock()
            .expect("launch state was poisoned")
            .current
            .clone()
    }

    pub fn queue(&self, request: NativeOpenRequest) {
        let mut session = self.0.lock().expect("launch state was poisoned");
        let request = resolve_open_request(&mut session.grants, request);
        session.pending.push_back(request);
    }

    pub fn has_pending(&self) -> bool {
        !self
            .0
            .lock()
            .expect("launch state was poisoned")
            .pending
            .is_empty()
    }

    pub fn pending(&self) -> Option<LaunchRequest> {
        self.0
            .lock()
            .expect("launch state was poisoned")
            .pending
            .front()
            .cloned()
    }

    pub fn accept_pending(&self) -> Option<LaunchRequest> {
        let mut session = self.0.lock().expect("launch state was poisoned");
        let request = session.pending.pop_front()?;
        session.current = request.clone();
        Some(request)
    }

    pub fn project_grants(&self) -> Vec<ProjectGrant> {
        self.0
            .lock()
            .expect("launch state was poisoned")
            .grants
            .projects()
    }

    pub fn resolve(&self, resource: &ResourceRef) -> Result<PathBuf, String> {
        self.0
            .lock()
            .expect("launch state was poisoned")
            .grants
            .resolve(resource)
    }

    pub fn root(&self, project_id: &str, worktree_id: &str) -> Result<PathBuf, String> {
        self.0
            .lock()
            .expect("launch state was poisoned")
            .grants
            .root(project_id, worktree_id)
    }

    pub fn remove_project(&self, project_id: &str) -> Result<ProjectGrant, String> {
        let mut session = self.0.lock().expect("launch state was poisoned");
        let in_use = std::iter::once(&session.current)
            .chain(session.pending.iter())
            .any(|request| {
                request
                    .project
                    .as_ref()
                    .is_some_and(|project| project.id == project_id)
            });
        if in_use {
            return Err(format!("project grant {project_id} is still active"));
        }
        session.grants.remove_project(project_id)
    }
}

fn resolve_open_request(grants: &mut GrantStore, request: NativeOpenRequest) -> LaunchRequest {
    let Some(raw_path) = request.path else {
        return LaunchRequest {
            project: None,
            worktree_id: None,
            relative_path: None,
            problem: None,
        };
    };
    let path = Path::new(&raw_path);
    let root = scope_for(&raw_path);
    let approved = match grants.approve_project(&root) {
        Ok(approved) => approved,
        Err(problem) => {
            return LaunchRequest {
                project: None,
                worktree_id: None,
                relative_path: None,
                problem: Some(problem),
            };
        }
    };

    let relative_path = if path.is_dir() {
        None
    } else {
        let root = Path::new(&approved.project.root);
        let resolved_parent = path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .canonicalize();
        match (resolved_parent, path.file_name()) {
            (Ok(parent), Some(name)) => parent
                .join(name)
                .strip_prefix(root)
                .ok()
                .map(|relative| relative.to_string_lossy().into_owned()),
            _ => None,
        }
    };
    let problem = (!path.is_dir() && relative_path.is_none()).then(|| {
        format!(
            "{} could not be represented inside its approved project",
            path.display()
        )
    });

    LaunchRequest {
        project: Some(approved.project),
        worktree_id: Some(approved.worktree_id),
        relative_path,
        problem,
    }
}

/// The environment variable a development run uses to report the real cwd.
const INVOCATION_DIR: &str = "ZD_CWD";

/// Which directory a relative path on the command line is resolved against.
///
/// The process working directory, except when something has told us it is not
/// the directory the user was standing in. `tauri dev` runs the binary from
/// `src-tauri/`, so `zd README.md` typed at the repo root went looking for
/// `src-tauri/README.md` and failed — the `app:open` script passes npm's
/// `INIT_CWD` through so development resolves paths the way a shipped binary
/// does. A shipped binary never sets it and takes the plain working directory.
///
/// A relative override is refused rather than honoured: it would be resolved
/// against the very directory it exists to replace.
fn resolve_dir(override_dir: Option<PathBuf>, working_dir: PathBuf) -> PathBuf {
    match override_dir {
        Some(dir) if dir.is_absolute() => dir,
        _ => working_dir,
    }
}

pub fn launch_from_environment() -> NativeOpenRequest {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = resolve_dir(
        std::env::var_os(INVOCATION_DIR).map(PathBuf::from),
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    );
    parse_args(&args, &cwd)
}

#[tauri::command]
pub fn launch_request(state: tauri::State<'_, LaunchState>) -> LaunchRequest {
    state.current()
}

#[tauri::command]
pub fn project_grants(state: tauri::State<'_, LaunchState>) -> Vec<ProjectGrant> {
    state.project_grants()
}

#[tauri::command]
pub fn pending_open_request(state: tauri::State<'_, LaunchState>) -> Option<LaunchRequest> {
    state.pending()
}

#[tauri::command]
pub fn remove_project_grant(
    state: tauri::State<'_, LaunchState>,
    project_id: String,
) -> Result<ProjectGrant, String> {
    state.remove_project(&project_id)
}

/// Turn the first local file in a native open event into a workbench request.
pub fn opened_request(urls: &[tauri::Url]) -> Option<NativeOpenRequest> {
    let path = urls.iter().find_map(|url| url.to_file_path().ok())?;
    Some(NativeOpenRequest {
        path: Some(path.to_string_lossy().into_owned()),
    })
}

/// Pure so it can be tested without a process.
fn parse_args(args: &[String], cwd: &Path) -> NativeOpenRequest {
    // macOS hands Finder launches a `-psn_0_12345` process-serial argument.
    let mut positional = args.iter().filter(|a| !a.starts_with('-'));

    let Some(first) = positional.next() else {
        return NativeOpenRequest { path: None };
    };

    NativeOpenRequest {
        path: Some(absolutize(first, cwd)),
    }
}

/// Resolve against the working directory without requiring the path to exist —
/// `zd new-file.md` is allowed to name something that is not there yet.
fn absolutize(raw: &str, cwd: &Path) -> String {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        cwd.join(candidate)
    };

    // Drop `.` components so `zd .` reports the folder, not `folder/.`.
    let cleaned: PathBuf = joined
        .components()
        .filter(|component| !matches!(component, Component::CurDir))
        .collect();

    if cleaned.as_os_str().is_empty() {
        return cwd.to_string_lossy().into_owned();
    }

    cleaned.to_string_lossy().into_owned()
}

/// A launch path scopes file access to itself when it is a directory and to its
/// parent when it names a document (including a document not created yet).
pub fn scope_for(path: &str) -> PathBuf {
    let path = Path::new(path);
    if path.is_dir() {
        return path.to_path_buf();
    }
    path.parent().unwrap_or(path).to_path_buf()
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-launch-{name}-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
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

    fn args(raw: &[&str]) -> Vec<String> {
        raw.iter().map(|s| s.to_string()).collect()
    }

    fn cwd() -> PathBuf {
        PathBuf::from("/work/notes")
    }

    #[test]
    fn a_relative_path_resolves_against_the_invocation_directory() {
        // `tauri dev` runs the binary with the working directory set to
        // `src-tauri/`, so `zd README.md` typed at the repo root looked for
        // `src-tauri/README.md` and failed.
        let resolved = resolve_dir(
            Some(PathBuf::from("/repo")),
            PathBuf::from("/repo/src-tauri"),
        );
        assert_eq!(resolved, PathBuf::from("/repo"));
    }

    #[test]
    fn without_an_override_the_working_directory_is_used() {
        // A shipped binary launched from a terminal is already in the right
        // place, so nothing overrides it there.
        let resolved = resolve_dir(None, PathBuf::from("/work/notes"));
        assert_eq!(resolved, PathBuf::from("/work/notes"));
    }

    #[test]
    fn a_relative_override_is_ignored() {
        // An override that is itself relative would resolve against the very
        // directory it exists to replace, which is worse than not having one.
        let resolved = resolve_dir(
            Some(PathBuf::from("../up")),
            PathBuf::from("/repo/src-tauri"),
        );
        assert_eq!(resolved, PathBuf::from("/repo/src-tauri"));
    }

    #[test]
    fn bare_launch_opens_the_workbench_home() {
        let request = parse_args(&args(&[]), &cwd());
        assert_eq!(request.path, None);
    }

    #[test]
    fn finder_launch_process_serial_argument_is_ignored() {
        let request = parse_args(&args(&["-psn_0_774321"]), &cwd());
        assert_eq!(request.path, None);
    }

    #[test]
    fn dot_opens_the_current_folder() {
        let request = parse_args(&args(&["."]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes"));
    }

    #[test]
    fn a_relative_file_resolves_against_the_working_directory() {
        let request = parse_args(&args(&["plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/plan.md"));
    }

    #[test]
    fn an_absolute_file_is_used_as_given() {
        let request = parse_args(&args(&["/tmp/plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/tmp/plan.md"));
    }

    #[test]
    fn md_is_a_path_name_and_not_a_compatibility_selector() {
        let request = parse_args(&args(&["md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/md"));
    }

    #[test]
    fn one_path_goes_to_the_workbench() {
        let request = parse_args(&args(&["plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/plan.md"));
    }

    #[test]
    fn interior_dot_components_are_dropped_too() {
        let request = parse_args(&args(&["./docs/./plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/docs/plan.md"));
    }

    #[test]
    fn a_file_that_does_not_exist_yet_still_resolves() {
        let request = parse_args(&args(&["not-created-yet.md"]), &cwd());
        assert_eq!(
            request.path.as_deref(),
            Some("/work/notes/not-created-yet.md")
        );
    }

    #[test]
    fn a_finder_file_url_becomes_a_workbench_launch_request() {
        let urls = vec![tauri::Url::parse("file:///work/notes/plan.md").unwrap()];

        let request = opened_request(&urls).expect("the file URL should be accepted");

        assert_eq!(request.path.as_deref(), Some("/work/notes/plan.md"));
    }

    #[test]
    fn launch_json_has_no_surface_selector() {
        let scratch = Scratch::new("json");
        let file = scratch.join("plan.md");
        std::fs::write(&file, "# Plan\n").unwrap();
        let request = LaunchState::new(NativeOpenRequest {
            path: Some(file.to_string_lossy().into_owned()),
        })
        .current();
        let json = serde_json::to_value(request).unwrap();

        assert_eq!(
            json.get("relativePath").and_then(|path| path.as_str()),
            Some("plan.md")
        );
        assert!(json
            .get("project")
            .and_then(|project| project.get("id"))
            .is_some());
        assert!(json.get("worktreeId").and_then(|id| id.as_str()).is_some());
        assert!(json.get("path").is_none());
        assert!(json.get("miniapp").is_none());
    }

    #[test]
    fn a_non_file_url_is_not_a_launch_request() {
        let urls = vec![tauri::Url::parse("https://example.com/plan.md").unwrap()];

        assert_eq!(opened_request(&urls), None);
    }

    #[test]
    fn a_queued_open_keeps_both_grants_and_does_not_activate_until_accepted() {
        let scratch = Scratch::new("queue");
        let alpha = scratch.join("alpha");
        let beta = scratch.join("beta");
        std::fs::create_dir_all(&alpha).unwrap();
        std::fs::create_dir_all(&beta).unwrap();
        let old = alpha.join("old.md");
        let new = beta.join("new.md");
        std::fs::write(&old, "old").unwrap();
        std::fs::write(&new, "new").unwrap();
        let state = LaunchState::new(NativeOpenRequest {
            path: Some(old.to_string_lossy().into_owned()),
        });
        let current = state.current();

        state.queue(NativeOpenRequest {
            path: Some(new.to_string_lossy().into_owned()),
        });

        assert_eq!(state.current(), current);
        assert_eq!(state.project_grants().len(), 2);
        assert_eq!(
            state.pending().and_then(|request| request.relative_path),
            Some("new.md".to_string())
        );
        let accepted = state.accept_pending().unwrap();
        assert_ne!(
            current.project.as_ref().map(|project| &project.id),
            accepted.project.as_ref().map(|project| &project.id),
        );
        assert_eq!(state.current(), accepted);
        assert_eq!(state.accept_pending(), None);
    }

    #[test]
    fn a_missing_parent_becomes_a_recoverable_launch_problem() {
        let scratch = Scratch::new("missing-parent");
        let state = LaunchState::new(NativeOpenRequest {
            path: Some(
                scratch
                    .join("missing/plan.md")
                    .to_string_lossy()
                    .into_owned(),
            ),
        });

        let request = state.current();
        assert!(request.project.is_none());
        assert!(request
            .problem
            .as_deref()
            .is_some_and(|problem| problem.contains("missing")));
    }
}
