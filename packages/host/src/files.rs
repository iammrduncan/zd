//! Bounded file reads below an already-resolved host grant.

use std::io::Read;
use std::path::Path;

use serde::Serialize;

pub const EDITABLE_FILE_LIMIT_BYTES: u64 = 8 * 1024 * 1024;
pub const FILE_PREVIEW_LIMIT_BYTES: usize = 64 * 1024;

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
