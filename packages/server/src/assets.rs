use std::path::{Component, Path, PathBuf};

use axum::body::Body;
use axum::http::header::{
    CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, REFERRER_POLICY, X_CONTENT_TYPE_OPTIONS,
};
use axum::http::{HeaderValue, StatusCode, Uri};
use axum::response::Response;

const CONTENT_SECURITY_POLICY_VALUE: &str = "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";

#[derive(Clone)]
pub struct Assets {
    root: PathBuf,
}

impl Assets {
    pub fn open(root: &Path) -> Result<Self, String> {
        let root = root
            .canonicalize()
            .map_err(|error| format!("application assets are unavailable: {error}"))?;
        if !root.is_dir() {
            return Err("application assets are not a directory".to_string());
        }
        let index = root.join("index.html");
        if !index.is_file() {
            return Err("application assets do not contain index.html".to_string());
        }
        Ok(Self { root })
    }

    pub async fn response(&self, uri: &Uri) -> Response {
        let requested = uri.path().trim_start_matches('/');
        let relative = if requested.is_empty() {
            Path::new("index.html")
        } else {
            Path::new(requested)
        };
        if !safe_relative(relative) {
            return not_found();
        }

        let selected = match self.resolve_existing(relative).await {
            Some(path) => path,
            None if relative.extension().is_none() => self.root.join("index.html"),
            None => return not_found(),
        };
        let bytes = match tokio::fs::read(&selected).await {
            Ok(bytes) => bytes,
            Err(_) => return not_found(),
        };
        let relative = selected.strip_prefix(&self.root).unwrap_or(&selected);
        let content_type = content_type(relative);
        let cache = if relative == Path::new("index.html") {
            "no-store"
        } else if relative.starts_with("assets") {
            "public, max-age=31536000, immutable"
        } else {
            "no-cache"
        };
        secured_response(StatusCode::OK, bytes, content_type, cache)
    }

    async fn resolve_existing(&self, relative: &Path) -> Option<PathBuf> {
        let candidate = self.root.join(relative);
        let resolved = tokio::fs::canonicalize(candidate).await.ok()?;
        if !resolved.starts_with(&self.root) || !resolved.is_file() {
            return None;
        }
        Some(resolved)
    }
}

fn safe_relative(path: &Path) -> bool {
    !path.as_os_str().is_empty()
        && !path.is_absolute()
        && !path.to_string_lossy().contains('%')
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
}

fn content_type(path: &Path) -> HeaderValue {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    let value = match mime.as_ref() {
        "text/html" => "text/html; charset=utf-8".to_string(),
        "text/css" => "text/css; charset=utf-8".to_string(),
        "text/javascript" | "application/javascript" => {
            "text/javascript; charset=utf-8".to_string()
        }
        "application/json" | "image/svg+xml" => format!("{mime}; charset=utf-8"),
        _ => mime.to_string(),
    };
    HeaderValue::from_str(&value)
        .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream"))
}

fn not_found() -> Response {
    secured_response(
        StatusCode::NOT_FOUND,
        Vec::new(),
        HeaderValue::from_static("text/plain; charset=utf-8"),
        "no-store",
    )
}

fn secured_response(
    status: StatusCode,
    body: Vec<u8>,
    content_type: HeaderValue,
    cache: &'static str,
) -> Response {
    let mut response = Response::new(Body::from(body));
    *response.status_mut() = status;
    let headers = response.headers_mut();
    headers.insert(CONTENT_TYPE, content_type);
    headers.insert(CACHE_CONTROL, HeaderValue::from_static(cache));
    headers.insert(
        CONTENT_SECURITY_POLICY,
        HeaderValue::from_static(CONTENT_SECURITY_POLICY_VALUE),
    );
    headers.insert(X_CONTENT_TYPE_OPTIONS, HeaderValue::from_static("nosniff"));
    headers.insert(REFERRER_POLICY, HeaderValue::from_static("no-referrer"));
    headers.insert("x-frame-options", HeaderValue::from_static("DENY"));
    headers.insert(
        "permissions-policy",
        HeaderValue::from_static("camera=(), geolocation=(), microphone=()"),
    );
    response
}
