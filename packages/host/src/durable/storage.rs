mod maintenance;
mod validation;

use std::collections::HashSet;
use std::fs::{File, OpenOptions};
use std::io::Read;
use std::path::{Path, PathBuf};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;

use super::{
    DurableFileDraft, DurableReviewLedger, DurableStateApply, DurableStateApplyResult,
    DurableStateBundle, DurableStateMutation, DurableStateRevision,
};
use crate::atomic_write;
use maintenance::{cleanup_records, fresh_record_name};
use validation::{
    validate_draft, validate_manifest, validate_preferences, validate_relative_path,
    validate_review, validate_scope, validate_versioned_json, DRAFT_RECORD_LIMIT_BYTES,
    PREFERENCES_LIMIT_BYTES, REVIEW_LEDGER_LIMIT_BYTES, WORKBENCH_LIMIT_BYTES,
};

pub(super) fn validate_project_id(project_id: &str) -> Result<(), String> {
    validation::validate_project_id(project_id)
}

const STORAGE_DIRECTORY: &str = "durable-state-v1";
const PROJECTS_DIRECTORY: &str = "projects";
const RECORDS_DIRECTORY: &str = "records";
const PREFERENCES_FILE: &str = "preferences-v1.json";
const PREFERENCES_LOCK: &str = "preferences-v1.lock";
const PROJECT_MANIFEST_FILE: &str = "manifest-v1.json";
const PROJECT_LOCK_FILE: &str = "manifest-v1.lock";
const STORAGE_SCHEMA_VERSION: u16 = 1;
const RECORD_ENVELOPE_ALLOWANCE_BYTES: usize = 64 * 1024;
const PREFERENCES_FILE_LIMIT_BYTES: u64 =
    (PREFERENCES_LIMIT_BYTES + RECORD_ENVELOPE_ALLOWANCE_BYTES) as u64;
const PROJECT_MANIFEST_LIMIT_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Debug)]
struct StatePaths {
    root: PathBuf,
    preferences: PathBuf,
    preferences_lock: PathBuf,
    project: PathBuf,
    project_manifest: PathBuf,
    project_lock: PathBuf,
    records: PathBuf,
}

impl StatePaths {
    fn new(state_directory: &Path, project_id: &str) -> Self {
        let root = state_directory.join(STORAGE_DIRECTORY);
        let project = root.join(PROJECTS_DIRECTORY).join(project_id);
        Self {
            preferences: root.join(PREFERENCES_FILE),
            preferences_lock: root.join(PREFERENCES_LOCK),
            project_manifest: project.join(PROJECT_MANIFEST_FILE),
            project_lock: project.join(PROJECT_LOCK_FILE),
            records: project.join(RECORDS_DIRECTORY),
            root,
            project,
        }
    }

    fn prepare(&self) -> Result<(), String> {
        std::fs::create_dir_all(&self.root)
            .and_then(|()| std::fs::create_dir_all(&self.project))
            .and_then(|()| std::fs::create_dir_all(&self.records))
            .map_err(|_| unavailable("storage directories cannot be created"))
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PreferencesRecord {
    schema_version: u16,
    revision: u64,
    record: Option<Value>,
}

impl Default for PreferencesRecord {
    fn default() -> Self {
        Self {
            schema_version: STORAGE_SCHEMA_VERSION,
            revision: 0,
            record: None,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectManifest {
    schema_version: u16,
    revision: u64,
    project_id: String,
    workbench: Option<Value>,
    drafts: Vec<DraftPointer>,
    review_ledgers: Vec<ReviewPointer>,
}

impl ProjectManifest {
    fn empty(project_id: &str) -> Self {
        Self {
            schema_version: STORAGE_SCHEMA_VERSION,
            revision: 0,
            project_id: project_id.to_string(),
            workbench: None,
            drafts: Vec::new(),
            review_ledgers: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftPointer {
    project_id: String,
    worktree_id: String,
    relative_path: String,
    file_name: String,
    record_bytes: u64,
    payload_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReviewPointer {
    project_id: String,
    worktree_id: String,
    file_name: String,
    record_bytes: u64,
}

pub(super) fn describe(
    state_directory: &Path,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
) -> Result<DurableStateBundle, String> {
    let paths = StatePaths::new(state_directory, project_id);
    paths.prepare()?;
    let _locks = lock_state(&paths)?;
    let preferences = load_preferences(&paths.preferences)?;
    let manifest = load_manifest(&paths.project_manifest, project_id, allowed_worktree_ids)?;
    let drafts = manifest
        .drafts
        .iter()
        .map(|pointer| load_draft(&paths.records, pointer, project_id, allowed_worktree_ids))
        .collect::<Result<Vec<_>, _>>()?;
    let review_ledgers = manifest
        .review_ledgers
        .iter()
        .map(|pointer| load_review(&paths.records, pointer, project_id, allowed_worktree_ids))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(DurableStateBundle {
        revision: DurableStateRevision {
            preferences: preferences.revision,
            project: manifest.revision,
        },
        preferences: preferences.record,
        workbench: manifest.workbench,
        drafts,
        review_ledgers,
    })
}

pub(super) fn apply(
    state_directory: &Path,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
    request: &DurableStateApply,
) -> Result<DurableStateApplyResult, String> {
    let paths = StatePaths::new(state_directory, project_id);
    paths.prepare()?;
    let _locks = lock_state(&paths)?;
    let mut preferences = load_preferences(&paths.preferences)?;
    let mut manifest = load_manifest(&paths.project_manifest, project_id, allowed_worktree_ids)?;
    let current_revision = DurableStateRevision {
        preferences: preferences.revision,
        project: manifest.revision,
    };
    if request.expected_revision != current_revision {
        return Ok(DurableStateApplyResult::ReloadRequired { current_revision });
    }

    match &request.mutation {
        DurableStateMutation::ReplacePreferences { record } => {
            validate_versioned_json(record, &[1], PREFERENCES_LIMIT_BYTES, "preferences")?;
            preferences.revision = next_revision(preferences.revision)?;
            preferences.record = Some(record.clone());
            save_preferences(&paths.preferences, &preferences)?;
        }
        DurableStateMutation::ReplaceWorkbench { record } => {
            validate_versioned_json(record, &[1, 2], WORKBENCH_LIMIT_BYTES, "workbench")?;
            manifest.revision = next_revision(manifest.revision)?;
            manifest.workbench = Some(record.clone());
            save_manifest(
                &paths.project_manifest,
                &manifest,
                project_id,
                allowed_worktree_ids,
            )?;
            cleanup_records(&paths.records, &manifest);
        }
        DurableStateMutation::PutDraft { draft } => {
            let bytes = validate_draft(draft, project_id, allowed_worktree_ids)?;
            let file_name = fresh_record_name(&paths.records, "draft")?;
            let pointer = DraftPointer {
                project_id: draft.project_id.clone(),
                worktree_id: draft.worktree_id.clone(),
                relative_path: draft.relative_path.clone(),
                file_name: file_name.clone(),
                record_bytes: bytes.len() as u64,
                payload_bytes: draft.text.len() as u64,
            };
            if let Some(existing) = manifest.drafts.iter_mut().find(|existing| {
                existing.project_id == pointer.project_id
                    && existing.worktree_id == pointer.worktree_id
                    && existing.relative_path == pointer.relative_path
            }) {
                *existing = pointer;
            } else {
                manifest.drafts.push(pointer);
            }
            manifest.revision = next_revision(manifest.revision)?;
            validate_manifest(&manifest, project_id, allowed_worktree_ids)?;
            atomic_write(&paths.records.join(file_name), &bytes)
                .map_err(|_| unavailable("draft record cannot be replaced"))?;
            save_manifest(
                &paths.project_manifest,
                &manifest,
                project_id,
                allowed_worktree_ids,
            )?;
            cleanup_records(&paths.records, &manifest);
        }
        DurableStateMutation::RemoveDraft {
            project_id: requested_project,
            worktree_id,
            relative_path,
        } => {
            validate_scope(
                requested_project,
                worktree_id,
                project_id,
                allowed_worktree_ids,
            )?;
            validate_relative_path(relative_path)?;
            manifest.drafts.retain(|draft| {
                draft.project_id != *requested_project
                    || draft.worktree_id != *worktree_id
                    || draft.relative_path != *relative_path
            });
            manifest.revision = next_revision(manifest.revision)?;
            save_manifest(
                &paths.project_manifest,
                &manifest,
                project_id,
                allowed_worktree_ids,
            )?;
            cleanup_records(&paths.records, &manifest);
        }
        DurableStateMutation::ReplaceReviewLedger { ledger } => {
            let bytes = validate_review(ledger, project_id, allowed_worktree_ids)?;
            let file_name = fresh_record_name(&paths.records, "review")?;
            let pointer = ReviewPointer {
                project_id: ledger.project_id.clone(),
                worktree_id: ledger.worktree_id.clone(),
                file_name: file_name.clone(),
                record_bytes: bytes.len() as u64,
            };
            if let Some(existing) = manifest.review_ledgers.iter_mut().find(|existing| {
                existing.project_id == pointer.project_id
                    && existing.worktree_id == pointer.worktree_id
            }) {
                *existing = pointer;
            } else {
                manifest.review_ledgers.push(pointer);
            }
            manifest.revision = next_revision(manifest.revision)?;
            validate_manifest(&manifest, project_id, allowed_worktree_ids)?;
            atomic_write(&paths.records.join(file_name), &bytes)
                .map_err(|_| unavailable("review record cannot be replaced"))?;
            save_manifest(
                &paths.project_manifest,
                &manifest,
                project_id,
                allowed_worktree_ids,
            )?;
            cleanup_records(&paths.records, &manifest);
        }
    }

    Ok(DurableStateApplyResult::Applied {
        revision: DurableStateRevision {
            preferences: preferences.revision,
            project: manifest.revision,
        },
    })
}

fn lock_state(paths: &StatePaths) -> Result<(File, File), String> {
    let preferences = open_lock(&paths.preferences_lock)?;
    File::lock(&preferences).map_err(|_| unavailable("preferences lock failed"))?;
    let project = open_lock(&paths.project_lock)?;
    File::lock(&project).map_err(|_| unavailable("project lock failed"))?;
    Ok((preferences, project))
}

fn open_lock(path: &Path) -> Result<File, String> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)
        .map_err(|_| unavailable("state lock cannot be opened"))
}

fn load_preferences(path: &Path) -> Result<PreferencesRecord, String> {
    let Some(preferences) = load_json(path, PREFERENCES_FILE_LIMIT_BYTES, "preferences")? else {
        return Ok(PreferencesRecord::default());
    };
    validate_preferences(&preferences)?;
    Ok(preferences)
}

fn save_preferences(path: &Path, preferences: &PreferencesRecord) -> Result<(), String> {
    validate_preferences(preferences)?;
    let bytes = serde_json::to_vec_pretty(preferences)
        .map_err(|_| unavailable("preferences cannot be encoded"))?;
    if bytes.len() as u64 > PREFERENCES_FILE_LIMIT_BYTES {
        return Err(unavailable("preferences file exceeds its byte limit"));
    }
    atomic_write(path, &bytes).map_err(|_| unavailable("preferences cannot be replaced"))
}

fn load_manifest(
    path: &Path,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
) -> Result<ProjectManifest, String> {
    let Some(manifest) = load_json(path, PROJECT_MANIFEST_LIMIT_BYTES, "project manifest")? else {
        return Ok(ProjectManifest::empty(project_id));
    };
    validate_manifest(&manifest, project_id, allowed_worktree_ids)?;
    validate_record_metadata(
        path.parent()
            .expect("a project manifest always has a project directory")
            .join(RECORDS_DIRECTORY)
            .as_path(),
        &manifest,
    )?;
    Ok(manifest)
}

fn save_manifest(
    path: &Path,
    manifest: &ProjectManifest,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
) -> Result<(), String> {
    validate_manifest(manifest, project_id, allowed_worktree_ids)?;
    let bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|_| unavailable("manifest cannot be encoded"))?;
    if bytes.len() as u64 > PROJECT_MANIFEST_LIMIT_BYTES {
        return Err(unavailable("project manifest exceeds its byte limit"));
    }
    atomic_write(path, &bytes).map_err(|_| unavailable("project manifest cannot be replaced"))
}

fn validate_record_metadata(records: &Path, manifest: &ProjectManifest) -> Result<(), String> {
    for (file_name, expected_length) in manifest
        .drafts
        .iter()
        .map(|draft| (&draft.file_name, draft.record_bytes))
        .chain(
            manifest
                .review_ledgers
                .iter()
                .map(|review| (&review.file_name, review.record_bytes)),
        )
    {
        let metadata = std::fs::symlink_metadata(records.join(file_name))
            .map_err(|_| unavailable("referenced record is unavailable"))?;
        if !metadata.file_type().is_file() || metadata.len() != expected_length {
            return Err(unavailable("referenced record metadata is invalid"));
        }
    }
    Ok(())
}

fn load_draft(
    records: &Path,
    pointer: &DraftPointer,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
) -> Result<DurableFileDraft, String> {
    let draft: DurableFileDraft = load_required_json(
        &records.join(&pointer.file_name),
        DRAFT_RECORD_LIMIT_BYTES as u64,
        "draft record",
    )?;
    let bytes = validate_draft(&draft, project_id, allowed_worktree_ids)?;
    if draft.project_id != pointer.project_id
        || draft.worktree_id != pointer.worktree_id
        || draft.relative_path != pointer.relative_path
        || bytes.len() as u64 != pointer.record_bytes
        || draft.text.len() as u64 != pointer.payload_bytes
    {
        return Err(unavailable("draft record does not match its manifest"));
    }
    Ok(draft)
}

fn load_review(
    records: &Path,
    pointer: &ReviewPointer,
    project_id: &str,
    allowed_worktree_ids: &HashSet<String>,
) -> Result<DurableReviewLedger, String> {
    let ledger: DurableReviewLedger = load_required_json(
        &records.join(&pointer.file_name),
        REVIEW_LEDGER_LIMIT_BYTES as u64,
        "review record",
    )?;
    let bytes = validate_review(&ledger, project_id, allowed_worktree_ids)?;
    if ledger.project_id != pointer.project_id
        || ledger.worktree_id != pointer.worktree_id
        || bytes.len() as u64 != pointer.record_bytes
    {
        return Err(unavailable("review record does not match its manifest"));
    }
    Ok(ledger)
}

fn load_required_json<T: DeserializeOwned>(
    path: &Path,
    limit: u64,
    kind: &str,
) -> Result<T, String> {
    load_json(path, limit, kind)?.ok_or_else(|| unavailable("referenced record is missing"))
}

fn load_json<T: DeserializeOwned>(
    path: &Path,
    limit: u64,
    kind: &str,
) -> Result<Option<T>, String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(unavailable(&format!("{kind} metadata cannot be read"))),
    };
    if !metadata.file_type().is_file() || metadata.len() > limit {
        return Err(unavailable(&format!("{kind} exceeds its boundary")));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|file| file.take(limit.saturating_add(1)).read_to_end(&mut bytes))
        .map_err(|_| unavailable(&format!("{kind} cannot be read")))?;
    if bytes.len() as u64 > limit {
        return Err(unavailable(&format!("{kind} exceeds its byte limit")));
    }
    serde_json::from_slice(&bytes)
        .map(Some)
        .map_err(|_| unavailable(&format!("{kind} JSON is invalid")))
}

fn next_revision(revision: u64) -> Result<u64, String> {
    revision
        .checked_add(1)
        .ok_or_else(|| unavailable("revision is exhausted"))
}

fn unavailable(reason: &str) -> String {
    format!("durable state is unavailable: {reason}")
}
