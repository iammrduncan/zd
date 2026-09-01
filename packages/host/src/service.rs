use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;

use crate::durable::DurableStateStore;
use crate::instrumentation::{
    DiagnosticRecordInput, DiagnosticState, DiagnosticStatus, DiagnosticWriteOutcome,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
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
#[derive(Debug)]
pub struct HostService {
    state: Mutex<HostState>,
    durable: Option<DurableStateStore>,
    diagnostics: Option<DiagnosticState>,
    state_directory: Option<PathBuf>,
}

impl HostService {
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
            durable: None,
            diagnostics: None,
            state_directory: None,
        })
    }

    pub fn open_project_with_state(root: &Path, state_directory: &Path) -> Result<Self, String> {
        let identity = identity::open_project(root, state_directory)?;
        Self::open_project_with_identity(root, identity, state_directory)
    }

    pub fn recover_project_with_state(
        project_id: &str,
        root: &Path,
        state_directory: &Path,
    ) -> Result<Self, String> {
        let identity = identity::recover_project(project_id, root, state_directory)?;
        Self::open_project_with_identity(root, identity, state_directory)
    }

    fn open_project_with_identity(
        root: &Path,
        identity: identity::ProjectIdentity,
        state_directory: &Path,
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
