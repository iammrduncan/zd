use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeOpenRequest {
    /// Absolute native path, or `None` for the workbench home.
    pub path: Option<String>,
}

const INVOCATION_DIR: &str = "ZD_CWD";

pub(crate) fn invocation_directory_from_environment() -> PathBuf {
    resolve_directory(
        std::env::var_os(INVOCATION_DIR).map(PathBuf::from),
        std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
    )
}

fn resolve_directory(override_directory: Option<PathBuf>, working_directory: PathBuf) -> PathBuf {
    match override_directory {
        Some(directory) if directory.is_absolute() => directory,
        _ => working_directory,
    }
}

pub(crate) fn parse_launch_args(
    arguments: &[String],
    invocation_directory: &Path,
) -> Result<NativeOpenRequest, String> {
    let mut positional = arguments
        .iter()
        .filter(|argument| argument.starts_with("-psn_") || !argument.starts_with('-'))
        .filter(|argument| !argument.starts_with("-psn_"));
    if let Some(option) = arguments
        .iter()
        .find(|argument| argument.starts_with('-') && !argument.starts_with("-psn_"))
    {
        return Err(format!("unknown desktop option: {option}"));
    }
    let Some(first) = positional.next() else {
        return Ok(NativeOpenRequest { path: None });
    };
    if positional.next().is_some() {
        return Err("zd accepts at most one desktop path".to_string());
    }
    Ok(NativeOpenRequest {
        path: Some(absolutize(first, invocation_directory)),
    })
}

fn absolutize(raw: &str, invocation_directory: &Path) -> String {
    let candidate = Path::new(raw);
    let joined = if candidate.is_absolute() {
        candidate.to_path_buf()
    } else {
        invocation_directory.join(candidate)
    };
    let cleaned = joined
        .components()
        .filter(|component| !matches!(component, Component::CurDir))
        .collect::<PathBuf>();
    if cleaned.as_os_str().is_empty() {
        invocation_directory.to_string_lossy().into_owned()
    } else {
        cleaned.to_string_lossy().into_owned()
    }
}

#[cfg(target_os = "macos")]
pub fn opened_request(urls: &[tauri::Url]) -> Option<NativeOpenRequest> {
    let path = urls.iter().find_map(|url| url.to_file_path().ok())?;
    Some(NativeOpenRequest {
        path: Some(path.to_string_lossy().into_owned()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_relative_override_cannot_replace_the_real_invocation_directory() {
        assert_eq!(
            resolve_directory(
                Some(PathBuf::from("relative")),
                PathBuf::from("/actual/work")
            ),
            PathBuf::from("/actual/work")
        );
        assert_eq!(
            resolve_directory(
                Some(PathBuf::from("/reported/work")),
                PathBuf::from("/actual/work")
            ),
            PathBuf::from("/reported/work")
        );
    }
}
