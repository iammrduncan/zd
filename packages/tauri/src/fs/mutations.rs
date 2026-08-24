use std::path::{Path, PathBuf};

use crate::cli::LaunchState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum FileTreeCreationKind {
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Deserialize)]
#[serde(
    tag = "operation",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum FileTreeMutationRequest {
    Create {
        project_id: String,
        worktree_id: String,
        relative_path: String,
        kind: FileTreeCreationKind,
    },
    Rename {
        project_id: String,
        worktree_id: String,
        relative_path: String,
        new_name: String,
    },
    Copy {
        project_id: String,
        worktree_id: String,
        relative_path: String,
        destination_path: String,
    },
    Move {
        project_id: String,
        worktree_id: String,
        relative_path: String,
        destination_path: String,
    },
    Trash {
        project_id: String,
        worktree_id: String,
        relative_path: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "status", rename_all = "kebab-case")]
pub enum FileTreeMutationResult {
    Committed,
    Refused { reason: String },
}

impl FileTreeMutationRequest {
    fn scope(&self) -> (&str, &str) {
        match self {
            Self::Create {
                project_id,
                worktree_id,
                ..
            }
            | Self::Rename {
                project_id,
                worktree_id,
                ..
            }
            | Self::Copy {
                project_id,
                worktree_id,
                ..
            }
            | Self::Move {
                project_id,
                worktree_id,
                ..
            }
            | Self::Trash {
                project_id,
                worktree_id,
                ..
            } => (project_id, worktree_id),
        }
    }
}

fn copy_file_tree_entry(source: &Path, destination: &Path) -> Result<(), String> {
    let metadata = std::fs::symlink_metadata(source)
        .map_err(|error| format!("The selected item could not be read: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Symbolic links cannot be copied from the file tree.".to_string());
    }
    if metadata.is_file() {
        return std::fs::copy(source, destination)
            .map(|_| ())
            .map_err(|error| format!("The file could not be copied: {error}"));
    }
    if !metadata.is_dir() {
        return Err("Only files and folders can be copied.".to_string());
    }

    std::fs::create_dir(destination)
        .map_err(|error| format!("The destination folder could not be created: {error}"))?;
    let copied = (|| {
        let children = std::fs::read_dir(source)
            .map_err(|error| format!("The selected folder could not be read: {error}"))?;
        for child in children {
            let child =
                child.map_err(|error| format!("The selected folder could not be read: {error}"))?;
            copy_file_tree_entry(&child.path(), &destination.join(child.file_name()))?;
        }
        Ok(())
    })();
    if copied.is_err() {
        let _ = std::fs::remove_dir_all(destination);
    }
    copied
}

fn transfer_file_tree_entry(
    root: &Path,
    relative_path: &str,
    destination_path: &str,
    copy: bool,
) -> Result<(), String> {
    let source = validate_mutation_path(root, relative_path, true)?;
    let destination = validate_mutation_path(root, destination_path, false)?;
    if destination.exists() {
        return Err("A file or folder already exists at the destination.".to_string());
    }
    if destination.starts_with(&source) {
        return Err("A folder cannot be transferred into itself.".to_string());
    }
    if copy {
        copy_file_tree_entry(&source, &destination)
    } else {
        std::fs::rename(source, destination)
            .map_err(|error| format!("The item could not be moved: {error}"))
    }
}

fn validate_mutation_path(
    root: &Path,
    relative_path: &str,
    must_exist: bool,
) -> Result<PathBuf, String> {
    use std::path::Component;

    let relative = Path::new(relative_path);
    if relative_path.is_empty()
        || relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("Choose one project-relative file or folder.".to_string());
    }
    if relative.components().next().is_some_and(|component| {
        component
            .as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(".git")
    }) {
        return Err("Repository metadata is protected.".to_string());
    }
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "The approved worktree is unavailable.".to_string())?;
    let candidate = canonical_root.join(relative);
    let parent = candidate
        .parent()
        .ok_or_else(|| "The destination folder is unavailable.".to_string())?
        .canonicalize()
        .map_err(|_| "The destination folder is unavailable.".to_string())?;
    if !parent.starts_with(&canonical_root) {
        return Err("The operation cannot leave the approved worktree.".to_string());
    }
    if must_exist {
        let metadata = std::fs::symlink_metadata(&candidate)
            .map_err(|_| "The selected file or folder no longer exists.".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("Symbolic links cannot be changed from the file tree.".to_string());
        }
        let canonical = candidate
            .canonicalize()
            .map_err(|_| "The selected file or folder is unavailable.".to_string())?;
        if !canonical.starts_with(&canonical_root) {
            return Err("The operation cannot leave the approved worktree.".to_string());
        }
    }
    Ok(candidate)
}

fn valid_leaf_name(name: &str) -> bool {
    !name.is_empty()
        && name != "."
        && name != ".."
        && !name.contains('/')
        && !name.contains('\\')
        && !name.chars().any(char::is_control)
}

fn mutate_file_tree_in(
    root: &Path,
    request: FileTreeMutationRequest,
    move_to_trash: impl FnOnce(&Path) -> Result<(), String>,
) -> FileTreeMutationResult {
    let result = match request {
        FileTreeMutationRequest::Create {
            relative_path,
            kind,
            ..
        } => validate_mutation_path(root, &relative_path, false).and_then(|path| {
            if path.exists() {
                return Err("A file or folder with that name already exists.".to_string());
            }
            match kind {
                FileTreeCreationKind::File => std::fs::OpenOptions::new()
                    .write(true)
                    .create_new(true)
                    .open(path)
                    .map(|_| ()),
                FileTreeCreationKind::Directory => std::fs::create_dir(path),
            }
            .map_err(|error| format!("The item could not be created: {error}"))
        }),
        FileTreeMutationRequest::Rename {
            relative_path,
            new_name,
            ..
        } => {
            if !valid_leaf_name(&new_name) {
                Err("Enter one valid file or folder name, without a path.".to_string())
            } else {
                validate_mutation_path(root, &relative_path, true).and_then(|source| {
                    let destination = source
                        .parent()
                        .expect("validated entries always have a parent")
                        .join(new_name);
                    if destination.exists() {
                        return Err("A file or folder with that name already exists.".to_string());
                    }
                    std::fs::rename(source, destination)
                        .map_err(|error| format!("The item could not be renamed: {error}"))
                })
            }
        }
        FileTreeMutationRequest::Copy {
            relative_path,
            destination_path,
            ..
        } => transfer_file_tree_entry(root, &relative_path, &destination_path, true),
        FileTreeMutationRequest::Move {
            relative_path,
            destination_path,
            ..
        } => transfer_file_tree_entry(root, &relative_path, &destination_path, false),
        FileTreeMutationRequest::Trash { relative_path, .. } => {
            validate_mutation_path(root, &relative_path, true).and_then(|path| move_to_trash(&path))
        }
    };
    match result {
        Ok(()) => FileTreeMutationResult::Committed,
        Err(reason) => FileTreeMutationResult::Refused { reason },
    }
}

#[tauri::command]
pub fn mutate_file_tree(
    launch: tauri::State<'_, LaunchState>,
    request: FileTreeMutationRequest,
) -> FileTreeMutationResult {
    let (project_id, worktree_id) = request.scope();
    let root = match launch.root(project_id, worktree_id) {
        Ok(root) => root,
        Err(_) => {
            return FileTreeMutationResult::Refused {
                reason: "File authority is unavailable.".to_string(),
            }
        }
    };
    mutate_file_tree_in(&root, request, |path| {
        trash::delete(path)
            .map_err(|error| format!("The item could not be moved to Trash: {error}"))
    })
}

#[cfg(test)]
mod tests {
    use super::{
        mutate_file_tree_in, FileTreeCreationKind, FileTreeMutationRequest, FileTreeMutationResult,
    };
    use std::path::{Path, PathBuf};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-{name}-{stamp}"));
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

    fn scope() -> (String, String) {
        ("project-a".to_string(), "worktree-a".to_string())
    }

    fn transfer_request(
        copy: bool,
        relative_path: &str,
        destination_path: &str,
    ) -> FileTreeMutationRequest {
        let (project_id, worktree_id) = scope();
        if copy {
            FileTreeMutationRequest::Copy {
                project_id,
                worktree_id,
                relative_path: relative_path.to_string(),
                destination_path: destination_path.to_string(),
            }
        } else {
            FileTreeMutationRequest::Move {
                project_id,
                worktree_id,
                relative_path: relative_path.to_string(),
                destination_path: destination_path.to_string(),
            }
        }
    }

    fn mutate(root: &Path, request: FileTreeMutationRequest) -> FileTreeMutationResult {
        mutate_file_tree_in(root, request, |_| unreachable!())
    }

    #[test]
    fn creates_renames_and_recoverably_removes_scoped_entries() {
        let scratch = Scratch::new("file-tree-mutations");
        std::fs::create_dir(scratch.join("docs")).unwrap();
        let (project_id, worktree_id) = scope();
        let created = mutate(
            &scratch.0,
            FileTreeMutationRequest::Create {
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                relative_path: "docs/notes.md".to_string(),
                kind: FileTreeCreationKind::File,
            },
        );
        assert_eq!(created, FileTreeMutationResult::Committed);

        let renamed = mutate(
            &scratch.0,
            FileTreeMutationRequest::Rename {
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                relative_path: "docs/notes.md".to_string(),
                new_name: "draft.md".to_string(),
            },
        );
        assert_eq!(renamed, FileTreeMutationResult::Committed);
        assert!(scratch.join("docs/draft.md").is_file());

        let trashed = mutate_file_tree_in(
            &scratch.0,
            FileTreeMutationRequest::Trash {
                project_id,
                worktree_id,
                relative_path: "docs/draft.md".to_string(),
            },
            |path| std::fs::remove_file(path).map_err(|error| error.to_string()),
        );
        assert_eq!(trashed, FileTreeMutationResult::Committed);
        assert!(!scratch.join("docs/draft.md").exists());
    }

    #[test]
    fn copies_files_and_directories_and_moves_entries_between_folders() {
        let scratch = Scratch::new("file-tree-transfers");
        std::fs::create_dir_all(scratch.join("docs/nested")).unwrap();
        std::fs::create_dir(scratch.join("archive")).unwrap();
        std::fs::write(scratch.join("docs/note.md"), "note").unwrap();
        std::fs::write(scratch.join("docs/nested/detail.md"), "detail").unwrap();

        for (source, destination) in [
            ("docs/note.md", "archive/note.md"),
            ("docs/nested", "archive/nested"),
        ] {
            assert_eq!(
                mutate(&scratch.0, transfer_request(true, source, destination)),
                FileTreeMutationResult::Committed,
            );
        }
        assert_eq!(
            std::fs::read_to_string(scratch.join("archive/nested/detail.md")).unwrap(),
            "detail",
        );

        assert_eq!(
            mutate(
                &scratch.0,
                transfer_request(false, "archive/note.md", "docs/moved.md"),
            ),
            FileTreeMutationResult::Committed,
        );
        assert!(!scratch.join("archive/note.md").exists());
        assert_eq!(
            std::fs::read_to_string(scratch.join("docs/moved.md")).unwrap(),
            "note",
        );
    }

    #[test]
    fn refuses_transfer_collisions_self_descendants_and_repository_metadata() {
        let scratch = Scratch::new("file-tree-transfer-refusals");
        std::fs::create_dir_all(scratch.join("docs/nested")).unwrap();
        std::fs::write(scratch.join("docs/existing.md"), "kept").unwrap();
        for request in [
            transfer_request(true, "docs/existing.md", "docs/existing.md"),
            transfer_request(true, "docs", "docs/nested/copy"),
            transfer_request(false, "docs/existing.md", ".git/config"),
            transfer_request(false, "../outside.md", "docs/outside.md"),
        ] {
            assert!(matches!(
                mutate(&scratch.0, request),
                FileTreeMutationResult::Refused { .. }
            ));
        }
        assert_eq!(
            std::fs::read_to_string(scratch.join("docs/existing.md")).unwrap(),
            "kept",
        );
    }

    #[cfg(unix)]
    #[test]
    fn refuses_symlinks_nested_inside_copied_directories_without_partial_output() {
        use std::os::unix::fs::symlink;

        let scratch = Scratch::new("file-tree-transfer-symlink");
        std::fs::create_dir_all(scratch.join("docs/nested")).unwrap();
        std::fs::create_dir(scratch.join("archive")).unwrap();
        std::fs::write(scratch.join("outside.md"), "outside").unwrap();
        symlink(
            scratch.join("outside.md"),
            scratch.join("docs/nested/link.md"),
        )
        .unwrap();

        assert!(matches!(
            mutate(&scratch.0, transfer_request(true, "docs", "archive/docs"),),
            FileTreeMutationResult::Refused { .. }
        ));
        assert!(!scratch.join("archive/docs").exists());
    }

    #[test]
    fn refuses_escape_collisions_and_repository_metadata_on_creation() {
        let scratch = Scratch::new("file-tree-mutation-refusals");
        std::fs::create_dir(scratch.join("docs")).unwrap();
        std::fs::write(scratch.join("docs/existing.md"), "kept").unwrap();
        let (project_id, worktree_id) = scope();
        for relative_path in ["../outside.md", ".git/config", "docs/existing.md"] {
            let result = mutate(
                &scratch.0,
                FileTreeMutationRequest::Create {
                    project_id: project_id.clone(),
                    worktree_id: worktree_id.clone(),
                    relative_path: relative_path.to_string(),
                    kind: FileTreeCreationKind::File,
                },
            );
            assert!(matches!(result, FileTreeMutationResult::Refused { .. }));
        }
        assert_eq!(
            std::fs::read_to_string(scratch.join("docs/existing.md")).unwrap(),
            "kept",
        );
    }
}
