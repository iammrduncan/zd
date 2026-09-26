use std::path::Path;

use crate::dispatch::{self, LaunchMode};
use crate::launch::NativeOpenRequest;
use crate::{quick_access, shell};

const MAX_SECONDARY_ARGUMENTS: usize = 4;
const MAX_SECONDARY_VALUE_BYTES: usize = 8 * 1024;

pub fn plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(handle_secondary)
}

fn handle_secondary(app: &tauri::AppHandle, arguments: Vec<String>, cwd: String) {
    let request = match secondary_request(arguments, cwd) {
        Ok(request) => request,
        Err(problem) => {
            eprintln!("zd: {problem}");
            return;
        }
    };
    if let Some(path) = request.path.as_deref() {
        shell::queue_native_open(app, Path::new(path));
    }
    quick_access::show_ordinary(app);
}

fn secondary_request(
    arguments: Vec<String>,
    invocation_directory: String,
) -> Result<NativeOpenRequest, String> {
    if arguments.is_empty()
        || arguments.len() > MAX_SECONDARY_ARGUMENTS
        || arguments.iter().any(|argument| invalid_value(argument))
        || invalid_value(&invocation_directory)
    {
        return Err("the secondary desktop launch is invalid".to_string());
    }
    let invocation_directory = Path::new(&invocation_directory);
    if !invocation_directory.is_absolute() {
        return Err("the secondary desktop working directory is invalid".to_string());
    }
    let launch = dispatch::parse_command(&arguments[1..], invocation_directory)
        .map_err(|_| "the secondary desktop launch is invalid".to_string())?;
    match launch {
        LaunchMode::Desktop(request) => Ok(request),
        LaunchMode::Serve(_) | LaunchMode::TerminalKeeper(_) | LaunchMode::WrapperChild => {
            Err("the secondary launch is not a desktop request".to_string())
        }
    }
}

fn invalid_value(value: &str) -> bool {
    value.is_empty() || value.len() > MAX_SECONDARY_VALUE_BYTES || value.contains('\0')
}

#[cfg(test)]
mod tests {
    use crate::launch::NativeOpenRequest;

    use super::secondary_request;

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[test]
    fn secondary_desktop_launches_resolve_one_path_against_their_own_directory() {
        assert_eq!(
            secondary_request(
                arguments(&["/opt/zd", "notes.md"]),
                "/work/project".to_string()
            )
            .unwrap(),
            NativeOpenRequest {
                path: Some("/work/project/notes.md".to_string()),
            }
        );
        assert_eq!(
            secondary_request(arguments(&["/opt/zd"]), "/work/project".to_string()).unwrap(),
            NativeOpenRequest { path: None }
        );
    }

    #[test]
    fn secondary_forwarding_rejects_non_desktop_and_unbounded_inputs() {
        for (arguments, cwd) in [
            (arguments(&[]), "/work".to_string()),
            (arguments(&["/opt/zd", "serve"]), "/work".to_string()),
            (
                arguments(&["/opt/zd", "__zd-wrapper-child"]),
                "/work".to_string(),
            ),
            (
                arguments(&["/opt/zd", "__zd-terminal-keeper", "/state/zd"]),
                "/work".to_string(),
            ),
            (arguments(&["/opt/zd", "one", "two"]), "/work".to_string()),
            (arguments(&["/opt/zd", "notes.md"]), "relative".to_string()),
            (
                vec!["/opt/zd".to_string(), "x".repeat(9 * 1024)],
                "/work".to_string(),
            ),
        ] {
            assert!(
                secondary_request(arguments, cwd).is_err(),
                "accepted an invalid secondary launch"
            );
        }
    }
}
