use zd_server::{WrapperReadiness, PROTOCOL_VERSION, WRAPPER_PROTOCOL_VERSION};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedReadiness {
    pub origin: String,
    pub session_epoch: String,
    pub secret: String,
}

pub fn validate_readiness(readiness: WrapperReadiness) -> Result<ValidatedReadiness, String> {
    if readiness.wrapper_protocol_version != WRAPPER_PROTOCOL_VERSION
        || readiness.application_version != env!("CARGO_PKG_VERSION")
        || readiness.host_protocol_version != PROTOCOL_VERSION
    {
        return Err("the wrapper child readiness version is incompatible".to_string());
    }
    let origin = tauri::Url::parse(&readiness.origin)
        .map_err(|_| "the wrapper child origin is invalid".to_string())?;
    if origin.scheme() != "http"
        || origin.host_str() != Some("127.0.0.1")
        || origin.port().is_none()
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
        || readiness.origin != format!("http://127.0.0.1:{}", origin.port().unwrap_or_default())
    {
        return Err("the wrapper child origin is not an exact loopback origin".to_string());
    }
    if !url_token(&readiness.session_epoch, 22) || !url_token(&readiness.secret, 43) {
        return Err("the wrapper child credential shape is invalid".to_string());
    }
    Ok(ValidatedReadiness {
        origin: readiness.origin,
        session_epoch: readiness.session_epoch,
        secret: readiness.secret,
    })
}

fn url_token(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
}

#[cfg(test)]
mod tests {
    use zd_server::{PROTOCOL_VERSION, WRAPPER_PROTOCOL_VERSION};

    use super::*;

    fn readiness() -> WrapperReadiness {
        WrapperReadiness {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION,
            application_version: env!("CARGO_PKG_VERSION").to_string(),
            host_protocol_version: PROTOCOL_VERSION,
            origin: "http://127.0.0.1:4100".to_string(),
            session_epoch: "YWFhYWFhYWFhYWFhYWFhYQ".to_string(),
            secret: "a".repeat(43),
        }
    }

    #[test]
    fn exact_versioned_loopback_readiness_is_accepted() {
        assert_eq!(
            validate_readiness(readiness()).unwrap(),
            ValidatedReadiness {
                origin: "http://127.0.0.1:4100".to_string(),
                session_epoch: "YWFhYWFhYWFhYWFhYWFhYQ".to_string(),
                secret: "a".repeat(43),
            }
        );
    }

    #[test]
    fn versions_hostnames_wildcards_credentials_and_non_origins_are_refused() {
        let mut invalid = Vec::new();
        invalid.push(WrapperReadiness {
            wrapper_protocol_version: WRAPPER_PROTOCOL_VERSION + 1,
            ..readiness()
        });
        invalid.push(WrapperReadiness {
            application_version: "0.0.0".to_string(),
            ..readiness()
        });
        invalid.push(WrapperReadiness {
            host_protocol_version: PROTOCOL_VERSION + 1,
            ..readiness()
        });
        for origin in [
            "http://localhost:4100",
            "http://0.0.0.0:4100",
            "http://127.0.0.2:4100",
            "https://127.0.0.1:4100",
            "http://user:password@127.0.0.1:4100",
            "http://127.0.0.1:4100/path",
            "http://127.0.0.1:4100?query=1",
            "http://127.0.0.1:4100#fragment",
            "not-a-url",
        ] {
            invalid.push(WrapperReadiness {
                origin: origin.to_string(),
                ..readiness()
            });
        }
        invalid.push(WrapperReadiness {
            session_epoch: "too-short".to_string(),
            ..readiness()
        });
        invalid.push(WrapperReadiness {
            secret: "wrong-shape".to_string(),
            ..readiness()
        });

        for readiness in invalid {
            assert!(validate_readiness(readiness).is_err());
        }
    }
}
