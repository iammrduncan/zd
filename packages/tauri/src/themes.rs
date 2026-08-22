//! Bounded discovery of data-only themes in the platform configuration folder.

use std::path::Path;

use tauri::Manager;

const THEME_CONFIG_LIMIT_BYTES: u64 = 65_536;
const THEME_SUFFIX: &str = ".theme.config";

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeConfigFile {
    pub file_name: String,
    pub contents: Option<String>,
    pub problem: Option<String>,
}

impl ThemeConfigFile {
    fn valid(file_name: String, contents: String) -> Self {
        Self {
            file_name,
            contents: Some(contents),
            problem: None,
        }
    }

    fn invalid(file_name: String, problem: impl Into<String>) -> Self {
        Self {
            file_name,
            contents: None,
            problem: Some(problem.into()),
        }
    }
}

fn theme_files_in(directory: &Path) -> Result<Vec<ThemeConfigFile>, String> {
    let directory_metadata = match std::fs::symlink_metadata(directory) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(format!("{}: {error}", directory.display())),
    };
    if directory_metadata.file_type().is_symlink() {
        return Err("the zd theme configuration directory cannot be a symbolic link".to_string());
    }
    if !directory_metadata.is_dir() {
        return Err("the zd theme configuration path is not a directory".to_string());
    }

    let entries = std::fs::read_dir(directory)
        .map_err(|error| format!("{}: {error}", directory.display()))?;
    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let file_name = entry.file_name().to_string_lossy().into_owned();
        if !file_name.ends_with(THEME_SUFFIX) {
            continue;
        }

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                files.push(ThemeConfigFile::invalid(
                    file_name,
                    format!("could not inspect theme file: {error}"),
                ));
                continue;
            }
        };
        if file_type.is_symlink() {
            files.push(ThemeConfigFile::invalid(
                file_name,
                "symbolic-link theme files are not allowed",
            ));
            continue;
        }
        if !file_type.is_file() {
            files.push(ThemeConfigFile::invalid(
                file_name,
                "theme configuration is not a regular file",
            ));
            continue;
        }

        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(error) => {
                files.push(ThemeConfigFile::invalid(
                    file_name,
                    format!("could not inspect theme size: {error}"),
                ));
                continue;
            }
        };
        if metadata.len() > THEME_CONFIG_LIMIT_BYTES {
            files.push(ThemeConfigFile::invalid(
                file_name,
                "theme configuration exceeds the 65,536-byte limit",
            ));
            continue;
        }

        let bytes = match std::fs::read(entry.path()) {
            Ok(bytes) => bytes,
            Err(error) => {
                files.push(ThemeConfigFile::invalid(
                    file_name,
                    format!("could not read theme configuration: {error}"),
                ));
                continue;
            }
        };
        if bytes.len() as u64 > THEME_CONFIG_LIMIT_BYTES {
            files.push(ThemeConfigFile::invalid(
                file_name,
                "theme configuration exceeds the 65,536-byte limit",
            ));
            continue;
        }
        match String::from_utf8(bytes) {
            Ok(contents) => files.push(ThemeConfigFile::valid(file_name, contents)),
            Err(_) => files.push(ThemeConfigFile::invalid(
                file_name,
                "theme configuration is not UTF-8",
            )),
        }
    }
    files.sort_by(|left, right| left.file_name.cmp(&right.file_name));
    Ok(files)
}

/// Read only direct theme-file children of the platform's `zd` config directory.
#[tauri::command]
pub fn theme_config_files(app: tauri::AppHandle) -> Result<Vec<ThemeConfigFile>, String> {
    let directory = app
        .path()
        .config_dir()
        .map_err(|error| error.to_string())?
        .join("zd");
    theme_files_in(&directory)
}

#[cfg(test)]
mod tests {
    use super::{theme_files_in, THEME_CONFIG_LIMIT_BYTES};
    use std::path::PathBuf;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock moved before epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("zd-themes-{name}-{stamp}"));
            std::fs::create_dir_all(&path).expect("create scratch directory");
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn an_absent_configuration_directory_is_empty() {
        let scratch = Scratch::new("absent");
        let missing = scratch.0.join("missing");
        assert_eq!(theme_files_in(&missing).unwrap(), Vec::new());
    }

    #[test]
    fn direct_theme_files_are_read_in_stable_order() {
        let scratch = Scratch::new("ordered");
        std::fs::write(scratch.0.join("z.theme.config"), "{\"z\":true}").unwrap();
        std::fs::write(scratch.0.join("a.theme.config"), "{\"a\":true}").unwrap();
        std::fs::write(scratch.0.join("notes.txt"), "ignored").unwrap();
        std::fs::create_dir(scratch.0.join("nested.theme.config")).unwrap();

        let files = theme_files_in(&scratch.0).unwrap();
        assert_eq!(
            files
                .iter()
                .map(|file| file.file_name.as_str())
                .collect::<Vec<_>>(),
            vec!["a.theme.config", "nested.theme.config", "z.theme.config"]
        );
        assert_eq!(files[0].contents.as_deref(), Some("{\"a\":true}"));
        assert!(files[1]
            .problem
            .as_deref()
            .is_some_and(|problem| problem.contains("regular file")));
    }

    #[test]
    fn oversized_and_non_utf8_files_are_isolated() {
        let scratch = Scratch::new("invalid");
        std::fs::write(
            scratch.0.join("large.theme.config"),
            vec![b' '; THEME_CONFIG_LIMIT_BYTES as usize + 1],
        )
        .unwrap();
        std::fs::write(scratch.0.join("bytes.theme.config"), [0xff, 0xfe]).unwrap();

        let files = theme_files_in(&scratch.0).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|file| file.contents.is_none()));
        assert!(files.iter().any(|file| file
            .problem
            .as_deref()
            .is_some_and(|problem| problem.contains("65,536-byte"))));
        assert!(files.iter().any(|file| file
            .problem
            .as_deref()
            .is_some_and(|problem| problem.contains("UTF-8"))));
    }

    #[cfg(unix)]
    #[test]
    fn symbolic_link_theme_files_are_rejected() {
        use std::os::unix::fs::symlink;

        let scratch = Scratch::new("symlink");
        let target = scratch.0.join("target.txt");
        std::fs::write(&target, "{}").unwrap();
        symlink(&target, scratch.0.join("linked.theme.config")).unwrap();

        let files = theme_files_in(&scratch.0).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0]
            .problem
            .as_deref()
            .is_some_and(|problem| problem.contains("symbolic-link")));
    }
}
