use std::path::{Path, PathBuf};

use zd_host::instrumentation::DiagnosticRecordInput;
use zd_host::{BoundedFileRead, FileTreeRequest, FileTreeResult, HostService, ResourceRef};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-host-{name}-{stamp}"));
        std::fs::create_dir_all(&path).expect("create scratch directory");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn join(&self, relative: &str) -> PathBuf {
        self.0.join(relative)
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn startup_scope(host: &HostService) -> (String, String) {
    let launch = host.launch_request();
    let project = launch.project.expect("startup project grant");
    let worktree_id = launch.worktree_id.expect("startup worktree grant");
    (project.id, worktree_id)
}

fn persisted_host(project: &Path, state: &Path) -> HostService {
    HostService::open_project_with_state(project, state).expect("open persisted host")
}

#[test]
fn desktop_home_starts_without_approving_the_invocation_directory() {
    let state = Scratch::new("desktop-home-state");

    let host = HostService::open_desktop_with_state(None, state.path()).expect("open desktop home");

    assert_eq!(
        host.launch_request(),
        zd_host::HostLaunchRequest {
            project: None,
            worktree_id: None,
            relative_path: None,
            problem: None,
        }
    );
    assert!(host.project_grants().is_empty());
    assert!(host.diagnostics_status().is_ok());
    assert!(host.describe_durable_state().is_err());
}

#[test]
fn desktop_file_launch_approves_its_parent_and_keeps_only_a_relative_file_name() {
    let project = Scratch::new("desktop-file-project");
    let state = Scratch::new("desktop-file-state");
    let file = project.join("plan.md");
    std::fs::write(&file, "plan\n").expect("write launch file");

    let host =
        HostService::open_desktop_with_state(Some(&file), state.path()).expect("open desktop file");
    let launch = host.launch_request();
    let expected_root = project.path().canonicalize().unwrap();

    assert_eq!(launch.relative_path.as_deref(), Some("plan.md"));
    assert_eq!(
        launch.project.as_ref().map(|grant| grant.root.as_str()),
        Some(expected_root.to_string_lossy().as_ref())
    );
    assert!(launch.worktree_id.is_some());
}

#[test]
fn startup_project_drives_tree_and_bounded_file_authority() {
    let scratch = Scratch::new("startup");
    std::fs::create_dir_all(scratch.join("docs")).expect("create docs");
    std::fs::write(scratch.join("docs/notes.md"), "hello from the host\n").expect("write fixture");

    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    let grants = host.project_grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(grants[0].id, project_id);
    assert_eq!(
        grants[0].root,
        scratch.path().canonicalize().unwrap().to_string_lossy()
    );

    let tree = host.file_tree_snapshot(&FileTreeRequest {
        project_id: project_id.clone(),
        worktree_id: worktree_id.clone(),
        previous_revision: None,
    });
    let FileTreeResult::Ready { entries, .. } = tree else {
        panic!("expected a ready tree, got {tree:?}");
    };
    assert!(entries
        .iter()
        .any(|entry| entry.relative_path == "docs/notes.md"));

    let read = host.read_bounded_file(&ResourceRef {
        project_id,
        worktree_id,
        relative_path: "docs/notes.md".to_string(),
    });
    assert!(matches!(
        read,
        BoundedFileRead::Text { ref text, .. } if text == "hello from the host\n"
    ));
}

#[test]
fn startup_project_must_be_an_existing_directory() {
    let scratch = Scratch::new("invalid-root");
    let file = scratch.join("notes.md");
    std::fs::write(&file, "not a directory").expect("write fixture");

    assert!(HostService::open_project(&file).is_err());
    assert!(HostService::open_project(&scratch.join("missing")).is_err());
}

#[test]
fn project_and_root_worktree_identities_survive_a_fresh_host_process() {
    let project = Scratch::new("stable-project");
    let state = Scratch::new("stable-state");

    let first = persisted_host(project.path(), state.path());
    let first_scope = startup_scope(&first);
    drop(first);

    let second = persisted_host(&project.join("."), state.path());
    let second_scope = startup_scope(&second);

    assert_eq!(second_scope, first_scope);
    assert!(first_scope.0.starts_with("project-"));
    assert!(first_scope.1.starts_with("worktree-"));
    assert!(!first_scope
        .0
        .contains(&project.path().to_string_lossy().into_owned()));
    assert_ne!(first_scope.0, "project-0000000000000001");
}

#[test]
fn remembered_identities_do_not_authorize_other_roots() {
    let alpha = Scratch::new("catalog-alpha");
    let beta = Scratch::new("catalog-beta");
    let state = Scratch::new("catalog-state");

    let alpha_host = persisted_host(alpha.path(), state.path());
    let alpha_id = startup_scope(&alpha_host).0;
    drop(alpha_host);

    let beta_host = persisted_host(beta.path(), state.path());
    let grants = beta_host.project_grants();

    assert_eq!(grants.len(), 1);
    assert_ne!(grants[0].id, alpha_id);
    assert_eq!(
        grants[0].root,
        beta.path().canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn persisted_host_discovers_themes_from_its_configuration_directory() {
    let project = Scratch::new("theme-project");
    let state = Scratch::new("theme-state");
    std::fs::write(state.join("fixture.theme.config"), "{\"name\":\"Fixture\"}")
        .expect("write theme fixture");
    let host = persisted_host(project.path(), state.path());

    let themes = host.theme_config_files().expect("discover themes");

    assert_eq!(themes.len(), 1);
    assert_eq!(themes[0].file_name, "fixture.theme.config");
    assert_eq!(
        themes[0].contents.as_deref(),
        Some("{\"name\":\"Fixture\"}")
    );
}

#[test]
fn persisted_host_keeps_diagnostics_off_until_explicitly_enabled() {
    let project = Scratch::new("diagnostic-project");
    let state = Scratch::new("diagnostic-state");
    let host = persisted_host(project.path(), state.path());
    let diagnostics_directory = state.join("diagnostics");

    let initial = host.diagnostics_status().expect("read diagnostic status");
    assert!(!initial.enabled);
    assert!(!diagnostics_directory.exists());

    let enabled = host.enable_diagnostics().expect("enable diagnostics");
    assert!(enabled.enabled, "{:?}", enabled.problem);
    let record: DiagnosticRecordInput = serde_json::from_value(serde_json::json!({
        "recordType": "span",
        "operation": "protocol.request",
        "traceId": "request-0001",
        "spanId": "dispatch-0001",
        "durationUs": 125,
        "outcome": "ok"
    }))
    .expect("closed diagnostic record");
    assert!(
        host.record_diagnostic(record)
            .expect("record diagnostic")
            .recorded
    );

    let disabled = host.disable_diagnostics().expect("disable diagnostics");
    assert!(!disabled.enabled);
}

#[test]
fn a_corrupt_identity_catalog_is_preserved_and_fails_closed() {
    let project = Scratch::new("corrupt-project");
    let state = Scratch::new("corrupt-state");
    let catalog = state.join("host-identities-v1.json");
    std::fs::write(&catalog, b"{not valid json").expect("write corrupt catalog");

    let problem = HostService::open_project_with_state(project.path(), state.path())
        .expect_err("corrupt state must stop startup");

    assert!(problem.contains("identity catalog"));
    assert_eq!(std::fs::read(&catalog).unwrap(), b"{not valid json");
}

#[test]
fn trusted_root_recovery_preserves_the_project_and_root_worktree_ids() {
    let original = Scratch::new("recover-original");
    let replacement = Scratch::new("recover-replacement");
    let state = Scratch::new("recover-state");
    let first = persisted_host(original.path(), state.path());
    let first_scope = startup_scope(&first);
    drop(first);

    let recovered =
        HostService::recover_project_with_state(&first_scope.0, replacement.path(), state.path())
            .expect("recover trusted project root");

    assert_eq!(startup_scope(&recovered), first_scope);
    assert_eq!(
        recovered.project_grants()[0].root,
        replacement.path().canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn resource_requests_cannot_supply_an_absolute_parent_or_foreign_scope() {
    let scratch = Scratch::new("path-input");
    std::fs::write(scratch.join("inside.md"), "inside").expect("write fixture");
    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    for relative_path in [
        "../outside.md".to_string(),
        scratch.join("inside.md").to_string_lossy().into_owned(),
    ] {
        let read = host.read_bounded_file(&ResourceRef {
            project_id: project_id.clone(),
            worktree_id: worktree_id.clone(),
            relative_path,
        });
        assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
    }

    let read = host.read_bounded_file(&ResourceRef {
        project_id: "another-project".to_string(),
        worktree_id,
        relative_path: "inside.md".to_string(),
    });
    assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
}

#[cfg(unix)]
#[test]
fn resource_symlinks_cannot_escape_the_startup_project() {
    let scratch = Scratch::new("symlink-root");
    let outside = Scratch::new("symlink-outside");
    std::fs::write(outside.join("secret.md"), "secret").expect("write outside fixture");
    std::os::unix::fs::symlink(outside.join("secret.md"), scratch.join("linked.md"))
        .expect("create symlink");
    let host = HostService::open_project(scratch.path()).expect("approve startup project");
    let (project_id, worktree_id) = startup_scope(&host);

    let read = host.read_bounded_file(&ResourceRef {
        project_id,
        worktree_id,
        relative_path: "linked.md".to_string(),
    });
    assert!(matches!(read, BoundedFileRead::Unavailable { .. }));
}
