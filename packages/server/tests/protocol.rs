mod support;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use serde_json::{json, Value};

use support::{authenticate, connect_same_origin, receive_event, request, TestServer};

async fn authenticated(server: &TestServer) -> support::Socket {
    let mut socket = connect_same_origin(server).await;
    let accepted = authenticate(server, &mut socket).await;
    assert_eq!(accepted["protocolVersion"], 1);
    assert_eq!(accepted["type"], "authenticated");
    assert!(accepted["sessionEpoch"].as_str().is_some());
    assert!(accepted["sequence"].as_u64().is_some());
    assert!(accepted.get("project").is_none());
    socket
}

fn assert_timing(response: &Value, request_id: &str) {
    assert_eq!(response["requestId"], request_id);
    for field in ["queueMicros", "handlerMicros", "serializationMicros"] {
        let duration = response["timing"][field]
            .as_u64()
            .unwrap_or_else(|| panic!("{field} is a non-negative integer"));
        assert!(duration <= zd_server::MAX_REPORTED_DURATION_MICROS);
    }
    assert!(response["timing"].get("clientWallClock").is_none());
}

#[tokio::test]
async fn session_description_has_a_closed_editing_capability_manifest() {
    let server = TestServer::start("description").await;
    let mut socket = authenticated(&server).await;

    let response = request(&mut socket, "describe-1", "session.describe", json!({})).await;
    assert_eq!(response["type"], "response");
    assert_timing(&response, "describe-1");
    assert_eq!(response["result"]["protocolVersion"], 1);
    assert_eq!(response["result"]["access"], "read-write");
    assert_eq!(response["result"]["capabilities"]["fileTree"], "read-only");
    assert_eq!(response["result"]["capabilities"]["fileRead"], "read-only");
    for read_write in [
        "fileWrite",
        "fileMutations",
        "clipboardImages",
        "worktrees",
        "durableState",
        "hostDiagnostics",
        "terminal",
        "projectGrants",
        "projectPicker",
    ] {
        assert_eq!(response["result"]["capabilities"][read_write], "read-write");
    }
    for read_only in ["fileWatch", "git", "projectImages", "themeFiles"] {
        assert_eq!(response["result"]["capabilities"][read_only], "read-only");
    }
    assert_eq!(
        response["result"]["capabilities"]["recentWorkspaces"],
        "unavailable"
    );
    assert_eq!(
        response["result"]["capabilities"]
            .as_object()
            .expect("capability object")
            .len(),
        16
    );

    server.shutdown().await;
}

#[tokio::test]
async fn remote_project_picker_uses_opaque_handles_and_adds_the_chosen_folder() {
    let server = TestServer::start("remote-project-picker").await;
    let sibling = support::Scratch::new("remote-project-picker-sibling");
    std::fs::write(sibling.join("second.md"), "second remote project\n")
        .expect("write second project file");
    let sibling_name = sibling
        .path()
        .file_name()
        .expect("second project name")
        .to_string_lossy()
        .into_owned();
    let mut socket = authenticated(&server).await;

    let started = request(&mut socket, "picker-1", "projectPicker.start", json!({})).await;
    assert_eq!(started["type"], "response");
    let session_id = started["result"]["sessionId"]
        .as_str()
        .expect("picker session ID");
    let path_query = request(
        &mut socket,
        "picker-path-query",
        "projectPicker.search",
        json!({"sessionId": session_id, "query": sibling.path()}),
    )
    .await;
    assert!(path_query["result"]["directories"]
        .as_array()
        .expect("path query result")
        .is_empty());

    let searched = request(
        &mut socket,
        "picker-search",
        "projectPicker.search",
        json!({"sessionId": session_id, "query": sibling_name}),
    )
    .await;
    let sibling_entry = searched["result"]["directories"]
        .as_array()
        .expect("directory list")
        .iter()
        .find(|entry| entry["name"] == sibling_name)
        .expect("second project is visible");
    let sibling_id = sibling_entry["id"].as_str().expect("opaque directory ID");
    assert!(!sibling_id.contains(&sibling_name));
    assert!(!sibling_id.contains('/'));
    assert!(sibling_entry.get("path").is_none());

    let forged = request(
        &mut socket,
        "picker-forged",
        "projectPicker.open",
        json!({
            "sessionId": session_id,
            "directoryId": sibling.path(),
        }),
    )
    .await;
    assert_eq!(forged["code"], "host-failure");

    let opened = request(
        &mut socket,
        "picker-2",
        "projectPicker.open",
        json!({"sessionId": session_id, "directoryId": sibling_id}),
    )
    .await;
    assert_eq!(
        opened["result"]["directory"]["path"],
        sibling
            .path()
            .canonicalize()
            .unwrap()
            .to_string_lossy()
            .as_ref()
    );
    let chosen = request(
        &mut socket,
        "picker-3",
        "projectPicker.choose",
        json!({
            "sessionId": session_id,
            "directoryId": opened["result"]["directory"]["id"],
        }),
    )
    .await;
    let project_id = chosen["result"]["id"].as_str().expect("new project ID");
    let worktree_id = chosen["result"]["worktrees"][0]["id"]
        .as_str()
        .expect("new worktree ID");
    assert_eq!(
        chosen["result"]["root"],
        sibling.path().to_string_lossy().as_ref()
    );

    let tree = request(
        &mut socket,
        "picker-tree",
        "fileTree.snapshot",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "previousRevision": null,
        }),
    )
    .await;
    assert!(tree["result"]["entries"]
        .as_array()
        .expect("second project tree")
        .iter()
        .any(|entry| entry["relativePath"] == "second.md"));

    let removed = request(
        &mut socket,
        "picker-remove",
        "projectGrants.remove",
        json!({"projectId": project_id}),
    )
    .await;
    assert_eq!(removed["result"]["id"], project_id);
    let grants = request(
        &mut socket,
        "picker-grants",
        "projectGrants.list",
        json!({}),
    )
    .await;
    assert_eq!(grants["result"]["projects"].as_array().unwrap().len(), 1);

    server.shutdown().await;
}

#[tokio::test]
async fn watches_terminals_snapshot_and_resume_share_the_authenticated_socket() {
    let server = TestServer::start("runtime-protocol").await;
    let mut socket = authenticated(&server).await;
    let (project_id, worktree_id) = startup_scope(&mut socket).await;

    let initial = request(&mut socket, "snapshot-1", "session.snapshot", json!({})).await;
    assert_eq!(initial["result"]["sequence"], 0);
    assert_eq!(initial["result"]["resourceStatus"], "active");
    assert_eq!(initial["result"]["watches"], json!([]));
    assert_eq!(initial["result"]["terminals"], json!([]));
    let epoch = initial["result"]["sessionEpoch"]
        .as_str()
        .unwrap()
        .to_string();

    let watch = json!({
        "projectId": project_id,
        "worktreeId": worktree_id,
        "watchId": "watch-protocol",
    });
    let started_watch = request(
        &mut socket,
        "watch-1",
        "fileTree.watch.start",
        watch.clone(),
    )
    .await;
    assert_eq!(started_watch["result"], Value::Null);
    std::fs::write(server.project.join("watched.md"), "changed\n").unwrap();
    let changed = tokio::time::timeout(
        std::time::Duration::from_secs(5),
        receive_event(&mut socket, "fileTree.changed"),
    )
    .await
    .expect("native watcher emits through the authenticated socket");
    assert_eq!(changed["payload"], watch);

    let start = request(
        &mut socket,
        "terminal-1",
        "terminal.start",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "terminalId": "terminal-protocol",
            "viewport": {"rows": 24, "columns": 80, "pixelWidth": 0, "pixelHeight": 0},
        }),
    )
    .await;
    let session = start["result"].clone();
    assert_eq!(session["sessionId"], "terminal-protocol");
    let reattached = request(
        &mut socket,
        "terminal-reattach-1",
        "terminal.reattach",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "terminalId": "terminal-protocol",
            "viewport": {"rows": 30, "columns": 100, "pixelWidth": 0, "pixelHeight": 0},
        }),
    )
    .await;
    assert_eq!(reattached["result"], session);
    let missing = request(
        &mut socket,
        "terminal-reattach-2",
        "terminal.reattach",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "terminalId": "terminal-missing",
            "viewport": {"rows": 24, "columns": 80, "pixelWidth": 0, "pixelHeight": 0},
        }),
    )
    .await;
    assert_eq!(missing["result"], Value::Null);

    let command = STANDARD.encode(b"printf '__ZD_PROTOCOL_TERMINAL__\\n'\n");
    let write = request(
        &mut socket,
        "terminal-2",
        "terminal.write",
        json!({"session": session, "bytesBase64": command}),
    )
    .await;
    assert_eq!(write["result"], Value::Null);
    tokio::time::timeout(
        std::time::Duration::from_secs(5),
        receive_event(&mut socket, "terminal.outputReady"),
    )
    .await
    .expect("PTY output emits through the authenticated socket");
    let read = request(
        &mut socket,
        "terminal-3",
        "terminal.read",
        json!({"session": session}),
    )
    .await;
    let output = STANDARD
        .decode(read["result"]["bytesBase64"].as_str().unwrap())
        .unwrap();
    assert!(String::from_utf8_lossy(&output).contains("__ZD_PROTOCOL_TERMINAL__"));
    assert!(read["result"].get("bytes").is_none());

    let snapshot = request(&mut socket, "snapshot-2", "session.snapshot", json!({})).await;
    assert_eq!(snapshot["result"]["watches"].as_array().unwrap().len(), 1);
    assert_eq!(snapshot["result"]["terminals"].as_array().unwrap().len(), 1);
    assert!(!snapshot["result"]
        .to_string()
        .contains("__ZD_PROTOCOL_TERMINAL__"));
    let resume = request(
        &mut socket,
        "resume-1",
        "session.resume",
        json!({"sessionEpoch": epoch, "afterSequence": 0}),
    )
    .await;
    assert_eq!(resume["result"]["status"], "replayed");
    assert!(resume["result"]["events"].as_array().unwrap().len() >= 2);

    assert_eq!(
        request(
            &mut socket,
            "terminal-4",
            "terminal.dispose",
            json!({"session": session}),
        )
        .await["result"],
        Value::Null
    );
    assert_eq!(
        request(&mut socket, "watch-2", "fileTree.watch.stop", watch).await["result"],
        Value::Null
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
    let encoded = file["result"]["textBase64"].as_str().unwrap();
    assert_eq!(
        STANDARD.decode(encoded).unwrap(),
        b"hello from a real host\n"
    );
    assert_eq!(file["result"]["writable"], true);
    assert_eq!(file["result"]["reason"], Value::Null);

    server.shutdown().await;
}

async fn startup_scope(socket: &mut support::Socket) -> (String, String) {
    let grants = request(socket, "scope", "projectGrants.list", json!({})).await;
    let project = &grants["result"]["projects"][0];
    (
        project["id"].as_str().unwrap().to_string(),
        project["worktrees"][0]["id"].as_str().unwrap().to_string(),
    )
}

#[tokio::test]
async fn file_tree_text_and_image_methods_commit_through_the_real_host() {
    let server = TestServer::start("editing").await;
    let mut socket = authenticated(&server).await;
    let (project_id, worktree_id) = startup_scope(&mut socket).await;
    let resource = json!({
        "projectId": project_id,
        "worktreeId": worktree_id,
        "relativePath": "notes.md",
    });

    let written = request(
        &mut socket,
        "write-1",
        "file.writeText",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
            "contentsBase64": STANDARD.encode("changed through the socket\n"),
        }),
    )
    .await;
    assert_eq!(written["result"], Value::Null);
    assert_eq!(
        std::fs::read_to_string(server.project.join("notes.md")).unwrap(),
        "changed through the socket\n"
    );

    let stamp = request(&mut socket, "stamp-1", "file.stamp", resource.clone()).await;
    assert_eq!(stamp["result"]["length"], 27);
    let files = request(
        &mut socket,
        "files-1",
        "workspaceFiles.list",
        json!({"projectId": project_id, "worktreeId": worktree_id}),
    )
    .await;
    assert!(files["result"]["files"]
        .as_array()
        .unwrap()
        .iter()
        .any(|file| file["relative"] == "notes.md"));

    let created = request(
        &mut socket,
        "mutate-1",
        "fileTree.mutate",
        json!({
            "operation": "create",
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "new.md",
            "kind": "file",
        }),
    )
    .await;
    assert_eq!(created["result"]["status"], "committed");
    let renamed = request(
        &mut socket,
        "mutate-2",
        "fileTree.mutate",
        json!({
            "operation": "rename",
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "new.md",
            "newName": "renamed.md",
        }),
    )
    .await;
    assert_eq!(renamed["result"]["status"], "committed");
    assert!(server.project.join("renamed.md").is_file());

    let png = [0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3];
    std::fs::write(server.project.join("image.png"), png).unwrap();
    let image = request(
        &mut socket,
        "image-1",
        "image.readProject",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "image.png",
        }),
    )
    .await;
    assert_eq!(image["result"]["mediaType"], "image/png");
    assert_eq!(
        STANDARD
            .decode(image["result"]["bytesBase64"].as_str().unwrap())
            .unwrap(),
        png
    );

    let saved = request(
        &mut socket,
        "image-2",
        "image.saveClipboard",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "mediaType": "image/png",
            "bytesBase64": STANDARD.encode(png),
        }),
    )
    .await;
    let saved_path = saved["result"]["relativePath"].as_str().unwrap();
    assert!(saved_path.starts_with("docs/screenshots/screenshot-"));
    assert_eq!(std::fs::read(server.project.join(saved_path)).unwrap(), png);

    let widened = request(
        &mut socket,
        "write-wide",
        "file.writeText",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
            "contentsBase64": "not base64!",
            "root": "/tmp/foreign",
        }),
    )
    .await;
    assert_eq!(widened["code"], "invalid-params");

    server.shutdown().await;
}

#[tokio::test]
async fn git_worktree_theme_and_diagnostic_methods_use_closed_host_operations() {
    let server = TestServer::start("host-operations").await;
    std::fs::write(
        server.state.join("fixture.theme.config"),
        "{\"name\":\"Fixture\"}",
    )
    .unwrap();
    std::fs::write(server.project.join("notes.md"), "working change\n").unwrap();
    let mut socket = authenticated(&server).await;
    let (project_id, worktree_id) = startup_scope(&mut socket).await;
    let scope = json!({"projectId": project_id, "worktreeId": worktree_id});

    let status = request(&mut socket, "git-1", "git.status", scope.clone()).await;
    assert_eq!(status["result"]["availability"], "available");
    let change_id = status["result"]["entries"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let history = request(
        &mut socket,
        "git-2",
        "git.history",
        json!({"scope": scope, "cursor": null, "pageSize": 20}),
    )
    .await;
    let head = history["result"]["commits"][0]["id"]
        .as_str()
        .unwrap()
        .to_string();
    let comparison = request(
        &mut socket,
        "git-3",
        "git.compare",
        json!({"scope": scope, "baseCommitId": head, "headCommitId": head}),
    )
    .await;
    assert_eq!(comparison["result"]["availability"], "available");
    let diff = request(
        &mut socket,
        "git-4",
        "git.diff",
        json!({
            "scope": scope,
            "source": {"kind": "working-tree", "changeId": change_id},
        }),
    )
    .await;
    assert_eq!(diff["result"]["head"]["text"], "working change\n");

    let worktree = request(
        &mut socket,
        "worktree-1",
        "worktree.create",
        json!({
            "projectId": project_id,
            "name": "served",
            "branch": "feature/served",
            "baseRevision": null,
        }),
    )
    .await;
    assert_eq!(worktree["result"]["status"], "created");
    let worktree_root = worktree["result"]["worktree"]["root"]
        .as_str()
        .unwrap()
        .to_string();

    let themes = request(&mut socket, "theme-1", "theme.list", json!({})).await;
    assert_eq!(themes["result"][0]["fileName"], "fixture.theme.config");
    let initial = request(
        &mut socket,
        "diagnostics-1",
        "diagnostics.status",
        json!({}),
    )
    .await;
    assert_eq!(initial["result"]["enabled"], false);
    assert!(!server.state.join("diagnostics").exists());
    let enabled = request(
        &mut socket,
        "diagnostics-2",
        "diagnostics.enable",
        json!({}),
    )
    .await;
    assert_eq!(enabled["result"]["enabled"], true);
    let recorded = request(
        &mut socket,
        "diagnostics-3",
        "diagnostics.record",
        json!({
            "recordType": "event",
            "operation": "served.test",
            "outcome": "ok",
            "context": null,
        }),
    )
    .await;
    assert_eq!(recorded["result"]["recorded"], true);
    let disabled = request(
        &mut socket,
        "diagnostics-4",
        "diagnostics.disable",
        json!({}),
    )
    .await;
    assert_eq!(disabled["result"]["enabled"], false);

    support::git(
        server.project.path(),
        &["worktree", "remove", "--force", &worktree_root],
    );
    server.shutdown().await;
}

#[tokio::test]
async fn unknown_versions_methods_fields_and_generic_paths_are_refused() {
    let server = TestServer::start("closed-schema").await;
    let mut socket = authenticated(&server).await;

    let unknown_method = request(&mut socket, "unknown-1", "shell.execute", json!({})).await;
    assert_eq!(unknown_method["code"], "unknown-method");
    assert_eq!(unknown_method["requestId"], "unknown-1");
    for (index, method) in [
        "fileTree.watch",
        "terminal.execute",
        "project.choose",
        "projectRoot.open",
    ]
    .into_iter()
    .enumerate()
    {
        let refusal = request(&mut socket, &format!("excluded-{index}"), method, json!({})).await;
        assert_eq!(refusal["code"], "unknown-method", "{method}");
    }

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

#[tokio::test]
async fn encoded_payload_limits_and_media_signatures_fail_closed() {
    let server = TestServer::start("encoded-bounds").await;
    let mut socket = authenticated(&server).await;
    let (project_id, worktree_id) = startup_scope(&mut socket).await;

    let invalid_text = request(
        &mut socket,
        "encoding-1",
        "file.writeText",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
            "contentsBase64": "not base64!",
        }),
    )
    .await;
    assert_eq!(invalid_text["code"], "invalid-params");

    let encoded_limit = (zd_host::EDITABLE_FILE_LIMIT_BYTES as usize)
        .div_ceil(3)
        .saturating_mul(4);
    let oversized_text = request(
        &mut socket,
        "encoding-2",
        "file.writeText",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
            "contentsBase64": "A".repeat(encoded_limit + 4),
        }),
    )
    .await;
    assert_eq!(oversized_text["code"], "invalid-params");

    let invalid_utf8 = request(
        &mut socket,
        "encoding-3",
        "file.writeText",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "relativePath": "notes.md",
            "contentsBase64": STANDARD.encode([0xff]),
        }),
    )
    .await;
    assert_eq!(invalid_utf8["code"], "invalid-params");

    let mismatched_image = request(
        &mut socket,
        "encoding-4",
        "image.saveClipboard",
        json!({
            "projectId": project_id,
            "worktreeId": worktree_id,
            "mediaType": "image/png",
            "bytesBase64": STANDARD.encode("not a PNG"),
        }),
    )
    .await;
    assert_eq!(mismatched_image["code"], "host-failure");
    assert!(!server.project.join("docs/screenshots").exists());

    server.shutdown().await;
}
