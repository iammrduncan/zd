use std::io::Read;
use std::sync::mpsc::{self, Receiver};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use portable_pty::{Child, ExitStatus, MasterPty};
#[cfg(unix)]
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use super::output::BoundedOutput;
use super::{TerminalError, TerminalErrorKind, TerminalOutputSignal, TerminalSessionHandle};

/// Platform process-tree ownership attached to one PTY session.
///
/// Unix shells lead an isolated process group. Windows shells are assigned to
/// a kill-on-close Job Object so descendants share the session lifecycle.
pub(super) struct ProcessTree {
    #[cfg(unix)]
    process_group: Option<i32>,
    #[cfg(windows)]
    job: WindowsJob,
}

impl ProcessTree {
    pub(super) fn attach(
        master: &dyn MasterPty,
        child: &(dyn Child + Send + Sync),
    ) -> Result<Self, TerminalError> {
        #[cfg(unix)]
        {
            Ok(Self {
                process_group: owned_process_group(
                    child.process_id(),
                    master.process_group_leader(),
                ),
            })
        }

        #[cfg(windows)]
        {
            let _ = master;
            Ok(Self {
                job: WindowsJob::attach(child)?,
            })
        }

        #[cfg(not(any(unix, windows)))]
        {
            let _ = (master, child);
            Ok(Self {})
        }
    }

    pub(super) fn cleanup_descendants(&mut self) -> Result<(), TerminalError> {
        #[cfg(unix)]
        cleanup_unix_session(self.process_group.take())?;

        #[cfg(windows)]
        self.job.terminate()?;

        Ok(())
    }
}

pub(super) struct OutputReader {
    thread: Option<JoinHandle<()>>,
    finished: Receiver<()>,
}

impl OutputReader {
    pub(super) fn start(
        mut reader: Box<dyn Read + Send>,
        output: Arc<Mutex<BoundedOutput>>,
        session: TerminalSessionHandle,
        output_signal: Option<TerminalOutputSignal>,
    ) -> Result<Self, TerminalError> {
        let (finished_sender, finished) = mpsc::sync_channel(1);
        let thread = thread::Builder::new()
            .name("zd-terminal-output".to_string())
            .spawn(move || {
                let mut chunk = [0_u8; 8 * 1024];
                loop {
                    match reader.read(&mut chunk) {
                        Ok(0) => {
                            signal_output(&output_signal, &session);
                            break;
                        }
                        Ok(length) => {
                            lock_output(&output).push(&chunk[..length]);
                            signal_output(&output_signal, &session);
                        }
                        Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                        Err(error) => {
                            lock_output(&output).fail(error.to_string());
                            signal_output(&output_signal, &session);
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

fn signal_output(signal: &Option<TerminalOutputSignal>, session: &TerminalSessionHandle) {
    if let Some(signal) = signal {
        signal(session.clone());
    }
}

fn lock_output(output: &Mutex<BoundedOutput>) -> std::sync::MutexGuard<'_, BoundedOutput> {
    output
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub(super) fn terminate(
    child: &mut (dyn Child + Send + Sync),
    process_tree: &mut ProcessTree,
) -> Result<ExitStatus, TerminalError> {
    process_tree.cleanup_descendants()?;

    if let Err(error) = child.kill() {
        if child.try_wait().map_err(io_error)?.is_none() {
            return Err(TerminalError::new(
                TerminalErrorKind::Io,
                format!("could not terminate terminal process: {error}"),
            ));
        }
    }

    child.wait().map_err(io_error)
}

#[cfg(windows)]
struct WindowsJob {
    handle: usize,
    terminated: bool,
}

#[cfg(windows)]
impl WindowsJob {
    fn attach(child: &(dyn Child + Send + Sync)) -> Result<Self, TerminalError> {
        use std::mem::size_of;
        use std::ptr;

        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };

        let process = child.as_raw_handle().ok_or_else(|| {
            TerminalError::new(
                TerminalErrorKind::Io,
                "the Windows terminal process did not expose a native handle",
            )
        })?;
        let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() {
            return Err(io_error(std::io::Error::last_os_error()));
        }
        let job = Self {
            handle: handle as usize,
            terminated: false,
        };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                job.handle(),
                JobObjectExtendedLimitInformation,
                std::ptr::from_ref(&limits).cast(),
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if configured == 0 {
            return Err(io_error(std::io::Error::last_os_error()));
        }
        let assigned = unsafe { AssignProcessToJobObject(job.handle(), process.cast()) };
        if assigned == 0 {
            return Err(io_error(std::io::Error::last_os_error()));
        }
        Ok(job)
    }

    fn handle(&self) -> windows_sys::Win32::Foundation::HANDLE {
        self.handle as windows_sys::Win32::Foundation::HANDLE
    }

    fn terminate(&mut self) -> Result<(), TerminalError> {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;

        if self.terminated {
            return Ok(());
        }
        let result = unsafe { TerminateJobObject(self.handle(), 1) };
        if result == 0 {
            return Err(io_error(std::io::Error::last_os_error()));
        }
        self.terminated = true;
        Ok(())
    }
}

#[cfg(windows)]
impl Drop for WindowsJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.handle());
        }
    }
}

#[cfg(unix)]
fn owned_process_group(
    child_process_id: Option<u32>,
    tty_process_group: Option<i32>,
) -> Option<i32> {
    // portable-pty starts the Unix child as a session and process-group
    // leader. Its PID is therefore the group we own; the terminal's current
    // foreground group is only a fallback when a backend omits that PID.
    child_process_id
        .and_then(|identity| i32::try_from(identity).ok())
        .or(tty_process_group)
}

#[cfg(unix)]
fn cleanup_unix_session(process_group: Option<i32>) -> Result<(), TerminalError> {
    cleanup_unix_session_with(
        process_group,
        |process_group| signal_process(-process_group, libc::SIGKILL),
        signal_session_members,
    )
}

#[cfg(unix)]
fn cleanup_unix_session_with<SignalGroup, SignalMembers>(
    process_group: Option<i32>,
    signal_group: SignalGroup,
    signal_members: SignalMembers,
) -> Result<(), TerminalError>
where
    SignalGroup: FnOnce(i32) -> std::io::Result<()>,
    SignalMembers: FnOnce(i32) -> Result<(), TerminalError>,
{
    let Some(process_group) = process_group else {
        return Ok(());
    };

    match signal_group(process_group) {
        Ok(()) => Ok(()),
        Err(error) if error.raw_os_error() == Some(libc::ESRCH) => Ok(()),
        // macOS reports EPERM for the whole group when any one member cannot
        // receive the signal. Fall back to the members that still belong to
        // this PTY session so one inaccessible process does not strand all of
        // the processes we can terminate.
        Err(error) if error.raw_os_error() == Some(libc::EPERM) => signal_members(process_group),
        Err(error) => Err(TerminalError::new(
            TerminalErrorKind::Io,
            format!("could not terminate terminal process group {process_group}: {error}"),
        )),
    }
}

#[cfg(unix)]
fn signal_session_members(session_id: i32) -> Result<(), TerminalError> {
    let mut system = System::new();
    system.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::nothing().without_tasks(),
    );
    let Ok(session_id) = u32::try_from(session_id) else {
        return Ok(());
    };
    let session_id = Pid::from_u32(session_id);
    let mut members = system
        .processes()
        .iter()
        .filter_map(|(pid, process)| (process.session_id() == Some(session_id)).then_some(*pid))
        .collect::<Vec<_>>();
    members.sort_unstable_by_key(|pid| (*pid == session_id, pid.as_u32()));

    let mut first_error = None;
    for pid in members {
        let native_pid = match i32::try_from(pid.as_u32()) {
            Ok(pid) => pid,
            Err(_) => continue,
        };
        if let Err(error) = signal_process(native_pid, libc::SIGKILL) {
            match error.raw_os_error() {
                // A process can exit or change effective user between the
                // session snapshot and this signal. Neither should prevent us
                // from terminating the remaining owned members.
                Some(code) if code == libc::ESRCH || code == libc::EPERM => {}
                _ => {
                    first_error.get_or_insert_with(|| {
                        TerminalError::new(
                            TerminalErrorKind::Io,
                            format!("could not terminate terminal process {native_pid}: {error}"),
                        )
                    });
                }
            }
        }
    }

    match first_error {
        Some(error) => Err(error),
        None => Ok(()),
    }
}

#[cfg(unix)]
fn signal_process(process: i32, signal: libc::c_int) -> std::io::Result<()> {
    let result = unsafe { libc::kill(process, signal) };
    if result == 0 {
        return Ok(());
    }

    Err(std::io::Error::last_os_error())
}

fn io_error(error: std::io::Error) -> TerminalError {
    TerminalError::new(TerminalErrorKind::Io, error.to_string())
}

#[cfg(all(test, unix))]
mod tests {
    use std::cell::Cell;

    use super::{cleanup_unix_session_with, owned_process_group, ProcessTree};

    #[test]
    fn process_tree_prefers_the_owned_child_over_a_stale_tty_group() {
        assert_eq!(owned_process_group(Some(42), Some(7)), Some(42));
        assert_eq!(owned_process_group(None, Some(7)), Some(7));
    }

    #[test]
    fn cleanup_consumes_the_owned_process_group() {
        let mut process_tree = ProcessTree {
            process_group: Some(1_000_000_000),
        };

        process_tree.cleanup_descendants().unwrap();

        assert_eq!(process_tree.process_group, None);
    }

    #[test]
    fn permission_denied_group_signal_falls_back_to_session_members() {
        let cleaned_session = Cell::new(None);

        cleanup_unix_session_with(
            Some(42),
            |_| Err(std::io::Error::from_raw_os_error(libc::EPERM)),
            |session_id| {
                cleaned_session.set(Some(session_id));
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(cleaned_session.get(), Some(42));
    }
}
