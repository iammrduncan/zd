use std::ops::Range;

use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};
use unicode_segmentation::UnicodeSegmentation;
use unicode_width::UnicodeWidthStr;

use crate::document::SourceRange;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MappingKind {
    Exact,
    WholeNode,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SourceSpan {
    pub range: SourceRange,
    pub kind: MappingKind,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RenderStyle {
    Body,
    Heading(u8),
    Emphasis,
    Strong,
    Code,
    Quote,
    Link,
    Image,
    Table,
    RawHtml,
    Muted,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderSpan {
    pub text: String,
    pub style: RenderStyle,
    pub source: Option<SourceSpan>,
}

impl RenderSpan {
    pub fn width(&self) -> usize {
        UnicodeWidthStr::width(self.text.as_str())
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RenderRow {
    pub spans: Vec<RenderSpan>,
}

impl RenderRow {
    pub fn plain_text(&self) -> String {
        self.spans.iter().map(|span| span.text.as_str()).collect()
    }

    pub fn width(&self) -> usize {
        self.spans.iter().map(RenderSpan::width).sum()
    }

    fn push(&mut self, text: &str, style: RenderStyle, source: Option<SourceSpan>) {
        if text.is_empty() {
            return;
        }
        if let Some(last) = self.spans.last_mut()
            && last.style == style
            && last.source == source
        {
            last.text.push_str(text);
            return;
        }
        self.spans.push(RenderSpan {
            text: text.to_string(),
            style,
            source,
        });
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderPlan {
    pub revision: u64,
    pub width: u16,
    pub rows: Vec<RenderRow>,
}

impl RenderPlan {
    pub fn plain_text(&self) -> String {
        self.rows
            .iter()
            .map(RenderRow::plain_text)
            .collect::<Vec<_>>()
            .join("\n")
    }

    pub fn source_at(&self, row: usize, cell: u16) -> Option<SourceRange> {
        let row = self.rows.get(row)?;
        let mut start = 0;
        for span in &row.spans {
            let end = start + span.width();
            if usize::from(cell) >= start && usize::from(cell) < end {
                return span.source.map(|source| source.range);
            }
            start = end;
        }
        None
    }
}

pub struct MarkdownView;

impl MarkdownView {
    pub fn render(source: &str, revision: u64, width: u16) -> RenderPlan {
        let mut options = Options::empty();
        options.insert(Options::ENABLE_STRIKETHROUGH);
        options.insert(Options::ENABLE_TABLES);
        options.insert(Options::ENABLE_TASKLISTS);
        let parser = Parser::new_ext(source, options).into_offset_iter();
        let mut builder = Builder::new(source, width.max(1));
        for (event, range) in parser {
            builder.event(event, range);
        }
        builder.finish(revision)
    }
}

struct Builder<'a> {
    source: &'a str,
    width: u16,
    rows: Vec<RenderRow>,
    styles: Vec<RenderStyle>,
    lists: Vec<Option<u64>>,
    destinations: Vec<(String, SourceSpan, bool)>,
    table_cell: usize,
    prefix_pending: bool,
}

impl<'a> Builder<'a> {
    fn new(source: &'a str, width: u16) -> Self {
        Self {
            source,
            width,
            rows: vec![RenderRow::default()],
            styles: vec![RenderStyle::Body],
            lists: Vec::new(),
            destinations: Vec::new(),
            table_cell: 0,
            prefix_pending: false,
        }
    }

    fn event(&mut self, event: Event<'a>, range: Range<usize>) {
        let source = SourceSpan {
            range: SourceRange::new(range.start, range.end),
            kind: MappingKind::WholeNode,
        };
        match event {
            Event::Start(tag) => self.start(tag, source),
            Event::End(tag) => self.end(tag),
            Event::Text(text) => {
                let mapping = self.mapping_for_text(text.as_ref(), source);
                self.text(text.as_ref(), self.style(), Some(mapping));
            }
            Event::Code(text) | Event::InlineMath(text) => {
                self.text(text.as_ref(), RenderStyle::Code, Some(source));
            }
            Event::DisplayMath(text) => {
                self.newline();
                self.text(text.as_ref(), RenderStyle::Code, Some(source));
                self.newline();
            }
            Event::Html(html) | Event::InlineHtml(html) => {
                let mapping = self.mapping_for_text(html.as_ref(), source);
                self.text(html.as_ref(), RenderStyle::RawHtml, Some(mapping));
            }
            Event::FootnoteReference(label) => {
                self.text(&format!("[{label}]"), RenderStyle::Muted, Some(source));
            }
            Event::SoftBreak | Event::HardBreak => self.newline(),
            Event::Rule => {
                self.newline();
                self.text("────────", RenderStyle::Muted, None);
                self.newline();
            }
            Event::TaskListMarker(checked) => self.text(
                if checked { "[x] " } else { "[ ] " },
                RenderStyle::Muted,
                None,
            ),
        }
    }

    fn start(&mut self, tag: Tag<'a>, source: SourceSpan) {
        match tag {
            Tag::Paragraph => self.ensure_block_start(),
            Tag::Heading { level, .. } => {
                self.ensure_block_start();
                self.styles.push(RenderStyle::Heading(heading_level(level)));
            }
            Tag::BlockQuote(_) => {
                self.ensure_block_start();
                self.text("│ ", RenderStyle::Quote, None);
                self.prefix_pending = true;
                self.styles.push(RenderStyle::Quote);
            }
            Tag::CodeBlock(_) => {
                self.ensure_block_start();
                self.styles.push(RenderStyle::Code);
            }
            Tag::HtmlBlock => {
                self.ensure_block_start();
                self.styles.push(RenderStyle::RawHtml);
            }
            Tag::List(first) => {
                self.ensure_block_start();
                self.lists.push(first);
            }
            Tag::Item => {
                self.ensure_line_start();
                let indent = "  ".repeat(self.lists.len().saturating_sub(1));
                self.text(&indent, RenderStyle::Muted, None);
                let marker = match self.lists.last_mut() {
                    Some(Some(number)) => {
                        let marker = format!("{number}. ");
                        *number = number.saturating_add(1);
                        marker
                    }
                    _ => "• ".to_string(),
                };
                self.text(&marker, RenderStyle::Muted, None);
                self.prefix_pending = true;
            }
            Tag::Table(_) => {
                self.ensure_block_start();
                self.styles.push(RenderStyle::Table);
            }
            Tag::TableHead | Tag::TableRow => {
                self.ensure_line_start();
                self.table_cell = 0;
            }
            Tag::TableCell => {
                if self.table_cell > 0 {
                    self.text(" │ ", RenderStyle::Muted, None);
                }
                self.table_cell += 1;
            }
            Tag::Emphasis => self.styles.push(RenderStyle::Emphasis),
            Tag::Strong => self.styles.push(RenderStyle::Strong),
            Tag::Strikethrough | Tag::Subscript | Tag::Superscript => {
                self.styles.push(RenderStyle::Muted);
            }
            Tag::Link { dest_url, .. } => {
                self.styles.push(RenderStyle::Link);
                self.destinations
                    .push((dest_url.into_string(), source, false));
            }
            Tag::Image { dest_url, .. } => {
                self.text("🖼 ", RenderStyle::Image, None);
                self.styles.push(RenderStyle::Image);
                self.destinations
                    .push((dest_url.into_string(), source, true));
            }
            Tag::FootnoteDefinition(label) => {
                self.ensure_block_start();
                self.text(&format!("[{label}] "), RenderStyle::Muted, None);
            }
            Tag::DefinitionList
            | Tag::DefinitionListTitle
            | Tag::DefinitionListDefinition
            | Tag::MetadataBlock(_) => self.ensure_block_start(),
        }
    }

    fn end(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Paragraph | TagEnd::Heading(_) | TagEnd::CodeBlock | TagEnd::HtmlBlock => {
                if !matches!(tag, TagEnd::Paragraph) {
                    self.pop_style();
                }
                self.block_gap();
            }
            TagEnd::BlockQuote(_) => {
                self.pop_style();
                self.block_gap();
            }
            TagEnd::List(_) => {
                self.lists.pop();
                self.block_gap();
            }
            TagEnd::Item | TagEnd::TableHead | TagEnd::TableRow => self.newline(),
            TagEnd::Table => {
                self.pop_style();
                self.block_gap();
            }
            TagEnd::TableCell => {}
            TagEnd::Emphasis
            | TagEnd::Strong
            | TagEnd::Strikethrough
            | TagEnd::Subscript
            | TagEnd::Superscript => self.pop_style(),
            TagEnd::Link | TagEnd::Image => {
                self.pop_style();
                if let Some((destination, source, image)) = self.destinations.pop() {
                    let style = if image {
                        RenderStyle::Image
                    } else {
                        RenderStyle::Link
                    };
                    self.text(&format!(" ({destination})"), style, Some(source));
                }
            }
            TagEnd::FootnoteDefinition
            | TagEnd::DefinitionList
            | TagEnd::DefinitionListTitle
            | TagEnd::DefinitionListDefinition
            | TagEnd::MetadataBlock(_) => self.block_gap(),
        }
    }

    fn mapping_for_text(&self, text: &str, fallback: SourceSpan) -> SourceSpan {
        if self.source.get(fallback.range.start..fallback.range.end) == Some(text) {
            SourceSpan {
                kind: MappingKind::Exact,
                ..fallback
            }
        } else {
            fallback
        }
    }

    fn style(&self) -> RenderStyle {
        *self.styles.last().unwrap_or(&RenderStyle::Body)
    }

    fn pop_style(&mut self) {
        if self.styles.len() > 1 {
            self.styles.pop();
        }
    }

    fn ensure_block_start(&mut self) {
        if self.prefix_pending {
            self.prefix_pending = false;
            return;
        }
        if self.rows.last().is_some_and(|row| !row.spans.is_empty()) {
            self.newline();
        }
    }

    fn ensure_line_start(&mut self) {
        self.ensure_block_start();
    }

    fn block_gap(&mut self) {
        self.newline();
        if self.rows.len() >= 2 && !self.rows[self.rows.len() - 2].spans.is_empty() {
            self.newline();
        }
    }

    fn newline(&mut self) {
        self.prefix_pending = false;
        if self.rows.last().is_some_and(|row| row.spans.is_empty()) {
            return;
        }
        self.rows.push(RenderRow::default());
    }

    fn text(&mut self, text: &str, style: RenderStyle, source: Option<SourceSpan>) {
        for (line_index, line) in text.split('\n').enumerate() {
            if line_index > 0 {
                self.newline();
            }
            for word in line.split_word_bounds() {
                let word_width = UnicodeWidthStr::width(word);
                let is_space = word.chars().all(char::is_whitespace);
                let row_width = self.rows.last().map_or(0, RenderRow::width);
                if row_width > 0 && row_width + word_width > usize::from(self.width) {
                    self.newline();
                    if is_space {
                        continue;
                    }
                }
                for grapheme in word.graphemes(true) {
                    let width = UnicodeWidthStr::width(grapheme);
                    if self.rows.last().is_some_and(|row| {
                        row.width() > 0 && row.width() + width > usize::from(self.width)
                    }) {
                        self.newline();
                    }
                    self.rows
                        .last_mut()
                        .expect("builder always has a row")
                        .push(grapheme, style, source);
                }
            }
        }
    }

    fn finish(mut self, revision: u64) -> RenderPlan {
        while self.rows.len() > 1 && self.rows.last().is_some_and(|row| row.spans.is_empty()) {
            self.rows.pop();
        }
        RenderPlan {
            revision,
            width: self.width,
            rows: self.rows,
        }
    }
}

const fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}
