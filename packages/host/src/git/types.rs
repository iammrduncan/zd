use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitScope {
    pub project_id: String,
    pub worktree_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitAvailability {
    Available,
    NonRepository,
    Denied,
    Unavailable,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitChangeState {
    Added,
    Modified,
    Deleted,
    Renamed,
    Conflicted,
    Untracked,
    Ignored,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GitDelta {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    TypeChanged,
    Unmerged,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeEntry {
    pub id: String,
    pub path: String,
    pub previous_path: Option<String>,
    pub state: GitChangeState,
    pub index_state: Option<GitDelta>,
    pub worktree_state: Option<GitDelta>,
    pub submodule: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusSnapshot {
    pub scope: GitScope,
    pub availability: GitAvailability,
    pub entries: Vec<GitChangeEntry>,
    pub truncated: bool,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitHistoryRequest {
    pub scope: GitScope,
    pub cursor: Option<String>,
    pub page_size: Option<u16>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommit {
    pub id: String,
    pub parent_ids: Vec<String>,
    pub author_name: String,
    pub authored_at: i64,
    pub subject: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitHistoryPage {
    pub scope: GitScope,
    pub availability: GitAvailability,
    pub commits: Vec<GitCommit>,
    pub next_cursor: Option<String>,
    pub truncated: bool,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitCompareRequest {
    pub scope: GitScope,
    pub base_commit_id: String,
    pub head_commit_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitComparisonEntry {
    pub id: String,
    pub path: String,
    pub previous_path: Option<String>,
    pub state: GitChangeState,
    pub submodule: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitComparison {
    pub scope: GitScope,
    pub availability: GitAvailability,
    pub base_commit_id: String,
    pub head_commit_id: String,
    pub entries: Vec<GitComparisonEntry>,
    pub truncated: bool,
    pub problem: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum GitDiffSource {
    WorkingTree {
        change_id: String,
    },
    Comparison {
        base_commit_id: String,
        head_commit_id: String,
        change_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GitDiffRequest {
    pub scope: GitScope,
    pub source: GitDiffSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum GitDiffBuffer {
    Text {
        identity: String,
        path: String,
        revision: String,
        text: String,
        byte_length: u64,
    },
    Binary {
        identity: String,
        path: String,
        revision: String,
        byte_length: u64,
    },
    Undecodable {
        identity: String,
        path: String,
        revision: String,
        byte_length: u64,
    },
    Missing {
        identity: String,
        path: String,
        revision: String,
    },
    Denied {
        identity: String,
        path: String,
        revision: String,
    },
    OverLimit {
        identity: String,
        path: String,
        revision: String,
        byte_length: u64,
        limit: u64,
        preview: Option<String>,
    },
    Unavailable {
        identity: String,
        path: String,
        revision: String,
        problem: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiff {
    pub scope: GitScope,
    pub availability: GitAvailability,
    pub base: GitDiffBuffer,
    pub head: GitDiffBuffer,
    pub problem: Option<String>,
}
