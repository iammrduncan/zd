mod coordinates;
mod find;
mod save;

use std::collections::VecDeque;
use std::fs;
use std::path::{Path, PathBuf};

use ropey::Rope;
use thiserror::Error;
use unicode_segmentation::UnicodeSegmentation;

pub use coordinates::TextPoint;
pub use find::{FindDirection, FindQuery};

pub const MAX_DOCUMENT_BYTES: usize = 10 * 1024 * 1024;
const MAX_HISTORY_ENTRIES: usize = 256;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceRange {
    pub start: usize,
    pub end: usize,
}

impl SourceRange {
    pub const fn new(start: usize, end: usize) -> Self {
        Self { start, end }
    }

    pub const fn is_empty(self) -> bool {
        self.start == self.end
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MoveDirection {
    Previous,
    Next,
}

#[derive(Debug, Error)]
pub enum DocumentError {
    #[error("document I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("document is larger than the {MAX_DOCUMENT_BYTES}-byte editing limit")]
    TooLarge,
    #[error("document is not valid UTF-8")]
    InvalidUtf8,
    #[error("document contains binary data")]
    Binary,
    #[error("source range is outside the document or not on UTF-8 boundaries")]
    InvalidRange,
    #[error("document has no save path")]
    NoPath,
    #[error("find expression is invalid: {0}")]
    InvalidRegex(#[from] regex::Error),
}

#[derive(Debug, Clone)]
struct HistoryEntry {
    start: usize,
    deleted: String,
    inserted: String,
    before_anchor: usize,
    before_cursor: usize,
    after_anchor: usize,
    after_cursor: usize,
    before_state: u64,
    after_state: u64,
}

#[derive(Debug, Clone)]
pub struct Document {
    text: Rope,
    path: Option<PathBuf>,
    anchor: usize,
    cursor: usize,
    revision: u64,
    next_state: u64,
    current_state: u64,
    saved_state: u64,
    undo: VecDeque<HistoryEntry>,
    redo: Vec<HistoryEntry>,
}

impl Document {
    pub fn new(text: impl AsRef<str>) -> Self {
        Self {
            text: Rope::from_str(text.as_ref()),
            path: None,
            anchor: 0,
            cursor: 0,
            revision: 0,
            next_state: 1,
            current_state: 0,
            saved_state: 0,
            undo: VecDeque::new(),
            redo: Vec::new(),
        }
    }

    pub fn open(path: impl AsRef<Path>) -> Result<Self, DocumentError> {
        let path = path.as_ref();
        if fs::metadata(path)?.len() > MAX_DOCUMENT_BYTES as u64 {
            return Err(DocumentError::TooLarge);
        }
        let bytes = fs::read(path)?;
        if bytes.len() > MAX_DOCUMENT_BYTES {
            return Err(DocumentError::TooLarge);
        }
        if bytes.contains(&0) {
            return Err(DocumentError::Binary);
        }
        let text = std::str::from_utf8(&bytes).map_err(|_| DocumentError::InvalidUtf8)?;
        let mut document = Self::new(text);
        document.path = Some(path.to_path_buf());
        Ok(document)
    }

    pub fn text(&self) -> String {
        self.text.to_string()
    }

    pub fn len_bytes(&self) -> usize {
        self.text.len_bytes()
    }

    pub fn path(&self) -> Option<&Path> {
        self.path.as_deref()
    }

    pub const fn cursor(&self) -> usize {
        self.cursor
    }

    pub fn selection(&self) -> SourceRange {
        SourceRange::new(self.anchor.min(self.cursor), self.anchor.max(self.cursor))
    }

    pub const fn revision(&self) -> u64 {
        self.revision
    }

    pub fn is_dirty(&self) -> bool {
        self.current_state != self.saved_state
    }

    pub fn set_cursor(&mut self, byte: usize) -> Result<(), DocumentError> {
        self.set_cursor_with_selection(byte, false)
    }

    pub fn set_cursor_with_selection(
        &mut self,
        byte: usize,
        extend: bool,
    ) -> Result<(), DocumentError> {
        self.validate_position(byte)?;
        if !extend {
            self.anchor = byte;
        }
        self.cursor = byte;
        Ok(())
    }

    pub fn select(&mut self, range: SourceRange) -> Result<(), DocumentError> {
        self.validate_range(range)?;
        self.anchor = range.start;
        self.cursor = range.end;
        Ok(())
    }

    pub fn move_cursor(&mut self, direction: MoveDirection, extend: bool) {
        let selection = self.selection();
        let target = if !extend && !selection.is_empty() {
            match direction {
                MoveDirection::Previous => selection.start,
                MoveDirection::Next => selection.end,
            }
        } else {
            let text = self.text();
            match direction {
                MoveDirection::Previous => previous_grapheme(&text, self.cursor),
                MoveDirection::Next => next_grapheme(&text, self.cursor),
            }
        };
        if !extend {
            self.anchor = target;
        }
        self.cursor = target;
    }

    pub fn insert(&mut self, text: &str) -> Result<(), DocumentError> {
        self.replace(self.selection(), text)
    }

    pub fn replace(&mut self, range: SourceRange, text: &str) -> Result<(), DocumentError> {
        self.validate_range(range)?;
        if self.len_bytes() - range.end.saturating_sub(range.start) + text.len()
            > MAX_DOCUMENT_BYTES
        {
            return Err(DocumentError::TooLarge);
        }
        self.apply_edit(range, text, true)
    }

    pub fn backspace(&mut self) -> Result<bool, DocumentError> {
        let selection = self.selection();
        if !selection.is_empty() {
            self.replace(selection, "")?;
            return Ok(true);
        }
        if self.cursor == 0 {
            return Ok(false);
        }
        let start = previous_grapheme(&self.text(), self.cursor);
        self.replace(SourceRange::new(start, self.cursor), "")?;
        Ok(true)
    }

    pub fn undo(&mut self) -> bool {
        let Some(entry) = self.undo.pop_back() else {
            return false;
        };
        let range = SourceRange::new(entry.start, entry.start + entry.inserted.len());
        self.apply_without_history(range, &entry.deleted);
        self.anchor = entry.before_anchor;
        self.cursor = entry.before_cursor;
        self.current_state = entry.before_state;
        self.revision = self.revision.saturating_add(1);
        self.redo.push(entry);
        true
    }

    pub fn redo(&mut self) -> bool {
        let Some(entry) = self.redo.pop() else {
            return false;
        };
        let range = SourceRange::new(entry.start, entry.start + entry.deleted.len());
        self.apply_without_history(range, &entry.inserted);
        self.anchor = entry.after_anchor;
        self.cursor = entry.after_cursor;
        self.current_state = entry.after_state;
        self.revision = self.revision.saturating_add(1);
        self.undo.push_back(entry);
        true
    }

    pub fn point_at(&self, byte: usize) -> Result<TextPoint, DocumentError> {
        self.validate_position(byte)?;
        Ok(coordinates::point_at(&self.text, byte))
    }

    pub fn byte_at(&self, line: usize, grapheme_column: usize) -> Option<usize> {
        coordinates::byte_at(&self.text, line, grapheme_column)
    }

    pub fn byte_at_cell(&self, line: usize, cell_column: usize) -> Option<usize> {
        coordinates::byte_at_cell(&self.text, line, cell_column)
    }

    pub fn save(&mut self) -> Result<(), DocumentError> {
        let path = self.path.clone().ok_or(DocumentError::NoPath)?;
        self.save_to(path)
    }

    pub fn save_to(&mut self, path: impl AsRef<Path>) -> Result<(), DocumentError> {
        save::atomic_write(path.as_ref(), self.text().as_bytes())?;
        self.path = Some(path.as_ref().to_path_buf());
        self.saved_state = self.current_state;
        Ok(())
    }

    fn apply_edit(
        &mut self,
        range: SourceRange,
        inserted: &str,
        record: bool,
    ) -> Result<(), DocumentError> {
        self.validate_range(range)?;
        let deleted = self.slice(range);
        let before_anchor = self.anchor;
        let before_cursor = self.cursor;
        let before_state = self.current_state;
        self.apply_without_history(range, inserted);
        let after = range.start + inserted.len();
        self.anchor = after;
        self.cursor = after;
        self.revision = self.revision.saturating_add(1);

        if record {
            let after_state = self.next_state;
            self.next_state = self.next_state.saturating_add(1);
            self.current_state = after_state;
            self.undo.push_back(HistoryEntry {
                start: range.start,
                deleted,
                inserted: inserted.to_string(),
                before_anchor,
                before_cursor,
                after_anchor: after,
                after_cursor: after,
                before_state,
                after_state,
            });
            if self.undo.len() > MAX_HISTORY_ENTRIES {
                self.undo.pop_front();
            }
            self.redo.clear();
        }
        Ok(())
    }

    fn apply_without_history(&mut self, range: SourceRange, inserted: &str) {
        let start = self.text.byte_to_char(range.start);
        let end = self.text.byte_to_char(range.end);
        self.text.remove(start..end);
        self.text.insert(start, inserted);
    }

    fn slice(&self, range: SourceRange) -> String {
        let start = self.text.byte_to_char(range.start);
        let end = self.text.byte_to_char(range.end);
        self.text.slice(start..end).to_string()
    }

    fn validate_position(&self, byte: usize) -> Result<(), DocumentError> {
        if byte > self.len_bytes() {
            return Err(DocumentError::InvalidRange);
        }
        let character = self.text.byte_to_char(byte);
        if self.text.char_to_byte(character) != byte {
            return Err(DocumentError::InvalidRange);
        }
        Ok(())
    }

    fn validate_range(&self, range: SourceRange) -> Result<(), DocumentError> {
        if range.start > range.end {
            return Err(DocumentError::InvalidRange);
        }
        self.validate_position(range.start)?;
        self.validate_position(range.end)
    }
}

fn previous_grapheme(text: &str, byte: usize) -> usize {
    text[..byte]
        .grapheme_indices(true)
        .map(|(index, _)| index)
        .next_back()
        .unwrap_or(0)
}

fn next_grapheme(text: &str, byte: usize) -> usize {
    text[byte..]
        .grapheme_indices(true)
        .nth(1)
        .map(|(index, _)| byte + index)
        .unwrap_or(text.len())
}
