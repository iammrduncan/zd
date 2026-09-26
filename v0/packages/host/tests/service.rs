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
fn trusted_desktop_inputs_add_host_grants_and_typed_open_intents() {
    let state = Scratch::new("desktop-input-state");
    let project = Scratch::new("desktop-input-project");
    let file = project.join("notes.md");
    std::fs::write(&file, "notes\n").expect("write trusted open file");
    let host = HostService::open_desktop_with_state(None, state.path()).expect("open desktop home");

    let selected = host
        .approve_trusted_project(project.path())
        .expect("approve picker project");
    let intent = host
        .approve_trusted_open(&file)
        .expect("approve trusted file open");
    let recovered_root = Scratch::new("desktop-input-recovered");
    let recovered = host
        .recover_trusted_project(&selected.id, recovered_root.path())
        .expect("recover trusted project root");

    assert_eq!(intent.project.as_ref(), Some(&selected));
    assert_eq!(intent.relative_path.as_deref(), Some("notes.md"));
    assert!(intent.worktree_id.is_some());
    assert_eq!(recovered.id, selected.id);
    assert_eq!(recovered.root, recovered_root.path().to_string_lossy());
    assert_eq!(host.project_grants(), vec![recovered]);
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
fn explicitly_added_project_grants_restore_until_they_are_removed() {
    let startup = Scratch::new("restored-grants-startup");
    let added = Scratch::new("restored-grants-added");
    let state = Scratch::new("restored-grants-state");

    let first = persisted_host(startup.path(), state.path());
    let added_grant = first
        .approve_trusted_project(added.path())
        .expect("approve additional project");
    assert_eq!(first.project_grants().len(), 2);
    drop(first);

    let restored = persisted_host(startup.path(), state.path());
    assert!(restored
        .project_grants()
        .iter()
        .any(|project| project.id == added_grant.id));
    restored
        .remove_project_grant(&added_grant.id)
        .expect("remove restored project");
    drop(restored);

    let reopened = persisted_host(startup.path(), state.path());
    assert_eq!(reopened.project_grants().len(), 1);
    assert_eq!(
        reopened.project_grants()[0].root,
        startup.path().to_string_lossy()
    );
}

#[test]
fn concurrent_hosts_do_not_erase_each_others_added_project_grants() {
    let startup = Scratch::new("concurrent-grants-startup");
    let alpha = Scratch::new("concurrent-grants-alpha");
    let beta = Scratch::new("concurrent-grants-beta");
    let state = Scratch::new("concurrent-grants-state");
    let first = persisted_host(startup.path(), state.path());
    let second = persisted_host(startup.path(), state.path());

    let alpha_grant = first
        .approve_trusted_project(alpha.path())
        .expect("approve alpha project");
    let beta_grant = second
        .approve_trusted_project(beta.path())
        .expect("approve beta project");
    drop(first);
    drop(second);

    let reopened = persisted_host(startup.path(), state.path());
    let project_ids = reopened
        .project_grants()
        .into_iter()
        .map(|project| project.id)
        .collect::<Vec<_>>();
    assert_eq!(project_ids.len(), 3);
    assert!(project_ids.contains(&alpha_grant.id));
    assert!(project_ids.contains(&beta_grant.id));
}

#[test]
fn a_corrupt_served_grant_set_is_preserved_and_fails_closed() {
    let startup = Scratch::new("corrupt-grants-startup");
    let state = Scratch::new("corrupt-grants-state");
    let first = persisted_host(startup.path(), state.path());
    let project_id = startup_scope(&first).0;
    drop(first);
    let grant_set = state
        .join("served-grants-v1")
        .join(format!("{project_id}.json"));
    std::fs::create_dir_all(grant_set.parent().expect("grant-set directory"))
        .expect("create grant-set directory");
    std::fs::write(&grant_set, b"{not valid json").expect("write corrupt grant set");

    let problem = HostService::open_project_with_state(startup.path(), state.path())
        .expect_err("corrupt grant state must stop startup");

    assert!(problem.contains("served grant persistence"));
    assert_eq!(std::fs::read(&grant_set).unwrap(), b"{not valid json");
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
