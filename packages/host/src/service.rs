use std::path::Path;
use std::sync::Mutex;

use serde::Serialize;

use crate::{
    read_bounded_file_at, snapshot_in, BoundedFileRead, FileTreeRequest, FileTreeResult,
    GrantStore, ProjectGrant, ResourceRef, TreeLimits,
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
pub struct HostService(Mutex<HostState>);

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
        Ok(Self(Mutex::new(HostState { launch, grants })))
    }

    pub fn launch_request(&self) -> HostLaunchRequest {
        self.0
            .lock()
            .expect("host state was poisoned")
            .launch
            .clone()
    }

    pub fn project_grants(&self) -> Vec<ProjectGrant> {
        self.0
            .lock()
            .expect("host state was poisoned")
            .grants
            .projects()
    }

    pub fn file_tree_snapshot(&self, request: &FileTreeRequest) -> FileTreeResult {
        let root = self
            .0
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
            .0
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
}
