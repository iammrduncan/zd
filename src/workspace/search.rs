use std::fs;
use std::path::PathBuf;

use regex::RegexBuilder;

use crate::document::{MAX_DOCUMENT_BYTES, SourceRange};

use super::{EntryKind, Workspace, WorkspaceError};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResult {
    pub path: PathBuf,
    pub line: usize,
    pub range: SourceRange,
    pub preview: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchResults {
    pub matches: Vec<SearchResult>,
    pub truncated: bool,
    pub unreadable: usize,
}

impl Workspace {
    pub fn search(
        &self,
        query: &str,
        case_sensitive: bool,
    ) -> Result<SearchResults, WorkspaceError> {
        self.search_with_limit(query, case_sensitive, super::MAX_SEARCH_MATCHES)
    }

    pub fn search_with_limit(
        &self,
        query: &str,
        case_sensitive: bool,
        limit: usize,
    ) -> Result<SearchResults, WorkspaceError> {
        if query.is_empty() {
            return Err(WorkspaceError::EmptyQuery);
        }
        let expression = RegexBuilder::new(&regex::escape(query))
            .case_insensitive(!case_sensitive)
            .build()?;
        let scan = self.scan();
        let mut files = scan
            .entries
            .into_iter()
            .filter(|entry| entry.kind == EntryKind::File)
            .collect::<Vec<_>>();
        files.sort_by(|left, right| {
            left.path
                .to_string_lossy()
                .to_lowercase()
                .cmp(&right.path.to_string_lossy().to_lowercase())
                .then_with(|| left.path.cmp(&right.path))
        });

        let mut matches = Vec::new();
        let mut unreadable = scan.unreadable;
        for entry in files {
            let path = self.root.join(&entry.path);
            let metadata = match fs::metadata(&path) {
                Ok(metadata) => metadata,
                Err(_) => {
                    unreadable = unreadable.saturating_add(1);
                    continue;
                }
            };
            if metadata.len() > MAX_DOCUMENT_BYTES as u64 {
                continue;
            }
            let bytes = match fs::read(path) {
                Ok(bytes) if bytes.len() <= MAX_DOCUMENT_BYTES => bytes,
                Ok(_) => continue,
                Err(_) => {
                    unreadable = unreadable.saturating_add(1);
                    continue;
                }
            };
            if bytes.contains(&0) {
                continue;
            }
            let Ok(text) = std::str::from_utf8(&bytes) else {
                continue;
            };
            let mut line_start = 0;
            for (line_index, line) in text.split_inclusive('\n').enumerate() {
                let display_line = line.strip_suffix('\n').unwrap_or(line);
                for found in expression.find_iter(display_line) {
                    if matches.len() >= limit {
                        return Ok(SearchResults {
                            matches,
                            truncated: true,
                            unreadable,
                        });
                    }
                    matches.push(SearchResult {
                        path: entry.path.clone(),
                        line: line_index + 1,
                        range: SourceRange::new(
                            line_start + found.start(),
                            line_start + found.end(),
                        ),
                        preview: sanitize_preview(display_line),
                    });
                }
                line_start += line.len();
            }
        }
        Ok(SearchResults {
            matches,
            truncated: false,
            unreadable,
        })
    }
}

fn sanitize_preview(line: &str) -> String {
    line.chars()
        .map(|character| {
            if character.is_control() {
                ' '
            } else {
                character
            }
        })
        .collect()
}
