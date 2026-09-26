use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

use thiserror::Error;

use crate::document::{Document, DocumentError};
use crate::workspace::{Workspace, WorkspaceError};

pub const MAX_IMAGE_DIMENSION: u32 = 4_096;
pub const MAX_DECODED_IMAGE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_ENCODED_IMAGE_BYTES: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RgbaImage {
    pub width: u32,
    pub height: u32,
    pub pixels: Vec<u8>,
}

pub trait ClipboardImage {
    fn read_image(&mut self) -> Result<RgbaImage, ImageError>;
}

#[derive(Debug, Default)]
pub struct SystemClipboard;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImageInstall {
    pub relative_path: PathBuf,
    pub reused: bool,
}

#[derive(Debug, Error)]
pub enum ImageError {
    #[error("image clipboard unavailable: {0}")]
    Unavailable(String),
    #[error("clipboard image dimensions are zero or exceed {MAX_IMAGE_DIMENSION} pixels")]
    InvalidDimensions,
    #[error("clipboard RGBA byte length does not match its dimensions")]
    InvalidDecodedLength,
    #[error("clipboard image exceeds the {MAX_DECODED_IMAGE_BYTES}-byte decoded limit")]
    DecodedTooLarge,
    #[error("encoded PNG exceeds the {MAX_ENCODED_IMAGE_BYTES}-byte limit")]
    EncodedTooLarge,
    #[error("PNG encoding failed: {0}")]
    Encoding(#[from] png::EncodingError),
    #[error("image I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error(transparent)]
    Document(#[from] DocumentError),
    #[error("paste image is available only for a project-relative Markdown document")]
    NotMarkdown,
    #[error("the zd-images path is a symbolic link or escapes the project")]
    UnsafeDirectory,
    #[error("the zd-images path is not a directory")]
    NotDirectory,
    #[error("an existing content-hash image has different bytes")]
    Collision,
}

impl ClipboardImage for SystemClipboard {
    fn read_image(&mut self) -> Result<RgbaImage, ImageError> {
        let mut clipboard = arboard::Clipboard::new()
            .map_err(|error| ImageError::Unavailable(error.to_string()))?;
        let image = clipboard
            .get_image()
            .map_err(|error| ImageError::Unavailable(error.to_string()))?;
        let width = u32::try_from(image.width).map_err(|_| ImageError::InvalidDimensions)?;
        let height = u32::try_from(image.height).map_err(|_| ImageError::InvalidDimensions)?;
        Ok(RgbaImage {
            width,
            height,
            pixels: image.bytes.into_owned(),
        })
    }
}

pub fn paste_image(
    workspace: &Workspace,
    relative_document: &Path,
    document: &mut Document,
    clipboard: &mut impl ClipboardImage,
    alt_text: &str,
) -> Result<ImageInstall, ImageError> {
    validate_document_path(relative_document)?;
    let absolute_document = workspace.resolve(relative_document)?;
    let parent = absolute_document.parent().ok_or(ImageError::NotMarkdown)?;
    if !parent.starts_with(workspace.root()) {
        return Err(ImageError::UnsafeDirectory);
    }

    let image = clipboard.read_image()?;
    let encoded = encode_png(&image)?;
    let hash = blake3::hash(&encoded).to_hex();
    let filename = format!("image-{hash}.png");
    let image_directory = ensure_image_directory(workspace.root(), parent)?;
    let absolute_image = image_directory.join(&filename);
    let mut pending = install(&absolute_image, &encoded)?;
    let relative_path = PathBuf::from("zd-images").join(&filename);
    let alt_text = markdown_alt(alt_text);
    let link = format!("![{alt_text}](zd-images/{filename})");
    document.insert(&link)?;
    pending.commit();
    Ok(ImageInstall {
        relative_path,
        reused: pending.reused,
    })
}

pub fn encode_png(image: &RgbaImage) -> Result<Vec<u8>, ImageError> {
    validate_image(image)?;
    let mut encoded = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut encoded, image.width, image.height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header()?;
        writer.write_image_data(&image.pixels)?;
    }
    if encoded.len() > MAX_ENCODED_IMAGE_BYTES {
        return Err(ImageError::EncodedTooLarge);
    }
    Ok(encoded)
}

fn validate_image(image: &RgbaImage) -> Result<(), ImageError> {
    if image.width == 0
        || image.height == 0
        || image.width > MAX_IMAGE_DIMENSION
        || image.height > MAX_IMAGE_DIMENSION
    {
        return Err(ImageError::InvalidDimensions);
    }
    let decoded = usize::try_from(image.width)
        .ok()
        .and_then(|width| {
            usize::try_from(image.height)
                .ok()
                .and_then(|height| width.checked_mul(height))
        })
        .and_then(|pixels| pixels.checked_mul(4))
        .ok_or(ImageError::DecodedTooLarge)?;
    if decoded > MAX_DECODED_IMAGE_BYTES {
        return Err(ImageError::DecodedTooLarge);
    }
    if decoded != image.pixels.len() {
        return Err(ImageError::InvalidDecodedLength);
    }
    Ok(())
}

fn validate_document_path(path: &Path) -> Result<(), ImageError> {
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
        || !path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
    {
        return Err(ImageError::NotMarkdown);
    }
    Ok(())
}

fn ensure_image_directory(root: &Path, parent: &Path) -> Result<PathBuf, ImageError> {
    let directory = parent.join("zd-images");
    match fs::symlink_metadata(&directory) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(ImageError::UnsafeDirectory);
        }
        Ok(metadata) if !metadata.is_dir() => return Err(ImageError::NotDirectory),
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            fs::create_dir(&directory)?;
        }
        Err(error) => return Err(error.into()),
    }
    let metadata = fs::symlink_metadata(&directory)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(ImageError::UnsafeDirectory);
    }
    let canonical = fs::canonicalize(&directory)?;
    if !canonical.starts_with(root) || canonical != directory {
        return Err(ImageError::UnsafeDirectory);
    }
    Ok(directory)
}

fn install(path: &Path, encoded: &[u8]) -> Result<PendingImage, ImageError> {
    match OpenOptions::new().create_new(true).write(true).open(path) {
        Ok(mut file) => {
            let pending = PendingImage::new(path.to_path_buf(), false);
            file.write_all(encoded)?;
            file.sync_all()?;
            Ok(pending)
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let file = File::open(path)?;
            if file.metadata()?.len() > MAX_ENCODED_IMAGE_BYTES as u64 {
                return Err(ImageError::Collision);
            }
            let mut existing = Vec::new();
            file.take(MAX_ENCODED_IMAGE_BYTES as u64 + 1)
                .read_to_end(&mut existing)?;
            if existing != encoded {
                return Err(ImageError::Collision);
            }
            Ok(PendingImage::new(path.to_path_buf(), true))
        }
        Err(error) => Err(error.into()),
    }
}

fn markdown_alt(text: &str) -> String {
    let mut alt = String::new();
    for character in text.chars() {
        if alt.len() >= 128 {
            break;
        }
        match character {
            ']' => alt.push_str("\\]"),
            '\n' | '\r' => alt.push(' '),
            character if character.is_control() => alt.push(' '),
            character => alt.push(character),
        }
    }
    if alt.is_empty() {
        "pasted image".to_string()
    } else {
        alt
    }
}

struct PendingImage {
    path: PathBuf,
    reused: bool,
    written: bool,
    committed: bool,
}

impl PendingImage {
    fn new(path: PathBuf, reused: bool) -> Self {
        Self {
            path,
            reused,
            written: !reused,
            committed: reused,
        }
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for PendingImage {
    fn drop(&mut self) {
        if self.written && !self.committed {
            let _ = fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::PendingImage;

    #[test]
    fn an_uncommitted_new_file_is_removed_even_before_a_complete_write() {
        let directory = tempdir().unwrap();
        let path = directory.path().join("partial.png");
        fs::write(&path, "partial").unwrap();

        drop(PendingImage::new(path.clone(), false));

        assert!(!path.exists());
    }
}
