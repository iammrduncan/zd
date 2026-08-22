use std::io::Read;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use portable_pty::{Child, ExitStatus, MasterPty};

use super::output::BoundedOutput;
use super::{TerminalError, TerminalErrorKind};

pub(super) struct OutputReader {
    thread: Option<JoinHandle<()>>,
    finished: Receiver<()>,
}

impl OutputReader {
    pub(super) fn start(
        mut reader: Box<dyn Read + Send>,
        output: Arc<Mutex<BoundedOutput>>,
    ) -> Result<Self, TerminalError> {
        let (finished_sender, finished) = mpsc::sync_channel(1);
        let thread = thread::Builder::new()
            .name("zd-terminal-output".to_string())
            .spawn(move || {
                let mut chunk = [0_u8; 8 * 1024];
                loop {
                    match reader.read(&mut chunk) {
                        Ok(0) => break,
                        Ok(length) => lock_output(&output).push(&chunk[..length]),
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(error) => {
                            lock_output(&output).fail(error.to_string());
                            break;
                        }
                    }
                }
                let _ = finished_sender.send(());
            })
            .map_err(|error| {
                TerminalError::new(
                    TerminalErrorKind::Io,
                    format!("could not start terminal output reader: {error}"),
                )
            })?;
        Ok(Self {
            thread: Some(thread),
            finished,
        })
    }

    pub(super) fn join(mut self) -> Result<(), TerminalError> {
        let Some(thread) = self.thread.take() else {
            return Ok(());
        };
        self.finished
            .recv_timeout(Duration::from_secs(2))
            .map_err(|_| {
                TerminalError::new(
                    TerminalErrorKind::Io,
                    "terminal output reader did not stop within two seconds",
                )
            })?;
        thread.join().map_err(|_| {
            TerminalError::new(
                TerminalErrorKind::Io,
                "terminal output reader stopped unexpectedly",
            )
        })
    }
}

fn lock_output(output: &Mutex<BoundedOutput>) -> std::sync::MutexGuard<'_, BoundedOutput> {
    output
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(super) fn process_group(master: &dyn MasterPty, process_id: Option<u32>) -> Option<i32> {
    #[cfg(unix)]
    {
        master
            .process_group_leader()
            .or_else(|| process_id.and_then(|id| i32::try_from(id).ok()))
    }

    #[cfg(not(unix))]
    {
        let _ = (master, process_id);
        None
    }
}

pub(super) fn terminate(
    child: &mut (dyn Child + Send + Sync),
    process_group: Option<i32>,
) -> Result<ExitStatus, TerminalError> {
    #[cfg(unix)]
    signal_group(process_group, libc::SIGHUP)?;

    if let Err(error) = child.kill() {
        if child.try_wait().map_err(io_error)?.is_none() {
            return Err(TerminalError::new(
                TerminalErrorKind::Io,
                format!("could not terminate terminal process: {error}"),
            ));
        }
    }

    #[cfg(unix)]
    signal_group(process_group, libc::SIGKILL)?;

    // The portable Windows backend gives this module the same PTY and direct
    // child lifecycle, but not a descendant Job Object. Gate 2 must add a
    // kill-on-close Job Object before generalized Windows sessions are enabled.

    child.wait().map_err(io_error)
}

pub(super) fn cleanup_descendants(process_group: Option<i32>) -> Result<(), TerminalError> {
    #[cfg(unix)]
    {
        signal_group(process_group, libc::SIGHUP)?;
        signal_group(process_group, libc::SIGKILL)?;
    }

    #[cfg(not(unix))]
    let _ = process_group;

    Ok(())
}

#[cfg(unix)]
fn signal_group(process_group: Option<i32>, signal: libc::c_int) -> Result<(), TerminalError> {
    let Some(process_group) = process_group else {
        return Ok(());
    };
    let result = unsafe { libc::kill(-process_group, signal) };
    if result == 0 {
        return Ok(());
    }

    let error = std::io::Error::last_os_error();
    if error.raw_os_error() == Some(libc::ESRCH) {
        return Ok(());
    }
    Err(io_error(error))
}

fn io_error(error: std::io::Error) -> TerminalError {
    TerminalError::new(TerminalErrorKind::Io, error.to_string())
}
