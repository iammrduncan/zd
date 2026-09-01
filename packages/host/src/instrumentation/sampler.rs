use std::sync::Mutex;

use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};

use super::{ProcessSample, ProcessSampler};

/// Samples only this application process, and performs no refresh work until
/// diagnostics explicitly start asking for samples.
pub struct CurrentProcessSampler {
    pid: Pid,
    system: Mutex<System>,
}

impl CurrentProcessSampler {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            pid: sysinfo::get_current_pid().map_err(str::to_string)?,
            system: Mutex::new(System::new()),
        })
    }
}

impl ProcessSampler for CurrentProcessSampler {
    fn sample(&self) -> Result<ProcessSample, String> {
        let mut system = self
            .system
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let updated = system.refresh_processes_specifics(
            ProcessesToUpdate::Some(&[self.pid]),
            true,
            ProcessRefreshKind::nothing()
                .with_cpu()
                .with_memory()
                .without_tasks(),
        );
        if updated == 0 {
            return Err("the current process could not be refreshed".to_string());
        }

        let process = system
            .process(self.pid)
            .ok_or_else(|| "the current process is unavailable".to_string())?;
        let sample = ProcessSample {
            cpu_percent: f64::from(process.cpu_usage()),
            resident_bytes: process.memory(),
        };
        if !sample.is_bounded() {
            return Err("the current process returned an invalid sample".to_string());
        }
        Ok(sample)
    }
}
