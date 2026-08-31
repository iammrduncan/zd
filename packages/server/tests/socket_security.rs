mod support;

use futures_util::{SinkExt, StreamExt};
use http::StatusCode;
use serde_json::json;
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

#[tokio::test]
async fn websocket_requires_numeric_same_authority_host_and_origin() {
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
    let named = connect(
        &server,
        &format!("localhost:{}", server.running.address().port()),
        Some(&format!(
            "http://localhost:{}",
            server.running.address().port()
        )),
        &[],
    )
    .await
    .unwrap_err();
    assert_eq!(http_status(named), StatusCode::FORBIDDEN);
    let malformed_host = connect(
        &server,
        &authority,
        Some(&format!("http://{authority}")),
        &[("host", "127.0.0.1:not-a-port")],
    )
    .await
    .unwrap_err();
    assert_eq!(http_status(malformed_host), StatusCode::FORBIDDEN);

    server.shutdown().await;
}

#[tokio::test]
async fn matching_forwarded_authority_may_differ_from_the_bound_port() {
    let server = TestServer::start("forwarded-port").await;
    let forwarded = if server.running.address().port() == 49_151 {
        49_152
    } else {
        49_151
    };
    let authority = format!("127.0.0.1:{forwarded}");
    let mut socket = connect(
        &server,
        &authority,
        Some(&format!("http://{authority}")),
        &[],
    )
    .await
    .expect("SSH-forwarded authority is accepted");
    assert_eq!(
        authenticate(&server, &mut socket).await["type"],
        "authenticated"
    );
    socket.close(None).await.unwrap();

    server.shutdown().await;
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
