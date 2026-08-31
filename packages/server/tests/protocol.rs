mod support;

use serde_json::{json, Value};

use support::{authenticate, connect_same_origin, request, TestServer};

async fn authenticated(server: &TestServer) -> support::Socket {
    let mut socket = connect_same_origin(server).await;
    let accepted = authenticate(server, &mut socket).await;
    assert_eq!(accepted["protocolVersion"], 1);
    assert_eq!(accepted["type"], "authenticated");
    assert!(accepted["sessionEpoch"].as_str().is_some());
    assert!(accepted.get("project").is_none());
    socket
}

fn assert_timing(response: &Value, request_id: &str) {
    assert_eq!(response["requestId"], request_id);
    for field in ["queueMicros", "handlerMicros"] {
        let duration = response["timing"][field]
            .as_u64()
            .unwrap_or_else(|| panic!("{field} is a non-negative integer"));
        assert!(duration <= zd_server::MAX_REPORTED_DURATION_MICROS);
    }
    assert!(response["timing"].get("clientWallClock").is_none());
}

#[tokio::test]
async fn session_description_has_a_closed_read_only_capability_manifest() {
    let server = TestServer::start("description").await;
    let mut socket = authenticated(&server).await;

    let response = request(&mut socket, "describe-1", "session.describe", json!({})).await;
    assert_eq!(response["type"], "response");
    assert_timing(&response, "describe-1");
    assert_eq!(response["result"]["protocolVersion"], 1);
    assert_eq!(response["result"]["access"], "read-only");
    assert_eq!(
        response["result"]["capabilities"]["projectGrants"],
        "read-only"
    );
    assert_eq!(response["result"]["capabilities"]["fileTree"], "read-only");
    assert_eq!(response["result"]["capabilities"]["fileRead"], "read-only");
    for unavailable in [
        "fileWrite",
        "fileMutations",
        "fileWatch",
        "git",
        "terminal",
        "projectPicker",
        "recentWorkspaces",
    ] {
        assert_eq!(
            response["result"]["capabilities"][unavailable],
            "unavailable"
        );
    }
    assert_eq!(
        response["result"]["capabilities"]["durableState"],
        "read-write"
    );
    assert_eq!(
        response["result"]["capabilities"]
            .as_object()
            .expect("capability object")
            .len(),
        11
    );

    server.shutdown().await;
}

#[tokio::test]
async fn durable_state_is_closed_revisioned_and_scoped_to_the_session() {
    let server = TestServer::start("durable-state").await;
    let mut socket = authenticated(&server).await;
    let grants = request(&mut socket, "grants-state", "projectGrants.list", json!({})).await;
    let project = &grants["result"]["projects"][0];
    let project_id = project["id"].as_str().unwrap();
    let worktree_id = project["worktrees"][0]["id"].as_str().unwrap();

    let initial = request(&mut socket, "state-1", "state.describe", json!({})).await;
    assert_timing(&initial, "state-1");
    assert_eq!(
        initial["result"]["revision"],
        json!({"preferences": 0, "project": 0})
    );
    assert_eq!(initial["result"]["preferences"], Value::Null);
    assert_eq!(initial["result"]["drafts"], json!([]));

    let preferences = request(
        &mut socket,
        "state-2",
        "state.apply",
        json!({
            "expectedRevision": {"preferences": 0, "project": 0},
            "mutation": {
                "kind": "replace-preferences",
                "record": {"schemaVersion": 1, "theme": "current-dark"},
            },
        }),
    )
    .await;
    assert_eq!(preferences["result"]["status"], "applied");
    assert_eq!(
        preferences["result"]["revision"],
        json!({"preferences": 1, "project": 0})
    );
    let draft = request(
        &mut socket,
        "state-3",
        "state.apply",
        json!({
            "expectedRevision": {"preferences": 1, "project": 0},
            "mutation": {
                "kind": "put-draft",
                "draft": {
                    "schemaVersion": 1,
                    "projectId": project_id,
                    "worktreeId": worktree_id,
                    "relativePath": "notes.md",
                    "text": "unsaved through the socket",
                    "updatedAt": 42,
                },
            },
        }),
    )
    .await;
    assert_eq!(draft["result"]["status"], "applied");
    assert_eq!(draft["result"]["revision"]["project"], 1);

    let restored = request(&mut socket, "state-4", "state.describe", json!({})).await;
    assert_eq!(restored["result"]["preferences"]["theme"], "current-dark");
    assert_eq!(
        restored["result"]["drafts"][0]["text"],
        "unsaved through the socket"
    );
    assert_eq!(restored["result"]["drafts"][0]["projectId"], project_id);

    let stale = request(
        &mut socket,
        "state-5",
        "state.apply",
        json!({
            "expectedRevision": {"preferences": 0, "project": 0},
            "mutation": {
                "kind": "replace-workbench",
                "record": {"schemaVersion": 2, "private": "not returned"},
            },
        }),
    )
    .await;
    assert_eq!(stale["result"]["status"], "reload-required");
    assert_eq!(
        stale["result"]["currentRevision"],
        json!({"preferences": 1, "project": 1})
    );
    assert_eq!(stale["result"].as_object().unwrap().len(), 2);
    assert!(!stale["result"].to_string().contains("private"));

    let widened = request(
        &mut socket,
        "state-6",
        "state.apply",
        json!({
            "expectedRevision": {"preferences": 1, "project": 1},
            "mutation": {
                "kind": "remove-draft",
                "projectId": project_id,
                "worktreeId": worktree_id,
                "relativePath": "notes.md",
                "root": "/tmp/foreign",
            },
        }),
    )
    .await;
    assert_eq!(widened["code"], "invalid-params");

    server.shutdown().await;
}

#[tokio::test]
async fn authenticated_grants_tree_and_file_read_use_only_resource_identities() {
    let server = TestServer::start("resources").await;
    let mut socket = authenticated(&server).await;

    let grants = request(&mut socket, "grants-1", "projectGrants.list", json!({})).await;
    assert_timing(&grants, "grants-1");
    let project = &grants["result"]["projects"][0];
    let project_id = project["id"].as_str().unwrap();
    let worktree_id = project["worktrees"][0]["id"].as_str().unwrap();

    let tree = request(
        &mut socket,
        "tree-1",
        "fileTree.snapshot",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "previousRevision": null,
        }),
    )
    .await;
    assert_timing(&tree, "tree-1");
    assert!(tree["result"]["entries"]
        .as_array()
        .unwrap()
        .iter()
        .any(|entry| entry["relativePath"] == "notes.md"));

    let file = request(
        &mut socket,
        "file-1",
        "file.readBounded",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
        }),
    )
    .await;
    assert_timing(&file, "file-1");
    assert_eq!(file["result"]["status"], "text");
    assert_eq!(file["result"]["text"], "hello from a real host\n");
    assert_eq!(file["result"]["writable"], false);
    assert_eq!(file["result"]["reason"], "Served workbenches are read-only");

    server.shutdown().await;
}

#[tokio::test]
async fn unknown_versions_methods_fields_and_generic_paths_are_refused() {
    let server = TestServer::start("closed-schema").await;
    let mut socket = authenticated(&server).await;

    let unknown_method = request(&mut socket, "unknown-1", "shell.execute", json!({})).await;
    assert_eq!(unknown_method["code"], "unknown-method");
    assert_eq!(unknown_method["requestId"], "unknown-1");

    let generic_root = request(
        &mut socket,
        "root-1",
        "file.readBounded",
        json!({
            "projectId": "project-a",
            "worktreeId": "worktree-a",
            "relativePath": "notes.md",
            "root": "/tmp/other",
            "command": "sh",
            "argv": ["-c", "cat /etc/passwd"],
            "environment": {"TOKEN": "secret"},
        }),
    )
    .await;
    assert_eq!(generic_root["code"], "invalid-params");

    support::send_json(
        &mut socket,
        json!({
            "protocolVersion": 2,
            "type": "request",
            "requestId": "version-1",
            "method": "session.describe",
            "params": {},
        }),
    )
    .await;
    let version = support::receive_json(&mut socket).await;
    assert_eq!(version["code"], "unsupported-protocol");

    server.shutdown().await;
}
