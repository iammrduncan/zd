//! Transport-neutral host authority for the `zd` workbench.

mod atomic_write;
mod clipboard_images;
mod durable;
mod file_mutations;
mod file_tree;
mod files;
mod git;
#[doc(hidden)]
pub mod git_process;
mod grants;
mod identity;
mod service;
mod themes;
mod workspaces;
mod worktrees;

pub use atomic_write::atomic_write;
pub use clipboard_images::{
    save_clipboard_image_at, ClipboardImageMediaType, ClipboardImageRequest, SavedClipboardImage,
    MAX_CLIPBOARD_IMAGE_BYTES,
};
pub use durable::{
    DurableFileDraft, DurableReviewComment, DurableReviewLedger, DurableStateApply,
    DurableStateApplyResult, DurableStateBundle, DurableStateMutation, DurableStateRevision,
    DurableStateSession,
};
pub use file_mutations::{
    mutate_file_tree_at, FileTreeCreationKind, FileTreeMutationRequest, FileTreeMutationResult,
};
pub use file_tree::{
    snapshot_in, FileTreeEntry, FileTreeEntryKind, FileTreeRequest, FileTreeResult, TreeLimits,
};
pub use files::{
    file_stamp_at, read_bounded_file_at, read_bounded_file_with_limits, read_project_image_at,
    read_text_file_at, workspace_files_in, write_text_file_at, BoundedFileRead, FileStamp,
    ProjectImage, WorkspaceFile, WorkspaceListing, EDITABLE_FILE_LIMIT_BYTES,
    FILE_PREVIEW_LIMIT_BYTES, PROJECT_IMAGE_LIMIT_BYTES,
};
pub use git::{
    compare_for, diff_for, history_for, status_for, GitAuthority, GitAvailability, GitChangeEntry,
    GitChangeState, GitCommit, GitCompareRequest, GitComparison, GitComparisonEntry, GitDelta,
    GitDiff, GitDiffBuffer, GitDiffRequest, GitDiffSource, GitHistoryPage, GitHistoryRequest,
    GitScope, GitStatusSnapshot,
};
pub use grants::{
    ApprovedProject, GrantAvailability, GrantStore, ProjectGrant, ResourceRef, WorktreeGrant,
};
pub use service::{HostLaunchRequest, HostService};
pub use themes::{theme_files_in, ThemeConfigFile};
pub use workspaces::{
    RecentWorkspace, RecentWorkspaceKind, WorkspaceStore, MAX_PROJECTS_PER_WORKSPACE,
    MAX_RECENT_WORKSPACES,
};
pub use worktrees::{
    create_worktree_for, CreateThreadWorktreeRequest, CreateThreadWorktreeResult,
    WorktreeAuthority, WorktreeRefusalKind,
};
