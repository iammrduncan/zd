use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMPORARY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

pub(super) fn atomic_write(path: &Path, contents: &[u8]) -> std::io::Result<()> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let (temporary, mut file) = create_temporary(path)?;
    let result = (|| {
        file.write_all(contents)?;
        file.sync_all()?;
        drop(file);
        if let Ok(existing) = std::fs::metadata(path)
            && existing.is_file()
        {
            std::fs::set_permissions(&temporary, existing.permissions())?;
        }
        std::fs::rename(&temporary, path)?;
        if let Ok(directory) = File::open(directory) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(temporary);
    }
    result
}

fn create_temporary(path: &Path) -> std::io::Result<(PathBuf, File)> {
    for _ in 0..8 {
        let sequence = TEMPORARY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let name = path.file_name().unwrap_or_default().to_string_lossy();
        let temporary =
            path.with_file_name(format!(".{name}.zd-{}-{sequence}.tmp", std::process::id()));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
        {
            Ok(file) => return Ok((temporary, file)),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(std::io::Error::new(
        std::io::ErrorKind::AlreadyExists,
        "could not allocate a sibling temporary file",
    ))
}
