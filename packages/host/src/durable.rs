//! Closed, revisioned persistence for recovery-critical workbench state.

mod storage;

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableStateRevision {
    pub preferences: u64,
    pub project: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DurableStateBundle {
    pub revision: DurableStateRevision,
    pub preferences: Option<Value>,
    pub workbench: Option<Value>,
    pub drafts: Vec<DurableFileDraft>,
    pub review_ledgers: Vec<DurableReviewLedger>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableFileDraft {
    pub schema_version: u16,
    pub project_id: String,
    pub worktree_id: String,
    pub relative_path: String,
    pub text: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableReviewComment {
    pub id: String,
    pub relative: String,
    pub start_line: u64,
    pub end_line: u64,
    pub selected: String,
    pub comment: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableReviewLedger {
    pub schema_version: u16,
    pub project_id: String,
    pub worktree_id: String,
    pub comments: Vec<DurableReviewComment>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DurableStateApply {
    pub expected_revision: DurableStateRevision,
    pub mutation: DurableStateMutation,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum DurableStateMutation {
    ReplacePreferences {
        record: Value,
    },
    ReplaceWorkbench {
        record: Value,
    },
    PutDraft {
        draft: DurableFileDraft,
    },
    RemoveDraft {
        project_id: String,
        worktree_id: String,
        relative_path: String,
    },
    ReplaceReviewLedger {
        ledger: DurableReviewLedger,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum DurableStateApplyResult {
    Applied {
        revision: DurableStateRevision,
    },
    ReloadRequired {
        current_revision: DurableStateRevision,
    },
}

#[derive(Debug, Clone, Default)]
pub(crate) struct DurableStateScope {
    active_worktrees_by_project: HashMap<String, HashSet<String>>,
    remembered_worktrees_by_project: HashMap<String, HashSet<String>>,
}

impl DurableStateScope {
    pub(crate) fn from_projects(projects: &[crate::ProjectGrant]) -> Self {
        Self::from_scopes(projects.iter().flat_map(|project| {
            project
                .worktrees
                .iter()
                .map(|worktree| (project.id.clone(), worktree.id.clone()))
        }))
    }

    pub(crate) fn from_scopes(scopes: impl IntoIterator<Item = (String, String)>) -> Self {
        let mut result = Self::default();
        for (project_id, worktree_id) in scopes {
            result.remember_active(project_id, worktree_id);
        }
        result
    }

    pub(crate) fn remember_scopes(&mut self, scopes: impl IntoIterator<Item = (String, String)>) {
        for (project_id, worktree_id) in scopes {
            self.remembered_worktrees_by_project
                .entry(project_id)
                .or_default()
                .insert(worktree_id);
        }
    }

    pub(crate) fn allows(&self, project_id: &str, worktree_id: &str) -> bool {
        self.active_worktrees_by_project
            .get(project_id)
            .is_some_and(|worktrees| worktrees.contains(worktree_id))
    }

    pub(crate) fn remembers(&self, project_id: &str, worktree_id: &str) -> bool {
        self.remembered_worktrees_by_project
            .get(project_id)
            .is_some_and(|worktrees| worktrees.contains(worktree_id))
    }

    fn remember_active(&mut self, project_id: String, worktree_id: String) {
        self.active_worktrees_by_project
            .entry(project_id.clone())
            .or_default()
            .insert(worktree_id.clone());
        self.remembered_worktrees_by_project
            .entry(project_id)
            .or_default()
            .insert(worktree_id);
    }
}

/// A trusted, project-scoped view of durable state for native shell wrappers.
#[derive(Debug)]
pub struct DurableStateSession {
    store: DurableStateStore,
    scope: DurableStateScope,
}

impl DurableStateSession {
    pub fn new(state_directory: &Path, project: &crate::ProjectGrant) -> Result<Self, String> {
        let store = DurableStateStore::new(state_directory, project.id.clone())?;
        let scope = DurableStateScope::from_projects(std::slice::from_ref(project));
        Ok(Self { store, scope })
    }

    pub fn describe(&self) -> Result<DurableStateBundle, String> {
        self.store.describe(&self.scope)
    }

    pub fn apply(&self, request: &DurableStateApply) -> Result<DurableStateApplyResult, String> {
        self.store.apply(&self.scope, request)
    }
}

#[derive(Debug)]
pub(crate) struct DurableStateStore {
    state_directory: PathBuf,
    project_id: String,
}

impl DurableStateStore {
    pub(crate) fn new(state_directory: &Path, project_id: String) -> Result<Self, String> {
        storage::validate_project_id(&project_id)?;
        Ok(Self {
            state_directory: state_directory.to_path_buf(),
            project_id,
        })
    }

    pub(crate) fn project_id(&self) -> &str {
        &self.project_id
    }

    pub(crate) fn describe(&self, scope: &DurableStateScope) -> Result<DurableStateBundle, String> {
        storage::describe(&self.state_directory, &self.project_id, scope)
    }

    pub(crate) fn apply(
        &self,
        scope: &DurableStateScope,
        request: &DurableStateApply,
    ) -> Result<DurableStateApplyResult, String> {
        storage::apply(&self.state_directory, &self.project_id, scope, request)
    }
}
