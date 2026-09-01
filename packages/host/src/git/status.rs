use super::types::{GitChangeEntry, GitChangeState, GitDelta, GitScope};

pub(super) const MAX_STATUS_ENTRIES: usize = 50_000;

pub(super) struct ParsedStatus {
    pub entries: Vec<GitChangeEntry>,
    pub truncated: bool,
}

fn delta(code: u8) -> Option<GitDelta> {
    match code {
        b'.' | b' ' => None,
        b'A' => Some(GitDelta::Added),
        b'M' => Some(GitDelta::Modified),
        b'D' => Some(GitDelta::Deleted),
        b'R' => Some(GitDelta::Renamed),
        b'C' => Some(GitDelta::Copied),
        b'T' => Some(GitDelta::TypeChanged),
        b'U' => Some(GitDelta::Unmerged),
        _ => None,
    }
}

fn state(index: u8, worktree: u8) -> GitChangeState {
    if index == b'U' || worktree == b'U' {
        GitChangeState::Conflicted
    } else if index == b'R' || worktree == b'R' {
        GitChangeState::Renamed
    } else if index == b'D' || worktree == b'D' {
        GitChangeState::Deleted
    } else if index == b'A' || worktree == b'A' || index == b'C' || worktree == b'C' {
        GitChangeState::Added
    } else {
        GitChangeState::Modified
    }
}

fn scoped_path(path: &str, prefix: &str) -> Result<String, String> {
    if prefix.is_empty() {
        return Ok(path.to_string());
    }
    path.strip_prefix(prefix)
        .filter(|relative| !relative.is_empty())
        .map(str::to_string)
        .ok_or_else(|| "Git returned a path outside the approved worktree scope".to_string())
}

pub(super) fn stable_id(scope: &GitScope, kind: &str, anchor: &str) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for byte in scope
        .project_id
        .bytes()
        .chain([0])
        .chain(scope.worktree_id.bytes())
        .chain([0])
        .chain(kind.bytes())
        .chain([0])
        .chain(anchor.bytes())
    {
        hash ^= u64::from(byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("git-{hash:016x}")
}

fn tracked_entry(
    record: &str,
    field_count: usize,
    scope: &GitScope,
    prefix: &str,
    previous_path: Option<String>,
    conflicted: bool,
) -> Result<GitChangeEntry, String> {
    let fields: Vec<_> = record.splitn(field_count, ' ').collect();
    if fields.len() != field_count {
        return Err("Git returned an incomplete status record".to_string());
    }
    let xy = fields[1].as_bytes();
    if xy.len() != 2 {
        return Err("Git returned an invalid status pair".to_string());
    }
    let submodule = fields[2].starts_with('S');
    let path = scoped_path(fields[field_count - 1], prefix)?;
    let previous_path = previous_path
        .map(|path| scoped_path(&path, prefix))
        .transpose()?;
    let anchor = previous_path.as_deref().unwrap_or(&path);
    Ok(GitChangeEntry {
        id: stable_id(scope, "status", anchor),
        path,
        previous_path,
        state: if conflicted {
            GitChangeState::Conflicted
        } else {
            state(xy[0], xy[1])
        },
        index_state: if conflicted {
            Some(GitDelta::Unmerged)
        } else {
            delta(xy[0])
        },
        worktree_state: if conflicted {
            Some(GitDelta::Unmerged)
        } else {
            delta(xy[1])
        },
        submodule,
    })
}

pub(super) fn parse_status(
    bytes: &[u8],
    scope: &GitScope,
    prefix: &str,
    output_truncated: bool,
) -> Result<ParsedStatus, String> {
    let mut records: Vec<_> = bytes.split(|byte| *byte == 0).collect();
    if output_truncated && !bytes.ends_with(&[0]) {
        records.pop();
    }
    let mut entries = Vec::new();
    let mut cursor = 0;
    let mut truncated = output_truncated;
    while cursor < records.len() {
        let raw = records[cursor];
        cursor += 1;
        if raw.is_empty() {
            continue;
        }
        if entries.len() == MAX_STATUS_ENTRIES {
            truncated = true;
            break;
        }
        let record = std::str::from_utf8(raw)
            .map_err(|_| "Git returned a path that is not valid UTF-8".to_string())?;
        let entry = match raw[0] {
            b'1' => tracked_entry(record, 9, scope, prefix, None, false)?,
            b'2' => {
                let previous = records
                    .get(cursor)
                    .ok_or_else(|| "Git returned an incomplete rename record".to_string())?;
                cursor += 1;
                let previous = std::str::from_utf8(previous)
                    .map_err(|_| "Git returned a path that is not valid UTF-8".to_string())?;
                tracked_entry(record, 10, scope, prefix, Some(previous.to_string()), false)?
            }
            b'u' => tracked_entry(record, 11, scope, prefix, None, true)?,
            b'?' | b'!' if record.len() >= 3 => {
                let path = scoped_path(&record[2..], prefix)?;
                let state = if raw[0] == b'?' {
                    GitChangeState::Untracked
                } else {
                    GitChangeState::Ignored
                };
                GitChangeEntry {
                    id: stable_id(scope, "status", &path),
                    path,
                    previous_path: None,
                    state,
                    index_state: None,
                    worktree_state: None,
                    submodule: false,
                }
            }
            b'#' => continue,
            _ => return Err("Git returned an unsupported status record".to_string()),
        };
        entries.push(entry);
    }
    entries.sort_by(|left, right| {
        left.path
            .to_ascii_lowercase()
            .cmp(&right.path.to_ascii_lowercase())
            .then_with(|| left.path.cmp(&right.path))
    });
    Ok(ParsedStatus { entries, truncated })
}
