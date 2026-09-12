use std::net::Ipv4Addr;
use std::path::{Path, PathBuf};

const MAX_FIXED_SECRET_BYTES: usize = 128;

/// A fixed, human-typed secret may only guard a listener that cannot be
/// reached by an open network: loopback, or a Tailscale tailnet address in the
/// carrier-grade NAT range (the protected network remote access assumes).
pub(crate) fn fixed_secret_bind_allowed(bind: Ipv4Addr) -> bool {
    bind.is_loopback() || (bind.octets()[0] == 100 && (64..=127).contains(&bind.octets()[1]))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServeArgs {
    project: PathBuf,
    bind: Ipv4Addr,
    port: u16,
    secret: Option<String>,
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
        let mut secret = None;
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
                "--secret" => {
                    if secret.is_some() {
                        return Err("--secret may be supplied only once".to_string());
                    }
                    index += 1;
                    let value = arguments
                        .get(index)
                        .ok_or_else(|| "--secret requires a value".to_string())?;
                    if value.is_empty() || value.len() > MAX_FIXED_SECRET_BYTES {
                        return Err(format!(
                            "--secret must be between 1 and {MAX_FIXED_SECRET_BYTES} bytes"
                        ));
                    }
                    secret = Some(value.clone());
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
        // A fixed secret exists for typing by hand, so it is only ever valid
        // on a loopback or Tailscale-range bind; an omitted --bind narrows to
        // loopback instead of listening on every interface.
        let bind = match (bind, secret.is_some()) {
            (Some(bind), true) if !fixed_secret_bind_allowed(bind) => {
                return Err(
                    "--secret requires a loopback or Tailscale (100.64.0.0/10) bind".to_string(),
                );
            }
            (Some(bind), _) => bind,
            (None, true) => Ipv4Addr::LOCALHOST,
            (None, false) => Ipv4Addr::UNSPECIFIED,
        };
        Ok(Self {
            project,
            bind,
            port: port.unwrap_or(0),
            secret,
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

    pub fn secret(&self) -> Option<&str> {
        self.secret.as_deref()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    fn cwd() -> PathBuf {
        PathBuf::from("/work/notes")
    }

    #[test]
    fn a_fixed_secret_defaults_the_bind_to_loopback() {
        let served = ServeArgs::parse_in(&args(&["--secret", "12345"]), &cwd()).unwrap();
        assert_eq!(served.secret(), Some("12345"));
        assert_eq!(served.bind(), Ipv4Addr::LOCALHOST);
        assert_eq!(served.project(), cwd());
    }

    #[test]
    fn a_fixed_secret_accepts_loopback_and_tailscale_binds_only() {
        for bind in ["127.0.0.1", "127.55.0.9", "100.80.233.115", "100.127.0.1"] {
            let served =
                ServeArgs::parse_in(&args(&["--bind", bind, "--secret", "local"]), &cwd()).unwrap();
            assert_eq!(served.bind().to_string(), bind);
        }

        for bind in [
            "0.0.0.0",
            "192.168.1.20",
            "8.8.8.8",
            "100.63.255.255",
            "100.128.0.1",
        ] {
            let result = ServeArgs::parse_in(&args(&["--bind", bind, "--secret", "local"]), &cwd());
            assert!(result.is_err(), "accepted --bind {bind} with --secret");
        }
    }

    #[test]
    fn secret_option_is_single_valued_and_bounded() {
        for invalid in [
            args(&["--secret"]),
            args(&["--secret", "one", "--secret", "two"]),
            args(&["--secret", ""]),
            args(&["--secret", &"x".repeat(129)]),
        ] {
            assert!(
                ServeArgs::parse_in(&invalid, &cwd()).is_err(),
                "accepted {invalid:?}"
            );
        }
        assert!(ServeArgs::parse_in(&args(&["--secret", &"x".repeat(128)]), &cwd()).is_ok());
    }

    #[test]
    fn serve_without_a_secret_keeps_the_unspecified_default_bind() {
        let served = ServeArgs::parse_in(&args(&["project"]), &cwd()).unwrap();
        assert_eq!(served.secret(), None);
        assert_eq!(served.bind(), Ipv4Addr::UNSPECIFIED);
    }
}
