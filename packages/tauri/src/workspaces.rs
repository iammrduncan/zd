//! Durable recent project/workspace setups.
//!
//! Roots are accepted only from the native grant store. The webview can name the
//! opaque project IDs it is already using or a previously issued workspace ID;
//! it cannot submit a path through this boundary.

use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::cli::LaunchState;
use crate::grants::ProjectGrant;

const SCHEMA_VERSION: u8 = 1;
const MAX_RECENT_WORKSPACES: usize = 20;
const MAX_PROJECTS_PER_WORKSPACE: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecentWorkspaceKind {
    Project,
    Workspace,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentWorkspace {
    pub id: String,
    pub name: String,
    pub kind: RecentWorkspaceKind,
    pub project_names: Vec<String>,
    pub last_opened: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredWorkspace {
    id: String,
    roots: Vec<String>,
    project_names: Vec<String>,
    last_opened: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceCatalog {
    schema_version: u8,
    next_identity: u64,
    workspaces: Vec<StoredWorkspace>,
}

impl Default for WorkspaceCatalog {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            next_identity: 1,
            workspaces: Vec::new(),
        }
    }
}

fn root_set(roots: &[String]) -> Vec<&str> {
    let mut normalized = roots.iter().map(String::as_str).collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized
}

fn workspace_name(project_names: &[String]) -> String {
    match project_names {
        [] => "Workspace".into(),
        [name] => name.clone(),
        [first, second] => format!("{first} + {second}"),
        [first, rest @ ..] => format!("{first} + {} more", rest.len()),
    }
}

fn describe(workspace: &StoredWorkspace) -> RecentWorkspace {
    RecentWorkspace {
        id: workspace.id.clone(),
        name: workspace_name(&workspace.project_names),
        kind: if workspace.roots.len() == 1 {
            RecentWorkspaceKind::Project
        } else {
            RecentWorkspaceKind::Workspace
        },
        project_names: workspace.project_names.clone(),
        last_opened: workspace.last_opened,
    }
}

impl WorkspaceCatalog {
    fn save(
        &mut self,
        roots: Vec<String>,
        project_names: Vec<String>,
        last_opened: u64,
    ) -> RecentWorkspace {
        let expected = root_set(&roots);
        let existing = self
            .workspaces
            .iter()
            .position(|workspace| root_set(&workspace.roots) == expected);
        let mut workspace = match existing {
            Some(index) => self.workspaces.remove(index),
            None => {
                let id = format!("workspace-{:016x}", self.next_identity);
                self.next_identity += 1;
                StoredWorkspace {
                    id,
                    roots: Vec::new(),
                    project_names: Vec::new(),
                    last_opened,
                }
            }
        };
        workspace.roots = roots;
        workspace.project_names = project_names;
        workspace.last_opened = last_opened;
        self.workspaces.insert(0, workspace);
        self.workspaces.truncate(MAX_RECENT_WORKSPACES);
        describe(&self.workspaces[0])
    }

    fn recent(&self) -> Vec<RecentWorkspace> {
        self.workspaces.iter().map(describe).collect()
    }

    fn roots(&self, workspace_id: &str) -> Result<Vec<String>, String> {
        self.workspaces
            .iter()
            .find(|workspace| workspace.id == workspace_id)
            .map(|workspace| workspace.roots.clone())
            .ok_or_else(|| format!("unknown recent workspace {workspace_id}"))
    }

    fn touch(&mut self, workspace_id: &str, last_opened: u64) -> Result<(), String> {
        let index = self
            .workspaces
            .iter()
            .position(|workspace| workspace.id == workspace_id)
            .ok_or_else(|| format!("unknown recent workspace {workspace_id}"))?;
        let mut workspace = self.workspaces.remove(index);
        workspace.last_opened = last_opened;
        self.workspaces.insert(0, workspace);
        Ok(())
    }
}

struct WorkspaceRuntime {
    catalog: WorkspaceCatalog,
    load_problem: Option<String>,
}

pub struct WorkspaceState {
    path: PathBuf,
    runtime: Mutex<WorkspaceRuntime>,
}

impl WorkspaceState {
    pub fn new(path: PathBuf) -> Self {
        let loaded = load_catalog(&path);
        let (catalog, load_problem) = match loaded {
            Ok(catalog) => (catalog, None),
            Err(problem) => (WorkspaceCatalog::default(), Some(problem)),
        };
        Self {
            path,
            runtime: Mutex::new(WorkspaceRuntime {
                catalog,
                load_problem,
            }),
        }
    }

    fn recent(&self) -> Result<Vec<RecentWorkspace>, String> {
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| "recent workspace state is unavailable".to_owned())?;
        if let Some(problem) = &runtime.load_problem {
            return Err(problem.clone());
        }
        Ok(runtime.catalog.recent())
    }

    fn save(
        &self,
        roots: Vec<String>,
        project_names: Vec<String>,
    ) -> Result<RecentWorkspace, String> {
        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "recent workspace state is unavailable".to_owned())?;
        if let Some(problem) = &runtime.load_problem {
            return Err(problem.clone());
        }
        let recent = runtime.catalog.save(roots, project_names, now_millis());
        persist_catalog(&self.path, &runtime.catalog)?;
        Ok(recent)
    }

    fn roots(&self, workspace_id: &str) -> Result<Vec<String>, String> {
        let runtime = self
            .runtime
            .lock()
            .map_err(|_| "recent workspace state is unavailable".to_owned())?;
        if let Some(problem) = &runtime.load_problem {
            return Err(problem.clone());
        }
        runtime.catalog.roots(workspace_id)
    }

    fn touch(&self, workspace_id: &str) -> Result<(), String> {
        let mut runtime = self
            .runtime
            .lock()
            .map_err(|_| "recent workspace state is unavailable".to_owned())?;
        if let Some(problem) = &runtime.load_problem {
            return Err(problem.clone());
        }
        runtime.catalog.touch(workspace_id, now_millis())?;
        persist_catalog(&self.path, &runtime.catalog)
    }
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

fn load_catalog(path: &Path) -> Result<WorkspaceCatalog, String> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(WorkspaceCatalog::default())
        }
        Err(error) => return Err(format!("{}: {error}", path.display())),
    };
    let catalog: WorkspaceCatalog =
        serde_json::from_slice(&bytes).map_err(|error| format!("{}: {error}", path.display()))?;
    if catalog.schema_version != SCHEMA_VERSION {
        return Err(format!(
            "{} uses unsupported workspace schema {}",
            path.display(),
            catalog.schema_version
        ));
    }
    Ok(catalog)
}

fn persist_catalog(path: &Path, catalog: &WorkspaceCatalog) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| format!("{} has no configuration directory", path.display()))?;
    fs::create_dir_all(parent).map_err(|error| format!("{}: {error}", parent.display()))?;
    let contents = serde_json::to_string_pretty(catalog).map_err(|error| error.to_string())?;
    crate::fs::atomic_write(path, &contents).map_err(|error| format!("{}: {error}", path.display()))
}

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
    state.save(
        grants.iter().map(|grant| grant.root.clone()).collect(),
        grants.iter().map(|grant| grant.name.clone()).collect(),
    )
}

#[tauri::command]
pub fn open_workspace(
    state: tauri::State<'_, WorkspaceState>,
    launch: tauri::State<'_, LaunchState>,
    workspace_id: String,
) -> Result<Vec<ProjectGrant>, String> {
    let roots = state.roots(&workspace_id)?;
    let mut grants = Vec::with_capacity(roots.len());
    for root in roots {
        grants.push(launch.approve_project(Path::new(&root))?);
    }
    state.touch(&workspace_id)?;
    Ok(grants)
}

#[cfg(test)]
mod tests {
    use super::{RecentWorkspaceKind, WorkspaceCatalog, WorkspaceState};
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            Self(std::env::temp_dir().join(format!("zd-workspaces-{stamp}")))
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn a_multi_project_setup_is_saved_once_and_moved_to_the_front() {
        let mut catalog = WorkspaceCatalog::default();
        let first = catalog.save(
            vec!["/work/alpha".into(), "/work/beta".into()],
            vec!["alpha".into(), "beta".into()],
            10,
        );
        catalog.save(vec!["/work/solo".into()], vec!["solo".into()], 20);
        let reopened = catalog.save(
            vec!["/work/beta".into(), "/work/alpha".into()],
            vec!["beta".into(), "alpha".into()],
            30,
        );

        assert_eq!(reopened.id, first.id);
        assert_eq!(catalog.recent().len(), 2);
        assert_eq!(catalog.recent()[0].id, first.id);
        assert_eq!(catalog.recent()[0].kind, RecentWorkspaceKind::Workspace);
        assert_eq!(catalog.recent()[0].project_names, ["beta", "alpha"]);
    }

    #[test]
    fn persisted_workspace_catalog_round_trips_its_native_roots() {
        let mut catalog = WorkspaceCatalog::default();
        let saved = catalog.save(
            vec!["/work/alpha".into(), "/work/beta".into()],
            vec!["alpha".into(), "beta".into()],
            10,
        );

        let json = serde_json::to_vec(&catalog).unwrap();
        let restored: WorkspaceCatalog = serde_json::from_slice(&json).unwrap();

        assert_eq!(
            restored.roots(&saved.id).unwrap(),
            ["/work/alpha", "/work/beta"]
        );
    }

    #[test]
    fn workspace_state_survives_a_new_process_state() {
        let scratch = Scratch::new();
        let path = scratch.0.join("configuration/workspaces-v1.json");
        let state = WorkspaceState::new(path.clone());
        state
            .save(vec!["/work/alpha".into()], vec!["alpha".into()])
            .unwrap();

        let restored = WorkspaceState::new(path);

        assert_eq!(restored.recent().unwrap()[0].name, "alpha");
    }
}
