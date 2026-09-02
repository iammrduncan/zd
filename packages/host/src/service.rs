use std::collections::HashSet;
use std::fmt;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::durable::DurableStateStore;
use crate::file_tree_watch::{
    FileTreeWatchRequest, FileTreeWatchSnapshot, FileTreeWatchState, WatchListener,
};
use crate::instrumentation::{
    DiagnosticRecordInput, DiagnosticState, DiagnosticStatus, DiagnosticWriteOutcome,
};
use crate::project_picker::ProjectPickerState;
use crate::terminal::{
    TerminalError, TerminalErrorKind, TerminalExitSignal, TerminalExitStatus, TerminalMode,
    TerminalOutputBatch, TerminalOutputSignal, TerminalRuntime, TerminalScope,
    TerminalSessionHandle, TerminalSessionSnapshot, TerminalStartRequest, TerminalViewport,
};
use crate::{durable, identity};
use crate::{
    file_stamp_at, mutate_file_tree_at, read_bounded_file_at, read_project_image_at,
    read_text_file_at, save_clipboard_image_at, snapshot_in, workspace_files_in,
    write_text_file_at, BoundedFileRead, ClipboardImageRequest, CreateThreadWorktreeRequest,
    CreateThreadWorktreeResult, FileStamp, FileTreeMutationRequest, FileTreeMutationResult,
    FileTreeRequest, FileTreeResult, GitAuthority, GitCompareRequest, GitComparison, GitDiff,
    GitDiffRequest, GitHistoryPage, GitHistoryRequest, GitScope, GitStatusSnapshot, GrantStore,
    ProjectGrant, ProjectImage, ResourceRef, SavedClipboardImage, ThemeConfigFile, TreeLimits,
    WorkspaceListing, WorktreeAuthority, WorktreeGrant,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HostLaunchRequest {
    pub project: Option<ProjectGrant>,
    pub worktree_id: Option<String>,
    pub relative_path: Option<String>,
    pub problem: Option<String>,
}

#[derive(Debug)]
struct HostState {
    launch: HostLaunchRequest,
    grants: GrantStore,
}

/// One authority owner for an approved workbench session.
pub struct HostService {
    state: Mutex<HostState>,
    project_picker: Mutex<ProjectPickerState>,
    file_tree_watches: FileTreeWatchState,
    terminals: TerminalRuntime,
    durable: Option<DurableStateStore>,
    diagnostics: Option<DiagnosticState>,
    state_directory: Option<PathBuf>,
}

impl fmt::Debug for HostService {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("HostService")
            .field("durable", &self.durable.is_some())
            .field("diagnostics", &self.diagnostics.is_some())
            .finish_non_exhaustive()
    }
}

impl HostService {
    pub fn open_desktop_with_state(
        requested: Option<&Path>,
        state_directory: &Path,
    ) -> Result<Self, String> {
        Self::open_desktop(requested, state_directory, TerminalMode::Local)
    }

    pub fn open_desktop_with_terminal_keeper(
        requested: Option<&Path>,
        state_directory: &Path,
    ) -> Result<Self, String> {
        Self::open_desktop(requested, state_directory, TerminalMode::Keeper)
    }

    fn open_desktop(
        requested: Option<&Path>,
        state_directory: &Path,
        terminal_mode: TerminalMode,
    ) -> Result<Self, String> {
        let Some(requested) = requested else {
            return Self::open_desktop_home(state_directory, terminal_mode);
        };
        if requested.is_dir() {
            return Self::open_project_with_mode(requested, state_directory, terminal_mode);
        }
        let parent = requested
            .parent()
            .filter(|path| !path.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."));
        let relative_path = requested
            .file_name()
            .ok_or_else(|| "the desktop launch path has no file name".to_string())?
            .to_string_lossy()
            .into_owned();
        let host = Self::open_project_with_mode(parent, state_directory, terminal_mode)?;
        host.state
            .lock()
            .map_err(|_| "desktop launch authority is unavailable".to_string())?
            .launch
            .relative_path = Some(relative_path);
        Ok(host)
    }

    fn open_desktop_home(
        state_directory: &Path,
        terminal_mode: TerminalMode,
    ) -> Result<Self, String> {
        let diagnostics = DiagnosticState::new(
            state_directory.join("diagnostics"),
            env!("CARGO_PKG_VERSION"),
        )?;
        Ok(Self {
            state: Mutex::new(HostState {
                launch: HostLaunchRequest {
                    project: None,
                    worktree_id: None,
                    relative_path: None,
                    problem: None,
                },
                grants: GrantStore::default(),
            }),
            project_picker: Mutex::new(ProjectPickerState::default()),
            file_tree_watches: FileTreeWatchState::default(),
            terminals: TerminalRuntime::open(terminal_mode, state_directory)?,
            durable: None,
            diagnostics: Some(diagnostics),
            state_directory: Some(state_directory.to_path_buf()),
        })
    }

    pub fn open_project(root: &Path) -> Result<Self, String> {
        let mut grants = GrantStore::default();
        let approved = grants.approve_project(root)?;
        let launch = HostLaunchRequest {
            project: Some(approved.project),
            worktree_id: Some(approved.worktree_id),
            relative_path: None,
            problem: None,
        };
        Ok(Self {
            state: Mutex::new(HostState { launch, grants }),
            project_picker: Mutex::new(ProjectPickerState::default()),
            file_tree_watches: FileTreeWatchState::default(),
            terminals: TerminalRuntime::local(),
            durable: None,
            diagnostics: None,
            state_directory: None,
        })
    }

    pub fn open_project_with_state(root: &Path, state_directory: &Path) -> Result<Self, String> {
        Self::open_project_with_mode(root, state_directory, TerminalMode::Local)
    }

    pub fn open_project_with_terminal_keeper(
        root: &Path,
        state_directory: &Path,
    ) -> Result<Self, String> {
        Self::open_project_with_mode(root, state_directory, TerminalMode::Keeper)
    }

    fn open_project_with_mode(
        root: &Path,
        state_directory: &Path,
        terminal_mode: TerminalMode,
    ) -> Result<Self, String> {
        let identity = identity::open_project(root, state_directory)?;
        Self::open_project_with_identity(root, identity, state_directory, terminal_mode)
    }

    pub fn recover_project_with_state(
        project_id: &str,
        root: &Path,
        state_directory: &Path,
    ) -> Result<Self, String> {
        let identity = identity::recover_project(project_id, root, state_directory)?;
        Self::open_project_with_identity(root, identity, state_directory, TerminalMode::Local)
    }

    fn open_project_with_identity(
        root: &Path,
        identity: identity::ProjectIdentity,
        state_directory: &Path,
        terminal_mode: TerminalMode,
    ) -> Result<Self, String> {
        let durable = DurableStateStore::new(state_directory, identity.project_id.clone())?;
        let diagnostics = DiagnosticState::new(
            state_directory.join("diagnostics"),
            env!("CARGO_PKG_VERSION"),
        )?;
        let mut grants = GrantStore::default();
        let approved = grants.approve_project_with_identity(
            root,
            identity.project_id,
            identity.root_worktree_id,
        )?;
        let launch = HostLaunchRequest {
            project: Some(approved.project),
            worktree_id: Some(approved.worktree_id),
            relative_path: None,
            problem: None,
        };
        Ok(Self {
            state: Mutex::new(HostState { launch, grants }),
            project_picker: Mutex::new(ProjectPickerState::default()),
            file_tree_watches: FileTreeWatchState::default(),
            terminals: TerminalRuntime::open(terminal_mode, state_directory)?,
            durable: Some(durable),
            diagnostics: Some(diagnostics),
            state_directory: Some(state_directory.to_path_buf()),
        })
    }

    pub fn launch_request(&self) -> HostLaunchRequest {
        self.state
            .lock()
            .expect("host state was poisoned")
            .launch
            .clone()
    }

    pub fn project_grants(&self) -> Vec<ProjectGrant> {
        self.state
            .lock()
            .expect("host state was poisoned")
            .grants
            .projects()
    }

    pub fn approve_trusted_project(&self, root: &Path) -> Result<ProjectGrant, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "project approval is unavailable".to_string())?;
        let approved = match self.state_directory.as_deref() {
            Some(state_directory) => state
                .grants
                .approve_project_with_state(root, state_directory),
            None => state.grants.approve_project(root),
        }?;
        Ok(approved.project)
    }

    pub fn start_project_picker(&self) -> Result<crate::ProjectPickerSnapshot, String> {
        let starting_directory = {
            let state = self
                .state
                .lock()
                .map_err(|_| "The remote project browser is unavailable.".to_string())?;
            state
                .launch
                .project
                .as_ref()
                .and_then(|project| state.grants.project_root(&project.id).ok())
                .and_then(|root| root.parent().map(Path::to_path_buf).or(Some(root)))
        }
        .map(Ok)
        .unwrap_or_else(std::env::current_dir)
        .map_err(|_| "The remote project browser has no starting folder.".to_string())?;
        self.project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .start(&starting_directory)
    }

    pub fn open_project_picker(
        &self,
        request: &crate::ProjectPickerDirectoryRequest,
    ) -> Result<crate::ProjectPickerSnapshot, String> {
        self.project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .open(request)
    }

    pub fn search_project_picker(
        &self,
        request: &crate::ProjectPickerSearchRequest,
    ) -> Result<crate::ProjectPickerSnapshot, String> {
        self.project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .search(request)
    }

    pub fn choose_project_picker(
        &self,
        request: &crate::ProjectPickerDirectoryRequest,
    ) -> Result<ProjectGrant, String> {
        let root = self
            .project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .resolve(request)?;
        let grant = self.approve_trusted_project(&root)?;
        self.project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .finish(&request.session_id);
        Ok(grant)
    }

    pub fn cancel_project_picker(
        &self,
        request: &crate::ProjectPickerCancelRequest,
    ) -> Result<(), String> {
        self.project_picker
            .lock()
            .map_err(|_| "The remote project browser is unavailable.".to_string())?
            .cancel(request)
    }

    pub fn remove_project_grant(&self, project_id: &str) -> Result<ProjectGrant, String> {
        if self
            .durable
            .as_ref()
            .is_some_and(|durable| durable.project_id() == project_id)
        {
            return Err(
                "The startup project cannot be closed while this host is running.".to_string(),
            );
        }
        self.state
            .lock()
            .map_err(|_| "Project removal is unavailable.".to_string())?
            .grants
            .remove_project(project_id)
    }

    pub fn recover_trusted_project(
        &self,
        project_id: &str,
        root: &Path,
    ) -> Result<ProjectGrant, String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "desktop project recovery is unavailable".to_string())?;
        match self.state_directory.as_deref() {
            Some(state_directory) => {
                state
                    .grants
                    .recover_project_with_state(project_id, root, state_directory)
            }
            None => state.grants.recover_project(project_id, root),
        }
    }

    pub fn approve_trusted_open(&self, requested: &Path) -> Result<HostLaunchRequest, String> {
        let (root, relative_path) = if requested.is_dir() {
            (requested, None)
        } else {
            let parent = requested
                .parent()
                .filter(|path| !path.as_os_str().is_empty())
                .ok_or_else(|| "the trusted desktop path has no parent".to_string())?;
            let file_name = requested
                .file_name()
                .ok_or_else(|| "the trusted desktop path has no file name".to_string())?
                .to_string_lossy()
                .into_owned();
            (parent, Some(file_name))
        };
        let project = self.approve_trusted_project(root)?;
        let worktree_id = project
            .worktrees
            .first()
            .map(|worktree| worktree.id.clone());
        Ok(HostLaunchRequest {
            project: Some(project),
            worktree_id,
            relative_path,
            problem: None,
        })
    }

    pub fn start_file_tree_watch(
        &self,
        request: &FileTreeWatchRequest,
        listener: WatchListener,
    ) -> Result<(), String> {
        let root = self
            .state
            .lock()
            .map_err(|_| "File-tree watch authority is unavailable".to_string())?
            .grants
            .root(&request.project_id, &request.worktree_id)
            .map_err(|_| "File-tree watch authority is unavailable".to_string())?;
        self.file_tree_watches.start(&root, request, listener)
    }

    pub fn stop_file_tree_watch(&self, request: &FileTreeWatchRequest) {
        self.file_tree_watches.stop(request);
    }

    pub fn file_tree_watch_snapshot(&self) -> Vec<FileTreeWatchSnapshot> {
        self.file_tree_watches.snapshot()
    }

    pub fn start_terminal(
        &self,
        request: TerminalStartRequest,
        output_signal: Option<TerminalOutputSignal>,
        exit_signal: Option<TerminalExitSignal>,
    ) -> Result<TerminalSessionHandle, TerminalError> {
        let root = self
            .state
            .lock()
            .map_err(|_| terminal_runtime_unavailable())?
            .grants
            .root(&request.project_id, &request.worktree_id)
            .map_err(|_| {
                TerminalError::new(
                    TerminalErrorKind::InvalidScope,
                    "Terminal scope is unavailable",
                )
            })?;
        let scope =
            TerminalScope::from_approved_worktree(request.project_id, request.worktree_id, root)?;
        self.terminals.start(
            scope,
            request.terminal_id,
            request.viewport,
            output_signal,
            exit_signal,
        )
    }

    pub fn reattach_terminal(
        &self,
        request: TerminalStartRequest,
    ) -> Result<Option<TerminalSessionHandle>, TerminalError> {
        let root = self
            .state
            .lock()
            .map_err(|_| terminal_runtime_unavailable())?
            .grants
            .root(&request.project_id, &request.worktree_id)
            .map_err(|_| {
                TerminalError::new(
                    TerminalErrorKind::InvalidScope,
                    "Terminal scope is unavailable",
                )
            })?;
        let scope =
            TerminalScope::from_approved_worktree(request.project_id, request.worktree_id, root)?;
        self.terminals
            .reattach(&scope, &request.terminal_id, request.viewport)
    }

    pub fn write_terminal(
        &self,
        session: &TerminalSessionHandle,
        bytes: &[u8],
    ) -> Result<(), TerminalError> {
        self.terminals.write(session, bytes)
    }

    pub fn resize_terminal(
        &self,
        session: &TerminalSessionHandle,
        viewport: TerminalViewport,
    ) -> Result<(), TerminalError> {
        self.terminals.resize(session, viewport)
    }

    pub fn read_terminal(
        &self,
        session: &TerminalSessionHandle,
        after_offset: Option<u64>,
    ) -> Result<TerminalOutputBatch, TerminalError> {
        self.terminals.read_from(session, after_offset)
    }

    pub fn poll_terminal_exit(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<Option<TerminalExitStatus>, TerminalError> {
        self.terminals.poll_exit(session)
    }

    pub fn terminate_terminal(
        &self,
        session: &TerminalSessionHandle,
    ) -> Result<TerminalExitStatus, TerminalError> {
        self.terminals.terminate(session)
    }

    pub fn dispose_terminal(&self, session: &TerminalSessionHandle) -> Result<(), TerminalError> {
        self.terminals.dispose(session)
    }

    pub fn terminal_snapshot(&self) -> Result<Vec<TerminalSessionSnapshot>, TerminalError> {
        self.terminals.snapshot()
    }

    pub fn terminal_runtime_is_external(&self) -> bool {
        self.terminals.is_external()
    }

    pub fn shutdown_runtime(&self) -> Result<(), TerminalError> {
        self.file_tree_watches.shutdown();
        Ok(())
    }

    pub fn file_tree_snapshot(&self, request: &FileTreeRequest) -> FileTreeResult {
        let root = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .root(&request.project_id, &request.worktree_id);
        let root = match root {
            Ok(root) => root,
            Err(_) => {
                return FileTreeResult::Unavailable {
                    project_id: request.project_id.clone(),
                    worktree_id: request.worktree_id.clone(),
                    problem: "File-tree authority is unavailable".to_string(),
                };
            }
        };
        snapshot_in(&root, request, TreeLimits::default())
    }

    pub fn read_bounded_file(&self, resource: &ResourceRef) -> BoundedFileRead {
        let path = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .resolve(resource);
        match path {
            Ok(path) => read_bounded_file_at(&path),
            Err(_) => BoundedFileRead::Unavailable {
                problem: "File authority is unavailable".to_string(),
            },
        }
    }

    pub fn read_text_file(&self, resource: &ResourceRef) -> Result<String, String> {
        let path = self.resolve_resource(resource)?;
        read_text_file_at(&path)
    }

    pub fn write_text_file(&self, resource: &ResourceRef, contents: &str) -> Result<(), String> {
        let path = self.resolve_resource(resource)?;
        write_text_file_at(&path, contents)
    }

    pub fn file_stamp(&self, resource: &ResourceRef) -> Result<Option<FileStamp>, String> {
        let path = self.resolve_resource(resource)?;
        file_stamp_at(&path)
    }

    pub fn read_project_image(&self, resource: &ResourceRef) -> Result<ProjectImage, String> {
        let path = self.resolve_resource(resource)?;
        read_project_image_at(&path)
    }

    pub fn workspace_files(
        &self,
        project_id: &str,
        worktree_id: &str,
    ) -> Result<WorkspaceListing, String> {
        let root = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .root(project_id, worktree_id)
            .map_err(|_| "Workspace file authority is unavailable".to_string())?;
        workspace_files_in(&root, project_id, worktree_id)
    }

    pub fn mutate_file_tree(&self, request: FileTreeMutationRequest) -> FileTreeMutationResult {
        let (project_id, worktree_id) = request.scope();
        let root = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .root(project_id, worktree_id);
        match root {
            Ok(root) => mutate_file_tree_at(&root, request),
            Err(_) => FileTreeMutationResult::Refused {
                reason: "File authority is unavailable.".to_string(),
            },
        }
    }

    pub fn save_clipboard_image(
        &self,
        request: &ClipboardImageRequest,
    ) -> Result<SavedClipboardImage, String> {
        let root = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .root(&request.project_id, &request.worktree_id)
            .map_err(|_| "Clipboard image authority is unavailable".to_string())?;
        save_clipboard_image_at(&root, request)
    }

    pub fn git_status(&self, scope: GitScope) -> GitStatusSnapshot {
        crate::status_for(self, scope)
    }

    pub fn git_history(&self, request: GitHistoryRequest) -> GitHistoryPage {
        crate::history_for(self, request)
    }

    pub fn git_compare(&self, request: GitCompareRequest) -> GitComparison {
        crate::compare_for(self, request)
    }

    pub fn git_diff(&self, request: GitDiffRequest) -> GitDiff {
        crate::diff_for(self, request)
    }

    pub fn create_thread_worktree(
        &self,
        request: CreateThreadWorktreeRequest,
    ) -> CreateThreadWorktreeResult {
        crate::create_worktree_for(self, request)
    }

    pub fn theme_config_files(&self) -> Result<Vec<ThemeConfigFile>, String> {
        let directory = self.state_directory.as_deref().ok_or_else(|| {
            "theme discovery is unavailable: configuration was not provided".to_string()
        })?;
        crate::theme_files_in(directory)
    }

    pub fn diagnostics_status(&self) -> Result<DiagnosticStatus, String> {
        Ok(self.diagnostics()?.status())
    }

    pub fn enable_diagnostics(&self) -> Result<DiagnosticStatus, String> {
        Ok(self.diagnostics()?.enable())
    }

    pub fn disable_diagnostics(&self) -> Result<DiagnosticStatus, String> {
        Ok(self.diagnostics()?.shutdown())
    }

    pub fn record_diagnostic(
        &self,
        record: DiagnosticRecordInput,
    ) -> Result<DiagnosticWriteOutcome, String> {
        Ok(self.diagnostics()?.record(record))
    }

    fn resolve_resource(&self, resource: &ResourceRef) -> Result<std::path::PathBuf, String> {
        self.state
            .lock()
            .expect("host state was poisoned")
            .grants
            .resolve(resource)
            .map_err(|_| "File authority is unavailable".to_string())
    }

    pub fn describe_durable_state(&self) -> Result<durable::DurableStateBundle, String> {
        let (durable, worktree_ids) = self.durable_scope()?;
        durable.describe(&worktree_ids)
    }

    pub fn apply_durable_state(
        &self,
        request: &durable::DurableStateApply,
    ) -> Result<durable::DurableStateApplyResult, String> {
        let (durable, worktree_ids) = self.durable_scope()?;
        durable.apply(&worktree_ids, request)
    }

    fn durable_scope(&self) -> Result<(&DurableStateStore, HashSet<String>), String> {
        let durable = self.durable.as_ref().ok_or_else(|| {
            "durable state is unavailable: persistence was not configured".to_string()
        })?;
        let worktree_ids = self
            .state
            .lock()
            .expect("host state was poisoned")
            .grants
            .worktree_ids(durable.project_id())?
            .into_iter()
            .collect();
        Ok((durable, worktree_ids))
    }

    fn diagnostics(&self) -> Result<&DiagnosticState, String> {
        self.diagnostics.as_ref().ok_or_else(|| {
            "host diagnostics are unavailable: persistence was not configured".to_string()
        })
    }
}

fn terminal_runtime_unavailable() -> TerminalError {
    TerminalError::new(
        TerminalErrorKind::Io,
        "Terminal session state is unavailable",
    )
}

impl GitAuthority for HostService {
    fn git_root(&self, project_id: &str, worktree_id: &str) -> Result<std::path::PathBuf, String> {
        self.state
            .lock()
            .expect("host state was poisoned")
            .grants
            .root(project_id, worktree_id)
    }

    fn git_resource(&self, resource: &ResourceRef) -> Result<std::path::PathBuf, String> {
        self.state
            .lock()
            .expect("host state was poisoned")
            .grants
            .resolve(resource)
    }
}

impl WorktreeAuthority for HostService {
    fn worktree_project_root(&self, project_id: &str) -> Result<PathBuf, String> {
        self.state
            .lock()
            .expect("host state was poisoned")
            .grants
            .project_root(project_id)
    }

    fn approve_created_worktree(
        &self,
        project_id: &str,
        root: &Path,
    ) -> Result<WorktreeGrant, String> {
        let mut state = self.state.lock().expect("host state was poisoned");
        match self.state_directory.as_deref() {
            Some(state_directory) => {
                state
                    .grants
                    .approve_worktree_with_state(project_id, root, state_directory)
            }
            None => state.grants.approve_worktree(project_id, root),
        }
    }
}
