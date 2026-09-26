use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

use crate::app::{App, Focus, HandoffStage, Mode, SidebarMode};
use crate::document::SourceRange;
use crate::markdown::{MarkdownView, RenderStyle};
use crate::workspace::EntryKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Areas {
    pub tree: Option<Rect>,
    pub document: Rect,
    pub status: Rect,
    pub overlay: Option<Rect>,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct DocumentViewport {
    pub row_offset: usize,
    pub cell_offset: usize,
}

pub fn layout(area: Rect, app: &App) -> Areas {
    let vertical = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(1), Constraint::Length(1)])
        .split(area);
    let body = vertical[0];
    let status = vertical[1];
    let (tree, document) = if !app.tree_visible() {
        (None, body)
    } else if area.width < 50 {
        match app.focus() {
            Focus::Tree => (Some(body), Rect::new(body.x, body.y, 0, 0)),
            Focus::Document => (None, body),
        }
    } else {
        let horizontal = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(28), Constraint::Min(1)])
            .split(body);
        (Some(horizontal[0]), horizontal[1])
    };
    let overlay = if app.handoff_stage().is_some() {
        Some(centered(area, 80, area.height.saturating_sub(4).max(5)))
    } else {
        app.prompt().map(|_| centered(area, 70, 3))
    };
    Areas {
        tree,
        document,
        status,
        overlay,
    }
}

pub fn draw(frame: &mut Frame<'_>, app: &App) {
    let areas = layout(frame.area(), app);
    if let Some(area) = areas.tree {
        draw_sidebar(frame, area, app);
    }
    draw_document(frame, areas.document, app);
    draw_status(frame, areas.status, app);
    if let (Some(area), Some(prompt)) = (areas.overlay, app.prompt()) {
        frame.render_widget(Clear, area);
        let text = format!("{}: {}", prompt.label(), prompt.value());
        frame.render_widget(
            Paragraph::new(text).block(Block::default().borders(Borders::ALL).title("Command")),
            area,
        );
    } else if let (Some(area), Some(stage)) = (areas.overlay, app.handoff_stage()) {
        draw_handoff(frame, area, app, stage);
    }
}

fn draw_sidebar(frame: &mut Frame<'_>, area: Rect, app: &App) {
    let selected = app.sidebar_cursor();
    let content = sidebar_content_area(area);
    let offset = sidebar_row_offset(app, content.height);
    let tree = (app.sidebar_mode() == SidebarMode::Tree).then(|| app.tree_view());
    let tree_limited = tree.as_ref().is_some_and(|tree| tree.truncated);
    let items = match app.sidebar_mode() {
        SidebarMode::Tree => tree
            .expect("tree view exists in tree mode")
            .entries
            .into_iter()
            .enumerate()
            .map(|(index, entry)| {
                let marker = match entry.kind {
                    EntryKind::Directory if entry.expanded => "▾ ",
                    EntryKind::Directory => "▸ ",
                    EntryKind::File => "  ",
                };
                let prefix = "  ".repeat(entry.depth);
                sidebar_item(format!("{prefix}{marker}{}", entry.name), index == selected)
            })
            .skip(offset)
            .take(usize::from(content.height))
            .collect::<Vec<_>>(),
        SidebarMode::Search => app
            .search_results()
            .iter()
            .enumerate()
            .map(|(index, result)| {
                sidebar_item(
                    format!(
                        "{}:{} {}",
                        result.path.display(),
                        result.line,
                        result.preview
                    ),
                    index == selected,
                )
            })
            .skip(offset)
            .take(usize::from(content.height))
            .collect(),
        SidebarMode::Review => app
            .active_comments()
            .into_iter()
            .enumerate()
            .map(|(index, review)| {
                let state = match review.state {
                    crate::review::AnchorState::Attached(_) => "attached",
                    crate::review::AnchorState::Detached => "detached",
                };
                sidebar_item(
                    format!("{state} {}", review.comment.comment),
                    index == selected,
                )
            })
            .skip(offset)
            .take(usize::from(content.height))
            .collect(),
    };
    let title = match app.sidebar_mode() {
        SidebarMode::Tree if tree_limited => "Files (limit)",
        SidebarMode::Tree => "Files",
        SidebarMode::Search => "Search",
        SidebarMode::Review => "Reviews",
    };
    frame.render_widget(
        List::new(items).block(Block::default().borders(Borders::RIGHT).title(title)),
        area,
    );
}

fn draw_handoff(frame: &mut Frame<'_>, area: Rect, app: &App, stage: HandoffStage) {
    frame.render_widget(Clear, area);
    match stage {
        HandoffStage::Targets => {
            let items = app
                .handoff_targets()
                .iter()
                .enumerate()
                .map(|(index, target)| {
                    sidebar_item(target.label.clone(), index == app.handoff_cursor())
                })
                .collect::<Vec<_>>();
            frame.render_widget(
                List::new(items).block(
                    Block::default()
                        .borders(Borders::ALL)
                        .title("Choose agent — Enter previews, Esc cancels"),
                ),
                area,
            );
        }
        HandoffStage::Preview => {
            let target = app.handoff_target().map_or(
                "manual delivery — Herdr target unavailable".to_string(),
                |target| format!("target {target} — Enter submits, Esc cancels"),
            );
            let text = app
                .prepared_handoff()
                .map_or_else(String::new, |prepared| sanitize(&prepared.text));
            frame.render_widget(
                Paragraph::new(text)
                    .wrap(ratatui::widgets::Wrap { trim: false })
                    .block(Block::default().borders(Borders::ALL).title(target)),
                area,
            );
        }
    }
}

fn sidebar_item(text: String, selected: bool) -> ListItem<'static> {
    let style = if selected {
        Style::default()
            .bg(Color::DarkGray)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default()
    };
    ListItem::new(Line::styled(sanitize(&text), style))
}

fn draw_document(frame: &mut Frame<'_>, area: Rect, app: &App) {
    let title = sanitize(
        &app.active_path()
            .map_or_else(|| "No file".to_string(), |path| path.display().to_string()),
    );
    let block = Block::default().title(title).borders(Borders::BOTTOM);
    let inner = document_content_area(area);
    frame.render_widget(block, area);
    let Some(document) = app.document() else {
        frame.render_widget(Paragraph::new("Open a file from the tree"), inner);
        return;
    };
    let viewport = document_viewport(app, inner);
    match app.mode() {
        Mode::Edit => {
            let lines = edit_lines(&document.text(), document.selection())
                .into_iter()
                .skip(viewport.row_offset)
                .take(usize::from(inner.height))
                .collect::<Vec<_>>();
            frame.render_widget(
                Paragraph::new(lines).scroll((0, viewport.cell_offset as u16)),
                inner,
            );
            if app.focus() == Focus::Document
                && app.prompt().is_none()
                && let Ok(point) = document.point_at(document.cursor())
                && point.line >= viewport.row_offset
                && point.line - viewport.row_offset < usize::from(inner.height)
                && point.cell_column >= viewport.cell_offset
                && point.cell_column - viewport.cell_offset < usize::from(inner.width)
            {
                frame.set_cursor_position((
                    inner.x + (point.cell_column - viewport.cell_offset) as u16,
                    inner.y + (point.line - viewport.row_offset) as u16,
                ));
            }
        }
        Mode::Read => {
            let plan = MarkdownView::render(&document.text(), document.revision(), inner.width);
            let selection = document.selection();
            let lines = plan
                .rows
                .into_iter()
                .skip(viewport.row_offset)
                .take(usize::from(inner.height))
                .map(|row| {
                    Line::from(
                        row.spans
                            .into_iter()
                            .map(|span| {
                                let selected = span.source.is_some_and(|source| {
                                    intersects(source.range, selection) && !selection.is_empty()
                                });
                                Span::styled(
                                    sanitize(&span.text),
                                    selected_style(read_style(span.style), selected),
                                )
                            })
                            .collect::<Vec<_>>(),
                    )
                })
                .collect::<Vec<_>>();
            frame.render_widget(Paragraph::new(lines), inner);
        }
    }
}

pub fn document_content_area(area: Rect) -> Rect {
    Block::default()
        .title("file")
        .borders(Borders::BOTTOM)
        .inner(area)
}

pub fn document_viewport(app: &App, area: Rect) -> DocumentViewport {
    let Some(document) = app.document() else {
        return DocumentViewport::default();
    };
    match app.mode() {
        Mode::Edit => document.point_at(document.cursor()).map_or_else(
            |_| DocumentViewport::default(),
            |point| DocumentViewport {
                row_offset: point
                    .line
                    .saturating_sub(usize::from(area.height.saturating_sub(1))),
                cell_offset: point
                    .cell_column
                    .saturating_sub(usize::from(area.width.saturating_sub(1))),
            },
        ),
        Mode::Read => {
            let cursor = document.cursor();
            let plan = MarkdownView::render(&document.text(), document.revision(), area.width);
            let row = plan
                .rows
                .iter()
                .position(|row| {
                    row.spans.iter().any(|span| {
                        span.source.is_some_and(|source| {
                            source.range.start <= cursor && cursor <= source.range.end
                        })
                    })
                })
                .unwrap_or(0);
            DocumentViewport {
                row_offset: row.saturating_sub(usize::from(area.height.saturating_sub(1))),
                cell_offset: 0,
            }
        }
    }
}

pub fn sidebar_content_area(area: Rect) -> Rect {
    Block::default()
        .title("sidebar")
        .borders(Borders::RIGHT)
        .inner(area)
}

pub fn sidebar_row_offset(app: &App, height: u16) -> usize {
    app.sidebar_cursor()
        .saturating_sub(usize::from(height.saturating_sub(1)))
}

fn edit_lines(text: &str, selection: SourceRange) -> Vec<Line<'static>> {
    let mut offset = 0;
    let mut lines = Vec::new();
    for raw_line in text.split_inclusive('\n') {
        let line = raw_line.trim_end_matches(['\r', '\n']);
        let line_range = SourceRange::new(offset, offset + line.len());
        let selected_start = selection.start.max(line_range.start).min(line_range.end);
        let selected_end = selection.end.max(line_range.start).min(line_range.end);
        let relative_start = selected_start - line_range.start;
        let relative_end = selected_end - line_range.start;
        let spans = vec![
            Span::raw(sanitize(&line[..relative_start])),
            Span::styled(
                sanitize(&line[relative_start..relative_end]),
                selected_style(Style::default(), relative_start < relative_end),
            ),
            Span::raw(sanitize(&line[relative_end..])),
        ];
        lines.push(Line::from(spans));
        offset += raw_line.len();
    }
    if lines.is_empty() {
        lines.push(Line::default());
    }
    lines
}

const fn intersects(left: SourceRange, right: SourceRange) -> bool {
    left.start < right.end && right.start < left.end
}

fn selected_style(style: Style, selected: bool) -> Style {
    if selected {
        style.fg(Color::White).bg(Color::Blue)
    } else {
        style
    }
}

fn draw_status(frame: &mut Frame<'_>, area: Rect, app: &App) {
    let mode = match app.mode() {
        Mode::Edit => "EDIT",
        Mode::Read => "READ",
    };
    let dirty = app.document().is_some_and(|document| document.is_dirty());
    let path = app
        .active_path()
        .map_or_else(|| "no file".to_string(), |path| path.display().to_string());
    let marker = if dirty { " [+]" } else { "" };
    frame.render_widget(
        Paragraph::new(sanitize(&format!(
            " {mode}  {path}{marker}  {}",
            app.status()
        )))
        .style(Style::default().fg(Color::Black).bg(Color::Gray)),
        area,
    );
}

fn read_style(style: RenderStyle) -> Style {
    match style {
        RenderStyle::Heading(_) => Style::default().add_modifier(Modifier::BOLD),
        RenderStyle::Emphasis => Style::default().add_modifier(Modifier::ITALIC),
        RenderStyle::Strong => Style::default().add_modifier(Modifier::BOLD),
        RenderStyle::Code => Style::default().fg(Color::Cyan),
        RenderStyle::Quote | RenderStyle::Muted | RenderStyle::RawHtml => {
            Style::default().fg(Color::DarkGray)
        }
        RenderStyle::Link | RenderStyle::Image => Style::default().fg(Color::Blue),
        RenderStyle::Table => Style::default().fg(Color::Green),
        RenderStyle::Body => Style::default(),
    }
}

fn sanitize(text: &str) -> String {
    text.chars()
        .map(|character| {
            if character.is_control() && character != '\t' {
                ' '
            } else {
                character
            }
        })
        .collect()
}

fn centered(area: Rect, percent_x: u16, height: u16) -> Rect {
    let width = area
        .width
        .saturating_mul(percent_x)
        .saturating_div(100)
        .max(1);
    let height = height.min(area.height).max(1);
    Rect::new(
        area.x + area.width.saturating_sub(width) / 2,
        area.y + area.height.saturating_sub(height) / 2,
        width,
        height,
    )
}
