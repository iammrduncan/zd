use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::atomic_write;
use crate::grants::canonical_directory;

const CATALOG_FILE: &str = "host-identities-v1.json";
const CATALOG_LOCK_FILE: &str = "host-identities-v1.lock";
const CATALOG_SCHEMA_VERSION: u32 = 1;
const CATALOG_LIMIT_BYTES: u64 = 1024 * 1024;
const PROJECT_LIMIT: usize = 4096;
const WORKTREES_PER_PROJECT_LIMIT: usize = 128;
const RANDOM_ID_BYTES: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProjectIdentity {
    pub project_id: String,
    pub root_worktree_id: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct IdentityCatalog {
    schema_version: u32,
    projects: Vec<CatalogProject>,
}

impl Default for IdentityCatalog {
    fn default() -> Self {
        Self {
            schema_version: CATALOG_SCHEMA_VERSION,
            projects: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CatalogProject {
    id: String,
    root: PathBuf,
    worktrees: Vec<CatalogWorktree>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CatalogWorktree {
    id: String,
    root: PathBuf,
}

pub(crate) fn open_project(
    requested: &Path,
    state_directory: &Path,
) -> Result<ProjectIdentity, String> {
    let root = canonical_directory(requested)?;
    remember_root(root, state_directory)
}

pub(crate) fn remember_legacy_project(
    requested: &Path,
    state_directory: &Path,
) -> Result<ProjectIdentity, String> {
    let root = match canonical_directory(requested) {
        Ok(root) => root,
        Err(_) if is_normal_absolute(requested) => requested.to_path_buf(),
        Err(_) => return Err(unavailable("legacy root is invalid")),
    };
    remember_root(root, state_directory)
}

fn remember_root(root: PathBuf, state_directory: &Path) -> Result<ProjectIdentity, String> {
    with_catalog(state_directory, |catalog| {
        if let Some(project) = catalog.projects.iter().find(|project| project.root == root) {
            return Ok((identity_of(project)?, false));
        }
        if catalog.projects.len() >= PROJECT_LIMIT || catalog_contains_root(catalog, &root) {
            return Err(unavailable("capacity or root conflict"));
        }

        let project_id = fresh_identity("project", catalog)?;
        let root_worktree_id = fresh_identity("worktree", catalog)?;
        catalog.projects.push(CatalogProject {
            id: project_id.clone(),
            root: root.clone(),
            worktrees: vec![CatalogWorktree {
                id: root_worktree_id.clone(),
                root,
            }],
        });
        Ok((
            ProjectIdentity {
                project_id,
                root_worktree_id,
            },
            true,
        ))
    })
}

pub(crate) fn project_roots(
    project_ids: &[String],
    state_directory: &Path,
) -> Result<Vec<PathBuf>, String> {
    if project_ids.is_empty() {
        return Ok(Vec::new());
    }
    with_catalog(state_directory, |catalog| {
        let roots = project_ids
            .iter()
            .map(|project_id| {
                catalog
                    .projects
                    .iter()
                    .find(|project| project.id == *project_id)
                    .map(|project| project.root.clone())
                    .ok_or_else(|| unavailable("workspace project is unknown"))
            })
            .collect::<Result<Vec<_>, _>>()?;
        Ok((roots, false))
    })
}

pub(crate) fn open_worktree(
    project_id: &str,
    requested: &Path,
    state_directory: &Path,
) -> Result<String, String> {
    let root = canonical_directory(requested)?;
    with_catalog(state_directory, |catalog| {
        let project_index = catalog
            .projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| unavailable("unknown project"))?;
        if let Some((owner_index, worktree)) = catalog
            .projects
            .iter()
            .enumerate()
            .flat_map(|(owner_index, project)| {
                project
                    .worktrees
                    .iter()
                    .map(move |worktree| (owner_index, worktree))
            })
            .find(|(_, worktree)| worktree.root == root)
        {
            return if owner_index == project_index {
                Ok((worktree.id.clone(), false))
            } else {
                Err(unavailable("root conflict"))
            };
        }
        if catalog.projects[project_index].worktrees.len() >= WORKTREES_PER_PROJECT_LIMIT {
            return Err(unavailable("worktree capacity reached"));
        }

        let worktree_id = fresh_identity("worktree", catalog)?;
        catalog.projects[project_index]
            .worktrees
            .push(CatalogWorktree {
                id: worktree_id.clone(),
                root,
            });
        Ok((worktree_id, true))
    })
}

pub(crate) fn recover_project(
    project_id: &str,
    requested: &Path,
    state_directory: &Path,
) -> Result<ProjectIdentity, String> {
    let root = canonical_directory(requested)?;
    with_catalog(state_directory, |catalog| {
        let project_index = catalog
            .projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| unavailable("unknown project"))?;
        if catalog
            .projects
            .iter()
            .enumerate()
            .any(|(owner_index, owner)| {
                owner
                    .worktrees
                    .iter()
                    .enumerate()
                    .any(|(worktree_index, worktree)| {
                        let recovered_root = owner_index == project_index && worktree_index == 0;
                        !recovered_root && worktree.root == root
                    })
            })
        {
            return Err(unavailable("root conflict"));
        }

        let project = &mut catalog.projects[project_index];
        project.root.clone_from(&root);
        project
            .worktrees
            .first_mut()
            .ok_or_else(|| unavailable("missing root worktree"))?
            .root = root;
        let identity = identity_of(project)?;
        Ok((identity, true))
    })
}

fn with_catalog<T>(
    state_directory: &Path,
    operation: impl FnOnce(&mut IdentityCatalog) -> Result<(T, bool), String>,
) -> Result<T, String> {
    std::fs::create_dir_all(state_directory)
        .map_err(|_| unavailable("state directory cannot be created"))?;
    let catalog_path = state_directory.join(CATALOG_FILE);
    let lock_path = state_directory.join(CATALOG_LOCK_FILE);
    let lock = open_lock(&lock_path)?;
    File::lock(&lock).map_err(|_| unavailable("catalog lock failed"))?;

    let mut catalog = load_catalog(&catalog_path)?;
    let (result, changed) = operation(&mut catalog)?;
    if changed {
        validate_catalog(&catalog)?;
        save_catalog(&catalog_path, &catalog)?;
    }
    Ok(result)
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

fn load_catalog(path: &Path) -> Result<IdentityCatalog, String> {
    let bytes = match std::fs::metadata(path) {
        Ok(metadata) if metadata.len() > CATALOG_LIMIT_BYTES => {
            return Err(unavailable("catalog exceeds its byte limit"));
        }
        Ok(_) => std::fs::read(path).map_err(|_| unavailable("catalog cannot be read"))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(IdentityCatalog::default());
        }
        Err(_) => return Err(unavailable("catalog metadata cannot be read")),
    };
    let catalog: IdentityCatalog =
        serde_json::from_slice(&bytes).map_err(|_| unavailable("catalog JSON is invalid"))?;
    validate_catalog(&catalog)?;
    Ok(catalog)
}

fn save_catalog(path: &Path, catalog: &IdentityCatalog) -> Result<(), String> {
    let contents =
        serde_json::to_vec_pretty(catalog).map_err(|_| unavailable("catalog cannot be encoded"))?;
    if contents.len() as u64 > CATALOG_LIMIT_BYTES {
        return Err(unavailable("catalog exceeds its byte limit"));
    }
    atomic_write::atomic_write(path, &contents)
        .map_err(|_| unavailable("catalog cannot be replaced"))
}

fn validate_catalog(catalog: &IdentityCatalog) -> Result<(), String> {
    if catalog.schema_version != CATALOG_SCHEMA_VERSION {
        return Err(unavailable("unsupported schema version"));
    }
    if catalog.projects.len() > PROJECT_LIMIT {
        return Err(unavailable("too many projects"));
    }

    let mut identities = HashSet::new();
    let mut roots = HashSet::new();
    for project in &catalog.projects {
        if !valid_identity(&project.id, "project") || !identities.insert(project.id.as_str()) {
            return Err(unavailable("invalid or duplicate project identity"));
        }
        if !is_normal_absolute(&project.root) || !roots.insert(project.root.as_path()) {
            return Err(unavailable("invalid or duplicate project root"));
        }
        if project.worktrees.is_empty()
            || project.worktrees.len() > WORKTREES_PER_PROJECT_LIMIT
            || project.worktrees[0].root != project.root
        {
            return Err(unavailable("invalid root worktree"));
        }
        for (worktree_index, worktree) in project.worktrees.iter().enumerate() {
            if !valid_identity(&worktree.id, "worktree") || !identities.insert(worktree.id.as_str())
            {
                return Err(unavailable("invalid or duplicate worktree identity"));
            }
            if !is_normal_absolute(&worktree.root)
                || (worktree_index > 0 && !roots.insert(worktree.root.as_path()))
            {
                return Err(unavailable("invalid worktree root"));
            }
        }
    }
    Ok(())
}

fn is_normal_absolute(path: &Path) -> bool {
    path.is_absolute()
        && !path
            .components()
            .any(|component| matches!(component, Component::CurDir | Component::ParentDir))
}

fn catalog_contains_root(catalog: &IdentityCatalog, root: &Path) -> bool {
    catalog
        .projects
        .iter()
        .flat_map(|project| &project.worktrees)
        .any(|worktree| worktree.root == root)
}

fn identity_of(project: &CatalogProject) -> Result<ProjectIdentity, String> {
    Ok(ProjectIdentity {
        project_id: project.id.clone(),
        root_worktree_id: project
            .worktrees
            .first()
            .ok_or_else(|| unavailable("missing root worktree"))?
            .id
            .clone(),
    })
}

fn fresh_identity(kind: &str, catalog: &IdentityCatalog) -> Result<String, String> {
    for _ in 0..8 {
        let mut random = [0_u8; RANDOM_ID_BYTES];
        getrandom::fill(&mut random).map_err(|_| unavailable("random identity failed"))?;
        let identity = format!("{kind}-{}", hexadecimal(&random));
        if !catalog.projects.iter().any(|project| {
            project.id == identity
                || project
                    .worktrees
                    .iter()
                    .any(|worktree| worktree.id == identity)
        }) {
            return Ok(identity);
        }
    }
    Err(unavailable("random identity collision"))
}

fn valid_identity(identity: &str, kind: &str) -> bool {
    let Some(encoded) = identity.strip_prefix(&format!("{kind}-")) else {
        return false;
    };
    encoded.len() == RANDOM_ID_BYTES * 2
        && encoded
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn hexadecimal(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a string cannot fail");
    }
    encoded
}

fn unavailable(reason: &str) -> String {
    format!("identity catalog is unavailable: {reason}")
}

#[cfg(test)]
mod tests;
