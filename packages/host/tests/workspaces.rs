use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};

use zd_host::{HostService, RecentWorkspaceKind, WorkspaceStore};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-workspaces-{name}-{stamp}"));
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

fn grant(project: &Scratch, state: &Scratch) -> zd_host::ProjectGrant {
    HostService::open_project_with_state(project.path(), state.path())
        .expect("open project")
        .project_grants()
        .remove(0)
}

fn store(state: &Scratch) -> WorkspaceStore {
    WorkspaceStore::new(state.join("workspaces-v1.json"))
}

#[test]
fn workspaces_are_keyed_by_stable_project_ids_without_repeating_roots() {
    let alpha = Scratch::new("ids-alpha");
    let beta = Scratch::new("ids-beta");
    let state = Scratch::new("ids-state");
    let projects = [grant(&alpha, &state), grant(&beta, &state)];
    let workspaces = store(&state);

    let saved = workspaces
        .save_approved_projects(&projects)
        .expect("save workspace");
    let bytes = std::fs::read(state.join("workspaces-v1.json")).unwrap();
    let catalog: serde_json::Value = serde_json::from_slice(&bytes).unwrap();

    assert_eq!(saved.kind, RecentWorkspaceKind::Workspace);
    assert_eq!(catalog["schemaVersion"], 2);
    assert_eq!(catalog["workspaces"][0]["projectIds"][0], projects[0].id);
    assert_eq!(catalog["workspaces"][0]["projectIds"][1], projects[1].id);
    assert!(catalog["workspaces"][0].get("roots").is_none());
    assert!(!String::from_utf8(bytes)
        .unwrap()
        .contains(&alpha.path().to_string_lossy().into_owned()));
}

#[test]
fn the_same_project_set_reuses_one_workspace_and_moves_it_to_the_front() {
    let alpha = Scratch::new("reuse-alpha");
    let beta = Scratch::new("reuse-beta");
    let solo = Scratch::new("reuse-solo");
    let state = Scratch::new("reuse-state");
    let alpha_grant = grant(&alpha, &state);
    let beta_grant = grant(&beta, &state);
    let workspaces = store(&state);
    let first = workspaces
        .save_approved_projects(&[alpha_grant.clone(), beta_grant.clone()])
        .unwrap();
    workspaces
        .save_approved_projects(&[grant(&solo, &state)])
        .unwrap();
    let reopened_names = [beta_grant.name.clone(), alpha_grant.name.clone()];

    let reopened = workspaces
        .save_approved_projects(&[beta_grant, alpha_grant])
        .unwrap();
    let recent = workspaces.recent().unwrap();

    assert_eq!(reopened.id, first.id);
    assert_eq!(recent.len(), 2);
    assert_eq!(recent[0].id, first.id);
    assert_eq!(recent[0].project_names, reopened_names);
}

#[test]
fn a_legacy_root_catalog_migrates_once_to_stable_project_ids() {
    let alpha = Scratch::new("legacy-alpha");
    let beta = Scratch::new("legacy-beta");
    let state = Scratch::new("legacy-state");
    let fixture = serde_json::json!({
        "schemaVersion": 1,
        "nextIdentity": 2,
        "workspaces": [{
            "id": "workspace-0000000000000001",
            "roots": [alpha.path(), beta.path()],
            "projectNames": ["alpha", "beta"],
            "lastOpened": 10,
        }],
    });
    std::fs::write(
        state.join("workspaces-v1.json"),
        serde_json::to_vec_pretty(&fixture).unwrap(),
    )
    .unwrap();
    let workspaces = store(&state);

    let recent = workspaces.recent().expect("migrate legacy workspaces");
    let roots = workspaces
        .trusted_roots("workspace-0000000000000001")
        .expect("resolve migrated roots");
    let rewritten: serde_json::Value =
        serde_json::from_slice(&std::fs::read(state.join("workspaces-v1.json")).unwrap()).unwrap();

    assert_eq!(recent[0].kind, RecentWorkspaceKind::Workspace);
    assert_eq!(
        roots,
        [
            alpha.path().canonicalize().unwrap(),
            beta.path().canonicalize().unwrap()
        ]
    );
    assert_eq!(rewritten["schemaVersion"], 2);
    assert!(rewritten["workspaces"][0].get("roots").is_none());
}

#[test]
fn corrupt_workspace_bytes_are_preserved_and_fail_closed() {
    let state = Scratch::new("corrupt-state");
    let path = state.join("workspaces-v1.json");
    let bytes = b"{partially written";
    std::fs::write(&path, bytes).unwrap();
    let workspaces = store(&state);

    let problem = workspaces
        .recent()
        .expect_err("corruption must stop access");

    assert!(problem.contains("workspace catalog"));
    assert!(!problem.contains(&state.path().to_string_lossy().into_owned()));
    assert_eq!(std::fs::read(path).unwrap(), bytes);
}

#[test]
fn unsupported_and_oversized_workspace_catalogs_are_preserved() {
    let state = Scratch::new("invalid-state");
    let path = state.join("workspaces-v1.json");
    let cases = [
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 99,
            "workspaces": [],
        }))
        .unwrap(),
        vec![b' '; 1024 * 1024 + 1],
    ];

    for bytes in cases {
        std::fs::write(&path, &bytes).unwrap();
        let problem = store(&state)
            .recent()
            .expect_err("invalid catalog must stop access");
        assert!(problem.contains("workspace catalog"));
        assert_eq!(std::fs::read(&path).unwrap(), bytes);
    }
}

#[test]
fn legacy_missing_roots_remain_recoverable_without_becoming_grants() {
    let state = Scratch::new("legacy-missing-state");
    let active = Scratch::new("legacy-active");
    let missing = state.join("moved-away-project");
    let fixture = serde_json::json!({
        "schemaVersion": 1,
        "nextIdentity": 2,
        "workspaces": [{
            "id": "workspace-0000000000000001",
            "roots": [&missing],
            "projectNames": ["moved-away-project"],
            "lastOpened": 10,
        }],
    });
    std::fs::write(
        state.join("workspaces-v1.json"),
        serde_json::to_vec_pretty(&fixture).unwrap(),
    )
    .unwrap();

    let workspaces = store(&state);
    assert_eq!(workspaces.recent().unwrap().len(), 1);
    assert_eq!(
        workspaces
            .trusted_roots("workspace-0000000000000001")
            .unwrap(),
        [missing]
    );
    let active_host = HostService::open_project_with_state(active.path(), state.path()).unwrap();
    let grants = active_host.project_grants();
    assert_eq!(grants.len(), 1);
    assert_eq!(
        grants[0].root,
        active.path().canonicalize().unwrap().to_string_lossy()
    );
}

#[test]
fn workspace_and_project_counts_are_bounded() {
    let state = Scratch::new("bounds-state");
    let projects = (0..21)
        .map(|index| Scratch::new(&format!("bounds-{index}")))
        .collect::<Vec<_>>();
    let grants = projects
        .iter()
        .map(|project| grant(project, &state))
        .collect::<Vec<_>>();
    let workspaces = store(&state);

    for project in &grants {
        workspaces
            .save_approved_projects(std::slice::from_ref(project))
            .unwrap();
    }
    let recent = workspaces.recent().unwrap();
    assert_eq!(recent.len(), 20);
    assert_eq!(recent[0].project_names, [grants[20].name.clone()]);
    assert!(recent
        .iter()
        .all(|workspace| workspace.project_names != [grants[0].name.clone()]));

    let too_many = vec![grants[0].clone(); 33];
    assert!(workspaces.save_approved_projects(&too_many).is_err());
    assert_eq!(workspaces.recent().unwrap().len(), 20);
}

#[test]
fn concurrent_workspace_saves_retain_every_successful_record() {
    const WORKSPACE_COUNT: usize = 8;
    let state = Scratch::new("concurrent-state");
    let projects = (0..WORKSPACE_COUNT)
        .map(|index| Scratch::new(&format!("concurrent-{index}")))
        .collect::<Vec<_>>();
    let grants = projects
        .iter()
        .map(|project| grant(project, &state))
        .collect::<Vec<_>>();
    let barrier = Arc::new(Barrier::new(WORKSPACE_COUNT));

    std::thread::scope(|scope| {
        let handles = grants
            .iter()
            .map(|project| {
                let barrier = Arc::clone(&barrier);
                let workspaces = store(&state);
                scope.spawn(move || {
                    barrier.wait();
                    workspaces
                        .save_approved_projects(std::slice::from_ref(project))
                        .expect("save concurrent workspace")
                })
            })
            .collect::<Vec<_>>();
        for handle in handles {
            handle.join().expect("join workspace writer");
        }
    });

    assert_eq!(store(&state).recent().unwrap().len(), WORKSPACE_COUNT);
}
