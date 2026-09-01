use std::io::{self, BufRead, BufReader, Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Weak};
use std::time::{Duration, Instant};

use zd_server::{
    WrapperControl, WrapperReadiness, WrapperStartup, MAX_WRAPPER_FRAME_BYTES,
    WRAPPER_PROTOCOL_VERSION,
};

use super::{validate_readiness, with_inner, Inner, SupervisorLaunch, SupervisorPhase};

const PROCESS_POLL: Duration = Duration::from_millis(20);
const STARTUP_DEADLINE: Duration = Duration::from_secs(10);
const GRACEFUL_SHUTDOWN_DEADLINE: Duration = Duration::from_secs(5);
const STDOUT_QUEUE_DEPTH: usize = 4;

#[derive(Debug, Clone, Copy)]
pub(super) enum ProcessCommand {
    Shutdown,
}

#[derive(Debug)]
enum ProcessOutcome {
    Stopped,
    Failed(&'static str),
    Exited(&'static str),
}

impl ProcessOutcome {
    fn phase(&self) -> SupervisorPhase {
        match self {
            Self::Stopped => SupervisorPhase::Stopped,
            Self::Failed(_) => SupervisorPhase::Failed,
            Self::Exited(_) => SupervisorPhase::Exited,
        }
    }

    fn problem(&self) -> Option<String> {
        match self {
            Self::Stopped => None,
            Self::Failed(problem) | Self::Exited(problem) => Some((*problem).to_string()),
        }
    }
}

#[derive(Debug)]
enum OutputEvent {
    Frame(Vec<u8>),
    Eof,
    Invalid,
}

pub(super) fn run(
    inner: Weak<Inner>,
    generation: u64,
    launch: SupervisorLaunch,
    commands: mpsc::Receiver<ProcessCommand>,
) {
    let outcome = own_process(&inner, generation, launch, &commands);
    let phase = outcome.phase();
    let problem = outcome.problem();
    let _ = with_inner(&inner, |inner| {
        inner.finish(generation, phase, problem);
    });
}

fn own_process(
    inner: &Weak<Inner>,
    generation: u64,
    launch: SupervisorLaunch,
    commands: &mpsc::Receiver<ProcessCommand>,
) -> ProcessOutcome {
    let startup = match startup_frame(&launch) {
        Ok(startup) => startup,
        Err(problem) => return ProcessOutcome::Failed(problem),
    };
    let mut command = Command::new(&launch.executable);
    command
        .arg("__zd-wrapper-child")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (name, value) in launch.environment {
        command.env(name, value);
    }
    let child = match command.spawn() {
        Ok(child) => child,
        Err(_) => {
            return ProcessOutcome::Failed("the desktop host process could not start");
        }
    };
    let mut child = OwnedChild::new(child);
    let Some(mut stdin) = child.child.stdin.take() else {
        return ProcessOutcome::Failed("the desktop host startup channel is unavailable");
    };
    let Some(stdout) = child.child.stdout.take() else {
        return ProcessOutcome::Failed("the desktop host readiness channel is unavailable");
    };
    let Some(stderr) = child.child.stderr.take() else {
        return ProcessOutcome::Failed("the desktop host error channel is unavailable");
    };

    let (output, output_events) = mpsc::sync_channel(STDOUT_QUEUE_DEPTH);
    let stdout_reader = match std::thread::Builder::new()
        .name("zd-desktop-host-stdout".to_string())
        .spawn(move || read_stdout(stdout, &output))
    {
        Ok(reader) => reader,
        Err(_) => {
            return ProcessOutcome::Failed("the desktop host readiness reader could not start");
        }
    };
    let stderr_reader = match std::thread::Builder::new()
        .name("zd-desktop-host-stderr".to_string())
        .spawn(move || drain_stderr(stderr))
    {
        Ok(reader) => reader,
        Err(_) => {
            child.force_stop();
            let _ = stdout_reader.join();
            return ProcessOutcome::Failed("the desktop host error reader could not start");
        }
    };

    let outcome = if write_json_line(&mut stdin, &startup).is_err() {
        ProcessOutcome::Failed("the desktop host process closed before readiness")
    } else {
        run_protocol(
            inner,
            generation,
            commands,
            &output_events,
            &mut child,
            &mut stdin,
        )
    };
    if !matches!(outcome, ProcessOutcome::Stopped) {
        child.force_stop();
    }
    drop(stdin);
    child.force_stop();
    drop(output_events);
    let _ = stdout_reader.join();
    let _ = stderr_reader.join();
    outcome
}

fn run_protocol(
    inner: &Weak<Inner>,
    generation: u64,
    commands: &mpsc::Receiver<ProcessCommand>,
    output: &mpsc::Receiver<OutputEvent>,
    child: &mut OwnedChild,
    stdin: &mut ChildStdin,
) -> ProcessOutcome {
    let deadline = Instant::now() + STARTUP_DEADLINE;
    let readiness = loop {
        match commands.try_recv() {
            Ok(ProcessCommand::Shutdown) | Err(mpsc::TryRecvError::Disconnected) => {
                stop_child(child, stdin);
                return ProcessOutcome::Stopped;
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        match child.has_exited() {
            Ok(true) => {
                return ProcessOutcome::Failed("the desktop host process exited before readiness");
            }
            Err(()) => {
                return ProcessOutcome::Failed(
                    "the desktop host process could not be checked before readiness",
                );
            }
            Ok(false) => {}
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return ProcessOutcome::Failed(
                "the desktop host did not report readiness before the deadline",
            );
        }
        match output.recv_timeout(remaining.min(PROCESS_POLL)) {
            Ok(OutputEvent::Frame(frame)) => {
                let readiness = match serde_json::from_slice::<WrapperReadiness>(&frame)
                    .map_err(|_| ())
                    .and_then(|readiness| validate_readiness(readiness).map_err(|_| ()))
                {
                    Ok(readiness) => readiness,
                    Err(()) => {
                        return ProcessOutcome::Failed(
                            "the desktop host sent invalid readiness before startup",
                        );
                    }
                };
                break readiness;
            }
            Ok(OutputEvent::Eof) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                return ProcessOutcome::Failed(
                    "the desktop host readiness channel closed before readiness",
                );
            }
            Ok(OutputEvent::Invalid) => {
                return ProcessOutcome::Failed(
                    "the desktop host sent invalid output before readiness",
                );
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
    };

    let ready = with_inner(inner, |inner| inner.ready(generation, readiness)).unwrap_or(false);
    if !ready {
        stop_child(child, stdin);
        return ProcessOutcome::Stopped;
    }

    loop {
        match commands.recv_timeout(PROCESS_POLL) {
            Ok(ProcessCommand::Shutdown) | Err(mpsc::RecvTimeoutError::Disconnected) => {
                stop_child(child, stdin);
                return ProcessOutcome::Stopped;
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        match output.try_recv() {
            Ok(OutputEvent::Frame(_)) | Ok(OutputEvent::Invalid) => {
                return ProcessOutcome::Exited(
                    "the desktop host sent unexpected output after readiness",
                );
            }
            Ok(OutputEvent::Eof) | Err(mpsc::TryRecvError::Disconnected) => {
                return ProcessOutcome::Exited(
                    "the desktop host connection closed after readiness",
                );
            }
            Err(mpsc::TryRecvError::Empty) => {}
        }
        match child.has_exited() {
            Ok(true) => {
                return ProcessOutcome::Exited("the desktop host process exited unexpectedly");
            }
            Err(()) => {
                return ProcessOutcome::Exited("the desktop host process could not be checked");
            }
            Ok(false) => {}
        }
    }
}

fn startup_frame(launch: &SupervisorLaunch) -> Result<WrapperStartup, &'static str> {
    let launch_path = match launch.launch_path.as_deref() {
        Some(path) => Some(
            path.to_str()
                .ok_or("the desktop launch path cannot be sent to the host process")?
                .to_string(),
        ),
        None => None,
    };
    Ok(WrapperStartup {
        wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        application_version: env!("CARGO_PKG_VERSION").to_string(),
        launch_path,
    })
}

fn stop_child(child: &mut OwnedChild, stdin: &mut ChildStdin) {
    let _ = write_json_line(
        stdin,
        &WrapperControl::Shutdown {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
        },
    );
    let deadline = Instant::now() + GRACEFUL_SHUTDOWN_DEADLINE;
    while Instant::now() < deadline {
        match child.has_exited() {
            Ok(true) => return,
            Err(()) => break,
            Ok(false) => std::thread::sleep(PROCESS_POLL),
        }
    }
    child.force_stop();
}

fn write_json_line(output: &mut impl Write, frame: &impl serde::Serialize) -> Result<(), ()> {
    let bytes = serde_json::to_vec(frame).map_err(|_| ())?;
    if bytes.len() + 1 > MAX_WRAPPER_FRAME_BYTES {
        return Err(());
    }
    output
        .write_all(&bytes)
        .and_then(|_| output.write_all(b"\n"))
        .and_then(|_| output.flush())
        .map_err(|_| ())
}

fn read_stdout(stdout: std::process::ChildStdout, output: &mpsc::SyncSender<OutputEvent>) {
    let mut input = BufReader::new(stdout);
    loop {
        let mut bytes = Vec::new();
        let read = Read::by_ref(&mut input)
            .take((MAX_WRAPPER_FRAME_BYTES + 1) as u64)
            .read_until(b'\n', &mut bytes);
        let event = match read {
            Ok(0) => OutputEvent::Eof,
            Ok(_) if bytes.len() > MAX_WRAPPER_FRAME_BYTES => OutputEvent::Invalid,
            Ok(_) if bytes.pop() != Some(b'\n') => OutputEvent::Invalid,
            Ok(_) => OutputEvent::Frame(bytes),
            Err(_) => OutputEvent::Invalid,
        };
        let finished = !matches!(event, OutputEvent::Frame(_));
        if output.send(event).is_err() || finished {
            return;
        }
    }
}

fn drain_stderr(mut stderr: std::process::ChildStderr) {
    let _ = io::copy(&mut stderr, &mut io::sink());
}

struct OwnedChild {
    child: Child,
    reaped: bool,
}

impl OwnedChild {
    fn new(child: Child) -> Self {
        Self {
            child,
            reaped: false,
        }
    }

    fn has_exited(&mut self) -> Result<bool, ()> {
        if self.reaped {
            return Ok(true);
        }
        match self.child.try_wait().map_err(|_| ())? {
            Some(_) => {
                self.reaped = true;
                Ok(true)
            }
            None => Ok(false),
        }
    }

    fn force_stop(&mut self) {
        if self.reaped {
            return;
        }
        let _ = self.child.kill();
        if self.child.wait().is_ok() {
            self.reaped = true;
        }
    }
}

impl Drop for OwnedChild {
    fn drop(&mut self) {
        self.force_stop();
    }
}
