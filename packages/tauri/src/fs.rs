//! File and link access for the frontend.
//!
//! Directory walking, watching, and recovery arrive with the sessions that need
//! them (2.1, 3.1).

use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use crate::cli::LaunchState;
use crate::grants::ResourceRef;
use tauri_plugin_opener::OpenerExt;

const EDITABLE_FILE_LIMIT: u64 = 8 * 1024 * 1024;
const FILE_PREVIEW_LIMIT: usize = 64 * 1024;

/// One file in the retained bounded Markdown listing, named for opening and display.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WorkspaceFile {
    pub resource: ResourceRef,
    pub relative: String,
}

/// The retained Markdown-only listing used by compatibility file-open flows.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WorkspaceListing {
    #[serde(rename = "projectId")]
    pub project_id: String,
    #[serde(rename = "worktreeId")]
    pub worktree_id: String,
    pub root: String,
    pub files: Vec<WorkspaceFile>,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
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

fn bounded_file_read(path: &Path, limit: u64, preview_limit: usize) -> BoundedFileRead {
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

#[tauri::command]
pub fn read_bounded_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> BoundedFileRead {
    let path = match launch.resolve(&resource) {
        Ok(path) => path,
        Err(_) => {
            return BoundedFileRead::Unavailable {
                problem: "File authority is unavailable".to_string(),
            }
        }
    };
    bounded_file_read(&path, EDITABLE_FILE_LIMIT, FILE_PREVIEW_LIMIT)
}

#[tauri::command]
pub fn read_text_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> Result<String, String> {
    let path = launch.resolve(&resource)?;
    std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))
}

/// List Markdown files below an approved root in stable display order.
fn workspace_files_in(
    root: &Path,
    project_id: &str,
    worktree_id: &str,
) -> Result<WorkspaceListing, String> {
    let root = root
        .canonicalize()
        .map_err(|error| format!("{}: {error}", root.display()))?;
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
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let is_markdown = path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
        if !entry.file_type().is_some_and(|kind| kind.is_file()) || !is_markdown {
            continue;
        }

        let relative = path
            .strip_prefix(&root)
            .map_err(|error| format!("{}: {error}", path.display()))?;
        files.push(WorkspaceFile {
            resource: ResourceRef {
                project_id: project_id.to_string(),
                worktree_id: worktree_id.to_string(),
                relative_path: relative.to_string_lossy().into_owned(),
            },
            relative: relative.to_string_lossy().into_owned(),
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

/// Retained grant-scoped Markdown listing. New navigation uses `file_tree_snapshot`.
#[tauri::command]
pub fn workspace_files(
    launch: tauri::State<'_, LaunchState>,
    project_id: String,
    worktree_id: String,
) -> Result<WorkspaceListing, String> {
    let root = launch.root(&project_id, &worktree_id)?;
    workspace_files_in(&root, &project_id, &worktree_id)
}

/// Save a document. Vision §6.3: "`cmd+s` saves. Writes are atomic."
///
/// Atomic here means the strong thing: at no instant does the path hold a
/// half-written file. The only two states a caller can ever observe are the
/// old contents and the new ones, even if the power goes out between them.
///
/// A plain `write` cannot promise that. It truncates first, so a crash — or a
/// full disk, or the process being killed — leaves the file empty or cut off,
/// and the user's document is gone with no copy anywhere. That is the one
/// failure this app must never have: the whole point of a writing tool is that
/// what you wrote is still there.
#[tauri::command]
pub fn write_text_file(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
    contents: String,
) -> Result<(), String> {
    let path = launch.resolve(&resource)?;
    atomic_write(&path, &contents).map_err(|error| format!("{}: {error}", path.display()))
}

/// What the file on disk looked like when we last agreed with it.
///
/// Vision §6.3: "External changes to an open file are detected and reconciled,
/// not silently clobbered." Detecting the change is this, and it is deliberately
/// *not* a file watcher: a watcher is a plugin, a background thread, and a stream
/// of events to debounce, and none of that is needed to answer the only question
/// that matters — "is the file still the one I read?"
///
/// Modified time *and* length, because either alone lies. Timestamps have coarse
/// resolution on some filesystems, so a fast rewrite of the same length can land
/// in the same tick; and a length is unchanged by any edit that swaps one
/// character for another. Together they miss only a same-length edit inside one
/// timestamp tick, which needs a machine writing the file rather than a person.
///
/// A missing file is `None` rather than an error. It is a real state — the
/// document was deleted or moved while open — and it is the caller's to explain,
/// not an exception to handle.
#[tauri::command]
pub fn file_stamp(
    launch: tauri::State<'_, LaunchState>,
    resource: ResourceRef,
) -> Result<Option<FileStamp>, String> {
    let path = launch.resolve(&resource)?;
    stamp_of(&path)
}

/// The stamp itself, with no scope and no IPC — what the command does once the path
/// has been allowed.
///
/// Separate so the tests below can ask the question directly. A `tauri::State` cannot
/// be built outside a running app, so a test that went through the command would be
/// testing the framework's injection rather than the answer.
fn stamp_of(path: &Path) -> Result<Option<FileStamp>, String> {
    let metadata = match std::fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(format!("{}: {error}", path.display())),
    };

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

/// Identity enough to notice someone else wrote the file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
pub struct FileStamp {
    /// Milliseconds since the epoch, or `None` where the platform has no mtime.
    pub modified: Option<u64>,
    pub length: u64,
}

/// Write `contents` to `path` via a temporary file and a rename.
///
/// The rename is the atomic step, and it is only atomic *within a filesystem* —
/// so the temporary must be a sibling of the target rather than in the system
/// temp directory, which is very often a different mount. Getting that wrong
/// turns the rename into a copy-and-delete and quietly gives up the guarantee
/// this whole function exists for.
///
/// The `sync_all` before the rename is the other half. Without it the rename can
/// reach the disk before the bytes do, and a crash in that window leaves the
/// document present, correctly named, and empty.
///
/// # What a rename costs, decided rather than discovered
///
/// Audit finding L6. A rename over a path *replaces the path*, and three things
/// follow that a plain write would not do:
///
/// - A **symlink** at `path` is replaced by a regular file. Someone whose notes
///   are symlinked in from a dotfile manager gets a real file where their link
///   was, and the original stops being written to.
/// - **Hard links** to the file are broken: the other names keep the old content.
/// - **File watchers** see delete-then-create rather than a modification, which
///   some rebuild tools handle badly.
///
/// Every editor with atomic saves faces this; VS Code ships a setting to turn it
/// off. The trade is taken deliberately here: none of the three loses data, and
/// the alternative — writing in place — loses the *whole document* on a crash
/// mid-write, which is the failure this app cares most about. §6.3 promises what
/// you wrote is still there, and it promises that about the bytes rather than
/// about the inode.
///
/// It is written down rather than fixed because fixing it is a decision with a
/// cost either way, and because `fs::canonicalize` before writing resolves the
/// symlink case for free — which is arriving anyway with the path scoping in
/// audit M2. Revisit it there, not before.
fn atomic_write(path: &Path, contents: &str) -> std::io::Result<()> {
    let directory = path.parent().unwrap_or_else(|| Path::new("."));
    let temporary = temporary_beside(path);

    // A scope, so the handle is closed before the rename — Windows refuses to
    // replace a file that is still open.
    {
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(contents.as_bytes())?;
        file.sync_all()?;
    }

    // Keep whatever mode the document already had. A fresh temporary is created
    // with the process umask, so without this a save would silently relax or
    // tighten the permissions on someone's file.
    if let Ok(existing) = std::fs::metadata(path) {
        let _ = std::fs::set_permissions(&temporary, existing.permissions());
    }

    if let Err(error) = std::fs::rename(&temporary, path) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }

    // The rename itself needs flushing too, or the directory entry can be lost
    // while both files' contents survive. Best effort: some platforms refuse to
    // open a directory, and a save that worked should not report failure.
    if let Ok(handle) = std::fs::File::open(directory) {
        let _ = handle.sync_all();
    }

    Ok(())
}

/// A sibling path for the temporary, hidden and marked so it is recognisable if
/// a crash ever leaves one behind.
fn temporary_beside(path: &Path) -> PathBuf {
    let name = path.file_name().unwrap_or_default().to_string_lossy();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or(0);

    path.with_file_name(format!(".{name}.zd-{stamp}.tmp"))
}

/// Hand a link to the system browser.
///
/// Only `http` and `https` leave the process. The editor resolves everything
/// else itself (vision §4.3, finding F01), so anything other than those two
/// schemes reaching here — `file:`, `javascript:`, a custom handler — is a bug
/// or an attack, and is refused at this boundary rather than passed to the OS.
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> Result<(), String> {
    if !is_web_url(&url) {
        return Err(format!("refused to open a non-web url: {url}"));
    }

    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())
}

fn is_web_url(url: &str) -> bool {
    let lowered = url.trim().to_ascii_lowercase();
    lowered.starts_with("http://") || lowered.starts_with("https://")
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write, bounded_file_read, is_web_url, stamp_of, temporary_beside,
        workspace_files_in, BoundedFileRead,
    };
    use std::path::{Path, PathBuf};

    /// A directory of our own under the system temp dir, removed on drop.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-{name}-{stamp}"));
            std::fs::create_dir_all(&path).unwrap();
            Scratch(path)
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

    #[test]
    fn workspace_files_are_recursive_markdown_only_and_stable() {
        let scratch = Scratch::new("workspace-files");
        std::fs::create_dir_all(scratch.join("notes")).unwrap();
        std::fs::create_dir_all(scratch.join(".private")).unwrap();
        std::fs::create_dir_all(scratch.join("generated")).unwrap();
        atomic_write(&scratch.join("z.md"), "# Z\n").unwrap();
        atomic_write(&scratch.join("notes/a.MD"), "# A\n").unwrap();
        atomic_write(&scratch.join("notes/ignore.txt"), "not markdown\n").unwrap();
        atomic_write(&scratch.join(".hidden.md"), "hidden\n").unwrap();
        atomic_write(&scratch.join(".private/secret.md"), "secret\n").unwrap();
        atomic_write(&scratch.join("generated/ignored.md"), "generated\n").unwrap();
        atomic_write(&scratch.join(".gitignore"), "generated/\n").unwrap();

        let workspace = workspace_files_in(&scratch.0, "project-a", "worktree-a").unwrap();
        let relative: Vec<_> = workspace
            .files
            .iter()
            .map(|file| file.relative.as_str())
            .collect();

        assert_eq!(relative, vec!["notes/a.MD", "z.md"]);
        assert!(workspace.files.iter().all(|file| {
            file.resource.project_id == "project-a"
                && file.resource.worktree_id == "worktree-a"
                && file.resource.relative_path == file.relative
        }));
        let json = serde_json::to_value(&workspace.files[0]).unwrap();
        assert!(json.get("resource").is_some());
        assert!(json.get("path").is_none());
    }

    #[test]
    fn a_missing_file_has_no_stamp() {
        let scratch = Scratch::new("stamp-missing");
        let path = scratch.join("never-written.md");

        // Not an error. A document deleted or moved while open is a real state and
        // the caller's to explain — §7.10 puts read state at the document.
        assert_eq!(stamp_of(&path).unwrap(), None);
    }

    #[test]
    fn a_stamp_reports_the_length() {
        let scratch = Scratch::new("stamp-length");
        let path = scratch.join("doc.md");
        atomic_write(&path, "hello").unwrap();

        let stamp = stamp_of(&path).unwrap().unwrap();
        assert_eq!(stamp.length, 5);
    }

    #[test]
    fn bounded_read_classifies_editable_utf8_without_guessing() {
        let scratch = Scratch::new("bounded-text");
        let path = scratch.join("main.rs");
        std::fs::write(&path, "fn main() {}\n").unwrap();

        assert_eq!(
            bounded_file_read(&path, 1024, 64),
            BoundedFileRead::Text {
                text: "fn main() {}\n".to_string(),
                byte_length: 13,
                writable: true,
                reason: None,
            }
        );
    }

    #[test]
    fn bounded_read_distinguishes_binary_undecodable_missing_and_over_limit() {
        let scratch = Scratch::new("bounded-states");
        let binary = scratch.join("binary.dat");
        let undecodable = scratch.join("undecodable.txt");
        let large = scratch.join("large.txt");
        std::fs::write(&binary, [b'a', 0, b'b']).unwrap();
        std::fs::write(&undecodable, [0xff, 0xfe]).unwrap();
        std::fs::write(&large, "preview-more").unwrap();

        assert_eq!(
            bounded_file_read(&binary, 1024, 64),
            BoundedFileRead::Binary { byte_length: 3 }
        );
        assert_eq!(
            bounded_file_read(&undecodable, 1024, 64),
            BoundedFileRead::Undecodable { byte_length: 2 }
        );
        assert_eq!(
            bounded_file_read(&scratch.join("missing.txt"), 1024, 64),
            BoundedFileRead::Missing
        );
        assert_eq!(
            bounded_file_read(&large, 5, 7),
            BoundedFileRead::OverLimit {
                byte_length: 12,
                limit: 5,
                preview: Some("preview".to_string()),
            }
        );
    }

    #[test]
    fn bounded_read_marks_filesystem_read_only_text_without_hiding_it() {
        let scratch = Scratch::new("bounded-read-only");
        let path = scratch.join("notes.md");
        std::fs::write(&path, "still visible").unwrap();
        let original_permissions = std::fs::metadata(&path).unwrap().permissions();
        let mut permissions = original_permissions.clone();
        permissions.set_readonly(true);
        std::fs::set_permissions(&path, permissions).unwrap();

        assert!(matches!(
            bounded_file_read(&path, 1024, 64),
            BoundedFileRead::Text {
                writable: false,
                reason: Some(_),
                ..
            }
        ));

        std::fs::set_permissions(&path, original_permissions).unwrap();
    }

    #[test]
    fn reading_the_same_unchanged_file_twice_gives_the_same_stamp() {
        let scratch = Scratch::new("stamp-stable");
        let path = scratch.join("doc.md");
        atomic_write(&path, "hello").unwrap();

        // The half that matters most: a stamp that drifted on its own would report
        // an external change on every save and make the guarantee unusable.
        let first = stamp_of(&path).unwrap();
        let second = stamp_of(&path).unwrap();
        assert_eq!(first, second);
    }

    #[test]
    fn an_edit_that_changes_the_length_changes_the_stamp() {
        let scratch = Scratch::new("stamp-grows");
        let path = scratch.join("doc.md");
        atomic_write(&path, "hello").unwrap();
        let before = stamp_of(&path).unwrap();

        atomic_write(&path, "hello there").unwrap();
        let after = stamp_of(&path).unwrap();

        assert_ne!(before, after);
    }

    #[test]
    fn an_edit_of_the_same_length_still_changes_the_stamp() {
        let scratch = Scratch::new("stamp-same-length");
        let path = scratch.join("doc.md");
        atomic_write(&path, "hello").unwrap();
        let before = stamp_of(&path).unwrap();

        // A whole second, so the modified time genuinely moves on a filesystem
        // whose timestamps are coarse. This is the case length alone cannot see,
        // and the reason the stamp carries both.
        std::thread::sleep(std::time::Duration::from_millis(1100));
        atomic_write(&path, "world").unwrap();
        let after = stamp_of(&path).unwrap();

        assert_eq!(before.unwrap().length, after.unwrap().length);
        assert_ne!(before, after);
    }

    #[test]
    fn writes_a_new_document() {
        let scratch = Scratch::new("new");
        let path = scratch.join("notes.md");

        atomic_write(&path, "# Notes\n").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "# Notes\n");
    }

    #[test]
    fn replaces_an_existing_document_whole() {
        let scratch = Scratch::new("replace");
        let path = scratch.join("notes.md");
        std::fs::write(&path, "a much longer previous version of the file\n").unwrap();

        atomic_write(&path, "short\n").unwrap();

        // Not merely "starts with" — a write that truncated badly would leave
        // the tail of the old document behind.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "short\n");
    }

    #[test]
    fn leaves_no_temporary_behind() {
        let scratch = Scratch::new("clean");
        let path = scratch.join("notes.md");

        atomic_write(&path, "one\n").unwrap();
        atomic_write(&path, "two\n").unwrap();

        let left: Vec<_> = std::fs::read_dir(&scratch.0)
            .unwrap()
            .map(|entry| entry.unwrap().file_name())
            .collect();
        assert_eq!(left, vec![std::ffi::OsString::from("notes.md")]);
    }

    #[test]
    fn the_temporary_is_a_sibling_of_the_target() {
        // The whole guarantee rests on this: rename is only atomic within one
        // filesystem, and the system temp directory is routinely a different
        // mount. A temporary anywhere else silently downgrades the save to a
        // copy-and-delete.
        let target = Path::new("/some/deep/place/notes.md");
        let temporary = temporary_beside(target);

        assert_eq!(temporary.parent(), target.parent());
        assert_ne!(temporary.file_name(), target.file_name());
    }

    #[test]
    fn a_failed_write_leaves_the_previous_document_untouched() {
        let scratch = Scratch::new("failure");
        let path = scratch.join("notes.md");
        std::fs::write(&path, "the version that must survive\n").unwrap();

        // A directory where the temporary wants to go: creating the file fails,
        // and the rename is never reached.
        std::fs::create_dir(scratch.join("sub")).unwrap();
        assert!(atomic_write(&scratch.join("sub"), "nonsense\n").is_err());

        assert_eq!(
            std::fs::read_to_string(&path).unwrap(),
            "the version that must survive\n"
        );
    }

    #[test]
    fn keeps_the_permissions_the_document_already_had() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            let scratch = Scratch::new("modes");
            let path = scratch.join("notes.md");
            std::fs::write(&path, "before\n").unwrap();
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();

            atomic_write(&path, "after\n").unwrap();

            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600, "saving changed the file's mode");
        }
    }

    #[test]
    fn http_and_https_may_leave_the_process() {
        assert!(is_web_url("http://example.com"));
        assert!(is_web_url("https://example.com/a/b?c=d"));
        assert!(is_web_url("HTTPS://EXAMPLE.COM"));
    }

    #[test]
    fn every_other_scheme_is_refused() {
        assert!(!is_web_url("file:///etc/passwd"));
        assert!(!is_web_url("javascript:alert(1)"));
        assert!(!is_web_url("./relative/doc.md"));
        assert!(!is_web_url("/absolute/doc.md"));
        assert!(!is_web_url("mailto:someone@example.com"));
        assert!(!is_web_url(""));
    }

    #[test]
    fn leading_whitespace_does_not_smuggle_a_scheme_past_the_check() {
        assert!(!is_web_url("  javascript:alert(1)"));
        assert!(is_web_url("  https://example.com"));
    }
}
