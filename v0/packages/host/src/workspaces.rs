//! Bounded recent workspace records keyed by stable project identities.

use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::{atomic_write, identity, ProjectGrant};

const CURRENT_SCHEMA_VERSION: u8 = 2;
const LEGACY_SCHEMA_VERSION: u8 = 1;
const CATALOG_LIMIT_BYTES: u64 = 1024 * 1024;
const PROJECT_NAME_LIMIT_BYTES: usize = 1024;
const LEGACY_ROOT_LIMIT_BYTES: usize = 32 * 1024;
const WORKSPACE_LOCK_FILE: &str = "workspaces-v1.lock";
pub const MAX_RECENT_WORKSPACES: usize = 20;
pub const MAX_PROJECTS_PER_WORKSPACE: usize = 32;

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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WorkspaceCatalog {
    schema_version: u8,
    workspaces: Vec<StoredWorkspace>,
}

impl Default for WorkspaceCatalog {
    fn default() -> Self {
        Self {
            schema_version: CURRENT_SCHEMA_VERSION,
            workspaces: Vec::new(),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StoredWorkspace {
    id: String,
    project_ids: Vec<String>,
    project_names: Vec<String>,
    last_opened: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchemaEnvelope {
    schema_version: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyWorkspaceCatalog {
    schema_version: u8,
    next_identity: u64,
    workspaces: Vec<LegacyWorkspace>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LegacyWorkspace {
    id: String,
    roots: Vec<String>,
    project_names: Vec<String>,
    last_opened: u64,
}

/// Cross-process recent-workspace persistence for trusted native callers.
#[derive(Debug, Clone)]
pub struct WorkspaceStore {
    path: PathBuf,
    state_directory: PathBuf,
    lock_path: PathBuf,
}

impl WorkspaceStore {
    pub fn new(path: PathBuf) -> Self {
        let state_directory = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        let lock_path = state_directory.join(WORKSPACE_LOCK_FILE);
        Self {
            path,
            state_directory,
            lock_path,
        }
    }

    pub fn recent(&self) -> Result<Vec<RecentWorkspace>, String> {
        self.with_catalog(|catalog| Ok((catalog.workspaces.iter().map(describe).collect(), false)))
    }

    pub fn save_approved_projects(
        &self,
        projects: &[ProjectGrant],
    ) -> Result<RecentWorkspace, String> {
        validate_project_count(projects.len())?;
        let mut project_ids = Vec::with_capacity(projects.len());
        let mut project_names = Vec::with_capacity(projects.len());
        for project in projects {
            if project.name.is_empty() || project.name.len() > PROJECT_NAME_LIMIT_BYTES {
                return Err(unavailable("project name is invalid"));
            }
            let stable = identity::open_project(Path::new(&project.root), &self.state_directory)?;
            project_ids.push(stable.project_id);
            project_names.push(project.name.clone());
        }
        if project_ids.iter().collect::<HashSet<_>>().len() != project_ids.len() {
            return Err(unavailable("a project is repeated"));
        }

        self.with_catalog(move |catalog| {
            let expected = identity_set(&project_ids);
            let existing = catalog
                .workspaces
                .iter()
                .position(|workspace| identity_set(&workspace.project_ids) == expected);
            let mut workspace = match existing {
                Some(index) => catalog.workspaces.remove(index),
                None => StoredWorkspace {
                    id: fresh_workspace_id(catalog)?,
                    project_ids: Vec::new(),
                    project_names: Vec::new(),
                    last_opened: 0,
                },
            };
            workspace.project_ids = project_ids;
            workspace.project_names = project_names;
            workspace.last_opened = now_millis();
            catalog.workspaces.insert(0, workspace);
            catalog.workspaces.truncate(MAX_RECENT_WORKSPACES);
            Ok((describe(&catalog.workspaces[0]), true))
        })
    }

    /// Resolve remembered roots only for an explicit trusted native open action.
    pub fn trusted_roots(&self, workspace_id: &str) -> Result<Vec<PathBuf>, String> {
        let project_ids = self.with_catalog(|catalog| {
            let project_ids = catalog
                .workspaces
                .iter()
                .find(|workspace| workspace.id == workspace_id)
                .map(|workspace| workspace.project_ids.clone())
                .ok_or_else(|| unavailable("workspace is unknown"))?;
            Ok((project_ids, false))
        })?;
        identity::project_roots(&project_ids, &self.state_directory)
    }

    pub fn touch(&self, workspace_id: &str) -> Result<(), String> {
        self.with_catalog(|catalog| {
            let index = catalog
                .workspaces
                .iter()
                .position(|workspace| workspace.id == workspace_id)
                .ok_or_else(|| unavailable("workspace is unknown"))?;
            let mut workspace = catalog.workspaces.remove(index);
            workspace.last_opened = now_millis();
            catalog.workspaces.insert(0, workspace);
            Ok(((), true))
        })
    }

    fn with_catalog<T>(
        &self,
        operation: impl FnOnce(&mut WorkspaceCatalog) -> Result<(T, bool), String>,
    ) -> Result<T, String> {
        std::fs::create_dir_all(&self.state_directory)
            .map_err(|_| unavailable("configuration directory cannot be created"))?;
        let lock = open_lock(&self.lock_path)?;
        File::lock(&lock).map_err(|_| unavailable("catalog lock failed"))?;
        let (mut catalog, migrated) = load_catalog(&self.path, &self.state_directory)?;
        let (result, changed) = operation(&mut catalog)?;
        if migrated || changed {
            validate_catalog(&catalog)?;
            persist_catalog(&self.path, &catalog)?;
        }
        Ok(result)
    }
}

fn open_lock(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|_| unavailable("catalog lock cannot be opened"))
}

fn load_catalog(path: &Path, state_directory: &Path) -> Result<(WorkspaceCatalog, bool), String> {
    let bytes = match std::fs::metadata(path) {
        Ok(metadata) if metadata.len() > CATALOG_LIMIT_BYTES => {
            return Err(unavailable("catalog exceeds its byte limit"));
        }
        Ok(_) => std::fs::read(path).map_err(|_| unavailable("catalog cannot be read"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((WorkspaceCatalog::default(), false));
        }
        Err(_) => return Err(unavailable("catalog metadata cannot be read")),
    };
    let envelope: SchemaEnvelope =
        serde_json::from_slice(&bytes).map_err(|_| unavailable("catalog JSON is invalid"))?;
    match envelope.schema_version {
        CURRENT_SCHEMA_VERSION => {
            let catalog = serde_json::from_slice(&bytes)
                .map_err(|_| unavailable("catalog schema is invalid"))?;
            validate_catalog(&catalog)?;
            validate_project_references(&catalog, state_directory)?;
            Ok((catalog, false))
        }
        LEGACY_SCHEMA_VERSION => migrate_legacy(&bytes, state_directory),
        _ => Err(unavailable("catalog schema is unsupported")),
    }
}

fn migrate_legacy(
    bytes: &[u8],
    state_directory: &Path,
) -> Result<(WorkspaceCatalog, bool), String> {
    let legacy: LegacyWorkspaceCatalog =
        serde_json::from_slice(bytes).map_err(|_| unavailable("legacy catalog is invalid"))?;
    validate_legacy_catalog(&legacy)?;
    let workspaces = legacy
        .workspaces
        .into_iter()
        .map(|workspace| {
            let project_ids = workspace
                .roots
                .iter()
                .map(|root| {
                    identity::remember_legacy_project(Path::new(root), state_directory)
                        .map(|stable| stable.project_id)
                })
                .collect::<Result<Vec<_>, _>>()?;
            Ok(StoredWorkspace {
                id: workspace.id,
                project_ids,
                project_names: workspace.project_names,
                last_opened: workspace.last_opened,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let catalog = WorkspaceCatalog {
        schema_version: CURRENT_SCHEMA_VERSION,
        workspaces,
    };
    validate_catalog(&catalog)?;
    Ok((catalog, true))
}

fn persist_catalog(path: &Path, catalog: &WorkspaceCatalog) -> Result<(), String> {
    let bytes =
        serde_json::to_vec_pretty(catalog).map_err(|_| unavailable("catalog cannot be encoded"))?;
    if bytes.len() as u64 > CATALOG_LIMIT_BYTES {
        return Err(unavailable("catalog exceeds its byte limit"));
    }
    atomic_write(path, &bytes).map_err(|_| unavailable("catalog cannot be replaced"))
}

fn validate_catalog(catalog: &WorkspaceCatalog) -> Result<(), String> {
    if catalog.schema_version != CURRENT_SCHEMA_VERSION
        || catalog.workspaces.len() > MAX_RECENT_WORKSPACES
    {
        return Err(unavailable("catalog bounds or schema are invalid"));
    }
    let mut workspace_ids = HashSet::new();
    for workspace in &catalog.workspaces {
        if !valid_workspace_id(&workspace.id) || !workspace_ids.insert(workspace.id.as_str()) {
            return Err(unavailable("workspace identity is invalid"));
        }
        validate_project_count(workspace.project_ids.len())?;
        if workspace.project_names.len() != workspace.project_ids.len()
            || workspace
                .project_names
                .iter()
                .any(|name| name.is_empty() || name.len() > PROJECT_NAME_LIMIT_BYTES)
            || workspace
                .project_ids
                .iter()
                .any(|project_id| !valid_project_id(project_id))
            || workspace.project_ids.iter().collect::<HashSet<_>>().len()
                != workspace.project_ids.len()
        {
            return Err(unavailable("workspace projects are invalid"));
        }
    }
    Ok(())
}

fn validate_project_references(
    catalog: &WorkspaceCatalog,
    state_directory: &Path,
) -> Result<(), String> {
    let project_ids = catalog
        .workspaces
        .iter()
        .flat_map(|workspace| workspace.project_ids.iter().cloned())
        .collect::<Vec<_>>();
    identity::project_roots(&project_ids, state_directory).map(|_| ())
}

fn validate_legacy_catalog(catalog: &LegacyWorkspaceCatalog) -> Result<(), String> {
    if catalog.schema_version != LEGACY_SCHEMA_VERSION
        || catalog.next_identity == 0
        || catalog.workspaces.len() > MAX_RECENT_WORKSPACES
    {
        return Err(unavailable("legacy catalog bounds or schema are invalid"));
    }
    let mut workspace_ids = HashSet::new();
    for workspace in &catalog.workspaces {
        validate_project_count(workspace.roots.len())?;
        if !valid_workspace_id(&workspace.id)
            || !workspace_ids.insert(workspace.id.as_str())
            || workspace.project_names.len() != workspace.roots.len()
            || workspace
                .project_names
                .iter()
                .any(|name| name.is_empty() || name.len() > PROJECT_NAME_LIMIT_BYTES)
            || workspace.roots.iter().any(|root| {
                root.is_empty()
                    || root.len() > LEGACY_ROOT_LIMIT_BYTES
                    || !normal_absolute(Path::new(root))
            })
            || workspace.roots.iter().collect::<HashSet<_>>().len() != workspace.roots.len()
        {
            return Err(unavailable("legacy workspace is invalid"));
        }
    }
    Ok(())
}

fn validate_project_count(count: usize) -> Result<(), String> {
    if (1..=MAX_PROJECTS_PER_WORKSPACE).contains(&count) {
        Ok(())
    } else {
        Err(unavailable("project count is invalid"))
    }
}

fn normal_absolute(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
}

fn valid_project_id(project_id: &str) -> bool {
    valid_hex_id(project_id, "project", 32)
}

fn valid_workspace_id(workspace_id: &str) -> bool {
    valid_hex_id(workspace_id, "workspace", 16) || valid_hex_id(workspace_id, "workspace", 32)
}

fn valid_hex_id(identity: &str, kind: &str, digits: usize) -> bool {
    identity
        .strip_prefix(&format!("{kind}-"))
        .is_some_and(|encoded| {
            encoded.len() == digits
                && encoded
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}

fn identity_set(project_ids: &[String]) -> Vec<&str> {
    let mut normalized = project_ids.iter().map(String::as_str).collect::<Vec<_>>();
    normalized.sort_unstable();
    normalized
}

fn fresh_workspace_id(catalog: &WorkspaceCatalog) -> Result<String, String> {
    for _ in 0..8 {
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|_| unavailable("random identity failed"))?;
        let id = format!("workspace-{}", hexadecimal(&random));
        if catalog
            .workspaces
            .iter()
            .all(|workspace| workspace.id != id)
        {
            return Ok(id);
        }
    }
    Err(unavailable("random identity collision"))
}

fn hexadecimal(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a string cannot fail");
    }
    encoded
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
        kind: if workspace.project_ids.len() == 1 {
            RecentWorkspaceKind::Project
        } else {
            RecentWorkspaceKind::Workspace
        },
        project_names: workspace.project_names.clone(),
        last_opened: workspace.last_opened,
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

fn unavailable(reason: &str) -> String {
    format!("workspace catalog is unavailable: {reason}")
}
