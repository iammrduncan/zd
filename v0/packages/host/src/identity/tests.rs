use super::{load_catalog, open_project, recover_project, CATALOG_FILE, CATALOG_LIMIT_BYTES};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-identities-{name}-{stamp}"));
        std::fs::create_dir_all(&path).expect("create scratch directory");
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn project_fixture(root: &Path, project_suffix: &str, worktree_suffix: &str) -> serde_json::Value {
    serde_json::json!({
        "id": format!("project-{project_suffix:0>32}"),
        "root": root,
        "worktrees": [{
            "id": format!("worktree-{worktree_suffix:0>32}"),
            "root": root,
        }],
    })
}

fn write_fixture(state: &Scratch, fixture: &serde_json::Value) -> Vec<u8> {
    let bytes = serde_json::to_vec_pretty(fixture).expect("encode fixture");
    std::fs::write(state.path().join(CATALOG_FILE), &bytes).expect("write fixture");
    bytes
}

fn assert_fixture_rejected(project: &Scratch, state: &Scratch, bytes: &[u8]) {
    std::fs::write(state.path().join(CATALOG_FILE), bytes).expect("write rejected fixture");
    let problem =
        open_project(project.path(), state.path()).expect_err("invalid catalog must fail closed");
    assert!(problem.contains("identity catalog"));
    assert!(!problem.contains(&state.path().to_string_lossy().into_owned()));
    assert_eq!(
        std::fs::read(state.path().join(CATALOG_FILE)).unwrap(),
        bytes
    );
}

#[test]
fn a_worktree_root_cannot_collide_with_another_project_root() {
    let alpha = Scratch::new("collision-alpha");
    let beta = Scratch::new("collision-beta");
    let state = Scratch::new("collision-state");
    let mut first = project_fixture(alpha.path(), "1", "2");
    first["worktrees"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({
            "id": "worktree-00000000000000000000000000000003",
            "root": beta.path(),
        }));
    let fixture = serde_json::json!({
        "schemaVersion": 1,
        "projects": [first, project_fixture(beta.path(), "4", "5")],
    });
    let bytes = write_fixture(&state, &fixture);

    assert_fixture_rejected(&alpha, &state, &bytes);
}

#[test]
fn corrupt_unsupported_and_duplicate_catalogs_are_preserved() {
    let project = Scratch::new("invalid-project");
    let state = Scratch::new("invalid-state");
    let valid_project = project_fixture(project.path(), "1", "2");
    let cases = [
        b"{partially written".to_vec(),
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 0,
            "projects": [],
        }))
        .unwrap(),
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 1,
            "projects": [valid_project.clone(), valid_project],
        }))
        .unwrap(),
        serde_json::to_vec(&serde_json::json!({
            "schemaVersion": 1,
            "projects": [],
            "surprise": true,
        }))
        .unwrap(),
    ];

    for bytes in cases {
        assert_fixture_rejected(&project, &state, &bytes);
    }
}

#[test]
fn an_oversized_catalog_is_rejected_before_decoding_and_preserved() {
    let project = Scratch::new("oversized-project");
    let state = Scratch::new("oversized-state");
    let bytes = vec![b' '; CATALOG_LIMIT_BYTES as usize + 1];

    assert_fixture_rejected(&project, &state, &bytes);
}

#[test]
fn concurrent_catalog_changes_do_not_erase_successful_writes() {
    const HOST_COUNT: usize = 8;
    let state = Scratch::new("concurrent-state");
    let projects = (0..HOST_COUNT)
        .map(|index| Scratch::new(&format!("concurrent-project-{index}")))
        .collect::<Vec<_>>();
    let barrier = Arc::new(Barrier::new(HOST_COUNT));

    std::thread::scope(|scope| {
        let handles = projects
            .iter()
            .map(|project| {
                let barrier = Arc::clone(&barrier);
                let state_path = state.path().to_path_buf();
                scope.spawn(move || {
                    barrier.wait();
                    open_project(project.path(), &state_path).expect("open concurrent project")
                })
            })
            .collect::<Vec<_>>();
        let identities = handles
            .into_iter()
            .map(|handle| handle.join().expect("join host thread").project_id)
            .collect::<std::collections::HashSet<_>>();
        assert_eq!(identities.len(), HOST_COUNT);
    });

    let catalog = load_catalog(&state.path().join(CATALOG_FILE)).expect("load final catalog");
    assert_eq!(catalog.projects.len(), HOST_COUNT);
}

#[test]
fn recovery_cannot_take_a_root_owned_by_another_project() {
    let alpha = Scratch::new("recover-conflict-alpha");
    let beta = Scratch::new("recover-conflict-beta");
    let state = Scratch::new("recover-conflict-state");
    let alpha_id = open_project(alpha.path(), state.path()).unwrap().project_id;
    open_project(beta.path(), state.path()).unwrap();
    let before = std::fs::read(state.path().join(CATALOG_FILE)).unwrap();

    let problem = recover_project(&alpha_id, beta.path(), state.path())
        .expect_err("recovery must not steal another root");

    assert!(problem.contains("identity catalog"));
    assert_eq!(
        std::fs::read(state.path().join(CATALOG_FILE)).unwrap(),
        before
    );
}
