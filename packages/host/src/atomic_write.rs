use std::fs::{File, OpenOptions};
use std::io::{Error, ErrorKind, Write};
use std::path::{Path, PathBuf};

const TEMPORARY_CREATE_ATTEMPTS: usize = 8;

/// Durably replace one file with complete bytes from a sibling temporary file.
///
/// Keeping the temporary beside the target makes the rename atomic on one
/// filesystem. Flushing the temporary before the rename prevents a durable
/// directory entry from pointing at incomplete bytes. The rename deliberately
/// replaces symlinks and breaks hard links in exchange for crash-safe contents.
pub fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    atomic_write_before_rename(path, contents, |_| Ok(()))
}

fn atomic_write_before_rename(
    path: &Path,
    contents: &[u8],
    before_rename: impl FnOnce(&Path) -> std::io::Result<()>,
) -> std::io::Result<()> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let (temporary, mut file) = create_temporary(path)?;

    let result = (|| {
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);

        if let Ok(existing) = std::fs::metadata(path) {
            std::fs::set_permissions(&temporary, existing.permissions())?;
        }
        before_rename(&temporary)?;
        std::fs::rename(&temporary, path)?;

        if let Ok(handle) = File::open(directory) {
            let _ = handle.sync_all();
        }
        Ok(())
    })();

    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

fn create_temporary(path: &Path) -> std::io::Result<(PathBuf, File)> {
    for _ in 0..TEMPORARY_CREATE_ATTEMPTS {
        let temporary = temporary_beside(path)?;
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => return Ok((temporary, file)),
            Err(error) if error.kind() == ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
    }
    Err(Error::new(
        ErrorKind::AlreadyExists,
        "could not allocate a sibling temporary file",
    ))
}

fn temporary_beside(path: &Path) -> std::io::Result<PathBuf> {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let mut random = [0_u8; 16];
    getrandom::fill(&mut random).map_err(Error::other)?;
    Ok(path.with_file_name(format!(".{name}.zd-{}.tmp", hexadecimal(&random))))
}

fn hexadecimal(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a string cannot fail");
    }
    encoded
}

#[cfg(test)]
mod tests {
    use super::{atomic_write, atomic_write_before_rename, temporary_beside};
    use std::path::{Path, PathBuf};

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-atomic-{name}-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn temporary_files_are_unique_siblings_and_success_leaves_none_behind() {
        let scratch = Scratch::new("sibling");
        let target = scratch.0.join("notes.md");
        let first = temporary_beside(&target).unwrap();
        let second = temporary_beside(&target).unwrap();

        assert_eq!(first.parent(), target.parent());
        assert_eq!(second.parent(), target.parent());
        assert_ne!(first, second);
        atomic_write(&target, b"one\n").unwrap();
        atomic_write(&target, b"two\n").unwrap();
        assert_eq!(std::fs::read(&target).unwrap(), b"two\n");
        assert_eq!(std::fs::read_dir(&scratch.0).unwrap().count(), 1);
    }

    #[test]
    fn a_failed_replacement_keeps_the_prior_complete_file() {
        let scratch = Scratch::new("failure");
        let target = scratch.0.join("notes.md");
        std::fs::write(&target, b"the version that must survive\n").unwrap();

        let result = atomic_write_before_rename(&target, b"replacement\n", |_| {
            Err(std::io::Error::other("injected before rename"))
        });

        assert!(result.is_err());
        assert_eq!(
            std::fs::read(&target).unwrap(),
            b"the version that must survive\n"
        );
        assert_eq!(std::fs::read_dir(&scratch.0).unwrap().count(), 1);
    }

    #[test]
    fn the_target_may_be_in_the_current_directory() {
        let target = Path::new("notes.md");
        assert_eq!(
            temporary_beside(target).unwrap().parent(),
            Some(Path::new(""))
        );
    }
}
