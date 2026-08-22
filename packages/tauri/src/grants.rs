//! Native ownership of user-approved project and worktree roots.
//!
//! The webview names an opaque project/worktree pair plus a relative path. It
//! never supplies a root to ordinary file commands, so it cannot widen its own
//! authority. Roots enter here only through native launch/open/picker or Git
//! worktree flows.

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum GrantAvailability {
    Available,
    Missing,
    Denied,
    NotDirectory,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeGrant {
    pub id: String,
    pub name: String,
    pub root: String,
    pub availability: GrantAvailability,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGrant {
    pub id: String,
    pub name: String,
    pub root: String,
    pub availability: GrantAvailability,
    pub worktrees: Vec<WorktreeGrant>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRef {
    pub project_id: String,
    pub worktree_id: String,
    pub relative_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ApprovedProject {
    pub project: ProjectGrant,
    pub worktree_id: String,
}

#[derive(Debug)]
struct WorktreeRecord {
    id: String,
    name: String,
    root: PathBuf,
}

#[derive(Debug)]
struct ProjectRecord {
    id: String,
    name: String,
    root: PathBuf,
    worktrees: Vec<WorktreeRecord>,
}

#[derive(Debug)]
pub struct GrantStore {
    next_identity: u64,
    projects: Vec<ProjectRecord>,
}

impl Default for GrantStore {
    fn default() -> Self {
        Self {
            next_identity: 1,
            projects: Vec::new(),
        }
    }
}

impl GrantStore {
    fn identity(&mut self, kind: &str) -> String {
        let identity = format!("{kind}-{:016x}", self.next_identity);
        self.next_identity += 1;
        identity
    }

    pub fn approve_project(&mut self, requested: &Path) -> Result<ApprovedProject, String> {
        let root = canonical_directory(requested)?;
        if let Some(existing) = self.projects.iter().find(|project| project.root == root) {
            return Ok(ApprovedProject {
                project: describe_project(existing),
                worktree_id: existing.worktrees[0].id.clone(),
            });
        }
        if self
            .projects
            .iter()
            .flat_map(|project| &project.worktrees)
            .any(|worktree| worktree.root == root)
        {
            return Err(format!(
                "{} is already approved as another project's worktree",
                root.display()
            ));
        }

        let name = display_name(&root);
        let project_id = self.identity("project");
        let worktree_id = self.identity("worktree");
        self.projects.push(ProjectRecord {
            id: project_id,
            name: name.clone(),
            root: root.clone(),
            worktrees: vec![WorktreeRecord {
                id: worktree_id.clone(),
                name,
                root,
            }],
        });
        let project =
            describe_project(self.projects.last().expect("the project was just inserted"));
        Ok(ApprovedProject {
            project,
            worktree_id,
        })
    }

    /// Called only by structured native Git worktree creation/discovery flows.
    pub fn approve_worktree(
        &mut self,
        project_id: &str,
        requested: &Path,
    ) -> Result<WorktreeGrant, String> {
        let root = canonical_directory(requested)?;
        for project in &self.projects {
            if let Some(existing) = project
                .worktrees
                .iter()
                .find(|worktree| worktree.root == root)
            {
                if project.id == project_id {
                    return Ok(describe_worktree(existing));
                }
                return Err(format!(
                    "{} is already approved by another project",
                    root.display()
                ));
            }
        }

        let id = self.identity("worktree");
        let project = self
            .projects
            .iter_mut()
            .find(|project| project.id == project_id)
            .ok_or_else(|| format!("unknown project grant {project_id}"))?;
        project.worktrees.push(WorktreeRecord {
            id,
            name: display_name(&root),
            root,
        });
        Ok(describe_worktree(
            project
                .worktrees
                .last()
                .expect("the worktree was just inserted"),
        ))
    }

    pub fn projects(&self) -> Vec<ProjectGrant> {
        self.projects.iter().map(describe_project).collect()
    }

    pub fn recover_project(
        &mut self,
        project_id: &str,
        requested: &Path,
    ) -> Result<ProjectGrant, String> {
        let root = canonical_directory(requested)?;
        let project_index = self
            .projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| format!("unknown project grant {project_id}"))?;

        for (owner_index, owner) in self.projects.iter().enumerate() {
            if owner_index != project_index && owner.root == root {
                return Err(format!(
                    "{} is already approved by project {}",
                    root.display(),
                    owner.id
                ));
            }
            for (worktree_index, worktree) in owner.worktrees.iter().enumerate() {
                let is_recovered_root = owner_index == project_index && worktree_index == 0;
                if !is_recovered_root && worktree.root == root {
                    return Err(format!(
                        "{} is already approved as worktree {}",
                        root.display(),
                        worktree.id
                    ));
                }
            }
        }

        let project = &mut self.projects[project_index];
        let name = display_name(&root);
        project.name.clone_from(&name);
        project.root.clone_from(&root);
        let root_worktree = project
            .worktrees
            .first_mut()
            .expect("every approved project has its root worktree");
        root_worktree.name = name;
        root_worktree.root = root;
        Ok(describe_project(project))
    }

    pub fn remove_project(&mut self, project_id: &str) -> Result<ProjectGrant, String> {
        let index = self
            .projects
            .iter()
            .position(|project| project.id == project_id)
            .ok_or_else(|| format!("unknown project grant {project_id}"))?;
        let removed = self.projects.remove(index);
        Ok(describe_project(&removed))
    }

    pub fn root(&self, project_id: &str, worktree_id: &str) -> Result<PathBuf, String> {
        let project = self
            .projects
            .iter()
            .find(|project| project.id == project_id)
            .ok_or_else(|| format!("unknown or removed project grant {project_id}"))?;
        let worktree = project
            .worktrees
            .iter()
            .find(|worktree| worktree.id == worktree_id)
            .ok_or_else(|| {
                format!("worktree grant {worktree_id} does not belong to project {project_id}")
            })?;
        Ok(worktree.root.clone())
    }

    pub fn project_root(&self, project_id: &str) -> Result<PathBuf, String> {
        self.projects
            .iter()
            .find(|project| project.id == project_id)
            .map(|project| project.root.clone())
            .ok_or_else(|| format!("unknown or removed project grant {project_id}"))
    }

    pub fn resolve(&self, resource: &ResourceRef) -> Result<PathBuf, String> {
        let root = self.root(&resource.project_id, &resource.worktree_id)?;
        resolve_relative(&root, &resource.relative_path)
    }
}

fn canonical_directory(requested: &Path) -> Result<PathBuf, String> {
    let root = requested
        .canonicalize()
        .map_err(|error| format!("{}: {error}", requested.display()))?;
    let metadata =
        std::fs::metadata(&root).map_err(|error| format!("{}: {error}", requested.display()))?;
    if !metadata.is_dir() {
        return Err(format!("{} is not a directory", requested.display()));
    }
    Ok(root)
}

fn display_name(root: &Path) -> String {
    root.file_name()
        .filter(|name| !name.is_empty())
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| root.to_string_lossy().into_owned())
}

fn availability(root: &Path) -> GrantAvailability {
    match std::fs::metadata(root) {
        Ok(metadata) if metadata.is_dir() => GrantAvailability::Available,
        Ok(_) => GrantAvailability::NotDirectory,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => GrantAvailability::Missing,
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            GrantAvailability::Denied
        }
        Err(_) => GrantAvailability::Unavailable,
    }
}

fn describe_worktree(record: &WorktreeRecord) -> WorktreeGrant {
    WorktreeGrant {
        id: record.id.clone(),
        name: record.name.clone(),
        root: record.root.to_string_lossy().into_owned(),
        availability: availability(&record.root),
    }
}

fn describe_project(record: &ProjectRecord) -> ProjectGrant {
    ProjectGrant {
        id: record.id.clone(),
        name: record.name.clone(),
        root: record.root.to_string_lossy().into_owned(),
        availability: availability(&record.root),
        worktrees: record.worktrees.iter().map(describe_worktree).collect(),
    }
}

fn resolve_relative(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let relative = Path::new(requested);
    if relative.is_absolute()
        || relative.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!("refused a non-relative project path: {requested}"));
    }

    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("{} is unavailable: {error}", root.display()))?;
    let joined = canonical_root.join(relative);
    let resolved = match std::fs::symlink_metadata(&joined) {
        Ok(_) => joined
            .canonicalize()
            .map_err(|error| format!("{}: {error}", joined.display()))?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            let parent = joined.parent().unwrap_or(&canonical_root);
            let resolved_parent = parent
                .canonicalize()
                .map_err(|error| format!("{}: {error}", parent.display()))?;
            match joined.file_name() {
                Some(name) => resolved_parent.join(name),
                None => resolved_parent,
            }
        }
        Err(error) => return Err(format!("{}: {error}", joined.display())),
    };

    if !resolved.starts_with(&canonical_root) {
        return Err(format!(
            "refused a path outside project grant {}: {requested}",
            canonical_root.display()
        ));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::{GrantAvailability, GrantStore, ResourceRef};
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-grants-{name}-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn join(&self, name: &str) -> PathBuf {
            self.0.join(name)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn resource(project_id: &str, worktree_id: &str, relative_path: &str) -> ResourceRef {
        ResourceRef {
            project_id: project_id.to_string(),
            worktree_id: worktree_id.to_string(),
            relative_path: relative_path.to_string(),
        }
    }

    #[test]
    fn two_approved_projects_remain_available_together() {
        let alpha = Scratch::new("alpha");
        let beta = Scratch::new("beta");
        std::fs::write(alpha.join("one.md"), "one").unwrap();
        std::fs::write(beta.join("two.md"), "two").unwrap();
        let mut grants = GrantStore::default();

        let alpha_grant = grants.approve_project(&alpha.0).unwrap();
        let beta_grant = grants.approve_project(&beta.0).unwrap();

        assert_ne!(alpha_grant.project.id, beta_grant.project.id);
        assert_eq!(grants.projects().len(), 2);
        assert_eq!(
            grants
                .resolve(&resource(
                    &alpha_grant.project.id,
                    &alpha_grant.worktree_id,
                    "one.md",
                ))
                .unwrap(),
            alpha.join("one.md").canonicalize().unwrap(),
        );
        assert_eq!(
            grants
                .resolve(&resource(
                    &beta_grant.project.id,
                    &beta_grant.worktree_id,
                    "two.md",
                ))
                .unwrap(),
            beta.join("two.md").canonicalize().unwrap(),
        );
    }

    #[test]
    fn approving_the_same_canonical_root_reuses_its_identity() {
        let project = Scratch::new("duplicate");
        let mut grants = GrantStore::default();

        let first = grants.approve_project(&project.0).unwrap();
        let second = grants.approve_project(&project.join(".")).unwrap();

        assert_eq!(first, second);
        assert_eq!(grants.projects().len(), 1);
    }

    #[test]
    fn an_approved_root_that_becomes_a_file_has_a_specific_state() {
        let project = Scratch::new("not-directory");
        let root = project.0.clone();
        let mut grants = GrantStore::default();
        grants.approve_project(&root).unwrap();
        std::fs::remove_dir_all(&root).unwrap();
        std::fs::write(&root, "not a folder").unwrap();

        let described = grants.projects().remove(0);

        assert_eq!(described.availability, GrantAvailability::NotDirectory);
        assert_eq!(
            described.worktrees[0].availability,
            GrantAvailability::NotDirectory
        );
        assert_eq!(
            serde_json::to_value(&described).unwrap()["availability"],
            "not-directory"
        );
        std::fs::remove_file(root).unwrap();
    }

    #[test]
    fn parent_and_absolute_paths_cannot_widen_a_grant() {
        let project = Scratch::new("boundary");
        let mut grants = GrantStore::default();
        let approved = grants.approve_project(&project.0).unwrap();

        for relative in ["../outside.md", "/etc/hosts"] {
            assert!(grants
                .resolve(&resource(
                    &approved.project.id,
                    &approved.worktree_id,
                    relative,
                ))
                .is_err());
        }
    }

    #[test]
    fn a_worktree_from_another_project_cannot_be_paired_with_the_project_id() {
        let alpha = Scratch::new("cross-alpha");
        let beta = Scratch::new("cross-beta");
        let mut grants = GrantStore::default();
        let alpha_grant = grants.approve_project(&alpha.0).unwrap();
        let beta_grant = grants.approve_project(&beta.0).unwrap();

        let crossed = resource(
            &alpha_grant.project.id,
            &beta_grant.worktree_id,
            "secrets.md",
        );
        assert!(grants.resolve(&crossed).is_err());
    }

    #[test]
    fn a_symlink_cannot_escape_an_approved_root() {
        #[cfg(unix)]
        {
            let project = Scratch::new("symlink-project");
            let elsewhere = Scratch::new("symlink-elsewhere");
            std::fs::write(elsewhere.join("secret.md"), "secret").unwrap();
            std::os::unix::fs::symlink(elsewhere.join("secret.md"), project.join("innocent.md"))
                .unwrap();
            let mut grants = GrantStore::default();
            let approved = grants.approve_project(&project.0).unwrap();

            assert!(grants
                .resolve(&resource(
                    &approved.project.id,
                    &approved.worktree_id,
                    "innocent.md",
                ))
                .is_err());
        }
    }

    #[test]
    fn removing_a_project_revokes_its_resources_without_affecting_others() {
        let alpha = Scratch::new("remove-alpha");
        let beta = Scratch::new("remove-beta");
        let mut grants = GrantStore::default();
        let alpha_grant = grants.approve_project(&alpha.0).unwrap();
        let beta_grant = grants.approve_project(&beta.0).unwrap();
        let alpha_file = resource(&alpha_grant.project.id, &alpha_grant.worktree_id, "one.md");
        let beta_file = resource(&beta_grant.project.id, &beta_grant.worktree_id, "two.md");

        grants.remove_project(&alpha_grant.project.id).unwrap();

        assert!(grants.resolve(&alpha_file).is_err());
        assert!(grants.resolve(&beta_file).is_ok());
    }

    #[test]
    fn a_native_worktree_grant_is_project_scoped_and_deduplicated() {
        let project = Scratch::new("project");
        let worktree = Scratch::new("worktree");
        std::fs::write(worktree.join("branch.md"), "branch").unwrap();
        let mut grants = GrantStore::default();
        let approved = grants.approve_project(&project.0).unwrap();

        let first = grants
            .approve_worktree(&approved.project.id, &worktree.0)
            .unwrap();
        let second = grants
            .approve_worktree(&approved.project.id, &worktree.join("."))
            .unwrap();

        assert_eq!(first, second);
        assert_eq!(grants.projects()[0].worktrees.len(), 2);
        assert!(grants
            .resolve(&resource(&approved.project.id, &first.id, "branch.md"))
            .is_ok());
    }

    #[test]
    fn recovering_a_moved_project_keeps_its_project_and_root_worktree_identities() {
        let scratch = Scratch::new("recover-moved");
        let original = scratch.join("original");
        let moved = scratch.join("moved");
        std::fs::create_dir_all(&original).unwrap();
        let mut grants = GrantStore::default();
        let approved = grants.approve_project(&original).unwrap();
        std::fs::rename(&original, &moved).unwrap();

        let recovered = grants
            .recover_project(&approved.project.id, &moved)
            .unwrap();

        assert_eq!(recovered.id, approved.project.id);
        assert_eq!(recovered.worktrees[0].id, approved.worktree_id);
        assert_eq!(
            recovered.root,
            moved.canonicalize().unwrap().to_string_lossy()
        );
        assert_eq!(recovered.worktrees[0].root, recovered.root);
    }

    #[test]
    fn project_recovery_cannot_take_over_another_grant() {
        let alpha = Scratch::new("recover-alpha");
        let beta = Scratch::new("recover-beta");
        let mut grants = GrantStore::default();
        let alpha_grant = grants.approve_project(&alpha.0).unwrap();
        let beta_grant = grants.approve_project(&beta.0).unwrap();

        let error = grants
            .recover_project(&alpha_grant.project.id, &beta.0)
            .unwrap_err();

        assert!(error.contains(&beta_grant.project.id));
        assert_eq!(grants.projects()[0].root, alpha_grant.project.root);
    }
}
