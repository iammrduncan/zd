use std::io::Read;
use std::path::Path;
use std::process::{Command, ExitStatus, Stdio};
use std::time::{Duration, Instant};

const STDERR_LIMIT: usize = 16 * 1024;

pub(crate) struct GitOutput {
    pub status: ExitStatus,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub stdout_truncated: bool,
}

#[derive(Debug)]
pub(crate) enum GitRunError {
    Io(std::io::ErrorKind),
    TimedOut,
}

struct Captured {
    bytes: Vec<u8>,
    truncated: bool,
}

fn drain(mut reader: impl Read, limit: usize) -> Result<Captured, std::io::ErrorKind> {
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    let mut truncated = false;
    let mut chunk = [0_u8; 8 * 1024];
    loop {
        let read = reader.read(&mut chunk).map_err(|error| error.kind())?;
        if read == 0 {
            break;
        }
        let remaining = limit.saturating_sub(bytes.len());
        let retained = remaining.min(read);
        bytes.extend_from_slice(&chunk[..retained]);
        truncated |= retained < read;
    }
    Ok(Captured { bytes, truncated })
}

pub(crate) fn run_git(
    root: &Path,
    arguments: &[String],
    stdout_limit: usize,
    timeout: Duration,
) -> Result<GitOutput, GitRunError> {
    let mut command = Command::new("git");
    command
        .arg("--no-pager")
        .arg("--literal-pathspecs")
        .arg("-c")
        .arg("color.ui=false")
        .arg("-c")
        .arg("core.fsmonitor=false")
        .arg("-c")
        .arg("status.relativePaths=false")
        .args(arguments)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("GIT_OPTIONAL_LOCKS", "0")
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("LC_ALL", "C")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_OBJECT_DIRECTORY")
        .env_remove("GIT_ALTERNATE_OBJECT_DIRECTORIES")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_NAMESPACE")
        .env_remove("GIT_CONFIG")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_CONFIG_SYSTEM")
        .env_remove("GIT_CONFIG_GLOBAL")
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_EXEC_PATH");

    let mut child = command
        .spawn()
        .map_err(|error| GitRunError::Io(error.kind()))?;
    let stdout = child.stdout.take().expect("piped Git stdout");
    let stderr = child.stderr.take().expect("piped Git stderr");
    let stdout_reader = std::thread::spawn(move || drain(stdout, stdout_limit));
    let stderr_reader = std::thread::spawn(move || drain(stderr, STDERR_LIMIT));
    let deadline = Instant::now() + timeout;

    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => {
                std::thread::sleep(Duration::from_millis(10));
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitRunError::TimedOut);
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = stdout_reader.join();
                let _ = stderr_reader.join();
                return Err(GitRunError::Io(error.kind()));
            }
        }
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| GitRunError::Io(std::io::ErrorKind::Other))?
        .map_err(GitRunError::Io)?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| GitRunError::Io(std::io::ErrorKind::Other))?
        .map_err(GitRunError::Io)?;
    Ok(GitOutput {
        status,
        stdout: stdout.bytes,
        stderr: stderr.bytes,
        stdout_truncated: stdout.truncated,
    })
}
