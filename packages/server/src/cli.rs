use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    project: PathBuf,
    port: u16,
    state_directory: Option<PathBuf>,
}

impl ServeArgs {
    pub fn parse(arguments: &[String]) -> Result<Self, String> {
        let mut project = None;
        let mut port = 0;
        let mut state_directory = None;
        let mut index = 0;
        while index < arguments.len() {
            match arguments[index].as_str() {
                "--port" => {
                    index += 1;
                    let value = arguments
                        .get(index)
                        .ok_or_else(|| "--port requires a number".to_string())?;
                    port = value
                        .parse::<u16>()
                        .map_err(|_| "--port must be between 0 and 65535".to_string())?;
                }
                "--state-dir" => {
                    if state_directory.is_some() {
                        return Err("--state-dir may be supplied only once".to_string());
                    }
                    index += 1;
                    let value = arguments
                        .get(index)
                        .filter(|value| !value.is_empty())
                        .ok_or_else(|| "--state-dir requires a folder".to_string())?;
                    state_directory = Some(PathBuf::from(value));
                }
                argument if argument.starts_with('-') => {
                    return Err(format!("unknown serve option: {argument}"));
                }
                argument if project.is_none() => project = Some(PathBuf::from(argument)),
                _ => return Err("zd serve accepts exactly one folder".to_string()),
            }
            index += 1;
        }
        let project = project.ok_or_else(|| "zd serve requires a folder".to_string())?;
        Ok(Self {
            project,
            port,
            state_directory,
        })
    }

    pub fn project(&self) -> &Path {
        &self.project
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn state_directory(&self) -> Option<&Path> {
        self.state_directory.as_deref()
    }
}
