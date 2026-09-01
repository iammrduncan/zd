use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{Listener, Manager};

use crate::supervisor::{Supervisor, SupervisorPhase, SupervisorSnapshot};

const REPORT_EVENT: &str = "zd-installed-smoke";
const TRIGGER_WAIT: Duration = Duration::from_secs(20);
const TRIGGER_POLL: Duration = Duration::from_millis(20);
const MAX_PATH_BYTES: usize = 8 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Scenario {
    Normal,
    Forced,
    Crash,
}

impl Scenario {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "normal" => Some(Self::Normal),
            "forced" => Some(Self::Forced),
            "crash" => Some(Self::Crash),
            _ => None,
        }
    }

    fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Forced => "forced",
            Self::Crash => "crash",
        }
    }
}

#[derive(Debug)]
struct Config {
    scenario: Scenario,
    report: PathBuf,
    trigger: PathBuf,
}

#[derive(Debug, Default)]
struct Progress {
    first_ready: Option<(u64, String)>,
    finished: bool,
}

#[derive(Debug, Clone, Default)]
pub struct InstalledSmoke {
    config: Option<Arc<Config>>,
    progress: Arc<Mutex<Progress>>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "checkpoint", rename_all = "kebab-case", deny_unknown_fields)]
enum Checkpoint {
    Ready,
    CrashPresented,
    Failed { stage: FailureStage },
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
enum FailureStage {
    ShellAction,
    RetiredAuthority,
}

#[derive(Debug, PartialEq, Eq)]
enum Action {
    None,
    Reload,
    AwaitClose,
    Exit(i32),
}

struct Transition {
    record: Value,
    action: Action,
}

impl InstalledSmoke {
    pub fn from_environment() -> Result<Self, String> {
        Self::from_values(
            std::env::var_os("ZD_INSTALLED_SMOKE_SCENARIO"),
            std::env::var_os("ZD_INSTALLED_SMOKE_REPORT"),
            std::env::var_os("ZD_INSTALLED_SMOKE_TRIGGER"),
        )
    }

    fn from_values(
        scenario: Option<OsString>,
        report: Option<OsString>,
        trigger: Option<OsString>,
    ) -> Result<Self, String> {
        let supplied = [scenario.is_some(), report.is_some(), trigger.is_some()];
        if supplied.iter().all(|value| !value) {
            return Ok(Self::default());
        }
        if supplied.iter().any(|value| !value) {
            return Err("the installed smoke configuration is incomplete".to_string());
        }
        let scenario = scenario
            .and_then(|value| value.into_string().ok())
            .and_then(|value| Scenario::parse(&value))
            .ok_or_else(|| "the installed smoke scenario is invalid".to_string())?;
        let report = PathBuf::from(report.expect("complete smoke report"));
        let trigger = PathBuf::from(trigger.expect("complete smoke trigger"));
        validate_path(&report)?;
        validate_path(&trigger)?;
        if report == trigger {
            return Err("the installed smoke paths must be distinct".to_string());
        }
        Ok(Self {
            config: Some(Arc::new(Config {
                scenario,
                report,
                trigger,
            })),
            progress: Arc::new(Mutex::new(Progress::default())),
        })
    }

    pub fn enabled(&self) -> bool {
        self.config.is_some()
    }

    pub fn decorate_url(&self, url: &mut tauri::Url) {
        if let Some(config) = &self.config {
            url.query_pairs_mut()
                .append_pair("zd-installed-smoke", config.scenario.as_str());
        }
    }

    pub fn install(&self, app: &tauri::AppHandle) {
        if !self.enabled() {
            return;
        }
        let smoke = self.clone();
        let app_handle = app.clone();
        app.listen_any(REPORT_EVENT, move |event| {
            smoke.handle(&app_handle, event.payload());
        });
    }

    fn handle(&self, app: &tauri::AppHandle, payload: &str) {
        let checkpoint = match serde_json::from_str::<Checkpoint>(payload) {
            Ok(checkpoint) => checkpoint,
            Err(_) => {
                self.fail(app, "invalid-checkpoint");
                return;
            }
        };
        let snapshot = app.state::<Supervisor>().snapshot();
        let transition = {
            let mut progress = self
                .progress
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            self.advance(&mut progress, checkpoint, &snapshot)
        };
        let transition = match transition {
            Ok(transition) => transition,
            Err(stage) => {
                self.fail(app, stage);
                return;
            }
        };
        if self.append(&transition.record).is_err() {
            app.exit(1);
            return;
        }
        match transition.action {
            Action::None => {}
            Action::Reload => {
                let Some(window) = app.get_webview_window("main") else {
                    self.fail(app, "missing-window");
                    return;
                };
                if window.eval("window.location.reload();").is_err() {
                    self.fail(app, "reload-command");
                }
            }
            Action::AwaitClose => self.wait_for_close(app),
            Action::Exit(code) => app.exit(code),
        }
    }

    fn advance(
        &self,
        progress: &mut Progress,
        checkpoint: Checkpoint,
        snapshot: &SupervisorSnapshot,
    ) -> Result<Transition, &'static str> {
        let config = self.config.as_ref().ok_or("disabled")?;
        if progress.finished {
            return Err("checkpoint-after-finish");
        }
        match checkpoint {
            Checkpoint::Ready => {
                if snapshot.phase != SupervisorPhase::Ready {
                    return Err("host-not-ready");
                }
                let session_epoch = snapshot
                    .session_epoch
                    .as_ref()
                    .ok_or("missing-session")?
                    .clone();
                if let Some((generation, first_session)) = &progress.first_ready {
                    if config.scenario != Scenario::Normal {
                        return Err("unexpected-reload");
                    }
                    let same_generation = *generation == snapshot.generation;
                    let same_session = first_session == &session_epoch;
                    if !same_generation || !same_session {
                        return Err("reload-replaced-host");
                    }
                    progress.finished = true;
                    Ok(Transition {
                        record: json!({
                            "phase": "reloaded",
                            "sameGeneration": true,
                            "sameSession": true
                        }),
                        action: Action::AwaitClose,
                    })
                } else {
                    progress.first_ready = Some((snapshot.generation, session_epoch));
                    let action = match config.scenario {
                        Scenario::Normal => Action::Reload,
                        Scenario::Forced => Action::AwaitClose,
                        Scenario::Crash => Action::None,
                    };
                    Ok(Transition {
                        record: json!({
                            "phase": "ready",
                            "controller": "one",
                            "shell": "show-workbench",
                            "retiredAuthority": "absent"
                        }),
                        action,
                    })
                }
            }
            Checkpoint::CrashPresented => {
                if config.scenario != Scenario::Crash
                    || progress.first_ready.is_none()
                    || snapshot.phase != SupervisorPhase::Exited
                {
                    return Err("unexpected-crash-presentation");
                }
                progress.finished = true;
                Ok(Transition {
                    record: json!({ "phase": "crash-presented" }),
                    action: Action::Exit(0),
                })
            }
            Checkpoint::Failed { stage } => {
                progress.finished = true;
                let stage = match stage {
                    FailureStage::ShellAction => "shell-action",
                    FailureStage::RetiredAuthority => "retired-authority",
                };
                Ok(Transition {
                    record: json!({ "phase": "failed", "stage": stage }),
                    action: Action::Exit(1),
                })
            }
        }
    }

    fn wait_for_close(&self, app: &tauri::AppHandle) {
        let Some(config) = self.config.clone() else {
            return;
        };
        let smoke = self.clone();
        let app_handle = app.clone();
        if std::thread::Builder::new()
            .name("zd-installed-smoke-trigger".to_string())
            .spawn(move || {
                let deadline = Instant::now() + TRIGGER_WAIT;
                while Instant::now() < deadline {
                    if fs::read_to_string(&config.trigger)
                        .is_ok_and(|contents| contents.trim() == "close")
                    {
                        app_handle.exit(0);
                        return;
                    }
                    std::thread::sleep(TRIGGER_POLL);
                }
                smoke.fail(&app_handle, "close-trigger-timeout");
            })
            .is_err()
        {
            self.fail(app, "close-trigger-thread");
        }
    }

    fn fail(&self, app: &tauri::AppHandle, stage: &'static str) {
        let _ = self.append(&json!({ "phase": "failed", "stage": stage }));
        app.exit(1);
    }

    fn append(&self, record: &Value) -> Result<(), ()> {
        let config = self.config.as_ref().ok_or(())?;
        let mut bytes = serde_json::to_vec(record).map_err(|_| ())?;
        bytes.push(b'\n');
        let mut output = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&config.report)
            .map_err(|_| ())?;
        output.write_all(&bytes).map_err(|_| ())?;
        output.flush().map_err(|_| ())
    }
}

fn validate_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute() || path.as_os_str().len() > MAX_PATH_BYTES {
        return Err("the installed smoke path is invalid".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn snapshot(
        phase: SupervisorPhase,
        generation: u64,
        session_epoch: &str,
    ) -> SupervisorSnapshot {
        SupervisorSnapshot {
            generation,
            phase,
            origin: Some("http://127.0.0.1:4100".to_string()),
            session_epoch: Some(session_epoch.to_string()),
            problem: None,
        }
    }

    fn smoke(scenario: &str) -> InstalledSmoke {
        InstalledSmoke::from_values(
            Some(OsString::from(scenario)),
            Some(OsString::from("/tmp/zd-installed-smoke-report")),
            Some(OsString::from("/tmp/zd-installed-smoke-trigger")),
        )
        .unwrap()
    }

    #[test]
    fn smoke_configuration_is_all_or_nothing_and_uses_distinct_absolute_paths() {
        assert!(!InstalledSmoke::from_values(None, None, None)
            .unwrap()
            .enabled());
        assert!(InstalledSmoke::from_values(Some(OsString::from("normal")), None, None).is_err());
        assert!(InstalledSmoke::from_values(
            Some(OsString::from("unknown")),
            Some(OsString::from("/tmp/report")),
            Some(OsString::from("/tmp/trigger"))
        )
        .is_err());
        assert!(InstalledSmoke::from_values(
            Some(OsString::from("normal")),
            Some(OsString::from("relative")),
            Some(OsString::from("/tmp/trigger"))
        )
        .is_err());
        assert!(InstalledSmoke::from_values(
            Some(OsString::from("normal")),
            Some(OsString::from("/tmp/same")),
            Some(OsString::from("/tmp/same"))
        )
        .is_err());
    }

    #[test]
    fn normal_smoke_requires_one_generation_and_session_across_reload() {
        let normal = smoke("normal");
        let mut progress = Progress::default();

        let first = normal
            .advance(
                &mut progress,
                Checkpoint::Ready,
                &snapshot(SupervisorPhase::Ready, 7, "epoch-one"),
            )
            .unwrap();
        assert_eq!(first.action, Action::Reload);
        let reloaded = normal
            .advance(
                &mut progress,
                Checkpoint::Ready,
                &snapshot(SupervisorPhase::Ready, 7, "epoch-one"),
            )
            .unwrap();
        assert_eq!(reloaded.action, Action::AwaitClose);
        assert_eq!(reloaded.record["sameGeneration"], true);
        assert_eq!(reloaded.record["sameSession"], true);

        let changed_host = smoke("normal");
        let mut changed = Progress::default();
        changed_host
            .advance(
                &mut changed,
                Checkpoint::Ready,
                &snapshot(SupervisorPhase::Ready, 7, "epoch-one"),
            )
            .unwrap();
        assert!(changed_host
            .advance(
                &mut changed,
                Checkpoint::Ready,
                &snapshot(SupervisorPhase::Ready, 8, "epoch-two"),
            )
            .is_err());
    }

    #[test]
    fn crash_smoke_finishes_only_after_the_ready_host_exits_and_the_page_reports() {
        let smoke = smoke("crash");
        let mut progress = Progress::default();
        smoke
            .advance(
                &mut progress,
                Checkpoint::Ready,
                &snapshot(SupervisorPhase::Ready, 3, "epoch"),
            )
            .unwrap();

        assert!(smoke
            .advance(
                &mut progress,
                Checkpoint::CrashPresented,
                &snapshot(SupervisorPhase::Ready, 3, "epoch"),
            )
            .is_err());
        let presented = smoke
            .advance(
                &mut progress,
                Checkpoint::CrashPresented,
                &snapshot(SupervisorPhase::Exited, 3, "epoch"),
            )
            .unwrap();
        assert_eq!(presented.action, Action::Exit(0));
        assert_eq!(presented.record["phase"], "crash-presented");
    }
}
