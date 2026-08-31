use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    project: PathBuf,
    port: u16,
}

impl ServeArgs {
    pub fn parse(arguments: &[String]) -> Result<Self, String> {
        let mut project = None;
        let mut port = 0;
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
                argument if argument.starts_with('-') => {
                    return Err(format!("unknown serve option: {argument}"));
                }
                argument if project.is_none() => project = Some(PathBuf::from(argument)),
                _ => return Err("zd serve accepts exactly one folder".to_string()),
            }
            index += 1;
        }
        let project = project.ok_or_else(|| "zd serve requires a folder".to_string())?;
        Ok(Self { project, port })
    }

    pub fn project(&self) -> &Path {
        &self.project
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}
