use std::collections::HashSet;
use std::path::{Component, Path};

use serde_json::Value;

use super::{
    unavailable, PreferencesRecord, ProjectManifest, PROJECT_MANIFEST_LIMIT_BYTES,
    STORAGE_SCHEMA_VERSION,
};
use crate::durable::{DurableFileDraft, DurableReviewLedger, DurableStateScope};
use crate::EDITABLE_FILE_LIMIT_BYTES;

pub(super) const PREFERENCES_LIMIT_BYTES: usize = 1024 * 1024;
pub(super) const WORKBENCH_LIMIT_BYTES: usize = 1024 * 1024;
const RECORD_ENVELOPE_ALLOWANCE_BYTES: usize = 64 * 1024;
pub(super) const DRAFT_RECORD_LIMIT_BYTES: usize =
    EDITABLE_FILE_LIMIT_BYTES as usize + RECORD_ENVELOPE_ALLOWANCE_BYTES;
pub(super) const REVIEW_LEDGER_LIMIT_BYTES: usize = 1024 * 1024;
const MAX_DRAFTS: usize = 256;
const MAX_REVIEW_LEDGERS: usize = 256;
const MAX_REVIEW_COMMENTS: usize = 4096;
const MAX_DRAFT_TOTAL_BYTES: u64 = 64 * 1024 * 1024;
const MAX_REVIEW_TOTAL_BYTES: u64 = 16 * 1024 * 1024;
const PATH_LIMIT_BYTES: usize = 32 * 1024;
const COMMENT_ID_LIMIT_BYTES: usize = 128;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

pub(super) fn validate_preferences(preferences: &PreferencesRecord) -> Result<(), String> {
    if preferences.schema_version != STORAGE_SCHEMA_VERSION {
        return Err(unavailable("preferences schema is unsupported"));
    }
    if let Some(record) = &preferences.record {
        validate_versioned_json(record, &[1], PREFERENCES_LIMIT_BYTES, "preferences")?;
    }
    Ok(())
}

pub(super) fn validate_manifest(
    manifest: &ProjectManifest,
    project_id: &str,
    scope: &DurableStateScope,
) -> Result<(), String> {
    if manifest.schema_version != STORAGE_SCHEMA_VERSION || manifest.project_id != project_id {
        return Err(unavailable("project manifest schema or scope is invalid"));
    }
    if let Some(workbench) = &manifest.workbench {
        validate_versioned_json(workbench, &[1, 2], WORKBENCH_LIMIT_BYTES, "workbench")?;
    }
    if manifest.drafts.len() > MAX_DRAFTS || manifest.review_ledgers.len() > MAX_REVIEW_LEDGERS {
        return Err(unavailable("project record count exceeds its limit"));
    }

    let mut draft_keys = HashSet::new();
    let mut record_files = HashSet::new();
    let mut draft_total = 0_u64;
    for draft in &manifest.drafts {
        validate_remembered_scope(&draft.project_id, &draft.worktree_id, scope)?;
        validate_relative_path(&draft.relative_path)?;
        if !valid_record_name(&draft.file_name, "draft")
            || !record_files.insert(draft.file_name.as_str())
            || !draft_keys.insert((
                draft.project_id.as_str(),
                draft.worktree_id.as_str(),
                draft.relative_path.as_str(),
            ))
            || draft.record_bytes as usize > DRAFT_RECORD_LIMIT_BYTES
            || draft.payload_bytes > EDITABLE_FILE_LIMIT_BYTES
        {
            return Err(unavailable("draft manifest entry is invalid"));
        }
        draft_total = draft_total
            .checked_add(draft.payload_bytes)
            .ok_or_else(|| unavailable("draft total overflowed"))?;
    }
    if draft_total > MAX_DRAFT_TOTAL_BYTES {
        return Err(unavailable("draft total exceeds its limit"));
    }

    let mut review_keys = HashSet::new();
    let mut review_total = 0_u64;
    for review in &manifest.review_ledgers {
        validate_remembered_scope(&review.project_id, &review.worktree_id, scope)?;
        if !valid_record_name(&review.file_name, "review")
            || !record_files.insert(review.file_name.as_str())
            || !review_keys.insert((review.project_id.as_str(), review.worktree_id.as_str()))
            || review.record_bytes as usize > REVIEW_LEDGER_LIMIT_BYTES
        {
            return Err(unavailable("review manifest entry is invalid"));
        }
        review_total = review_total
            .checked_add(review.record_bytes)
            .ok_or_else(|| unavailable("review total overflowed"))?;
    }
    if review_total > MAX_REVIEW_TOTAL_BYTES {
        return Err(unavailable("review total exceeds its limit"));
    }

    let encoded =
        serde_json::to_vec(manifest).map_err(|_| unavailable("manifest cannot be encoded"))?;
    if encoded.len() as u64 > PROJECT_MANIFEST_LIMIT_BYTES {
        return Err(unavailable("project manifest exceeds its byte limit"));
    }
    Ok(())
}

pub(super) fn validate_versioned_json(
    record: &Value,
    supported_versions: &[u64],
    limit: usize,
    kind: &str,
) -> Result<(), String> {
    let version = record
        .as_object()
        .and_then(|object| object.get("schemaVersion"))
        .and_then(Value::as_u64);
    if !version.is_some_and(|version| supported_versions.contains(&version)) {
        return Err(unavailable(&format!("{kind} schema is unsupported")));
    }
    let bytes = serde_json::to_vec(record)
        .map_err(|_| unavailable(&format!("{kind} cannot be encoded")))?;
    if bytes.len() > limit {
        return Err(unavailable(&format!("{kind} exceeds its byte limit")));
    }
    Ok(())
}

pub(super) fn validate_draft(
    draft: &DurableFileDraft,
    scope: &DurableStateScope,
) -> Result<Vec<u8>, String> {
    validate_draft_record(draft, scope, false)
}

fn validate_draft_record(
    draft: &DurableFileDraft,
    scope: &DurableStateScope,
    stored: bool,
) -> Result<Vec<u8>, String> {
    if draft.schema_version != 1 || draft.updated_at > MAX_SAFE_INTEGER {
        return Err(unavailable("draft schema or timestamp is invalid"));
    }
    validate_record_scope(&draft.project_id, &draft.worktree_id, scope, stored)?;
    validate_relative_path(&draft.relative_path)?;
    if draft.text.len() as u64 > EDITABLE_FILE_LIMIT_BYTES {
        return Err(unavailable("draft payload exceeds its byte limit"));
    }
    let bytes = serde_json::to_vec(draft).map_err(|_| unavailable("draft cannot be encoded"))?;
    if bytes.len() > DRAFT_RECORD_LIMIT_BYTES {
        return Err(unavailable("draft record exceeds its byte limit"));
    }
    Ok(bytes)
}

pub(super) fn validate_stored_draft(
    draft: &DurableFileDraft,
    scope: &DurableStateScope,
) -> Result<Vec<u8>, String> {
    validate_draft_record(draft, scope, true)
}

pub(super) fn validate_review(
    ledger: &DurableReviewLedger,
    scope: &DurableStateScope,
) -> Result<Vec<u8>, String> {
    validate_review_record(ledger, scope, false)
}

fn validate_review_record(
    ledger: &DurableReviewLedger,
    scope: &DurableStateScope,
    stored: bool,
) -> Result<Vec<u8>, String> {
    if ledger.schema_version != 1 || ledger.comments.len() > MAX_REVIEW_COMMENTS {
        return Err(unavailable("review schema or comment count is invalid"));
    }
    validate_record_scope(&ledger.project_id, &ledger.worktree_id, scope, stored)?;
    let mut comment_ids = HashSet::new();
    for comment in &ledger.comments {
        if comment.id.is_empty()
            || comment.id.len() > COMMENT_ID_LIMIT_BYTES
            || !comment_ids.insert(comment.id.as_str())
            || comment.start_line == 0
            || comment.end_line < comment.start_line
            || comment.end_line > MAX_SAFE_INTEGER
        {
            return Err(unavailable("review comment identity or lines are invalid"));
        }
        validate_relative_path(&comment.relative)?;
    }
    let bytes =
        serde_json::to_vec(ledger).map_err(|_| unavailable("review ledger cannot be encoded"))?;
    if bytes.len() > REVIEW_LEDGER_LIMIT_BYTES {
        return Err(unavailable("review ledger exceeds its byte limit"));
    }
    Ok(bytes)
}

pub(super) fn validate_stored_review(
    ledger: &DurableReviewLedger,
    scope: &DurableStateScope,
) -> Result<Vec<u8>, String> {
    validate_review_record(ledger, scope, true)
}

pub(super) fn validate_scope(
    requested_project_id: &str,
    requested_worktree_id: &str,
    scope: &DurableStateScope,
) -> Result<(), String> {
    if !valid_hex_id(requested_project_id, "project")
        || !valid_worktree_id(requested_worktree_id)
        || !scope.allows(requested_project_id, requested_worktree_id)
    {
        return Err(unavailable("record scope is not active"));
    }
    Ok(())
}

fn validate_remembered_scope(
    requested_project_id: &str,
    requested_worktree_id: &str,
    scope: &DurableStateScope,
) -> Result<(), String> {
    if !valid_hex_id(requested_project_id, "project")
        || !valid_worktree_id(requested_worktree_id)
        || !scope.remembers(requested_project_id, requested_worktree_id)
    {
        return Err(unavailable("record scope is not remembered"));
    }
    Ok(())
}

fn validate_record_scope(
    requested_project_id: &str,
    requested_worktree_id: &str,
    scope: &DurableStateScope,
    stored: bool,
) -> Result<(), String> {
    if stored {
        validate_remembered_scope(requested_project_id, requested_worktree_id, scope)
    } else {
        validate_scope(requested_project_id, requested_worktree_id, scope)
    }
}

pub(super) fn validate_relative_path(relative_path: &str) -> Result<(), String> {
    let path = Path::new(relative_path);
    if relative_path.is_empty()
        || relative_path.len() > PATH_LIMIT_BYTES
        || path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(unavailable("record path is invalid"));
    }
    Ok(())
}

pub(super) fn validate_project_id(project_id: &str) -> Result<(), String> {
    if valid_hex_id(project_id, "project") {
        Ok(())
    } else {
        Err(unavailable("project identity is invalid"))
    }
}

fn valid_worktree_id(worktree_id: &str) -> bool {
    valid_hex_id(worktree_id, "worktree")
}

fn valid_hex_id(identity: &str, kind: &str) -> bool {
    identity
        .strip_prefix(&format!("{kind}-"))
        .is_some_and(|encoded| {
            encoded.len() == 32
                && encoded
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}

pub(super) fn valid_record_name(file_name: &str, kind: &str) -> bool {
    file_name
        .strip_prefix(&format!("{kind}-"))
        .and_then(|name| name.strip_suffix(".json"))
        .is_some_and(|encoded| {
            encoded.len() == 32
                && encoded
                    .bytes()
                    .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        })
}

#[cfg(test)]
mod tests {
    use super::{validate_manifest, MAX_DRAFTS, MAX_REVIEW_LEDGERS};
    use crate::durable::storage::{DraftPointer, ProjectManifest, ReviewPointer};
    use crate::durable::DurableStateScope;
    use crate::EDITABLE_FILE_LIMIT_BYTES;

    fn id(kind: &str, number: usize) -> String {
        format!("{kind}-{number:032x}")
    }

    fn scope() -> (String, String, DurableStateScope) {
        let project_id = id("project", 1);
        let worktree_id = id("worktree", 2);
        let allowed = DurableStateScope::from_scopes([(project_id.clone(), worktree_id.clone())]);
        (project_id, worktree_id, allowed)
    }

    fn manifest(project_id: &str) -> ProjectManifest {
        ProjectManifest::empty(project_id)
    }

    #[test]
    fn manifest_record_counts_are_hard_limits() {
        let (project_id, worktree_id, allowed) = scope();
        let mut drafts = manifest(&project_id);
        drafts.drafts = (0..=MAX_DRAFTS)
            .map(|index| DraftPointer {
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                relative_path: format!("draft-{index}.md"),
                file_name: format!("draft-{index:032x}.json"),
                record_bytes: 1,
                payload_bytes: 1,
            })
            .collect();
        assert!(validate_manifest(&drafts, &project_id, &allowed)
            .unwrap_err()
            .contains("record count"));

        let mut reviews = manifest(&project_id);
        reviews.review_ledgers = (0..=MAX_REVIEW_LEDGERS)
            .map(|index| ReviewPointer {
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                file_name: format!("review-{index:032x}.json"),
                record_bytes: 1,
            })
            .collect();
        assert!(validate_manifest(&reviews, &project_id, &allowed)
            .unwrap_err()
            .contains("record count"));
    }

    #[test]
    fn aggregate_draft_and_review_payloads_are_bounded() {
        let (project_id, worktree_id, allowed) = scope();
        let mut drafts = manifest(&project_id);
        drafts.drafts = (0..9)
            .map(|index| DraftPointer {
                project_id: project_id.clone(),
                worktree_id: worktree_id.clone(),
                relative_path: format!("draft-{index}.md"),
                file_name: format!("draft-{index:032x}.json"),
                record_bytes: 1,
                payload_bytes: EDITABLE_FILE_LIMIT_BYTES,
            })
            .collect();
        assert!(validate_manifest(&drafts, &project_id, &allowed)
            .unwrap_err()
            .contains("draft total"));

        let mut reviews = manifest(&project_id);
        let review_worktrees = (0..17)
            .map(|index| id("worktree", index + 10))
            .collect::<Vec<_>>();
        let allowed = DurableStateScope::from_scopes(
            review_worktrees
                .iter()
                .cloned()
                .map(|worktree_id| (project_id.clone(), worktree_id)),
        );
        reviews.review_ledgers = review_worktrees
            .into_iter()
            .enumerate()
            .map(|(index, worktree_id)| ReviewPointer {
                project_id: project_id.clone(),
                worktree_id,
                file_name: format!("review-{index:032x}.json"),
                record_bytes: 1024 * 1024,
            })
            .collect();
        assert!(validate_manifest(&reviews, &project_id, &allowed)
            .unwrap_err()
            .contains("review total"));
    }
}
