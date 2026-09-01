use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    project: PathBuf,
    bind: Ipv4Addr,
    port: u16,
    state_directory: Option<PathBuf>,
}

impl ServeArgs {
    pub fn parse(arguments: &[String]) -> Result<Self, String> {
        let invocation_directory = std::env::current_dir()
            .map_err(|error| format!("could not inspect the invocation directory: {error}"))?;
        let mut project = None;
        let mut bind = None;
        let mut port = None;
        let mut state_directory = None;
        let mut index = 0;
        while index < arguments.len() {
            match arguments[index].as_str() {
                "--bind" => {
                    if bind.is_some() {
                        return Err("--bind may be supplied only once".to_string());
                    }
                    index += 1;
                    let value = arguments
                        .get(index)
                        .ok_or_else(|| "--bind requires a numeric IPv4 address".to_string())?;
                    bind = Some(
                        value
                            .parse::<Ipv4Addr>()
                            .map_err(|_| "--bind requires a numeric IPv4 address".to_string())?,
                    );
                }
                "--port" => {
                    if port.is_some() {
                        return Err("--port may be supplied only once".to_string());
                    }
                    index += 1;
                    let value = arguments
                        .get(index)
                        .ok_or_else(|| "--port requires a number".to_string())?;
                    port = Some(
                        value
                            .parse::<u16>()
                            .map_err(|_| "--port must be between 0 and 65535".to_string())?,
                    );
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
        let project = project
            .map(|path| {
                if path.is_absolute() {
                    path
                } else {
                    invocation_directory.join(path)
                }
            })
            .unwrap_or(invocation_directory);
        Ok(Self {
            project,
            bind: bind.unwrap_or(Ipv4Addr::UNSPECIFIED),
            port: port.unwrap_or(0),
            state_directory,
        })
    }

    pub fn project(&self) -> &Path {
        &self.project
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn bind(&self) -> Ipv4Addr {
        self.bind
    }

    pub fn state_directory(&self) -> Option<&Path> {
        self.state_directory.as_deref()
    }
}
