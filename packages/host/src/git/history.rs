use super::status::stable_id;
use super::types::{GitChangeState, GitCommit, GitComparisonEntry, GitHistoryRequest, GitScope};

pub(super) const DEFAULT_HISTORY_PAGE: u16 = 50;
pub(super) const MAX_HISTORY_PAGE: u16 = 200;
pub(super) const MAX_HISTORY_OFFSET: usize = 10_000;
pub(super) const MAX_COMPARISON_ENTRIES: usize = 50_000;

pub(super) struct HistoryCursor {
    pub head: String,
    pub offset: usize,
}

pub(super) fn full_commit_id(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(super) fn page_size(request: &GitHistoryRequest) -> usize {
    request
        .page_size
        .unwrap_or(DEFAULT_HISTORY_PAGE)
        .clamp(1, MAX_HISTORY_PAGE) as usize
}

pub(super) fn parse_cursor(value: &str) -> Result<HistoryCursor, String> {
    let (head, offset) = value
        .split_once(':')
        .ok_or_else(|| "The history cursor is invalid".to_string())?;
    let offset = offset
        .parse::<usize>()
        .map_err(|_| "The history cursor is invalid".to_string())?;
    if !full_commit_id(head) || offset > MAX_HISTORY_OFFSET {
        return Err("The history cursor is invalid".to_string());
    }
    Ok(HistoryCursor {
        head: head.to_ascii_lowercase(),
        offset,
    })
}

pub(super) fn parse_history(bytes: &[u8]) -> Result<Vec<GitCommit>, String> {
    let text = std::str::from_utf8(bytes)
        .map_err(|_| "Git returned history metadata that is not valid UTF-8".to_string())?;
    let mut commits = Vec::new();
    for record in text.split('\u{1e}').filter(|record| !record.is_empty()) {
        let record = record.strip_suffix('\n').unwrap_or(record);
        let fields: Vec<_> = record.splitn(5, '\u{1f}').collect();
        if fields.len() != 5 || !full_commit_id(fields[0]) {
            return Err("Git returned an invalid history record".to_string());
        }
        let parent_ids = if fields[1].is_empty() {
            Vec::new()
        } else {
            fields[1].split(' ').map(str::to_string).collect()
        };
        let authored_at = fields[3]
            .parse::<i64>()
            .map_err(|_| "Git returned an invalid commit time".to_string())?;
        commits.push(GitCommit {
            id: fields[0].to_string(),
            parent_ids,
            author_name: fields[2].to_string(),
            authored_at,
            subject: fields[4].to_string(),
        });
    }
    Ok(commits)
}

fn scoped_path(path: &str, prefix: &str) -> Result<String, String> {
    if prefix.is_empty() {
        return Ok(path.to_string());
    }
    path.strip_prefix(prefix)
        .filter(|relative| !relative.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Git returned a comparison path outside the approved scope".to_string())
}

pub(super) struct ParsedComparison {
    pub entries: Vec<GitComparisonEntry>,
    pub truncated: bool,
}

pub(super) fn parse_comparison(
    bytes: &[u8],
    scope: &GitScope,
    prefix: &str,
    base: &str,
    head: &str,
    output_truncated: bool,
) -> Result<ParsedComparison, String> {
    let mut records: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    if output_truncated && !bytes.ends_with(&[0]) {
        records.pop();
    }
    let mut entries = Vec::new();
    let mut cursor = 0;
    let mut truncated = output_truncated;
    while cursor < records.len() {
        let header = records[cursor];
        cursor += 1;
        if header.is_empty() {
            continue;
        }
        if entries.len() == MAX_COMPARISON_ENTRIES {
            truncated = true;
            break;
        }
        let header = std::str::from_utf8(header)
            .map_err(|_| "Git returned invalid comparison metadata".to_string())?;
        let fields: Vec<_> = header.split_ascii_whitespace().collect();
        if fields.len() != 5 || !fields[0].starts_with(':') {
            return Err("Git returned an invalid comparison record".to_string());
        }
        let status = fields[4].as_bytes().first().copied().unwrap_or_default();
        let first_path = records
            .get(cursor)
            .ok_or_else(|| "Git returned an incomplete comparison record".to_string())?;
        cursor += 1;
        let first_path = std::str::from_utf8(first_path)
            .map_err(|_| "Git returned a path that is not valid UTF-8".to_string())?;
        let (path, previous_path) = if matches!(status, b'R' | b'C') {
            let next_path = records
                .get(cursor)
                .ok_or_else(|| "Git returned an incomplete rename comparison".to_string())?;
            cursor += 1;
            let next_path = std::str::from_utf8(next_path)
                .map_err(|_| "Git returned a path that is not valid UTF-8".to_string())?;
            (
                scoped_path(next_path, prefix)?,
                Some(scoped_path(first_path, prefix)?),
            )
        } else {
            (scoped_path(first_path, prefix)?, None)
        };
        let state = match status {
            b'A' | b'C' => GitChangeState::Added,
            b'D' => GitChangeState::Deleted,
            b'R' => GitChangeState::Renamed,
            _ => GitChangeState::Modified,
        };
        let anchor = previous_path.as_deref().unwrap_or(&path);
        entries.push(GitComparisonEntry {
            id: stable_id(scope, &format!("compare:{base}:{head}"), anchor),
            path,
            previous_path,
            state,
            submodule: fields[0].trim_start_matches(':') == "160000" || fields[1] == "160000",
        });
    }
    entries.sort_by(|left, right| {
        left.path
            .to_ascii_lowercase()
            .cmp(&right.path.to_ascii_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(ParsedComparison { entries, truncated })
}
