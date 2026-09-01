use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;

use crate::durable::DurableStateStore;
use crate::{durable, identity};
use crate::{
    file_stamp_at, read_bounded_file_at, read_project_image_at, read_text_file_at, snapshot_in,
    workspace_files_in, write_text_file_at, BoundedFileRead, FileStamp, FileTreeRequest,
    FileTreeResult, GrantStore, ProjectGrant, ProjectImage, ResourceRef, TreeLimits,
    WorkspaceListing,
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
}
