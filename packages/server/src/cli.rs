use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    project: PathBuf,
    bind: Ipv4Addr,
    port: u16,
}

impl ServeArgs {
    pub fn parse(arguments: &[String]) -> Result<Self, String> {
        let invocation_directory = std::env::current_dir()
            .map_err(|error| format!("could not inspect the invocation directory: {error}"))?;
        Self::parse_in(arguments, &invocation_directory)
    }

    pub fn parse_in(arguments: &[String], invocation_directory: &Path) -> Result<Self, String> {
        let mut project = None;
        let mut bind = None;
        let mut port = None;
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
            .unwrap_or_else(|| invocation_directory.to_path_buf());
        Ok(Self {
            project,
            bind: bind.unwrap_or(Ipv4Addr::UNSPECIFIED),
            port: port.unwrap_or(0),
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
}
