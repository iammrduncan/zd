use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

use crate::document::{FindDirection, FindQuery, MoveDirection};

use super::{App, AppError, Focus, Mode, Prompt, SidebarMode};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Binding {
    pub label: &'static str,
    pub key: &'static str,
}

static BINDINGS: [Binding; 10] = [
    Binding {
        label: "focus",
        key: "Tab",
    },
    Binding {
        label: "tree",
        key: "Ctrl-B",
    },
    Binding {
        label: "project search",
        key: "Ctrl-P",
    },
    Binding {
        label: "save",
        key: "Ctrl-S",
    },
    Binding {
        label: "undo",
        key: "Ctrl-Z",
    },
    Binding {
        label: "redo",
        key: "Ctrl-Y",
    },
    Binding {
        label: "find",
        key: "Ctrl-F",
    },
    Binding {
        label: "replace",
        key: "Ctrl-H",
    },
    Binding {
        label: "read/edit",
        key: "Ctrl-R",
    },
    Binding {
        label: "quit",
        key: "Ctrl-Q",
    },
];

pub fn bindings() -> &'static [Binding] {
    &BINDINGS
}

impl App {
    pub fn handle_key(&mut self, key: KeyEvent) -> Result<(), AppError> {
        if self.prompt.is_some() {
            return self.handle_prompt_key(key);
        }
        if key.modifiers.contains(KeyModifiers::CONTROL) {
            return self.handle_control(key.code);
        }
        match key.code {
            KeyCode::Tab => {
                self.focus = if self.focus == Focus::Document && self.tree_visible {
                    Focus::Tree
                } else {
                    Focus::Document
                };
            }
            KeyCode::Up if self.focus == Focus::Tree => {
                self.sidebar_cursor = self.sidebar_cursor.saturating_sub(1);
            }
            KeyCode::Down if self.focus == Focus::Tree => {
                let count = self.sidebar_len();
                self.sidebar_cursor = (self.sidebar_cursor + 1).min(count.saturating_sub(1));
            }
            KeyCode::Enter if self.focus == Focus::Tree => self.activate_sidebar()?,
            KeyCode::Esc if self.sidebar_mode == SidebarMode::Search => {
                self.sidebar_mode = SidebarMode::Tree;
                self.sidebar_cursor = 0;
            }
            KeyCode::Left => self.move_document(MoveDirection::Previous, key.modifiers)?,
            KeyCode::Right => self.move_document(MoveDirection::Next, key.modifiers)?,
            KeyCode::Up => self.move_document_vertical(-1, key.modifiers)?,
            KeyCode::Down => self.move_document_vertical(1, key.modifiers)?,
            KeyCode::Home => {
                if let Some(document) = self.document.as_mut() {
                    document.set_cursor(0)?;
                }
                self.vertical_cell = None;
            }
            KeyCode::End => {
                if let Some(document) = self.document.as_mut() {
                    document.set_cursor(document.len_bytes())?;
                }
                self.vertical_cell = None;
            }
            KeyCode::Backspace if self.mode == Mode::Edit => {
                if let Some(document) = self.document.as_mut() {
                    document.backspace()?;
                }
            }
            KeyCode::Enter if self.mode == Mode::Edit => self.insert_text("\n")?,
            KeyCode::Char(character) if self.mode == Mode::Edit => {
                let mut encoded = [0; 4];
                self.insert_text(character.encode_utf8(&mut encoded))?;
            }
            _ => {}
        }
        Ok(())
    }

    pub fn insert_text(&mut self, text: &str) -> Result<(), AppError> {
        if self.mode == Mode::Edit
            && let Some(document) = self.document.as_mut()
        {
            document.insert(text)?;
            self.vertical_cell = None;
            self.status = "edited".to_string();
        }
        Ok(())
    }

    fn handle_control(&mut self, code: KeyCode) -> Result<(), AppError> {
        match code {
            KeyCode::Char('q') => self.should_quit = true,
            KeyCode::Char('b') => self.toggle_tree(),
            KeyCode::Char('p') => self.prompt = Some(Prompt::ProjectSearch(String::new())),
            KeyCode::Char('f') => self.prompt = Some(Prompt::Find(String::new())),
            KeyCode::Char('h') => self.prompt = Some(Prompt::ReplaceFind(String::new())),
            KeyCode::Char('s') => {
                if let Some(document) = self.document.as_mut() {
                    document.save()?;
                    self.status = "saved".to_string();
                }
            }
            KeyCode::Char('z') => {
                if let Some(document) = self.document.as_mut() {
                    self.status = if document.undo() {
                        "undone"
                    } else {
                        "nothing to undo"
                    }
                    .into();
                }
            }
            KeyCode::Char('y') => {
                if let Some(document) = self.document.as_mut() {
                    self.status = if document.redo() {
                        "redone"
                    } else {
                        "nothing to redo"
                    }
                    .into();
                }
            }
            KeyCode::Char('r') => self.toggle_mode(),
            _ => {}
        }
        Ok(())
    }

    fn handle_prompt_key(&mut self, key: KeyEvent) -> Result<(), AppError> {
        match key.code {
            KeyCode::Esc => self.prompt = None,
            KeyCode::Backspace => {
                if let Some(prompt) = self.prompt.as_mut() {
                    match prompt {
                        Prompt::ProjectSearch(value)
                        | Prompt::Find(value)
                        | Prompt::ReplaceFind(value)
                        | Prompt::ReplaceWith { value, .. } => {
                            value.pop();
                        }
                    }
                }
            }
            KeyCode::Char(character) if !key.modifiers.contains(KeyModifiers::CONTROL) => {
                if let Some(prompt) = self.prompt.as_mut() {
                    match prompt {
                        Prompt::ProjectSearch(value)
                        | Prompt::Find(value)
                        | Prompt::ReplaceFind(value)
                        | Prompt::ReplaceWith { value, .. } => value.push(character),
                    }
                }
            }
            KeyCode::Enter => self.submit_prompt()?,
            _ => {}
        }
        Ok(())
    }

    fn submit_prompt(&mut self) -> Result<(), AppError> {
        let Some(prompt) = self.prompt.take() else {
            return Ok(());
        };
        match prompt {
            Prompt::ProjectSearch(query) => {
                let results = self.workspace.search(&query, false)?;
                self.status = format!("{} matches", results.matches.len());
                self.search_results = results.matches;
                self.sidebar_mode = SidebarMode::Search;
                self.sidebar_cursor = 0;
                self.tree_visible = true;
                self.focus = Focus::Tree;
            }
            Prompt::Find(query) => {
                if let Some(document) = self.document.as_mut()
                    && let Some(found) = document.find(
                        &FindQuery::literal(query),
                        document.selection().end,
                        FindDirection::Next,
                    )?
                {
                    document.select(found)?;
                    self.status = "match selected".to_string();
                }
            }
            Prompt::ReplaceFind(query) => {
                self.prompt = Some(Prompt::ReplaceWith {
                    query,
                    value: String::new(),
                });
            }
            Prompt::ReplaceWith { query, value } => {
                if let Some(document) = self.document.as_mut() {
                    let count = document.replace_all(&FindQuery::literal(query), &value)?;
                    self.status = format!("replaced {count} matches");
                }
            }
        }
        Ok(())
    }

    fn move_document(
        &mut self,
        direction: MoveDirection,
        modifiers: KeyModifiers,
    ) -> Result<(), AppError> {
        if self.focus == Focus::Document
            && let Some(document) = self.document.as_mut()
        {
            document.move_cursor(direction, modifiers.contains(KeyModifiers::SHIFT));
            self.vertical_cell = None;
        }
        Ok(())
    }

    fn move_document_vertical(
        &mut self,
        line_delta: isize,
        modifiers: KeyModifiers,
    ) -> Result<(), AppError> {
        if self.focus != Focus::Document {
            return Ok(());
        }
        let Some(document) = self.document.as_mut() else {
            return Ok(());
        };
        let point = document.point_at(document.cursor())?;
        let target_line = if line_delta < 0 {
            point.line.checked_sub(line_delta.unsigned_abs())
        } else {
            point.line.checked_add(line_delta as usize)
        };
        let Some(target_line) = target_line else {
            return Ok(());
        };
        let cell = *self.vertical_cell.get_or_insert(point.cell_column);
        if let Some(byte) = document.byte_at_cell(target_line, cell) {
            document.set_cursor_with_selection(byte, modifiers.contains(KeyModifiers::SHIFT))?;
        }
        Ok(())
    }

    fn toggle_mode(&mut self) {
        let markdown = self.active_path.as_ref().is_some_and(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("md"))
        });
        if self.mode == Mode::Read || markdown {
            self.mode = if self.mode == Mode::Edit {
                Mode::Read
            } else {
                Mode::Edit
            };
            self.status = match self.mode {
                Mode::Edit => "edit mode",
                Mode::Read => "read mode",
            }
            .to_string();
        } else {
            self.status = "Read mode is available for Markdown".to_string();
        }
    }

    fn sidebar_len(&self) -> usize {
        match self.sidebar_mode {
            SidebarMode::Tree => self.workspace.tree().entries.len(),
            SidebarMode::Search => self.search_results.len(),
        }
    }
}
