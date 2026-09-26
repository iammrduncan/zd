use std::fs;
use std::path::Path;

use tempfile::tempdir;
use zd::document::{Document, SourceRange};
use zd::handoff::{HerdrClient, MAX_HANDOFF_BYTES, prepare_handoff};

#[cfg(unix)]
fn fake_herdr(directory: &Path, agents: &str) -> std::path::PathBuf {
    use std::os::unix::fs::PermissionsExt;

    let path = directory.join("herdr-fake");
    let script = format!(
        "#!/bin/sh\n\
         if [ \"$1:$2\" = \"agent:list\" ]; then\n\
           printf '%s' '{agents}'\n\
           exit 0\n\
         fi\n\
         if [ \"$1:$2\" = \"agent:prompt\" ]; then\n\
           if [ \"$3\" = \"fail\" ]; then exit 9; fi\n\
           printf '%s\\0' \"$@\" > \"$(dirname \"$0\")/capture\"\n\
           exit 0\n\
         fi\n\
         exit 2\n"
    );
    fs::write(&path, script).unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
    path
}

#[cfg(unix)]
#[test]
fn fake_herdr_discovers_and_submits_literal_bounded_arguments() {
    let fixture = tempdir().unwrap();
    let agents = r#"{"id":"list","result":{"agents":[{"agent":"codex","agent_session":{"value":"session-1"},"focused":true,"pane_id":"pane-1","terminal_title_stripped":"work"}],"type":"agent_list"}}"#;
    let executable = fake_herdr(fixture.path(), agents);
    let client = HerdrClient::new(&executable);
    let targets = client.discover().unwrap();
    assert_eq!(targets.len(), 1);
    assert_eq!(targets[0].target, "pane-1");
    assert!(targets[0].label.contains("codex"));

    let selected = "$(touch should-not-exist)\nline\x1b[2J\0tail";
    let mut document = Document::new(selected);
    document
        .select(SourceRange::new(0, document.len_bytes()))
        .unwrap();
    let prepared = prepare_handoff(
        Path::new("src/main.rs"),
        &document,
        "Please inspect\ncarefully",
    )
    .unwrap();
    assert!(prepared.text.contains("$(touch should-not-exist)"));
    assert!(prepared.text.contains("Please inspect\ncarefully"));
    assert!(!prepared.text.contains('\x1b'));
    assert!(!prepared.text.contains('\0'));
    assert!(prepared.text.len() <= MAX_HANDOFF_BYTES);

    client.submit(&targets[0].target, &prepared).unwrap();
    let capture = fs::read(fixture.path().join("capture")).unwrap();
    let arguments = capture
        .split(|byte| *byte == 0)
        .filter(|argument| !argument.is_empty())
        .map(|argument| String::from_utf8(argument.to_vec()).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(arguments, ["agent", "prompt", "pane-1", &prepared.text]);
    assert!(!fixture.path().join("should-not-exist").exists());

    let mut large = Document::new("x".repeat(MAX_HANDOFF_BYTES * 2));
    large
        .select(SourceRange::new(0, large.len_bytes()))
        .unwrap();
    let bounded = prepare_handoff(Path::new("large.md"), &large, "inspect").unwrap();
    assert!(bounded.text.len() <= MAX_HANDOFF_BYTES);
    assert!(bounded.text.contains("selection truncated"));
}

#[cfg(unix)]
#[test]
fn missing_empty_and_nonzero_herdr_fail_specifically() {
    let fixture = tempdir().unwrap();
    let missing = HerdrClient::new(fixture.path().join("missing"));
    assert!(missing.discover().is_err());

    let empty_json = r#"{"result":{"agents":[]}}"#;
    let empty = HerdrClient::new(fake_herdr(fixture.path(), empty_json));
    assert!(empty.discover().is_err());

    let mut document = Document::new("selection");
    document.select(SourceRange::new(0, 9)).unwrap();
    let prepared = prepare_handoff(Path::new("notes.md"), &document, "inspect").unwrap();
    assert!(empty.submit("fail", &prepared).is_err());
}
