use std::io::{self, Stdout, Write};
use std::path::Path;

use crossterm::cursor::{Hide, Show};
use crossterm::event::{
    self, DisableBracketedPaste, DisableFocusChange, DisableMouseCapture, EnableBracketedPaste,
    EnableFocusChange, EnableMouseCapture, Event, KeyEventKind, MouseButton, MouseEvent,
    MouseEventKind,
};
use crossterm::execute;
use crossterm::terminal::{
    EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode,
};
use ratatui::Terminal;
use ratatui::backend::CrosstermBackend;
use ratatui::layout::Rect;
use thiserror::Error;

use crate::app::{App, AppError};
use crate::ui::{Areas, document_content_area, draw, layout, sidebar_content_area};

#[derive(Debug, Error)]
pub enum TerminalError {
    #[error(transparent)]
    App(#[from] AppError),
    #[error("terminal I/O failed: {0}")]
    Io(#[from] io::Error),
}

pub fn run(path: &Path) -> Result<(), TerminalError> {
    let _guard = TerminalGuard::enter()?;
    let backend = CrosstermBackend::new(io::stdout());
    let mut terminal = Terminal::new(backend)?;
    let mut app = App::open(path)?;

    while !app.should_quit() {
        terminal.draw(|frame| draw(frame, &app))?;
        let size = terminal.size()?;
        let area = Rect::new(0, 0, size.width, size.height);
        handle_event(event::read()?, area, &mut app)?;
    }
    Ok(())
}

pub fn handle_event(event: Event, area: Rect, app: &mut App) -> Result<(), AppError> {
    match event {
        Event::Key(key) if matches!(key.kind, KeyEventKind::Press | KeyEventKind::Repeat) => {
            app.handle_key(key)?;
        }
        Event::Paste(text) => app.handle_paste(&text)?,
        Event::Mouse(mouse) => dispatch_mouse(mouse, layout(area, app), app)?,
        Event::FocusGained | Event::FocusLost | Event::Resize(_, _) => {}
        _ => {}
    }
    Ok(())
}

fn dispatch_mouse(mouse: MouseEvent, areas: Areas, app: &mut App) -> Result<(), AppError> {
    let (pressed, extend) = match mouse.kind {
        MouseEventKind::Down(MouseButton::Left) => (true, false),
        MouseEventKind::Drag(MouseButton::Left) => (true, true),
        _ => (false, false),
    };
    if !pressed {
        return Ok(());
    }
    if let Some(tree) = areas.tree
        && contains(tree, mouse.column, mouse.row)
    {
        let tree = sidebar_content_area(tree);
        if contains(tree, mouse.column, mouse.row) {
            app.pointer_tree(usize::from(mouse.row.saturating_sub(tree.y)))?;
        }
        return Ok(());
    }
    let document = document_content_area(areas.document);
    if contains(document, mouse.column, mouse.row) {
        app.pointer_document(
            usize::from(mouse.row.saturating_sub(document.y)),
            usize::from(mouse.column.saturating_sub(document.x)),
            extend,
            document.width,
        )?;
    }
    Ok(())
}

const fn contains(area: Rect, column: u16, row: u16) -> bool {
    column >= area.x
        && column < area.x.saturating_add(area.width)
        && row >= area.y
        && row < area.y.saturating_add(area.height)
}

struct TerminalGuard {
    raw: bool,
    alternate: bool,
    paste: bool,
    mouse: bool,
    focus: bool,
    cursor_hidden: bool,
}

impl TerminalGuard {
    fn enter() -> io::Result<Self> {
        let mut guard = Self {
            raw: false,
            alternate: false,
            paste: false,
            mouse: false,
            focus: false,
            cursor_hidden: false,
        };
        enable_raw_mode()?;
        guard.raw = true;
        let mut output = io::stdout();
        execute!(output, EnterAlternateScreen)?;
        guard.alternate = true;
        execute!(output, EnableBracketedPaste)?;
        guard.paste = true;
        execute!(output, EnableMouseCapture)?;
        guard.mouse = true;
        execute!(output, EnableFocusChange)?;
        guard.focus = true;
        execute!(output, Hide)?;
        guard.cursor_hidden = true;
        output.flush()?;
        Ok(guard)
    }
}

impl Drop for TerminalGuard {
    fn drop(&mut self) {
        let mut output: Stdout = io::stdout();
        if self.cursor_hidden {
            let _ = execute!(output, Show);
        }
        if self.focus {
            let _ = execute!(output, DisableFocusChange);
        }
        if self.mouse {
            let _ = execute!(output, DisableMouseCapture);
        }
        if self.paste {
            let _ = execute!(output, DisableBracketedPaste);
        }
        if self.alternate {
            let _ = execute!(output, LeaveAlternateScreen);
        }
        let _ = output.flush();
        if self.raw {
            let _ = disable_raw_mode();
        }
    }
}
