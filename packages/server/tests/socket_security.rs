mod support;

use futures_util::{SinkExt, StreamExt};
use http::StatusCode;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::protocol::Message;
use tokio_tungstenite::tungstenite::Error;

use support::{authenticate, connect, connect_same_origin, receive_json, send_json, TestServer};

fn http_status(error: Error) -> StatusCode {
    match error {
        Error::Http(response) => response.status(),
        other => panic!("expected an HTTP handshake refusal, got {other:?}"),
    }
}

async fn pair_response(server: &TestServer, secret: &str, origin: &str) -> String {
    let body = json!({ "protocolVersion": 1, "secret": secret }).to_string();
    let request = format!(
        "POST /api/pair HTTP/1.1\r\nHost: {}\r\nOrigin: {origin}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        server.authority(),
        body.len(),
    );
    let mut stream = TcpStream::connect(server.connect_address())
        .await
        .expect("connect to pairing endpoint");
    stream
        .write_all(request.as_bytes())
        .await
        .expect("send pairing request");
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .await
        .expect("read pairing response");
    String::from_utf8(response).expect("pairing response is HTTP text")
}

fn pairing_cookie(response: &str) -> String {
    let header = response
        .lines()
        .find_map(|line| line.strip_prefix("set-cookie: "))
        .expect("pairing response sets a cookie");
    header
        .split(';')
        .next()
        .expect("pairing cookie has one value")
        .to_string()
}

#[tokio::test]
async fn websocket_requires_exact_same_authority_host_and_origin() {
    let server = TestServer::start("authority").await;
    let authority = server.authority();

    let missing = connect(&server, &authority, None, &[]).await.unwrap_err();
    assert_eq!(http_status(missing), StatusCode::FORBIDDEN);
    let null = connect(&server, &authority, Some("null"), &[])
        .await
        .unwrap_err();
    assert_eq!(http_status(null), StatusCode::FORBIDDEN);
    let foreign = connect(&server, &authority, Some("https://example.com"), &[])
        .await
        .unwrap_err();
    assert_eq!(http_status(foreign), StatusCode::FORBIDDEN);
    let malformed_host = connect(
        &server,
        &authority,
        Some(&format!("http://{authority}")),
        &[("host", "127.0.0.1:not-a-port")],
    )
    .await
    .unwrap_err();
    assert_eq!(http_status(malformed_host), StatusCode::FORBIDDEN);
    for invalid_origin in [
        format!("http://{authority}/unexpected"),
        format!("http://{authority}?unexpected"),
    ] {
        let error = connect(&server, &authority, Some(&invalid_origin), &[])
            .await
            .unwrap_err();
        assert_eq!(
            http_status(error),
            StatusCode::FORBIDDEN,
            "{invalid_origin}"
        );
    }

    server.shutdown().await;
}

#[tokio::test]
async fn matching_remote_ip_and_hostname_authorities_are_accepted() {
    for (index, host) in ["100.80.233.115", "remote-workbench.example"]
        .into_iter()
        .enumerate()
    {
        let server = TestServer::start(&format!("remote-authority-{index}")).await;
        let authority = format!("{host}:{}", server.running.address().port());
        let mut socket = connect(
            &server,
            &authority,
            Some(&format!("http://{authority}")),
            &[],
        )
        .await
        .expect("direct same-origin authority is accepted");
        assert_eq!(
            authenticate(&server, &mut socket).await["type"],
            "authenticated"
        );
        socket.close(None).await.unwrap();
        server.shutdown().await;
    }
}

#[tokio::test]
async fn forwarding_identity_headers_are_refused_instead_of_trusted() {
    let server = TestServer::start("forwarding-headers").await;
    let authority = server.authority();
    for header in [
        "forwarded",
        "x-forwarded-host",
        "x-forwarded-for",
        "x-forwarded-proto",
    ] {
        let error = connect(
            &server,
            &authority,
            Some(&format!("http://{authority}")),
            &[(header, "for=203.0.113.7;host=example.com;proto=https")],
        )
        .await
        .unwrap_err();
        assert_eq!(http_status(error), StatusCode::FORBIDDEN, "{header}");
    }

    server.shutdown().await;
}

#[tokio::test]
async fn no_project_state_is_sent_before_successful_authentication() {
    let server = TestServer::start("closed-auth").await;
    let mut socket = connect_same_origin(&server).await;

    send_json(
        &mut socket,
        json!({
            "protocolVersion": 1,
            "type": "request",
            "requestId": "before-auth",
            "method": "projectGrants.list",
            "params": {},
        }),
    )
    .await;
    let error = receive_json(&mut socket).await;
    assert_eq!(error["type"], "error");
    assert_eq!(error["code"], "authentication-required");
    let serialized = error.to_string();
    assert!(!serialized.contains("notes.md"));
    assert!(!serialized.contains(&server.project.path().to_string_lossy().into_owned()));

    server.shutdown().await;
}

#[tokio::test]
async fn wrong_secret_and_unknown_auth_fields_fail_closed() {
    let server = TestServer::start("wrong-secret").await;
    let mut wrong = connect_same_origin(&server).await;
    send_json(
        &mut wrong,
        json!({
            "protocolVersion": 1,
            "type": "authenticate",
            "secret": "not-the-process-secret",
        }),
    )
    .await;
    let refusal = receive_json(&mut wrong).await;
    assert_eq!(refusal["code"], "authentication-failed");

    let mut unknown = connect_same_origin(&server).await;
    send_json(
        &mut unknown,
        json!({
            "protocolVersion": 1,
            "type": "authenticate",
            "secret": server.running.secret(),
            "root": server.project.path(),
        }),
    )
    .await;
    let refusal = receive_json(&mut unknown).await;
    assert_eq!(refusal["code"], "invalid-message");

    server.shutdown().await;
}

#[tokio::test]
async fn an_http_only_browser_pairing_survives_a_new_port_and_process_secret() {
    let server = TestServer::start("browser-pairing").await;
    let origin = format!("http://{}", server.authority());
    let first_secret = server.running.secret().to_string();
    let response = pair_response(&server, &first_secret, &origin).await;
    assert!(response.starts_with("HTTP/1.1 204"), "{response}");
    let set_cookie = response
        .lines()
        .find_map(|line| line.strip_prefix("set-cookie: "))
        .expect("pairing response sets a cookie");
    assert!(set_cookie.contains("Path=/api/host"));
    assert!(set_cookie.contains("HttpOnly"));
    assert!(set_cookie.contains("SameSite=Strict"));
    assert!(set_cookie.contains("Max-Age="));
    assert!(!set_cookie.contains(&first_secret));
    let cookie = pairing_cookie(&response);

    let authority = server.authority();
    let mut first = connect(
        &server,
        &authority,
        Some(&format!("http://{authority}")),
        &[("cookie", &cookie)],
    )
    .await
    .expect("paired browser connects");
    send_json(
        &mut first,
        json!({ "protocolVersion": 1, "type": "authenticate-browser" }),
    )
    .await;
    assert_eq!(receive_json(&mut first).await["type"], "authenticated");
    first.close(None).await.expect("close first browser");

    let restarted = server.restart().await;
    assert_ne!(restarted.running.secret(), first_secret);
    let authority = restarted.authority();
    let mut resumed = connect(
        &restarted,
        &authority,
        Some(&format!("http://{authority}")),
        &[("cookie", &cookie)],
    )
    .await
    .expect("paired browser reconnects on the new port");
    send_json(
        &mut resumed,
        json!({ "protocolVersion": 1, "type": "authenticate-browser" }),
    )
    .await;
    assert_eq!(receive_json(&mut resumed).await["type"], "authenticated");
    resumed.close(None).await.expect("close resumed browser");
    restarted.shutdown().await;
}

#[tokio::test]
async fn pairing_rejects_a_wrong_secret_and_a_foreign_origin_without_a_cookie() {
    let server = TestServer::start("browser-pairing-refusal").await;
    for (secret, origin) in [
        ("wrong", format!("http://{}", server.authority())),
        (server.running.secret(), "https://example.com".to_string()),
    ] {
        let response = pair_response(&server, secret, &origin).await;
        assert!(response.starts_with("HTTP/1.1 403"), "{response}");
        assert!(!response.contains("set-cookie:"));
    }
    server.shutdown().await;
}

#[tokio::test]
async fn only_one_authenticated_controller_is_admitted() {
    let server = TestServer::start("one-controller").await;
    let mut first = connect_same_origin(&server).await;
    assert_eq!(
        authenticate(&server, &mut first).await["type"],
        "authenticated"
    );

    let mut second = connect_same_origin(&server).await;
    let refusal = authenticate(&server, &mut second).await;
    assert_eq!(refusal["code"], "controller-unavailable");

    first.close(None).await.unwrap();
    server.shutdown().await;
}

#[tokio::test(start_paused = true)]
async fn valid_heartbeat_resets_liveness_and_three_missed_intervals_disconnect() {
    assert_eq!(zd_server::HEARTBEAT_INTERVAL, Duration::from_secs(10));
    assert_eq!(zd_server::HEARTBEAT_TIMEOUT, Duration::from_secs(30));
    let server = TestServer::start("heartbeat-liveness").await;
    // Keep one runnable task alive so Tokio's paused clock cannot auto-advance
    // past the real loopback socket work while this test advances it explicitly.
    let clock_guard = tokio::spawn(async {
        loop {
            tokio::task::yield_now().await;
        }
    });
    let mut first = connect_same_origin(&server).await;
    assert_eq!(
        authenticate(&server, &mut first).await["type"],
        "authenticated"
    );

    tokio::time::advance(Duration::from_secs(29)).await;
    send_json(
        &mut first,
        json!({
            "protocolVersion": 1,
            "type": "request",
            "requestId": "heartbeat-1",
            "method": "session.heartbeat",
            "params": {},
        }),
    )
    .await;
    tokio::time::advance(Duration::ZERO).await;
    let heartbeat = receive_json(&mut first).await;
    assert_eq!(heartbeat["type"], "response");
    tokio::time::advance(Duration::from_secs(29)).await;
    send_json(
        &mut first,
        json!({
            "protocolVersion": 1,
            "type": "request",
            "requestId": "heartbeat-2",
            "method": "session.heartbeat",
            "params": {},
        }),
    )
    .await;
    tokio::time::advance(Duration::ZERO).await;
    let heartbeat = receive_json(&mut first).await;
    assert_eq!(heartbeat["type"], "response");

    tokio::time::advance(Duration::from_secs(31)).await;
    let closed = first.next().await;
    assert!(matches!(closed, None | Some(Ok(Message::Close(_)))));

    let mut resumed = connect_same_origin(&server).await;
    assert_eq!(
        authenticate(&server, &mut resumed).await["type"],
        "authenticated"
    );
    clock_guard.abort();
    server.shutdown().await;
}

#[tokio::test]
async fn oversized_messages_close_without_disclosing_state() {
    let server = TestServer::start("oversized").await;
    let mut socket = connect_same_origin(&server).await;
    let oversized = "x".repeat(zd_server::MAX_MESSAGE_BYTES + 1);
    let description = match socket.send(Message::Text(oversized.into())).await {
        Err(error) => format!("{error:?}"),
        Ok(()) => {
            let response = timeout(Duration::from_secs(1), socket.next())
                .await
                .expect("an oversized message closes with bounded latency");
            assert!(matches!(
                response,
                None | Some(Err(_)) | Some(Ok(Message::Close(_)))
            ));
            format!("{response:?}")
        }
    };
    assert!(!description.contains("notes.md"));
    assert!(!description.contains(&server.project.path().to_string_lossy().into_owned()));

    server.shutdown().await;
}
