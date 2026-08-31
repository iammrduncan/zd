mod support;

use std::net::Ipv4Addr;

use http::header::{CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, X_CONTENT_TYPE_OPTIONS};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use support::TestServer;

async fn get(server: &TestServer, path: &str) -> (u16, http::HeaderMap, Vec<u8>) {
    let mut stream = TcpStream::connect(server.running.address())
        .await
        .expect("connect HTTP client");
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\n\r\n",
        server.authority()
    );
    stream
        .write_all(request.as_bytes())
        .await
        .expect("write HTTP request");
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .await
        .expect("read HTTP response");
    let split = response
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .expect("HTTP header terminator");
    let head = std::str::from_utf8(&response[..split]).expect("UTF-8 response headers");
    let mut lines = head.lines();
    let status = lines
        .next()
        .expect("status line")
        .split_whitespace()
        .nth(1)
        .expect("status code")
        .parse()
        .expect("numeric status");
    let mut headers = http::HeaderMap::new();
    for line in lines {
        let (name, value) = line.split_once(':').expect("response header");
        headers.insert(
            http::HeaderName::from_bytes(name.as_bytes()).expect("header name"),
            http::HeaderValue::from_str(value.trim()).expect("header value"),
        );
    }
    (status, headers, response[split + 4..].to_vec())
}

#[tokio::test]
async fn port_zero_keeps_the_owned_numeric_loopback_listener() {
    let server = TestServer::start("port-zero").await;

    assert_eq!(server.running.address().ip(), Ipv4Addr::LOCALHOST);
    assert_ne!(server.running.address().port(), 0);
    let (status, _, _) = get(&server, "/healthz").await;
    assert_eq!(status, 204);

    server.shutdown().await;
}

#[tokio::test]
async fn application_assets_have_closed_types_cache_rules_and_csp() {
    let server = TestServer::start("assets").await;

    let (status, headers, index) = get(&server, "/").await;
    assert_eq!(status, 200);
    assert_eq!(headers[CONTENT_TYPE], "text/html; charset=utf-8");
    assert_eq!(headers[CACHE_CONTROL], "no-store");
    assert_eq!(headers[X_CONTENT_TYPE_OPTIONS], "nosniff");
    assert!(headers[CONTENT_SECURITY_POLICY]
        .to_str()
        .unwrap()
        .contains("default-src 'self'"));
    assert!(String::from_utf8(index).unwrap().contains("served app"));

    let (status, headers, javascript) = get(&server, "/assets/app.123.js").await;
    assert_eq!(status, 200);
    assert_eq!(headers[CONTENT_TYPE], "text/javascript; charset=utf-8");
    assert_eq!(
        headers[CACHE_CONTROL],
        "public, max-age=31536000, immutable"
    );
    assert_eq!(javascript, b"export const app = 'zd';\n");

    server.shutdown().await;
}

#[tokio::test]
async fn project_files_are_never_http_assets_even_when_names_collide() {
    let server = TestServer::start("asset-boundary").await;
    std::fs::create_dir_all(server.project.join("assets")).expect("create colliding directory");
    std::fs::write(
        server.project.join("assets/app.123.js"),
        "globalThis.projectSecret = 'leaked';",
    )
    .expect("write colliding project script");
    std::fs::write(
        server.project.join("workspace.svg"),
        "<svg><script>leaked()</script></svg>",
    )
    .expect("write executable project SVG");

    let (_, _, javascript) = get(&server, "/assets/app.123.js").await;
    assert_eq!(javascript, b"export const app = 'zd';\n");
    let (status, _, body) = get(&server, "/workspace.svg").await;
    assert_eq!(status, 404);
    assert!(!String::from_utf8_lossy(&body).contains("leaked"));

    server.shutdown().await;
}
