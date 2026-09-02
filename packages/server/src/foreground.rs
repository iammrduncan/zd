use std::io::{self, Write};
use std::path::PathBuf;
use std::sync::Arc;

use zd_host::HostService;

use crate::{platform_state_directory, start, ServeArgs, ServerConfig};

pub fn run_foreground(arguments: ServeArgs) -> Result<(), String> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .map_err(|error| format!("could not start the served runtime: {error}"))?
        .block_on(run(arguments))
}

async fn run(arguments: ServeArgs) -> Result<(), String> {
    let state_directory = state_directory()?;
    let host = Arc::new(HostService::open_project_with_terminal_keeper(
        arguments.project(),
        &state_directory,
    )?);
    let assets = assets_directory()?;
    let server = start(
        host,
        ServerConfig::new(assets, arguments.bind(), arguments.port()),
    )
    .await?;

    {
        let stdout = io::stdout();
        let mut output = stdout.lock();
        writeln!(output, "zd serve URL: {}", server.url())
            .and_then(|_| writeln!(output, "zd serve secret: {}", server.secret()))
            .and_then(|_| output.flush())
            .map_err(|error| format!("could not report served readiness: {error}"))?;
    }

    wait_for_shutdown_signal().await?;
    server.shutdown().await
}

pub(crate) fn state_directory() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(directory) = std::env::var_os("ZD_TEST_STATE_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            return Err("ZD_TEST_STATE_DIR must be an absolute test path".to_string());
        }
        return Ok(directory);
    }
    platform_state_directory()
}

pub(crate) fn assets_directory() -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    if let Some(directory) = std::env::var_os("ZD_TEST_ASSETS_DIR") {
        let directory = PathBuf::from(directory);
        if !directory.is_absolute() {
            return Err("ZD_TEST_ASSETS_DIR must be an absolute test path".to_string());
        }
        return Ok(directory);
    }
    #[cfg(debug_assertions)]
    {
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../app/dist"))
    }
    #[cfg(not(debug_assertions))]
    {
        let executable = std::env::current_exe()
            .map_err(|_| "the installed executable location is unavailable".to_string())?;
        Ok(installed_assets_directory(&executable))
    }
}

#[cfg(any(not(debug_assertions), test))]
fn installed_assets_directory(executable: &std::path::Path) -> PathBuf {
    let canonical;
    let executable = match std::fs::canonicalize(executable) {
        Ok(path) => {
            canonical = path;
            canonical.as_path()
        }
        Err(_) => executable,
    };
    if let Some(contents) = mac_bundle_contents(executable) {
        return contents.join("Resources/assets");
    }
    let executable_directory = executable
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."));
    if executable_directory
        .file_name()
        .is_some_and(|name| name == "bin")
    {
        if let Some(prefix) = executable_directory.parent() {
            if prefix.file_name().is_some_and(|name| name == "usr") {
                return prefix.join("lib/zd/assets");
            }
        }
    }
    executable_directory.join("assets")
}

#[cfg(any(not(debug_assertions), test))]
fn mac_bundle_contents(executable: &std::path::Path) -> Option<&std::path::Path> {
    let bin = executable.parent()?;
    let resources = bin.parent()?;
    if bin.file_name()? != "bin" || resources.file_name()? != "Resources" {
        return None;
    }
    let contents = resources.parent()?;
    (contents.file_name()? == "Contents" && contents.parent()?.extension()? == "app")
        .then_some(contents)
}

#[cfg(unix)]
async fn wait_for_shutdown_signal() -> Result<(), String> {
    use tokio::signal::unix::{signal, SignalKind};

    let mut terminate = signal(SignalKind::terminate())
        .map_err(|error| format!("could not listen for shutdown: {error}"))?;
    tokio::select! {
        result = tokio::signal::ctrl_c() => {
            result.map_err(|error| format!("could not wait for shutdown: {error}"))
        }
        _ = terminate.recv() => Ok(()),
    }
}

#[cfg(not(unix))]
async fn wait_for_shutdown_signal() -> Result<(), String> {
    tokio::signal::ctrl_c()
        .await
        .map_err(|error| format!("could not wait for shutdown: {error}"))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::installed_assets_directory;

    #[test]
    fn debug_builds_use_the_workspace_frontend_when_no_test_override_exists() {
        std::env::remove_var("ZD_TEST_ASSETS_DIR");

        assert_eq!(
            super::assets_directory().expect("debug assets directory"),
            Path::new(env!("CARGO_MANIFEST_DIR")).join("../app/dist")
        );
    }

    #[test]
    fn installed_assets_follow_linux_and_macos_package_layouts() {
        assert_eq!(
            installed_assets_directory(Path::new("/usr/bin/zd")),
            Path::new("/usr/lib/zd/assets")
        );
        assert_eq!(
            installed_assets_directory(Path::new("/tmp/package/usr/bin/zd")),
            Path::new("/tmp/package/usr/lib/zd/assets")
        );
        assert_eq!(
            installed_assets_directory(Path::new("/Applications/zd.app/Contents/Resources/bin/zd")),
            Path::new("/Applications/zd.app/Contents/Resources/assets")
        );
        assert_eq!(
            installed_assets_directory(Path::new("/work/target/release/zd")),
            Path::new("/work/target/release/assets")
        );
    }

    #[cfg(unix)]
    #[test]
    fn installed_assets_follow_the_macos_console_symlink() {
        use std::os::unix::fs::symlink;

        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("system clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!("zd-macos-link-{stamp}"));
        let console = root.join("zd.app/Contents/Resources/bin/zd");
        let command = root.join("bin/zd");
        std::fs::create_dir_all(console.parent().expect("console parent"))
            .expect("create bundle console directory");
        std::fs::create_dir_all(command.parent().expect("command parent"))
            .expect("create command directory");
        std::fs::write(&console, b"console").expect("write bundle console");
        symlink(&console, &command).expect("link installed console");

        assert_eq!(
            installed_assets_directory(&command),
            root.join("zd.app/Contents/Resources/assets")
        );

        std::fs::remove_dir_all(root).expect("remove link fixture");
    }
}
