//! Bounded clipboard-image persistence below one native-approved worktree.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::cli::LaunchState;

const MAX_CLIPBOARD_IMAGE_BYTES: usize = 16 * 1024 * 1024;
const SCREENSHOT_DIRECTORY: [&str; 2] = ["docs", "screenshots"];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
pub enum ClipboardImageMediaType {
    #[serde(rename = "image/png")]
    Png,
    #[serde(rename = "image/jpeg")]
    Jpeg,
    #[serde(rename = "image/gif")]
    Gif,
    #[serde(rename = "image/webp")]
    Webp,
}

impl ClipboardImageMediaType {
    fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpg",
            Self::Gif => "gif",
            Self::Webp => "webp",
        }
    }

    fn matches(self, bytes: &[u8]) -> bool {
        match self {
            Self::Png => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a]),
            Self::Jpeg => bytes.starts_with(&[0xff, 0xd8, 0xff]) && bytes.ends_with(&[0xff, 0xd9]),
            Self::Gif => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
            Self::Webp => {
                bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
            }
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClipboardImageRequest {
    pub project_id: String,
    pub worktree_id: String,
    pub media_type: ClipboardImageMediaType,
    pub bytes: Vec<u8>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedClipboardImage {
    pub relative_path: String,
}

fn validate_image(media_type: ClipboardImageMediaType, bytes: &[u8]) -> Result<(), String> {
    if bytes.is_empty() {
        return Err("The clipboard image is empty".into());
    }
    if bytes.len() > MAX_CLIPBOARD_IMAGE_BYTES {
        return Err("The clipboard image exceeds the 16 MiB limit".into());
    }
    if !media_type.matches(bytes) {
        return Err("The clipboard bytes do not match their supported image type".into());
    }
    Ok(())
}

fn safe_screenshot_directory(root: &Path) -> Result<PathBuf, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|_| "The clipboard image project is unavailable".to_string())?;
    if !canonical_root.is_dir() {
        return Err("The clipboard image project is not a directory".into());
    }

    let mut directory = canonical_root.clone();
    for component in SCREENSHOT_DIRECTORY {
        directory.push(component);
        match std::fs::symlink_metadata(&directory) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err("The screenshot directory cannot contain symbolic links".into());
            }
            Ok(metadata) if !metadata.is_dir() => {
                return Err("The screenshot destination is not a directory".into());
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                std::fs::create_dir(&directory)
                    .map_err(|_| "The screenshot directory could not be created".to_string())?;
            }
            Err(_) => return Err("The screenshot directory is unavailable".into()),
        }

        let canonical = directory
            .canonicalize()
            .map_err(|_| "The screenshot directory is unavailable".to_string())?;
        if !canonical.starts_with(&canonical_root) {
            return Err("The screenshot directory escaped its approved project".into());
        }
        directory = canonical;
    }
    Ok(directory)
}

fn file_name(stamp: u128, attempt: usize, extension: &str) -> String {
    if attempt == 0 {
        format!("screenshot-{stamp}.{extension}")
    } else {
        format!("screenshot-{stamp}-{attempt}.{extension}")
    }
}

fn write_new_image(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temporary = path.with_file_name(format!(
        ".{}.zd-tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    ));
    let mut file = match OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err("collision".into());
        }
        Err(_) => return Err("The clipboard image could not be written".into()),
    };

    let written = file.write_all(bytes).and_then(|()| file.sync_all());
    drop(file);
    if written.is_err() {
        let _ = std::fs::remove_file(&temporary);
        return Err("The clipboard image could not be written".into());
    }
    let installed = std::fs::hard_link(&temporary, path);
    let _ = std::fs::remove_file(&temporary);
    match installed {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            return Err("collision".into());
        }
        Err(_) => return Err("The clipboard image could not be installed".into()),
    }
    if let Some(directory) = path.parent() {
        if let Ok(handle) = std::fs::File::open(directory) {
            let _ = handle.sync_all();
        }
    }
    Ok(())
}

fn save_clipboard_image_in(
    root: &Path,
    media_type: ClipboardImageMediaType,
    bytes: &[u8],
    stamp: u128,
) -> Result<SavedClipboardImage, String> {
    validate_image(media_type, bytes)?;
    let directory = safe_screenshot_directory(root)?;
    let extension = media_type.extension();

    for attempt in 0..1_000 {
        let name = file_name(stamp, attempt, extension);
        let target = directory.join(&name);
        match write_new_image(&target, bytes) {
            Ok(()) => {
                return Ok(SavedClipboardImage {
                    relative_path: format!("docs/screenshots/{name}"),
                });
            }
            Err(problem) if problem == "collision" => continue,
            Err(problem) => return Err(problem),
        }
    }
    Err("A unique screenshot name could not be allocated".into())
}

#[tauri::command]
pub fn save_clipboard_image(
    launch: tauri::State<'_, LaunchState>,
    request: ClipboardImageRequest,
) -> Result<SavedClipboardImage, String> {
    let root = launch.root(&request.project_id, &request.worktree_id)?;
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    save_clipboard_image_in(&root, request.media_type, &request.bytes, stamp)
}

#[cfg(test)]
mod tests {
    use super::{
        save_clipboard_image_in, ClipboardImageMediaType, ClipboardImageRequest,
        MAX_CLIPBOARD_IMAGE_BYTES,
    };
    use serde_json::json;
    use std::path::{Path, PathBuf};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-clipboard-{name}-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }

        fn join(&self, path: &str) -> PathBuf {
            self.0.join(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn png() -> Vec<u8> {
        vec![0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]
    }

    #[test]
    fn saves_only_below_docs_screenshots_and_returns_a_logical_path() {
        let scratch = Scratch::new("save");

        let saved =
            save_clipboard_image_in(scratch.path(), ClipboardImageMediaType::Png, &png(), 42)
                .unwrap();

        assert_eq!(saved.relative_path, "docs/screenshots/screenshot-42.png");
        assert_eq!(
            std::fs::read(scratch.join(&saved.relative_path)).unwrap(),
            png()
        );
        let files: Vec<_> = std::fs::read_dir(scratch.join("docs/screenshots"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(files, ["screenshot-42.png"]);
    }

    #[test]
    fn collisions_allocate_a_new_name_without_replacing_existing_bytes() {
        let scratch = Scratch::new("collision");
        std::fs::create_dir_all(scratch.join("docs/screenshots")).unwrap();
        std::fs::write(
            scratch.join("docs/screenshots/screenshot-42.png"),
            b"existing",
        )
        .unwrap();

        let saved =
            save_clipboard_image_in(scratch.path(), ClipboardImageMediaType::Png, &png(), 42)
                .unwrap();

        assert_eq!(saved.relative_path, "docs/screenshots/screenshot-42-1.png");
        assert_eq!(
            std::fs::read(scratch.join("docs/screenshots/screenshot-42.png")).unwrap(),
            b"existing"
        );
    }

    #[test]
    fn accepts_each_supported_signature_with_its_native_owned_extension() {
        let scratch = Scratch::new("formats");
        for (stamp, media_type, bytes, extension) in [
            (1, ClipboardImageMediaType::Png, png(), "png"),
            (
                2,
                ClipboardImageMediaType::Jpeg,
                vec![0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9],
                "jpg",
            ),
            (
                3,
                ClipboardImageMediaType::Gif,
                b"GIF89a-data".to_vec(),
                "gif",
            ),
            (
                4,
                ClipboardImageMediaType::Webp,
                b"RIFFsizeWEBP".to_vec(),
                "webp",
            ),
        ] {
            let saved = save_clipboard_image_in(scratch.path(), media_type, &bytes, stamp).unwrap();

            assert_eq!(
                saved.relative_path,
                format!("docs/screenshots/screenshot-{stamp}.{extension}")
            );
            assert_eq!(
                std::fs::read(scratch.join(&saved.relative_path)).unwrap(),
                bytes
            );
        }
    }

    #[test]
    fn rejects_empty_oversized_mismatched_and_unknown_image_inputs() {
        let scratch = Scratch::new("invalid");
        for bytes in [
            Vec::new(),
            vec![0; MAX_CLIPBOARD_IMAGE_BYTES + 1],
            b"not png".to_vec(),
        ] {
            assert!(save_clipboard_image_in(
                scratch.path(),
                ClipboardImageMediaType::Png,
                &bytes,
                42,
            )
            .is_err());
        }
        assert!(!scratch.join("docs").exists());

        let request = json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "mediaType": "image/svg+xml",
            "bytes": [1, 2, 3]
        });
        assert!(serde_json::from_value::<ClipboardImageRequest>(request).is_err());
    }

    #[test]
    fn request_cannot_choose_a_path_name_or_directory() {
        let base = json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "mediaType": "image/png",
            "bytes": png()
        });
        for extra in [
            json!({ "path": "/tmp/outside.png" }),
            json!({ "directory": "elsewhere" }),
            json!({ "fileName": "chosen.png" }),
        ] {
            let mut request = base.clone();
            request
                .as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            assert!(serde_json::from_value::<ClipboardImageRequest>(request).is_err());
        }
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symbolic_link_escape_in_the_fixed_destination() {
        use std::os::unix::fs::symlink;

        let scratch = Scratch::new("symlink");
        let outside = Scratch::new("outside");
        symlink(outside.path(), scratch.join("docs")).unwrap();

        let problem =
            save_clipboard_image_in(scratch.path(), ClipboardImageMediaType::Png, &png(), 42)
                .unwrap_err();

        assert!(problem.contains("symbolic links"));
        assert!(!outside.join("screenshots").exists());
    }
}
