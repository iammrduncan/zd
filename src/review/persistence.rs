use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use super::{FORMAT_VERSION, ReviewError, ReviewFile};

pub const MAX_REVIEW_BYTES: usize = 1024 * 1024;
const REVIEW_DIRECTORY: &str = ".zd";
const REVIEW_FILE: &str = "review-v1.json";

pub(super) fn load(root: &Path) -> Result<ReviewFile, ReviewError> {
    let directory = root.join(REVIEW_DIRECTORY);
    reject_symlink_if_present(&directory)?;
    let path = directory.join(REVIEW_FILE);
    reject_symlink_if_present(&path)?;
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ReviewFile {
                version: FORMAT_VERSION,
                comments: Vec::new(),
            });
        }
        Err(error) => return Err(error.into()),
    };
    if file.metadata()?.len() > MAX_REVIEW_BYTES as u64 {
        return Err(ReviewError::TooLarge);
    }
    let mut bytes = Vec::new();
    file.take(MAX_REVIEW_BYTES as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > MAX_REVIEW_BYTES {
        return Err(ReviewError::TooLarge);
    }
    Ok(serde_json::from_slice(&bytes)?)
}

pub(super) fn save(root: &Path, review: &ReviewFile) -> Result<(), ReviewError> {
    let directory = root.join(REVIEW_DIRECTORY);
    reject_symlink_if_present(&directory)?;
    fs::create_dir_all(&directory)?;
    reject_symlink_if_present(&directory)?;
    let path = directory.join(REVIEW_FILE);
    reject_symlink_if_present(&path)?;
    let bytes = serde_json::to_vec_pretty(review)?;
    if bytes.len().saturating_add(1) > MAX_REVIEW_BYTES {
        return Err(ReviewError::TooLarge);
    }
    let (temporary, mut file) = create_temporary(&directory)?;
    let mut cleanup = Temporary::new(temporary.clone());
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    fs::rename(&temporary, &path)?;
    cleanup.persisted = true;
    File::open(directory)?.sync_all()?;
    Ok(())
}

fn reject_symlink_if_present(path: &Path) -> Result<(), ReviewError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(ReviewError::SymbolicLink),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn create_temporary(directory: &Path) -> Result<(PathBuf, File), ReviewError> {
    for attempt in 0..128 {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!(".{attempt}")
        };
        let path = directory.join(format!(".{REVIEW_FILE}.{}{suffix}.tmp", std::process::id()));
        match OpenOptions::new().create_new(true).write(true).open(&path) {
            Ok(file) => return Ok((path, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error.into()),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "no unique review temporary filename is available",
    )
    .into())
}

struct Temporary {
    path: PathBuf,
    persisted: bool,
}

impl Temporary {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            persisted: false,
        }
    }
}

impl Drop for Temporary {
    fn drop(&mut self) {
        if !self.persisted {
            let _ = fs::remove_file(&self.path);
        }
    }
}
