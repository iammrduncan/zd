//! Turns the command line into a launch request.
//!
//! The three forms from the vision (§9):
//!   `zd md .`      open the current folder
//!   `zd md <file>` open that file, creating it later if it does not exist
//!   `zd md`        home screen
//!
//! Launching from Spotlight, the Dock, or the Start menu arrives here with no
//! arguments and behaves like bare `zd md`.

use std::path::{Component, Path, PathBuf};

use serde::Serialize;

/// Mini apps the command line knows about. Add an id here when its
/// `src/miniapps/<id>/` directory lands.
const MINIAPPS: &[&str] = &["md"];

const DEFAULT_MINIAPP: &str = "md";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchRequest {
    pub miniapp: String,
    /// Absolute path, or `None` for "show your home surface".
    pub path: Option<String>,
}

/// The environment variable a development run uses to report the real cwd.
const INVOCATION_DIR: &str = "ZD_CWD";

/// Which directory a relative path on the command line is resolved against.
///
/// The process working directory, except when something has told us it is not
/// the directory the user was standing in. `tauri dev` runs the binary from
/// `src-tauri/`, so `zd md README.md` typed at the repo root went looking for
/// `src-tauri/README.md` and failed — the `app:open` script passes npm's
/// `INIT_CWD` through so development resolves paths the way a shipped binary
/// does. A shipped binary never sets it and takes the plain working directory.
///
/// A relative override is refused rather than honoured: it would be resolved
/// against the very directory it exists to replace.
fn resolve_dir(override_dir: Option<PathBuf>, working_dir: PathBuf) -> PathBuf {
    match override_dir {
        Some(dir) if dir.is_absolute() => dir,
        _ => working_dir,
    }
}

#[tauri::command]
pub fn launch_request() -> LaunchRequest {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let cwd = resolve_dir(
        std::env::var_os(INVOCATION_DIR).map(PathBuf::from),
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    );
    parse_args(&args, &cwd)
}

/// Pure so it can be tested without a process.
fn parse_args(args: &[String], cwd: &Path) -> LaunchRequest {
    // macOS hands Finder launches a `-psn_0_12345` process-serial argument.
    let mut positional = args.iter().filter(|a| !a.starts_with('-'));

    let Some(first) = positional.next() else {
        return LaunchRequest {
            miniapp: DEFAULT_MINIAPP.to_string(),
            path: None,
        };
    };

    if MINIAPPS.contains(&first.as_str()) {
        return LaunchRequest {
            miniapp: first.clone(),
            path: positional.next().map(|p| absolutize(p, cwd)),
        };
    }

    // `zd notes.md` — no mini app named, so it is a path for the default one.
    LaunchRequest {
        miniapp: DEFAULT_MINIAPP.to_string(),
        path: Some(absolutize(first, cwd)),
    }
}

/// Resolve against the working directory without requiring the path to exist —
/// `zd md new-file.md` is allowed to name something that is not there yet.
fn absolutize(raw: &str, cwd: &Path) -> String {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        cwd.join(candidate)
    };

    // Drop `.` components so `zd md .` reports the folder, not `folder/.`.
    let cleaned: PathBuf = joined
        .components()
        .filter(|component| !matches!(component, Component::CurDir))
        .collect();

    if cleaned.as_os_str().is_empty() {
        return cwd.to_string_lossy().into_owned();
    }

    cleaned.to_string_lossy().into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(raw: &[&str]) -> Vec<String> {
        raw.iter().map(|s| s.to_string()).collect()
    }

    fn cwd() -> PathBuf {
        PathBuf::from("/work/notes")
    }

    #[test]
    fn a_relative_path_resolves_against_the_invocation_directory() {
        // `tauri dev` runs the binary with the working directory set to
        // `src-tauri/`, so `zd md README.md` typed at the repo root looked for
        // `src-tauri/README.md` and failed.
        let resolved = resolve_dir(
            Some(PathBuf::from("/repo")),
            PathBuf::from("/repo/src-tauri"),
        );
        assert_eq!(resolved, PathBuf::from("/repo"));
    }

    #[test]
    fn without_an_override_the_working_directory_is_used() {
        // A shipped binary launched from a terminal is already in the right
        // place, so nothing overrides it there.
        let resolved = resolve_dir(None, PathBuf::from("/work/notes"));
        assert_eq!(resolved, PathBuf::from("/work/notes"));
    }

    #[test]
    fn a_relative_override_is_ignored() {
        // An override that is itself relative would resolve against the very
        // directory it exists to replace, which is worse than not having one.
        let resolved = resolve_dir(Some(PathBuf::from("../up")), PathBuf::from("/repo/src-tauri"));
        assert_eq!(resolved, PathBuf::from("/repo/src-tauri"));
    }

    #[test]
    fn bare_launch_opens_the_default_miniapp_home() {
        let request = parse_args(&args(&[]), &cwd());
        assert_eq!(request.miniapp, "md");
        assert_eq!(request.path, None);
    }

    #[test]
    fn finder_launch_process_serial_argument_is_ignored() {
        let request = parse_args(&args(&["-psn_0_774321"]), &cwd());
        assert_eq!(request.miniapp, "md");
        assert_eq!(request.path, None);
    }

    #[test]
    fn dot_opens_the_current_folder() {
        let request = parse_args(&args(&["md", "."]), &cwd());
        assert_eq!(request.miniapp, "md");
        assert_eq!(request.path.as_deref(), Some("/work/notes"));
    }

    #[test]
    fn a_relative_file_resolves_against_the_working_directory() {
        let request = parse_args(&args(&["md", "plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/plan.md"));
    }

    #[test]
    fn an_absolute_file_is_used_as_given() {
        let request = parse_args(&args(&["md", "/tmp/plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/tmp/plan.md"));
    }

    #[test]
    fn a_named_miniapp_without_a_path_shows_its_home() {
        let request = parse_args(&args(&["md"]), &cwd());
        assert_eq!(request.miniapp, "md");
        assert_eq!(request.path, None);
    }

    #[test]
    fn a_path_without_a_miniapp_goes_to_the_default_miniapp() {
        let request = parse_args(&args(&["plan.md"]), &cwd());
        assert_eq!(request.miniapp, "md");
        assert_eq!(request.path.as_deref(), Some("/work/notes/plan.md"));
    }

    #[test]
    fn interior_dot_components_are_dropped_too() {
        let request = parse_args(&args(&["md", "./docs/./plan.md"]), &cwd());
        assert_eq!(request.path.as_deref(), Some("/work/notes/docs/plan.md"));
    }

    #[test]
    fn a_file_that_does_not_exist_yet_still_resolves() {
        let request = parse_args(&args(&["md", "not-created-yet.md"]), &cwd());
        assert_eq!(
            request.path.as_deref(),
            Some("/work/notes/not-created-yet.md")
        );
    }
}
