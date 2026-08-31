//! Transport-neutral host authority for the `zd` workbench.

mod atomic_write;
mod file_tree;
mod files;
#[doc(hidden)]
pub mod git_process;
mod grants;
mod identity;
mod service;

pub use atomic_write::atomic_write;
pub use file_tree::{
    snapshot_in, FileTreeEntry, FileTreeEntryKind, FileTreeRequest, FileTreeResult, TreeLimits,
};
pub use files::{
    read_bounded_file_at, read_bounded_file_with_limits, BoundedFileRead,
    EDITABLE_FILE_LIMIT_BYTES, FILE_PREVIEW_LIMIT_BYTES,
};
pub use grants::{
    ApprovedProject, GrantAvailability, GrantStore, ProjectGrant, ResourceRef, WorktreeGrant,
};
pub use service::{HostLaunchRequest, HostService};
