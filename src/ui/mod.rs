use ratatui::Frame;
use ratatui::layout::{Constraint, Direction, Layout, Rect};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Clear, List, ListItem, Paragraph};

use crate::app::{App, Focus, Mode, SidebarMode};
use crate::markdown::{MarkdownView, RenderStyle};
use crate::workspace::EntryKind;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Areas {
    pub tree: Option<Rect>,
    pub document: Rect,
    pub status: Rect,
    pub overlay: Option<Rect>,
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
            Focus::Tree => (Some(body), body),
            Focus::Document => (None, body),
        }
    } else {
        let horizontal = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Length(28), Constraint::Min(1)])
            .split(body);
        (Some(horizontal[0]), horizontal[1])
    };
    let overlay = app.prompt().map(|_| centered(area, 70, 3));
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
    }
}

fn draw_sidebar(frame: &mut Frame<'_>, area: Rect, app: &App) {
    let selected = app.sidebar_cursor();
    let items = match app.sidebar_mode() {
        SidebarMode::Tree => app
            .tree_view()
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
            .collect(),
    };
    let title = match app.sidebar_mode() {
        SidebarMode::Tree => "Files",
        SidebarMode::Search => "Search",
    };
    frame.render_widget(
        List::new(items).block(Block::default().borders(Borders::RIGHT).title(title)),
        area,
    );
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
    let title = app
        .active_path()
        .map_or_else(|| "No file".to_string(), |path| path.display().to_string());
    let block = Block::default().title(title).borders(Borders::BOTTOM);
    let inner = block.inner(area);
    frame.render_widget(block, area);
    let Some(document) = app.document() else {
        frame.render_widget(Paragraph::new("Open a file from the tree"), inner);
        return;
    };
    match app.mode() {
        Mode::Edit => {
            let lines = document
                .text()
                .lines()
                .map(|line| Line::raw(sanitize(line)))
                .collect::<Vec<_>>();
            frame.render_widget(Paragraph::new(lines), inner);
            if app.focus() == Focus::Document
                && app.prompt().is_none()
                && let Ok(point) = document.point_at(document.cursor())
                && point.line < usize::from(inner.height)
                && point.cell_column < usize::from(inner.width)
            {
                frame.set_cursor_position((
                    inner.x + point.cell_column as u16,
                    inner.y + point.line as u16,
                ));
            }
        }
        Mode::Read => {
            let plan = MarkdownView::render(&document.text(), document.revision(), inner.width);
            let lines = plan
                .rows
                .into_iter()
                .map(|row| {
                    Line::from(
                        row.spans
                            .into_iter()
                            .map(|span| Span::styled(sanitize(&span.text), read_style(span.style)))
                            .collect::<Vec<_>>(),
                    )
                })
                .collect::<Vec<_>>();
            frame.render_widget(Paragraph::new(lines), inner);
        }
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
        Paragraph::new(format!(" {mode}  {path}{marker}  {}", app.status()))
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
