mod persistence;
mod resolve;

use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::document::{Document, SourceRange};

pub use persistence::MAX_REVIEW_BYTES;

const FORMAT_VERSION: u32 = 1;
const MAX_COMMENTS: usize = 1_000;
const MAX_COMMENT_BYTES: usize = 16 * 1024;
const MAX_EXACT_BYTES: usize = 64 * 1024;
const CONTEXT_BYTES: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewComment {
    pub id: String,
    pub path: String,
    pub comment: String,
    pub anchor: ReviewAnchor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReviewAnchor {
    pub revision: String,
    pub start: usize,
    pub end: usize,
    pub exact: String,
    pub prefix: String,
    pub suffix: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnchorState {
    Attached(SourceRange),
    Detached,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ReviewFile {
    version: u32,
    comments: Vec<ReviewComment>,
}

#[derive(Debug, Clone)]
pub struct ReviewStore {
    root: PathBuf,
    file: ReviewFile,
}

#[derive(Debug, Error)]
pub enum ReviewError {
    #[error("review I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("review file is larger than {MAX_REVIEW_BYTES} bytes")]
    TooLarge,
    #[error("review file is malformed: {0}")]
    Malformed(#[from] serde_json::Error),
    #[error("unsupported review file version {0}")]
    UnsupportedVersion(u32),
    #[error("review file contains invalid or excessive data")]
    InvalidData,
    #[error("review path must be a normal project-relative UTF-8 path")]
    InvalidPath,
    #[error("a review requires a non-empty exact source selection")]
    EmptySelection,
    #[error("review comment is empty or larger than {MAX_COMMENT_BYTES} bytes")]
    InvalidComment,
    #[error("review store already contains {MAX_COMMENTS} comments")]
    TooManyComments,
    #[error("the .zd review directory or file is a symbolic link")]
    SymbolicLink,
}

impl ReviewStore {
    pub fn open(root: impl AsRef<Path>) -> Result<Self, ReviewError> {
        let root = std::fs::canonicalize(root)?;
        if !root.is_dir() {
            return Err(ReviewError::InvalidPath);
        }
        let file = persistence::load(&root)?;
        validate_file(&file)?;
        Ok(Self { root, file })
    }

    pub fn comments(&self) -> &[ReviewComment] {
        &self.file.comments
    }

    pub fn comment(&self, id: &str) -> Option<&ReviewComment> {
        self.file.comments.iter().find(|comment| comment.id == id)
    }

    pub fn add_comment(
        &mut self,
        path: &Path,
        document: &Document,
        comment: &str,
    ) -> Result<&str, ReviewError> {
        let path = valid_relative_path(path)?;
        if comment.is_empty() || comment.len() > MAX_COMMENT_BYTES {
            return Err(ReviewError::InvalidComment);
        }
        if self.file.comments.len() >= MAX_COMMENTS {
            return Err(ReviewError::TooManyComments);
        }
        let range = document.selection();
        if range.is_empty() {
            return Err(ReviewError::EmptySelection);
        }
        let text = document.text();
        let exact = text
            .get(range.start..range.end)
            .ok_or(ReviewError::InvalidData)?;
        if exact.len() > MAX_EXACT_BYTES {
            return Err(ReviewError::InvalidData);
        }
        let id = next_id(&self.file.comments);
        let prefix_start = floor_char_boundary(&text, range.start.saturating_sub(CONTEXT_BYTES));
        let suffix_end = ceil_char_boundary(
            &text,
            range.end.saturating_add(CONTEXT_BYTES).min(text.len()),
        );
        self.file.comments.push(ReviewComment {
            id,
            path,
            comment: comment.to_string(),
            anchor: ReviewAnchor {
                revision: revision(&text),
                start: range.start,
                end: range.end,
                exact: exact.to_string(),
                prefix: text[prefix_start..range.start].to_string(),
                suffix: text[range.end..suffix_end].to_string(),
            },
        });
        Ok(&self.file.comments.last().expect("comment was appended").id)
    }

    pub fn resolve(&self, comment: &ReviewComment, document: &Document) -> AnchorState {
        resolve::resolve(comment, &document.text())
    }

    pub fn save(&self) -> Result<(), ReviewError> {
        persistence::save(&self.root, &self.file)
    }
}

fn validate_file(file: &ReviewFile) -> Result<(), ReviewError> {
    if file.version != FORMAT_VERSION {
        return Err(ReviewError::UnsupportedVersion(file.version));
    }
    if file.comments.len() > MAX_COMMENTS {
        return Err(ReviewError::InvalidData);
    }
    for comment in &file.comments {
        valid_relative_path(Path::new(&comment.path))?;
        if comment.id.is_empty()
            || comment.comment.is_empty()
            || comment.comment.len() > MAX_COMMENT_BYTES
            || comment.anchor.exact.is_empty()
            || comment.anchor.exact.len() > MAX_EXACT_BYTES
            || comment.anchor.start > comment.anchor.end
            || comment.anchor.end.saturating_sub(comment.anchor.start) != comment.anchor.exact.len()
            || comment.anchor.prefix.len() > CONTEXT_BYTES
            || comment.anchor.suffix.len() > CONTEXT_BYTES
        {
            return Err(ReviewError::InvalidData);
        }
    }
    Ok(())
}

fn valid_relative_path(path: &Path) -> Result<String, ReviewError> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(ReviewError::InvalidPath);
    }
    path.to_str()
        .map(ToOwned::to_owned)
        .ok_or(ReviewError::InvalidPath)
}

fn next_id(comments: &[ReviewComment]) -> String {
    let mut number = comments.len() + 1;
    loop {
        let candidate = format!("review-{number:06}");
        if comments.iter().all(|comment| comment.id != candidate) {
            return candidate;
        }
        number += 1;
    }
}

fn revision(text: &str) -> String {
    blake3::hash(text.as_bytes()).to_hex().to_string()
}

fn floor_char_boundary(text: &str, mut byte: usize) -> usize {
    while !text.is_char_boundary(byte) {
        byte -= 1;
    }
    byte
}

fn ceil_char_boundary(text: &str, mut byte: usize) -> usize {
    while !text.is_char_boundary(byte) {
        byte += 1;
    }
    byte
}
