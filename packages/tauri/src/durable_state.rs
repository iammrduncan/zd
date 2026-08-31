//! Temporary Tauri commands over the host-owned durable-state service.

use crate::cli::LaunchState;
use zd_host::{DurableStateApply, DurableStateApplyResult, DurableStateBundle};

#[tauri::command]
pub fn describe_durable_state(
    launch: tauri::State<'_, LaunchState>,
) -> Result<DurableStateBundle, String> {
    launch.durable_state()?.describe()
}

#[tauri::command]
pub fn apply_durable_state(
    launch: tauri::State<'_, LaunchState>,
    request: DurableStateApply,
) -> Result<DurableStateApplyResult, String> {
    launch.durable_state()?.apply(&request)
}
