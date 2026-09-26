use std::collections::HashSet;
use std::path::Path;

use super::validation::valid_record_name;
use super::{unavailable, ProjectManifest};

const CLEANUP_SCAN_LIMIT: usize = 2048;

pub(super) fn fresh_record_name(records: &Path, kind: &str) -> Result<String, String> {
    for _ in 0..8 {
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|_| unavailable("random record identity failed"))?;
        let file_name = format!("{kind}-{}.json", hexadecimal(&random));
        if !records.join(&file_name).exists() {
            return Ok(file_name);
        }
    }
    Err(unavailable("random record identity collision"))
}

fn hexadecimal(bytes: &[u8]) -> String {
    use std::fmt::Write as _;

    let mut encoded = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        write!(&mut encoded, "{byte:02x}").expect("writing to a string cannot fail");
    }
    encoded
}

/// Best-effort cleanup runs only after the new manifest is durable. Failure is
/// safe because unreferenced files are never discovered through directory scans.
pub(super) fn cleanup_records(records: &Path, manifest: &ProjectManifest) {
    let referenced = manifest
        .drafts
        .iter()
        .map(|draft| draft.file_name.as_str())
        .chain(
            manifest
                .review_ledgers
                .iter()
                .map(|review| review.file_name.as_str()),
        )
        .collect::<HashSet<_>>();
    let Ok(entries) = std::fs::read_dir(records) else {
        return;
    };
    for entry in entries.take(CLEANUP_SCAN_LIMIT).flatten() {
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        let stale_record = (valid_record_name(name, "draft") || valid_record_name(name, "review"))
            && !referenced.contains(name);
        let stale_temporary = name.starts_with('.') && name.ends_with(".tmp");
        if stale_record || stale_temporary {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}
