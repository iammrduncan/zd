//! Debounced native change signals for one approved project/worktree tree.
//!
//! The webview supplies only opaque grant identities and a lifecycle token. The
//! native grant store resolves the root, while the watcher emits scope identity
//! only—never filesystem paths or raw backend errors.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, DebouncedEvent, Debouncer};
use serde::{Deserialize, Serialize};

const WATCH_DEBOUNCE: Duration = Duration::from_millis(150);
const MAX_WATCH_ID_BYTES: usize = 96;
const WATCH_PROBLEM: &str = "Automatic file-tree updates are unavailable.";
pub const MAX_FILE_TREE_WATCHES: usize = 32;

pub type WatchListener = Arc<dyn Fn(FileTreeWatchSignal) + Send + Sync>;

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct WatchScope {
    project_id: String,
    worktree_id: String,
}

impl From<&FileTreeWatchRequest> for WatchScope {
    fn from(request: &FileTreeWatchRequest) -> Self {
        Self {
            project_id: request.project_id.clone(),
            worktree_id: request.worktree_id.clone(),
        }
    }
}

#[derive(Debug)]
struct ActiveWatch {
    watch_id: String,
    _debouncer: Debouncer<RecommendedWatcher>,
}

pub struct FileTreeWatchState {
    active: Mutex<HashMap<WatchScope, ActiveWatch>>,
    limit: usize,
}

impl Default for FileTreeWatchState {
    fn default() -> Self {
        Self {
            active: Mutex::new(HashMap::new()),
            limit: MAX_FILE_TREE_WATCHES,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FileTreeWatchRequest {
    pub project_id: String,
    pub worktree_id: String,
    pub watch_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum FileTreeWatchSignal {
    Changed {
        project_id: String,
        worktree_id: String,
        watch_id: String,
    },
    Unavailable {
        project_id: String,
        worktree_id: String,
        watch_id: String,
        problem: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileTreeWatchSnapshot {
    pub project_id: String,
    pub worktree_id: String,
    pub watch_id: String,
}

impl FileTreeWatchState {
    #[cfg(test)]
    fn with_limit(limit: usize) -> Self {
        assert!(limit > 0 && limit <= MAX_FILE_TREE_WATCHES);
        Self {
            active: Mutex::new(HashMap::new()),
            limit,
        }
    }

    pub fn start(
        &self,
        root: &Path,
        request: &FileTreeWatchRequest,
        listener: WatchListener,
    ) -> Result<(), String> {
        if !valid_watch_id(&request.watch_id) {
            return Err(WATCH_PROBLEM.to_string());
        }
        let scope = WatchScope::from(request);
        {
            let active = self.active.lock().map_err(|_| WATCH_PROBLEM.to_string())?;
            if !active.contains_key(&scope) && active.len() >= self.limit {
                return Err(WATCH_PROBLEM.to_string());
            }
        }

        let watched_root = std::fs::canonicalize(root).map_err(|_| WATCH_PROBLEM.to_string())?;
        let git_head = git_head_path(&watched_root);
        let callback_root = watched_root.clone();
        let callback_git_head = git_head.clone();
        let callback_request = request.clone();
        let callback_listener = Arc::clone(&listener);
        let mut debouncer =
            new_debouncer(
                WATCH_DEBOUNCE,
                move |result: DebounceEventResult| match result {
                    Ok(events)
                        if has_project_change(
                            &callback_root,
                            callback_git_head.as_deref(),
                            &events,
                        ) =>
                    {
                        callback_listener(changed_signal(&callback_request));
                    }
                    Ok(_) => {}
                    Err(_) => callback_listener(unavailable_signal(&callback_request)),
                },
            )
            .map_err(|_| WATCH_PROBLEM.to_string())?;

        debouncer
            .watcher()
            .watch(&watched_root, RecursiveMode::Recursive)
            .map_err(|_| WATCH_PROBLEM.to_string())?;
        if let Some(head) = git_head.filter(|head| !head.starts_with(&watched_root)) {
            let git_directory = head.parent().unwrap_or(&head);
            debouncer
                .watcher()
                .watch(git_directory, RecursiveMode::NonRecursive)
                .map_err(|_| WATCH_PROBLEM.to_string())?;
        }

        let mut active = self.active.lock().map_err(|_| WATCH_PROBLEM.to_string())?;
        if !active.contains_key(&scope) && active.len() >= self.limit {
            return Err(WATCH_PROBLEM.to_string());
        }
        active.insert(
            scope,
            ActiveWatch {
                watch_id: request.watch_id.clone(),
                _debouncer: debouncer,
            },
        );
        Ok(())
    }

    pub fn stop(&self, request: &FileTreeWatchRequest) {
        let Ok(mut active) = self.active.lock() else {
            return;
        };
        let scope = WatchScope::from(request);
        if active
            .get(&scope)
            .is_some_and(|watch| watch.watch_id == request.watch_id)
        {
            active.remove(&scope);
        }
    }

    pub fn shutdown(&self) {
        if let Ok(mut active) = self.active.lock() {
            active.clear();
        }
    }

    pub fn snapshot(&self) -> Vec<FileTreeWatchSnapshot> {
        let Ok(active) = self.active.lock() else {
            return Vec::new();
        };
        let mut snapshot = active
            .iter()
            .map(|(scope, watch)| FileTreeWatchSnapshot {
                project_id: scope.project_id.clone(),
                worktree_id: scope.worktree_id.clone(),
                watch_id: watch.watch_id.clone(),
            })
            .collect::<Vec<_>>();
        snapshot.sort_by(|left, right| {
            (&left.project_id, &left.worktree_id, &left.watch_id).cmp(&(
                &right.project_id,
                &right.worktree_id,
                &right.watch_id,
            ))
        });
        snapshot
    }

    #[cfg(test)]
    fn active_count(&self) -> usize {
        self.snapshot().len()
    }
}

fn valid_watch_id(watch_id: &str) -> bool {
    !watch_id.is_empty()
        && watch_id.len() <= MAX_WATCH_ID_BYTES
        && watch_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn has_project_change(root: &Path, git_head: Option<&Path>, events: &[DebouncedEvent]) -> bool {
    events
        .iter()
        .any(|event| is_project_path(root, git_head, &event.path))
}

fn is_project_path(root: &Path, git_head: Option<&Path>, path: &Path) -> bool {
    if git_head.is_some_and(|head| path == head) {
        return true;
    }
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    !relative
        .components()
        .any(|component| component.as_os_str() == ".git")
}

fn git_head_path(root: &Path) -> Option<std::path::PathBuf> {
    let dot_git = root.join(".git");
    let head = if dot_git.is_dir() {
        dot_git.join("HEAD")
    } else {
        let pointer = std::fs::read_to_string(dot_git).ok()?;
        let git_dir = pointer.trim().strip_prefix("gitdir:")?.trim();
        let git_dir = Path::new(git_dir);
        let git_dir = if git_dir.is_absolute() {
            git_dir.to_path_buf()
        } else {
            root.join(git_dir)
        };
        git_dir.join("HEAD")
    };
    std::fs::canonicalize(head).ok()
}

fn changed_signal(request: &FileTreeWatchRequest) -> FileTreeWatchSignal {
    FileTreeWatchSignal::Changed {
        project_id: request.project_id.clone(),
        worktree_id: request.worktree_id.clone(),
        watch_id: request.watch_id.clone(),
    }
}

fn unavailable_signal(request: &FileTreeWatchRequest) -> FileTreeWatchSignal {
    FileTreeWatchSignal::Unavailable {
        project_id: request.project_id.clone(),
        worktree_id: request.worktree_id.clone(),
        watch_id: request.watch_id.clone(),
        problem: WATCH_PROBLEM.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::sync::mpsc;
    use std::time::{Instant, SystemTime, UNIX_EPOCH};

    use super::*;

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(name: &str) -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-file-watch-{name}-{stamp}"));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn request(watch_id: &str) -> FileTreeWatchRequest {
        FileTreeWatchRequest {
            project_id: "project-alpha".to_string(),
            worktree_id: "worktree-alpha".to_string(),
            watch_id: watch_id.to_string(),
        }
    }

    fn receive_changed(receiver: &mpsc::Receiver<FileTreeWatchSignal>) -> FileTreeWatchSignal {
        let deadline = Instant::now() + Duration::from_secs(5);
        loop {
            let signal = receiver
                .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                .expect("receive filesystem change before deadline");
            if matches!(signal, FileTreeWatchSignal::Changed { .. }) {
                return signal;
            }
        }
    }

    #[test]
    fn emits_one_path_free_scope_signal_for_a_new_file() {
        let root = TestDirectory::new("created");
        let state = FileTreeWatchState::default();
        let watch = request("watch-one");
        let (sender, receiver) = mpsc::sync_channel(8);
        state
            .start(
                &root.0,
                &watch,
                Arc::new(move |signal| {
                    let _ = sender.send(signal);
                }),
            )
            .expect("start watcher");

        fs::write(root.0.join("second.png"), b"image").expect("write watched file");

        assert_eq!(receive_changed(&receiver), changed_signal(&watch));
        assert_eq!(state.active_count(), 1);
        state.stop(&watch);
        assert_eq!(state.active_count(), 0);
    }

    #[test]
    fn stale_stop_cannot_remove_the_replacement_watch() {
        let root = TestDirectory::new("replace");
        let state = FileTreeWatchState::default();
        let first = request("watch-first");
        let second = request("watch-second");
        let (sender, receiver) = mpsc::sync_channel(8);
        state
            .start(&root.0, &first, Arc::new(|_| {}))
            .expect("start first watcher");
        state
            .start(
                &root.0,
                &second,
                Arc::new(move |signal| {
                    let _ = sender.send(signal);
                }),
            )
            .expect("replace watcher");

        state.stop(&first);
        fs::write(root.0.join("new.md"), b"new").expect("write watched file");

        assert_eq!(receive_changed(&receiver), changed_signal(&second));
        assert_eq!(state.active_count(), 1);
        state.shutdown();
        assert_eq!(state.active_count(), 0);
    }

    #[test]
    fn watcher_limit_allows_replacement_but_refuses_another_scope() {
        let root = TestDirectory::new("watcher-limit");
        let state = FileTreeWatchState::with_limit(1);
        let first = request("watch-first");
        let replacement = request("watch-replacement");
        let mut another_scope = request("watch-other");
        another_scope.worktree_id = "worktree-other".to_string();

        state
            .start(&root.0, &first, Arc::new(|_| {}))
            .expect("start first watcher");
        state
            .start(&root.0, &replacement, Arc::new(|_| {}))
            .expect("replace the same watcher scope at the limit");

        assert_eq!(
            state.start(&root.0, &another_scope, Arc::new(|_| {})),
            Err(WATCH_PROBLEM.to_string())
        );
        assert_eq!(state.snapshot().len(), 1);
        assert_eq!(state.snapshot()[0].watch_id, "watch-replacement");
    }

    #[test]
    fn emits_a_scope_signal_when_git_head_changes() {
        let root = TestDirectory::new("git-head");
        fs::create_dir(root.0.join(".git")).expect("create Git metadata");
        fs::write(root.0.join(".git/HEAD"), b"ref: refs/heads/main\n").expect("write Git HEAD");
        let state = FileTreeWatchState::default();
        let watch = request("watch-git-head");
        let (sender, receiver) = mpsc::sync_channel(8);
        state
            .start(
                &root.0,
                &watch,
                Arc::new(move |signal| {
                    let _ = sender.send(signal);
                }),
            )
            .expect("start watcher");

        fs::write(root.0.join(".git/HEAD"), b"ref: refs/heads/feature/live\n")
            .expect("switch branch");

        assert_eq!(receive_changed(&receiver), changed_signal(&watch));
    }

    #[test]
    fn resolves_linked_worktree_head_outside_the_approved_root() {
        let root = TestDirectory::new("linked-root");
        let metadata = TestDirectory::new("linked-metadata");
        fs::write(
            root.0.join(".git"),
            format!("gitdir: {}\n", metadata.0.display()),
        )
        .expect("write linked-worktree pointer");
        fs::write(metadata.0.join("HEAD"), b"ref: refs/heads/main\n").expect("write linked HEAD");

        assert_eq!(
            git_head_path(&root.0),
            Some(
                metadata
                    .0
                    .join("HEAD")
                    .canonicalize()
                    .expect("canonical HEAD")
            )
        );
    }

    #[test]
    fn ignores_internal_git_paths_and_rejects_widened_requests() {
        let root = PathBuf::from("/approved/project");
        let head = root.join(".git/HEAD");
        assert!(is_project_path(
            &root,
            Some(&head),
            &root.join("docs/new.md")
        ));
        assert!(is_project_path(&root, Some(&head), &head));
        assert!(!is_project_path(
            &root,
            Some(&head),
            &root.join(".git/index")
        ));
        assert!(!is_project_path(
            &root,
            Some(&head),
            Path::new("/other/project/new.md")
        ));
        assert!(!valid_watch_id(""));
        assert!(!valid_watch_id("watch/one"));
        assert!(valid_watch_id("file-tree-watch_42"));

        let widened = serde_json::json!({
            "projectId": "project-alpha",
            "worktreeId": "worktree-alpha",
            "watchId": "watch-one",
            "path": "/unapproved"
        });
        assert!(serde_json::from_value::<FileTreeWatchRequest>(widened).is_err());
    }
}
