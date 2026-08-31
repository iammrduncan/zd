//! Closed, revisioned persistence for recovery-critical workbench state.

mod storage;

use std::collections::HashSet;
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

    pub(crate) fn describe(
        &self,
        allowed_worktree_ids: &HashSet<String>,
    ) -> Result<DurableStateBundle, String> {
        storage::describe(
            &self.state_directory,
            &self.project_id,
            allowed_worktree_ids,
        )
    }

    pub(crate) fn apply(
        &self,
        allowed_worktree_ids: &HashSet<String>,
        request: &DurableStateApply,
    ) -> Result<DurableStateApplyResult, String> {
        storage::apply(
            &self.state_directory,
            &self.project_id,
            allowed_worktree_ids,
            request,
        )
    }
}
