use ropey::Rope;
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TextPoint {
    pub line: usize,
    pub scalar_column: usize,
    pub grapheme_column: usize,
    pub cell_column: usize,
}

pub(super) fn point_at(rope: &Rope, byte: usize) -> TextPoint {
    let line = rope.byte_to_line(byte);
    let line_start = rope.line_to_byte(line);
    let within_line = rope.byte_slice(line_start..byte).to_string();
    TextPoint {
        line,
        scalar_column: within_line.chars().count(),
        grapheme_column: within_line.graphemes(true).count(),
        cell_column: UnicodeWidthStr::width(within_line.as_str()),
    }
}

pub(super) fn byte_at(rope: &Rope, wanted_line: usize, grapheme_column: usize) -> Option<usize> {
    let start = rope.try_line_to_byte(wanted_line).ok()?;
    let line = rope.get_line(wanted_line)?.to_string();
    let line = line.trim_end_matches(['\r', '\n']);
    if grapheme_column == line.graphemes(true).count() {
        return Some(start + line.len());
    }
    line.grapheme_indices(true)
        .nth(grapheme_column)
        .map(|(offset, _)| start + offset)
}
