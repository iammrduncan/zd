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
use tauri::Emitter;

use crate::cli::LaunchState;

const WATCH_EVENT: &str = "file-tree-watch";
const WATCH_DEBOUNCE: Duration = Duration::from_millis(150);
const MAX_WATCH_ID_BYTES: usize = 96;
const WATCH_PROBLEM: &str = "Automatic file-tree updates are unavailable.";

type WatchListener = Arc<dyn Fn(FileTreeWatchSignal) + Send + Sync>;

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

#[derive(Default)]
pub struct FileTreeWatchState {
    active: Mutex<HashMap<WatchScope, ActiveWatch>>,
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
enum FileTreeWatchSignal {
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

impl FileTreeWatchState {
    fn start(
        &self,
        root: &Path,
        request: &FileTreeWatchRequest,
        listener: WatchListener,
    ) -> Result<(), String> {
        if !valid_watch_id(&request.watch_id) {
            return Err(WATCH_PROBLEM.to_string());
        }

        let watched_root = std::fs::canonicalize(root).map_err(|_| WATCH_PROBLEM.to_string())?;
        let callback_root = watched_root.clone();
        let callback_request = request.clone();
        let callback_listener = Arc::clone(&listener);
        let mut debouncer =
            new_debouncer(
                WATCH_DEBOUNCE,
                move |result: DebounceEventResult| match result {
                    Ok(events) if has_project_change(&callback_root, &events) => {
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

        let mut active = self.active.lock().map_err(|_| WATCH_PROBLEM.to_string())?;
        active.insert(
            WatchScope::from(request),
            ActiveWatch {
                watch_id: request.watch_id.clone(),
                _debouncer: debouncer,
            },
        );
        Ok(())
    }

    fn stop(&self, request: &FileTreeWatchRequest) {
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

    #[cfg(test)]
    fn active_count(&self) -> usize {
        self.active.lock().map_or(0, |active| active.len())
    }
}

#[tauri::command]
pub fn start_file_tree_watch(
    app: tauri::AppHandle,
    launch: tauri::State<'_, LaunchState>,
    watches: tauri::State<'_, FileTreeWatchState>,
    request: FileTreeWatchRequest,
) -> Result<(), String> {
    let root = launch
        .root(&request.project_id, &request.worktree_id)
        .map_err(|_| WATCH_PROBLEM.to_string())?;
    let app_handle = app.clone();
    watches.start(
        &root,
        &request,
        Arc::new(move |signal| {
            let _ = app_handle.emit(WATCH_EVENT, signal);
        }),
    )
}

#[tauri::command]
pub fn stop_file_tree_watch(
    watches: tauri::State<'_, FileTreeWatchState>,
    request: FileTreeWatchRequest,
) {
    watches.stop(&request);
}

fn valid_watch_id(watch_id: &str) -> bool {
    !watch_id.is_empty()
        && watch_id.len() <= MAX_WATCH_ID_BYTES
        && watch_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

fn has_project_change(root: &Path, events: &[DebouncedEvent]) -> bool {
    events
        .iter()
        .any(|event| is_project_path(root, &event.path))
}

fn is_project_path(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    !relative
        .components()
        .any(|component| component.as_os_str() == ".git")
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
    fn ignores_internal_git_paths_and_rejects_widened_requests() {
        let root = PathBuf::from("/approved/project");
        assert!(is_project_path(&root, &root.join("docs/new.md")));
        assert!(!is_project_path(&root, &root.join(".git/index")));
        assert!(!is_project_path(&root, Path::new("/other/project/new.md")));
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
