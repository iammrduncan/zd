//! File and link access for the frontend.
//!
//! Directory walking, watching, and recovery arrive with the sessions that need
//! them (2.1, 3.1).

use std::io::Write;
use std::path::{Path, PathBuf};

use crate::cli::LaunchState;
use tauri_plugin_opener::OpenerExt;

/// One file in the workspace tree, named both for opening and for display.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WorkspaceFile {
    pub path: String,
    pub relative: String,
}

/// The sidebar root and its visible Markdown files.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
pub struct WorkspaceListing {
    pub root: String,
    pub files: Vec<WorkspaceFile>,
}

/// The one folder this window may read and write — audit finding M2.
///
/// `read_text_file`, `write_text_file` and `file_stamp` accepted any absolute path
/// the webview sent. There was no bug: the only caller passes the launch path. The
/// trust boundary is still worth closing, because this app's entire purpose is
/// rendering **untrusted, agent-written markdown**, so a webview compromise — a
/// renderer bug, a future regression in the markdown pipeline — converted directly
/// into arbitrary file read and write as the user. AGENTS.md says to think in blast
/// radius, and the blast radius of three unscoped commands is the home directory.
///
/// **The launch path is the scope**, which is why this needs nothing from phase 3:
/// `zd notes.md` scopes to the folder holding it, `zd .` scopes to that folder,
/// and the sidebar's workspace root will be this same value when it lands. ADR 0002's
/// workspace model needs exactly this, so the two compose rather than compete.
///
/// `None` when the app was launched with no path at all. Everything is refused then,
/// which is right: there is no document, and §5.3's Home surface will set a root
/// before it offers to open anything.
/// Resolve `requested` and refuse it if it lands outside `root`.
///
/// **Canonicalized, and the parent rather than the path itself.** `fs::canonicalize`
/// requires the thing to exist, and `zd new-file.md` is allowed to name something
/// that is not there yet — so the check resolves the *directory*, which does exist,
/// and rejoins the file name. That is also what makes it proof against the two ways
/// out of a folder: `..` collapses during canonicalization, and a symlink resolves to
/// wherever it truly points before the comparison rather than after.
///
/// Returns the canonical path, so callers act on the resolved location rather than on
/// the string they were handed. Audit L5 (`..` surviving in the launch path) and L6
/// (a rename replacing a symlink) both wanted exactly this and are answered here.
fn within_scope(root: &Path, requested: &str) -> Result<PathBuf, String> {
    let path = Path::new(requested);

    let parent = path.parent().unwrap_or_else(|| Path::new("/"));
    let name = path.file_name();

    let resolved_parent = parent
        .canonicalize()
        .map_err(|error| format!("{requested}: {error}"))?;
    let rejoined = match name {
        Some(name) => resolved_parent.join(name),
        // The path *is* a directory — `zd .` resolves to the folder itself.
        None => resolved_parent,
    };

    /*
     * Resolve the last component too, when there is something there to resolve.
     *
     * The parent alone is not enough, and the symlink test is what said so: a link
     * at `<scope>/innocent.md` pointing at another folder has a parent inside the
     * scope and a target outside it, so rejoining the name and stopping there let
     * it straight through. Canonicalizing the whole path follows the link.
     *
     * Falling back to the rejoined path when that fails is the `zd new-file.md`
     * case and only that case: nothing exists at the name yet, so there is no link
     * to follow and the resolved parent already settles where it would be created.
     */
    let resolved = rejoined.canonicalize().unwrap_or(rejoined);

    let resolved_root = root
        .canonicalize()
        .map_err(|error| format!("{}: {error}", root.display()))?;

    if !resolved.starts_with(&resolved_root) {
        return Err(format!("refused a path outside the workspace: {requested}"));
    }

    Ok(resolved)
}

/// The folder a launch path scopes to: itself when it is one, its parent when it is a
/// file.
///
/// A path that does not exist yet is treated as a file, because that is what `zd
/// new-file.md` means — the folder it will be created in is the scope.
#[cfg(test)]
fn scope_for(path: &Path) -> PathBuf {
    crate::cli::scope_for(&path.to_string_lossy())
}

/// Check a path against the window's scope, or say why not.
fn allowed(scope: Option<&Path>, path: &str) -> Result<PathBuf, String> {
    match scope {
        Some(root) => within_scope(root, path),
        None => Err(format!("refused a path with no workspace open: {path}")),
    }
}

#[tauri::command]
pub fn read_text_file(
    launch: tauri::State<'_, LaunchState>,
    path: String,
) -> Result<String, String> {
    let scope = launch.scope();
    let path = allowed(scope.as_deref(), &path)?;
    std::fs::read_to_string(&path).map_err(|error| format!("{}: {error}", path.display()))
}

/// List the Markdown files below a workspace root in stable display order.
fn workspace_files_in(root: &Path) -> Result<WorkspaceListing, String> {
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
            path: path.to_string_lossy().into_owned(),
            relative: relative.to_string_lossy().into_owned(),
        });
    }
    files.sort_by(|left, right| left.relative.cmp(&right.relative));

    Ok(WorkspaceListing {
        root: root.to_string_lossy().into_owned(),
        files,
    })
}

/// The scoped tree shown by the Markdown workspace sidebar.
#[tauri::command]
pub fn workspace_files(
    launch: tauri::State<'_, LaunchState>,
) -> Result<Option<WorkspaceListing>, String> {
    match launch.scope() {
        Some(root) => workspace_files_in(&root).map(Some),
        None => Ok(None),
    }
}

/// Save a document. Vision §6.3: "`cmd+s` saves. Writes are atomic."
///
/// Atomic here means the strong thing: at no instant does the path hold a
/// half-written document. The only two states a reader can ever observe are the
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
    path: String,
    contents: String,
) -> Result<(), String> {
    let scope = launch.scope();
    let path = allowed(scope.as_deref(), &path)?;
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
    path: String,
) -> Result<Option<FileStamp>, String> {
    /*
     * A path outside the scope reports `None` rather than an error, and that is
     * deliberate: this command's whole contract is that a missing file is a state
     * rather than a failure, and the caller asks it on every window focus. Refusing
     * loudly would put a scope error on the §7.3 notice every time the window came
     * back, about a path the reader never typed. Nothing is read either way.
     */
    let scope = launch.scope();
    let Ok(path) = allowed(scope.as_deref(), &path) else {
        return Ok(None);
    };

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
/// Only `http` and `https` leave the process. The reader resolves everything
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
        allowed, atomic_write, is_web_url, scope_for, stamp_of, temporary_beside, within_scope,
        workspace_files_in,
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

        let workspace = workspace_files_in(&scratch.0).unwrap();
        let relative: Vec<_> = workspace
            .files
            .iter()
            .map(|file| file.relative.as_str())
            .collect();

        assert_eq!(relative, vec!["notes/a.MD", "z.md"]);
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

    /*
     * The scope — audit finding M2.
     *
     * Every one of these is about the trust boundary rather than about files: the
     * webview is the untrusted side, and what it sends is a string it chose.
     */

    #[test]
    fn a_path_inside_the_scope_is_allowed() {
        // The control, and it has to come first: a check that refused everything
        // would pass every assertion below and ship an app that cannot open a file.
        let scratch = Scratch::new("scope-inside");
        let path = scratch.join("notes.md");
        atomic_write(&path, "# Notes\n").unwrap();

        let allowed = within_scope(&scratch.0, &path.display().to_string()).unwrap();
        assert_eq!(allowed.file_name().unwrap(), "notes.md");
    }

    #[test]
    fn the_scope_folder_itself_is_allowed() {
        let scratch = Scratch::new("scope-root");
        assert!(within_scope(&scratch.0, &scratch.0.display().to_string()).is_ok());
    }

    #[test]
    fn a_file_that_does_not_exist_yet_is_allowed_inside_the_scope() {
        // `zd new-file.md` names something that is not there. Canonicalizing the
        // path itself would fail here, which is why the check resolves the parent.
        let scratch = Scratch::new("scope-new");
        let path = scratch.join("not-yet.md");

        assert!(within_scope(&scratch.0, &path.display().to_string()).is_ok());
    }

    #[test]
    fn a_path_outside_the_scope_is_refused() {
        let scratch = Scratch::new("scope-outside");
        let elsewhere = Scratch::new("scope-elsewhere");
        let path = elsewhere.join("secrets.md");
        atomic_write(&path, "not yours\n").unwrap();

        assert!(within_scope(&scratch.0, &path.display().to_string()).is_err());
    }

    #[test]
    fn dot_dot_cannot_climb_out_of_the_scope() {
        // The obvious escape, and the reason the check canonicalizes rather than
        // comparing strings: `<scope>/../<elsewhere>/secrets.md` starts with the
        // scope as text and does not as a location.
        let scratch = Scratch::new("scope-climb");
        let inside = scratch.join("sub");
        std::fs::create_dir(&inside).unwrap();

        let climbed = format!("{}/../../etc/hosts", inside.display());
        assert!(within_scope(&scratch.0, &climbed).is_err());
    }

    #[test]
    fn a_symlink_pointing_out_of_the_scope_is_refused() {
        #[cfg(unix)]
        {
            // The escape that a purely textual check cannot see at all: the string is
            // inside the scope and the file is not.
            let scratch = Scratch::new("scope-symlink");
            let elsewhere = Scratch::new("scope-symlink-target");
            let target = elsewhere.join("secrets.md");
            atomic_write(&target, "not yours\n").unwrap();

            let link = scratch.join("innocent.md");
            std::os::unix::fs::symlink(&target, &link).unwrap();

            assert!(within_scope(&scratch.0, &link.display().to_string()).is_err());
        }
    }

    #[test]
    fn nothing_is_allowed_when_no_workspace_is_open() {
        // Launched with no path — §5.3's Home surface. There is no document, so
        // there is nothing to read, and default-to-deny is the whole point.
        let scratch = Scratch::new("scope-none");
        let path = scratch.join("notes.md");
        atomic_write(&path, "# Notes\n").unwrap();

        assert!(allowed(None, &path.display().to_string()).is_err());
    }

    #[test]
    fn a_launch_file_scopes_to_its_folder_and_a_launch_folder_to_itself() {
        let scratch = Scratch::new("scope-for");
        let file = scratch.join("notes.md");
        atomic_write(&file, "# Notes\n").unwrap();

        assert_eq!(scope_for(&file), scratch.0);
        assert_eq!(scope_for(&scratch.0), scratch.0);

        // Not there yet: treated as a file, so the scope is the folder it will be
        // created in. `zd new-file.md` has to keep working.
        assert_eq!(scope_for(&scratch.join("not-yet.md")), scratch.0);
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
