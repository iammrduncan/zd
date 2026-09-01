use std::path::{Path, PathBuf};

const CONSOLE_NAME: &str = "zd";
const DESKTOP_NAME: &str = "zd-desktop";

pub(crate) fn console_for_desktop() -> Result<PathBuf, String> {
    let current = std::env::current_exe()
        .map_err(|_| "the desktop executable location is unavailable".to_string())?;
    Ok(console_for_desktop_path(&current))
}

pub(crate) fn desktop_for_console() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(overridden) = std::env::var_os("ZD_TEST_DESKTOP_EXECUTABLE") {
        let overridden = PathBuf::from(overridden);
        if overridden.is_absolute() {
            return Ok(overridden);
        }
        return Err("ZD_TEST_DESKTOP_EXECUTABLE must be an absolute test path".to_string());
    }

    let current = std::env::current_exe()
        .map_err(|_| "the console executable location is unavailable".to_string())?;
    Ok(desktop_for_console_path(&current))
}

fn console_for_desktop_path(desktop: &Path) -> PathBuf {
    mac_contents_from_desktop(desktop)
        .map(|contents| contents.join("Resources/bin").join(CONSOLE_NAME))
        .unwrap_or_else(|| sibling(desktop, CONSOLE_NAME))
}

fn desktop_for_console_path(console: &Path) -> PathBuf {
    let canonical;
    let console = match std::fs::canonicalize(console) {
        Ok(path) => {
            canonical = path;
            canonical.as_path()
        }
        Err(_) => console,
    };
    mac_contents_from_console(console)
        .map(|contents| contents.join("MacOS").join(DESKTOP_NAME))
        .unwrap_or_else(|| sibling(console, DESKTOP_NAME))
}

fn sibling(executable: &Path, name: &str) -> PathBuf {
    executable
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(name)
}

fn mac_contents_from_desktop(executable: &Path) -> Option<&Path> {
    let macos = executable.parent()?;
    if macos.file_name()? != "MacOS" {
        return None;
    }
    let contents = macos.parent()?;
    (contents.file_name()? == "Contents" && contents.parent()?.extension()? == "app")
        .then_some(contents)
}

fn mac_contents_from_console(executable: &Path) -> Option<&Path> {
    let bin = executable.parent()?;
    let resources = bin.parent()?;
    if bin.file_name()? != "bin" || resources.file_name()? != "Resources" {
        return None;
    }
    let contents = resources.parent()?;
    (contents.file_name()? == "Contents" && contents.parent()?.extension()? == "app")
        .then_some(contents)
}

#[cfg(test)]
mod tests {
    use super::{console_for_desktop_path, desktop_for_console_path};
    use std::path::Path;

    #[test]
    fn adjacent_development_and_linux_executables_find_each_other() {
        assert_eq!(
            console_for_desktop_path(Path::new("/usr/bin/zd-desktop")),
            Path::new("/usr/bin/zd")
        );
        assert_eq!(
            desktop_for_console_path(Path::new("/work/target/debug/zd")),
            Path::new("/work/target/debug/zd-desktop")
        );
    }

    #[test]
    fn macos_bundle_executables_cross_the_contents_layout() {
        assert_eq!(
            console_for_desktop_path(Path::new("/Applications/zd.app/Contents/MacOS/zd-desktop")),
            Path::new("/Applications/zd.app/Contents/Resources/bin/zd")
        );
        assert_eq!(
            desktop_for_console_path(Path::new("/Applications/zd.app/Contents/Resources/bin/zd")),
            Path::new("/Applications/zd.app/Contents/MacOS/zd-desktop")
        );
    }

    #[cfg(unix)]
    #[test]
    fn macos_console_symlink_finds_the_bundle_desktop() {
        use std::os::unix::fs::symlink;

        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("zd-desktop-link-{stamp}"));
        let console = root.join("zd.app/Contents/Resources/bin/zd");
        let command = root.join("bin/zd");
        std::fs::create_dir_all(console.parent().expect("console parent"))
            .expect("create bundle console directory");
        std::fs::create_dir_all(command.parent().expect("command parent"))
            .expect("create command directory");
        std::fs::write(&console, b"console").expect("write bundle console");
        symlink(&console, &command).expect("link installed console");

        assert_eq!(
            desktop_for_console_path(&command),
            root.join("zd.app/Contents/MacOS/zd-desktop")
        );

        std::fs::remove_dir_all(root).expect("remove link fixture");
    }
}
