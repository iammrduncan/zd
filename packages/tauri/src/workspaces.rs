//! Thin Tauri wrappers around host-owned recent workspace persistence.

use std::collections::HashSet;

use crate::cli::LaunchState;
use crate::grants::ProjectGrant;
pub use zd_host::WorkspaceStore as WorkspaceState;
use zd_host::{RecentWorkspace, MAX_PROJECTS_PER_WORKSPACE};

fn selected_grants(
    launch: &LaunchState,
    project_ids: &[String],
) -> Result<Vec<ProjectGrant>, String> {
    if project_ids.is_empty() || project_ids.len() > MAX_PROJECTS_PER_WORKSPACE {
        return Err(format!(
            "a workspace must contain between 1 and {MAX_PROJECTS_PER_WORKSPACE} projects"
        ));
    }
    let unique = project_ids.iter().collect::<HashSet<_>>();
    if unique.len() != project_ids.len() {
        return Err("a workspace cannot contain the same project twice".into());
    }
    let grants = launch.project_grants();
    project_ids
        .iter()
        .map(|project_id| {
            grants
                .iter()
                .find(|grant| grant.id == *project_id)
                .cloned()
                .ok_or_else(|| format!("unknown project grant {project_id}"))
        })
        .collect()
}

#[tauri::command]
pub fn recent_workspaces(
    state: tauri::State<'_, WorkspaceState>,
) -> Result<Vec<RecentWorkspace>, String> {
    state.recent()
}

#[tauri::command]
pub fn save_workspace(
    state: tauri::State<'_, WorkspaceState>,
    launch: tauri::State<'_, LaunchState>,
    project_ids: Vec<String>,
) -> Result<RecentWorkspace, String> {
    let grants = selected_grants(&launch, &project_ids)?;
    state.save_approved_projects(&grants)
}

#[tauri::command]
pub fn open_workspace(
    state: tauri::State<'_, WorkspaceState>,
    launch: tauri::State<'_, LaunchState>,
    workspace_id: String,
) -> Result<Vec<ProjectGrant>, String> {
    let roots = state.trusted_roots(&workspace_id)?;
    let grants = roots
        .iter()
        .map(|root| launch.approve_project(root))
        .collect::<Result<Vec<_>, _>>()?;
    state.touch(&workspace_id)?;
    Ok(grants)
}
