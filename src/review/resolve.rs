use crate::document::SourceRange;

use super::{AnchorState, ReviewComment, revision};

pub(super) fn resolve(comment: &ReviewComment, text: &str) -> AnchorState {
    let anchor = &comment.anchor;
    let stored = SourceRange::new(anchor.start, anchor.end);
    if revision(text) == anchor.revision && at_range(text, stored, &anchor.exact) {
        return AnchorState::Attached(stored);
    }
    if at_range(text, stored, &anchor.exact) {
        return AnchorState::Attached(stored);
    }

    let contextual = format!("{}{}{}", anchor.prefix, anchor.exact, anchor.suffix);
    if let Some(offset) = unique_offset(text, &contextual) {
        let start = offset + anchor.prefix.len();
        return AnchorState::Attached(SourceRange::new(start, start + anchor.exact.len()));
    }
    if let Some(start) = unique_offset(text, &anchor.exact) {
        return AnchorState::Attached(SourceRange::new(start, start + anchor.exact.len()));
    }
    AnchorState::Detached
}

fn at_range(text: &str, range: SourceRange, exact: &str) -> bool {
    text.get(range.start..range.end) == Some(exact)
}

fn unique_offset(text: &str, needle: &str) -> Option<usize> {
    if needle.is_empty() {
        return None;
    }
    let mut matches = text.match_indices(needle);
    let (offset, _) = matches.next()?;
    matches.next().is_none().then_some(offset)
}
