use std::path::{Path, PathBuf};
use std::sync::{Arc, Barrier};

use serde_json::json;
use zd_host::{
    DurableFileDraft, DurableReviewComment, DurableReviewLedger, DurableStateApply,
    DurableStateApplyResult, DurableStateMutation, DurableStateRevision, HostService,
};

struct Scratch(PathBuf);

impl Scratch {
    fn new(name: &str) -> Self {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("the clock is after the Unix epoch")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("zd-durable-{name}-{stamp}"));
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

fn persisted_host(project: &Scratch, state: &Scratch) -> HostService {
    HostService::open_project_with_state(project.path(), state.path()).expect("open persisted host")
}

fn scope(host: &HostService) -> (String, String) {
    let launch = host.launch_request();
    (
        launch.project.expect("startup project").id,
        launch.worktree_id.expect("startup worktree"),
    )
}

fn apply(
    host: &HostService,
    revision: DurableStateRevision,
    mutation: DurableStateMutation,
) -> DurableStateRevision {
    match host
        .apply_durable_state(&DurableStateApply {
            expected_revision: revision,
            mutation,
        })
        .expect("apply durable state")
    {
        DurableStateApplyResult::Applied { revision } => revision,
        DurableStateApplyResult::ReloadRequired { .. } => panic!("unexpected revision conflict"),
    }
}

#[test]
fn every_record_family_survives_a_fresh_host_service() {
    let project = Scratch::new("restart-project");
    let state = Scratch::new("restart-state");
    let first = persisted_host(&project, &state);
    let (project_id, worktree_id) = scope(&first);
    let mut revision = first.describe_durable_state().unwrap().revision;

    revision = apply(
        &first,
        revision,
        DurableStateMutation::ReplacePreferences {
            record: json!({"schemaVersion": 1, "theme": "current-dark"}),
        },
    );
    revision = apply(
        &first,
        revision,
        DurableStateMutation::ReplaceWorkbench {
            record: json!({"schemaVersion": 2, "activeProjectId": project_id}),
        },
    );
    revision = apply(
        &first,
        revision,
        DurableStateMutation::PutDraft {
            draft: DurableFileDraft {
                schema_version: 1,
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                relative_path: "notes.md".into(),
                text: "unsaved words".into(),
                updated_at: 42,
            },
        },
    );
    revision = apply(
        &first,
        revision,
        DurableStateMutation::ReplaceReviewLedger {
            ledger: DurableReviewLedger {
                schema_version: 1,
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                comments: vec![DurableReviewComment {
                    id: "comment-1".into(),
                    relative: "notes.md".into(),
                    start_line: 2,
                    end_line: 3,
                    selected: "words".into(),
                    comment: "Tighten this.".into(),
                }],
            },
        },
    );
    drop(first);

    let restored = persisted_host(&project, &state)
        .describe_durable_state()
        .expect("restore durable bundle");

    assert_eq!(restored.revision, revision);
    assert_eq!(restored.preferences.unwrap()["theme"], "current-dark");
    assert_eq!(restored.workbench.unwrap()["activeProjectId"], project_id);
    assert_eq!(restored.drafts[0].text, "unsaved words");
    assert_eq!(restored.review_ledgers[0].comments[0].id, "comment-1");
}

#[test]
fn stale_writes_return_only_the_current_revision() {
    let project = Scratch::new("conflict-project");
    let state = Scratch::new("conflict-state");
    let first = persisted_host(&project, &state);
    let second = persisted_host(&project, &state);
    let stale = first.describe_durable_state().unwrap().revision;
    let current = apply(
        &first,
        stale,
        DurableStateMutation::ReplacePreferences {
            record: json!({"schemaVersion": 1, "wordWrap": false}),
        },
    );

    let outcome = second
        .apply_durable_state(&DurableStateApply {
            expected_revision: stale,
            mutation: DurableStateMutation::ReplaceWorkbench {
                record: json!({"schemaVersion": 2, "private": "must not be returned"}),
            },
        })
        .unwrap();

    assert_eq!(
        outcome,
        DurableStateApplyResult::ReloadRequired {
            current_revision: current
        }
    );
    let wire = serde_json::to_value(outcome).unwrap();
    assert!(wire.get("record").is_none());
    assert!(!wire.to_string().contains("private"));
}

#[test]
fn project_records_are_scoped_to_the_active_grant() {
    let alpha = Scratch::new("scope-alpha");
    let beta = Scratch::new("scope-beta");
    let state = Scratch::new("scope-state");
    let alpha_host = persisted_host(&alpha, &state);
    let (alpha_id, alpha_worktree) = scope(&alpha_host);
    let initial = alpha_host.describe_durable_state().unwrap().revision;
    apply(
        &alpha_host,
        initial,
        DurableStateMutation::PutDraft {
            draft: DurableFileDraft {
                schema_version: 1,
                project_id: alpha_id.clone(),
                worktree_id: alpha_worktree,
                relative_path: "alpha.md".into(),
                text: "alpha-only".into(),
                updated_at: 1,
            },
        },
    );

    let beta_host = persisted_host(&beta, &state);
    let beta_bundle = beta_host.describe_durable_state().unwrap();
    assert!(beta_bundle.drafts.is_empty());
    assert!(beta_bundle.workbench.is_none());

    let (_, beta_worktree) = scope(&beta_host);
    let problem = beta_host
        .apply_durable_state(&DurableStateApply {
            expected_revision: beta_bundle.revision,
            mutation: DurableStateMutation::PutDraft {
                draft: DurableFileDraft {
                    schema_version: 1,
                    project_id: alpha_id,
                    worktree_id: beta_worktree,
                    relative_path: "foreign.md".into(),
                    text: "refuse".into(),
                    updated_at: 2,
                },
            },
        })
        .expect_err("foreign project must be refused");
    assert!(problem.contains("durable state"));
    assert!(!problem.contains(&alpha.path().to_string_lossy().into_owned()));
}

#[test]
fn concurrent_expected_revision_allows_exactly_one_writer() {
    let project = Scratch::new("concurrent-project");
    let state = Scratch::new("concurrent-state");
    let first = Arc::new(persisted_host(&project, &state));
    let second = Arc::new(persisted_host(&project, &state));
    let revision = first.describe_durable_state().unwrap().revision;
    let barrier = Arc::new(Barrier::new(2));

    let outcomes = std::thread::scope(|scope| {
        [Arc::clone(&first), Arc::clone(&second)]
            .into_iter()
            .enumerate()
            .map(|(index, host)| {
                let barrier = Arc::clone(&barrier);
                scope.spawn(move || {
                    barrier.wait();
                    host.apply_durable_state(&DurableStateApply {
                        expected_revision: revision,
                        mutation: DurableStateMutation::ReplacePreferences {
                            record: json!({"schemaVersion": 1, "writer": index}),
                        },
                    })
                    .unwrap()
                })
            })
            .collect::<Vec<_>>()
            .into_iter()
            .map(|handle| handle.join().unwrap())
            .collect::<Vec<_>>()
    });

    assert_eq!(
        outcomes
            .iter()
            .filter(|outcome| matches!(outcome, DurableStateApplyResult::Applied { .. }))
            .count(),
        1
    );
    assert_eq!(
        outcomes
            .iter()
            .filter(|outcome| { matches!(outcome, DurableStateApplyResult::ReloadRequired { .. }) })
            .count(),
        1
    );
}

#[test]
fn byte_limits_refuse_oversized_records_without_advancing_revision() {
    let project = Scratch::new("limits-project");
    let state = Scratch::new("limits-state");
    let host = persisted_host(&project, &state);
    let (project_id, worktree_id) = scope(&host);
    let initial = host.describe_durable_state().unwrap().revision;

    for mutation in [
        DurableStateMutation::ReplacePreferences {
            record: json!({"schemaVersion": 1, "payload": "x".repeat(1024 * 1024)}),
        },
        DurableStateMutation::ReplaceWorkbench {
            record: json!({"schemaVersion": 2, "payload": "x".repeat(1024 * 1024)}),
        },
    ] {
        assert!(host
            .apply_durable_state(&DurableStateApply {
                expected_revision: initial,
                mutation,
            })
            .is_err());
    }
    assert_eq!(host.describe_durable_state().unwrap().revision, initial);

    let maximum = DurableFileDraft {
        schema_version: 1,
        project_id: project_id.clone(),
        worktree_id: worktree_id.clone(),
        relative_path: "maximum.md".into(),
        text: "x".repeat(8 * 1024 * 1024),
        updated_at: 1,
    };
    let current = apply(
        &host,
        initial,
        DurableStateMutation::PutDraft { draft: maximum },
    );
    let oversized_draft = DurableFileDraft {
        schema_version: 1,
        project_id: project_id.clone(),
        worktree_id: worktree_id.clone(),
        relative_path: "oversized.md".into(),
        text: "x".repeat(8 * 1024 * 1024 + 1),
        updated_at: 2,
    };
    assert!(host
        .apply_durable_state(&DurableStateApply {
            expected_revision: current,
            mutation: DurableStateMutation::PutDraft {
                draft: oversized_draft,
            },
        })
        .is_err());
    let oversized_review = DurableReviewLedger {
        schema_version: 1,
        project_id,
        worktree_id,
        comments: vec![DurableReviewComment {
            id: "large-comment".into(),
            relative: "maximum.md".into(),
            start_line: 1,
            end_line: 1,
            selected: String::new(),
            comment: "x".repeat(1024 * 1024),
        }],
    };
    assert!(host
        .apply_durable_state(&DurableStateApply {
            expected_revision: current,
            mutation: DurableStateMutation::ReplaceReviewLedger {
                ledger: oversized_review,
            },
        })
        .is_err());
    assert_eq!(host.describe_durable_state().unwrap().revision, current);
}

#[test]
fn corrupt_referenced_records_are_preserved_and_fail_closed() {
    let project = Scratch::new("corrupt-project");
    let state = Scratch::new("corrupt-state");
    let host = persisted_host(&project, &state);
    let (project_id, worktree_id) = scope(&host);
    let revision = host.describe_durable_state().unwrap().revision;
    apply(
        &host,
        revision,
        DurableStateMutation::PutDraft {
            draft: DurableFileDraft {
                schema_version: 1,
                project_id: project_id.clone(),
                worktree_id,
                relative_path: "notes.md".into(),
                text: "recover me".into(),
                updated_at: 1,
            },
        },
    );
    let records = state
        .path()
        .join("durable-state-v1/projects")
        .join(project_id)
        .join("records");
    let record = std::fs::read_dir(records)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .find(|path| {
            path.file_name()
                .unwrap()
                .to_string_lossy()
                .starts_with("draft-")
        })
        .expect("draft record");
    std::fs::write(&record, b"{").unwrap();

    let problem = host
        .describe_durable_state()
        .expect_err("corrupt record must stop the bundle");

    assert!(problem.contains("durable state"));
    assert!(!problem.contains(&project.path().to_string_lossy().into_owned()));
    assert_eq!(std::fs::read(record).unwrap(), b"{");
}

#[test]
fn orphan_records_and_stale_temporaries_are_not_discovered() {
    let project = Scratch::new("orphan-project");
    let state = Scratch::new("orphan-state");
    let host = persisted_host(&project, &state);
    let (project_id, _) = scope(&host);
    let records = state
        .path()
        .join("durable-state-v1/projects")
        .join(project_id)
        .join("records");
    std::fs::create_dir_all(&records).unwrap();
    let orphan = records.join("draft-00000000000000000000000000000001.json");
    let temporary = records.join(".manifest.zd-00000000000000000000000000000002.tmp");
    let unrelated = records.join("keep.txt");
    std::fs::write(&orphan, b"secret orphan").unwrap();
    std::fs::write(&temporary, b"partial").unwrap();
    std::fs::write(&unrelated, b"unrelated").unwrap();

    let empty = host.describe_durable_state().unwrap();
    assert!(empty.drafts.is_empty());
    assert!(empty.review_ledgers.is_empty());
    apply(
        &host,
        empty.revision,
        DurableStateMutation::ReplaceWorkbench {
            record: json!({"schemaVersion": 2}),
        },
    );

    assert!(!orphan.exists());
    assert!(!temporary.exists());
    assert!(unrelated.exists());
}
