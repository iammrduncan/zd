//! Bounded file reads below an already-resolved host grant.

use std::io::Read;
use std::path::Path;

use serde::Serialize;

use crate::{atomic_write, ResourceRef};

pub const EDITABLE_FILE_LIMIT_BYTES: u64 = 8 * 1024 * 1024;
pub const FILE_PREVIEW_LIMIT_BYTES: usize = 64 * 1024;
pub const PROJECT_IMAGE_LIMIT_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceFile {
    pub resource: ResourceRef,
    pub relative: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceListing {
    pub project_id: String,
    pub worktree_id: String,
    pub root: String,
    pub files: Vec<WorkspaceFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectImage {
    pub media_type: &'static str,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct FileStamp {
    pub modified: Option<u64>,
    pub length: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum BoundedFileRead {
    Text {
        text: String,
        byte_length: u64,
        writable: bool,
        reason: Option<String>,
    },
    Binary {
        byte_length: u64,
    },
    Undecodable {
        byte_length: u64,
    },
    Missing,
    Denied,
    OverLimit {
        byte_length: u64,
        limit: u64,
        preview: Option<String>,
    },
    Unavailable {
        problem: String,
    },
}

fn read_failure(error: &std::io::Error) -> BoundedFileRead {
    match error.kind() {
        std::io::ErrorKind::NotFound => BoundedFileRead::Missing,
        std::io::ErrorKind::PermissionDenied => BoundedFileRead::Denied,
        _ => BoundedFileRead::Unavailable {
            problem: "The file could not be read".to_string(),
        },
    }
}

fn safe_preview(bytes: Vec<u8>) -> Option<String> {
    if bytes.contains(&0) {
        return None;
    }
    String::from_utf8(bytes).ok()
}

pub fn read_bounded_file_at(path: &Path) -> BoundedFileRead {
    read_bounded_file_with_limits(path, EDITABLE_FILE_LIMIT_BYTES, FILE_PREVIEW_LIMIT_BYTES)
}

pub fn read_text_file_at(path: &Path) -> Result<String, String> {
    match read_bounded_file_at(path) {
        BoundedFileRead::Text { text, .. } => Ok(text),
        BoundedFileRead::Binary { .. } | BoundedFileRead::Undecodable { .. } => {
            Err("The selected file is not UTF-8 text".to_string())
        }
        BoundedFileRead::Missing => Err("The selected file is missing".to_string()),
        BoundedFileRead::Denied => Err("File access was denied".to_string()),
        BoundedFileRead::OverLimit { .. } => {
            Err("The selected file exceeds the 8 MiB editable limit".to_string())
        }
        BoundedFileRead::Unavailable { problem } => Err(problem),
    }
}

pub fn write_text_file_at(path: &Path, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > EDITABLE_FILE_LIMIT_BYTES {
        return Err("The document exceeds the 8 MiB editable limit".to_string());
    }
    atomic_write(path, contents.as_bytes())
        .map_err(|_| "The document could not be saved".to_string())
}

pub fn file_stamp_at(path: &Path) -> Result<Option<FileStamp>, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            return Err("File access was denied".to_string())
        }
        Err(_) => return Err("The file stamp is unavailable".to_string()),
    };
    if !metadata.is_file() {
        return Err("The selected resource is not a regular file".to_string());
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|since| since.as_millis() as u64);
    Ok(Some(FileStamp {
        modified,
        length: metadata.len(),
    }))
}

fn project_image_media_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) && bytes.ends_with(&[0xff, 0xd9]) {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

pub fn read_project_image_at(path: &Path) -> Result<ProjectImage, String> {
    let metadata = std::fs::metadata(path).map_err(|_| "The Markdown image is unavailable")?;
    if !metadata.is_file() {
        return Err("The Markdown image is not a regular file".to_string());
    }
    if metadata.len() > PROJECT_IMAGE_LIMIT_BYTES {
        return Err("The Markdown image exceeds the 16 MiB limit".to_string());
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    std::fs::File::open(path)
        .and_then(|file| {
            file.take(PROJECT_IMAGE_LIMIT_BYTES.saturating_add(1))
                .read_to_end(&mut bytes)
        })
        .map_err(|_| "The Markdown image could not be read")?;
    if bytes.len() as u64 > PROJECT_IMAGE_LIMIT_BYTES {
        return Err("The Markdown image exceeds the 16 MiB limit".to_string());
    }
    let media_type = project_image_media_type(&bytes)
        .ok_or_else(|| "The Markdown image type is not supported".to_string())?;
    Ok(ProjectImage { media_type, bytes })
}

pub fn workspace_files_in(
    root: &Path,
    project_id: &str,
    worktree_id: &str,
) -> Result<WorkspaceListing, String> {
    let root = root
        .canonicalize()
        .map_err(|_| "The approved worktree is unavailable".to_string())?;
    let mut files = Vec::new();
    let walker = ignore::WalkBuilder::new(&root)
        .hidden(true)
        .git_ignore(true)
        .git_exclude(true)
        .git_global(true)
        .require_git(false)
        .follow_links(false)
        .build();
    for entry in walker {
        let entry = entry.map_err(|_| "The workspace file listing is unavailable".to_string())?;
        let path = entry.path();
        let is_markdown = path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
        if !entry.file_type().is_some_and(|kind| kind.is_file()) || !is_markdown {
            continue;
        }
        let relative = path
            .strip_prefix(&root)
            .map_err(|_| "The workspace file listing escaped its grant".to_string())?
            .to_string_lossy()
            .into_owned();
        files.push(WorkspaceFile {
            resource: ResourceRef {
                project_id: project_id.to_string(),
                worktree_id: worktree_id.to_string(),
                relative_path: relative.clone(),
            },
            relative,
        });
    }
    files.sort_by(|left, right| left.relative.cmp(&right.relative));
    Ok(WorkspaceListing {
        project_id: project_id.to_string(),
        worktree_id: worktree_id.to_string(),
        root: root.to_string_lossy().into_owned(),
        files,
    })
}

#[doc(hidden)]
pub fn read_bounded_file_with_limits(
    path: &Path,
    limit: u64,
    preview_limit: usize,
) -> BoundedFileRead {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) => return read_failure(&error),
    };
    if !metadata.is_file() {
        return BoundedFileRead::Unavailable {
            problem: "The selected resource is not a regular file".to_string(),
        };
    }

    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) => return read_failure(&error),
    };
    let byte_length = metadata.len();
    if byte_length > limit {
        let mut preview = Vec::with_capacity(preview_limit.min(byte_length as usize));
        if let Err(error) = (&mut file)
            .take(preview_limit as u64)
            .read_to_end(&mut preview)
        {
            return read_failure(&error);
        }
        return BoundedFileRead::OverLimit {
            byte_length,
            limit,
            preview: safe_preview(preview),
        };
    }

    let mut bytes = Vec::with_capacity(byte_length as usize);
    if let Err(error) = (&mut file)
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)
    {
        return read_failure(&error);
    }
    if bytes.len() as u64 > limit {
        let current_length = file
            .metadata()
            .map_or(bytes.len() as u64, |current| current.len());
        bytes.truncate(preview_limit.min(bytes.len()));
        return BoundedFileRead::OverLimit {
            byte_length: current_length,
            limit,
            preview: safe_preview(bytes),
        };
    }
    if bytes.contains(&0) {
        return BoundedFileRead::Binary { byte_length };
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(_) => return BoundedFileRead::Undecodable { byte_length },
    };
    let writable = !metadata.permissions().readonly()
        && std::fs::OpenOptions::new().write(true).open(path).is_ok();
    BoundedFileRead::Text {
        text,
        byte_length,
        writable,
        reason: (!writable).then(|| "The filesystem does not grant write access".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::{read_bounded_file_with_limits, BoundedFileRead};
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("the clock is after the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-host-read-{name}-{stamp}"));
            std::fs::create_dir_all(&path).expect("create scratch directory");
            Self(path)
        }

        fn join(&self, relative: &str) -> PathBuf {
            self.0.join(relative)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn classifies_text_binary_undecodable_missing_and_over_limit_files() {
        let scratch = Scratch::new("states");
        let text = scratch.join("main.rs");
        let binary = scratch.join("binary.dat");
        let undecodable = scratch.join("undecodable.txt");
        let large = scratch.join("large.txt");
        std::fs::write(&text, "fn main() {}\n").unwrap();
        std::fs::write(&binary, [b'a', 0, b'b']).unwrap();
        std::fs::write(&undecodable, [0xff, 0xfe]).unwrap();
        std::fs::write(&large, "preview-more").unwrap();

        assert!(matches!(
            read_bounded_file_with_limits(&text, 1024, 64),
            BoundedFileRead::Text { ref text, .. } if text == "fn main() {}\n"
        ));
        assert_eq!(
            read_bounded_file_with_limits(&binary, 1024, 64),
            BoundedFileRead::Binary { byte_length: 3 }
        );
        assert_eq!(
            read_bounded_file_with_limits(&undecodable, 1024, 64),
            BoundedFileRead::Undecodable { byte_length: 2 }
        );
        assert_eq!(
            read_bounded_file_with_limits(&scratch.join("missing.txt"), 1024, 64),
            BoundedFileRead::Missing
        );
        assert_eq!(
            read_bounded_file_with_limits(&large, 5, 7),
            BoundedFileRead::OverLimit {
                byte_length: 12,
                limit: 5,
                preview: Some("preview".to_string()),
            }
        );
    }
}
