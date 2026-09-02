use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
#[cfg(unix)]
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::http::header::COOKIE;
use axum::http::HeaderMap;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use subtle::ConstantTimeEq;

const PAIRING_FILE: &str = "browser-pairing-v1.key";
const PAIRING_COOKIE: &str = "zd_pairing_v1";
const TOKEN_BYTES: usize = 32;
const TOKEN_TEXT_BYTES: usize = 43;
const COOKIE_MAX_AGE_SECONDS: u64 = 365 * 24 * 60 * 60;

#[derive(Clone)]
pub(crate) struct BrowserPairing {
    token: Arc<[u8; TOKEN_BYTES]>,
}

impl BrowserPairing {
    pub(crate) fn open(state_directory: &Path) -> Result<Self, String> {
        fs::create_dir_all(state_directory)
            .map_err(|_| "the browser pairing directory is unavailable".to_string())?;
        let path = state_directory.join(PAIRING_FILE);
        let token = match read_token(&path)? {
            Some(token) => token,
            None => install_token(state_directory, &path)?,
        };
        Ok(Self {
            token: Arc::new(token),
        })
    }

    pub(crate) fn accepts_cookie(&self, headers: &HeaderMap) -> bool {
        let mut supplied = None;
        for header in headers.get_all(COOKIE) {
            let Ok(header) = header.to_str() else {
                return false;
            };
            for pair in header.split(';') {
                let Some((name, value)) = pair.trim().split_once('=') else {
                    return false;
                };
                if name != PAIRING_COOKIE {
                    continue;
                }
                if supplied.replace(value).is_some() {
                    return false;
                }
            }
        }
        let Some(supplied) = supplied else {
            return false;
        };
        if supplied.len() != TOKEN_TEXT_BYTES {
            return false;
        }
        let Ok(decoded) = URL_SAFE_NO_PAD.decode(supplied) else {
            return false;
        };
        bool::from(self.token.as_slice().ct_eq(decoded.as_slice()))
    }

    pub(crate) fn set_cookie_value(&self) -> String {
        format!(
            "{PAIRING_COOKIE}={}; Path=/api/host; HttpOnly; SameSite=Strict; Max-Age={COOKIE_MAX_AGE_SECONDS}",
            URL_SAFE_NO_PAD.encode(self.token.as_slice())
        )
    }
}

fn read_token(path: &Path) -> Result<Option<[u8; TOKEN_BYTES]>, String> {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("the browser pairing credential is unavailable".to_string()),
    };
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("the browser pairing credential is invalid".to_string());
    }

    let mut options = OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    options.custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    let mut file = match options.open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("the browser pairing credential is unavailable".to_string()),
    };
    if !file
        .metadata()
        .map_err(|_| "the browser pairing credential is unavailable".to_string())?
        .is_file()
    {
        return Err("the browser pairing credential is invalid".to_string());
    }
    restrict_file(&file)?;

    let mut token = [0_u8; TOKEN_BYTES];
    file.read_exact(&mut token)
        .map_err(|_| "the browser pairing credential is invalid".to_string())?;
    let mut trailing = [0_u8; 1];
    if file
        .read(&mut trailing)
        .map_err(|_| "the browser pairing credential is unavailable".to_string())?
        != 0
    {
        return Err("the browser pairing credential is invalid".to_string());
    }
    Ok(Some(token))
}

fn install_token(state_directory: &Path, destination: &Path) -> Result<[u8; TOKEN_BYTES], String> {
    let token = random_bytes::<TOKEN_BYTES>()?;
    let temporary = temporary_path(state_directory)?;
    let mut options = OpenOptions::new();
    options.create_new(true).write(true);
    #[cfg(unix)]
    options
        .mode(0o600)
        .custom_flags(libc::O_CLOEXEC | libc::O_NOFOLLOW);
    let mut file = options
        .open(&temporary)
        .map_err(|_| "the browser pairing credential could not be created".to_string())?;
    if let Err(problem) = restrict_file(&file) {
        drop(file);
        let _ = fs::remove_file(&temporary);
        return Err(problem);
    }
    let written = file.write_all(&token).and_then(|()| file.sync_all());
    drop(file);
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
        return Err("the browser pairing credential could not be written".to_string());
    }

    let installed = fs::hard_link(&temporary, destination);
    let _ = fs::remove_file(&temporary);
    match installed {
        Ok(()) => sync_directory(state_directory)?,
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
        Err(_) => return Err("the browser pairing credential could not be installed".to_string()),
    }
    read_token(destination)?
        .ok_or_else(|| "the browser pairing credential disappeared during creation".to_string())
}

fn temporary_path(state_directory: &Path) -> Result<PathBuf, String> {
    let suffix = URL_SAFE_NO_PAD.encode(random_bytes::<12>()?);
    Ok(state_directory.join(format!(".{PAIRING_FILE}.{suffix}.tmp")))
}

fn random_bytes<const N: usize>() -> Result<[u8; N], String> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes)
        .map_err(|_| "secure randomness is unavailable for browser pairing".to_string())?;
    Ok(bytes)
}

#[cfg(unix)]
fn restrict_file(file: &File) -> Result<(), String> {
    file.set_permissions(fs::Permissions::from_mode(0o600))
        .map_err(|_| "the browser pairing credential permissions could not be restricted".into())
}

#[cfg(not(unix))]
fn restrict_file(_file: &File) -> Result<(), String> {
    Ok(())
}

fn sync_directory(path: &Path) -> Result<(), String> {
    File::open(path)
        .and_then(|directory| directory.sync_all())
        .map_err(|_| "the browser pairing credential directory could not be synchronized".into())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use axum::http::header::COOKIE;
    use axum::http::HeaderValue;
    #[cfg(unix)]
    use std::os::unix::fs::{symlink, PermissionsExt};

    use super::*;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new(name: &str) -> Self {
            let stamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("the clock follows the Unix epoch")
                .as_nanos();
            let path = std::env::temp_dir()
                .join(format!("zd-pairing-{name}-{}-{stamp}", std::process::id()));
            fs::create_dir_all(&path).expect("create pairing test directory");
            Self(path)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn cookie(pairing: &BrowserPairing) -> String {
        pairing
            .set_cookie_value()
            .split(';')
            .next()
            .expect("pairing cookie has a value")
            .to_string()
    }

    #[test]
    fn credential_persists_and_accepts_only_its_cookie() {
        let state = Scratch::new("persistent");
        let pairing = BrowserPairing::open(&state.0).expect("create pairing");
        let first_cookie = cookie(&pairing);
        let reopened = BrowserPairing::open(&state.0).expect("reopen pairing");
        assert_eq!(cookie(&reopened), first_cookie);

        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("ordinary=one; {first_cookie}"))
                .expect("valid cookie header"),
        );
        assert!(reopened.accepts_cookie(&headers));
        #[cfg(unix)]
        assert_eq!(
            fs::metadata(state.0.join(PAIRING_FILE))
                .expect("pairing metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }

    #[test]
    fn malformed_duplicate_and_wrong_cookies_are_rejected() {
        let state = Scratch::new("cookies");
        let pairing = BrowserPairing::open(&state.0).expect("create pairing");
        let valid = cookie(&pairing);
        for header in [
            "ordinary".to_string(),
            format!("{valid}; {valid}"),
            "zd_pairing_v1=wrong".to_string(),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(
                COOKIE,
                HeaderValue::from_str(&header).expect("ASCII cookie header"),
            );
            assert!(!pairing.accepts_cookie(&headers), "{header}");
        }
    }

    #[test]
    fn corrupt_credential_fails_closed() {
        let state = Scratch::new("corrupt");
        fs::write(state.0.join(PAIRING_FILE), [0_u8; TOKEN_BYTES - 1])
            .expect("write corrupt credential");
        assert!(BrowserPairing::open(&state.0).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_credential_fails_closed() {
        let state = Scratch::new("symlink");
        let outside = state.0.join("outside");
        fs::write(&outside, [0_u8; TOKEN_BYTES]).expect("write outside credential");
        symlink(&outside, state.0.join(PAIRING_FILE)).expect("link pairing credential");
        assert!(BrowserPairing::open(&state.0).is_err());
    }
}
