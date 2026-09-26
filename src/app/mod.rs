mod input;
mod workflows;

use std::fs;
use std::path::{Path, PathBuf};

use thiserror::Error;

use crate::document::{Document, DocumentError, SourceRange};
use crate::handoff::{AgentTarget, HandoffError, PreparedHandoff};
use crate::image::ImageError;
use crate::markdown::MarkdownView;
use crate::review::{AnchorState, ReviewComment, ReviewError, ReviewStore};
use crate::workspace::{EntryKind, SearchResult, TreeView, Workspace, WorkspaceError};

pub use input::{Binding, bindings};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Focus {
    Tree,
    Document,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
    Edit,
    Read,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidebarMode {
    Tree,
    Search,
    Review,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Prompt {
    ProjectSearch(String),
    Find(String),
    ReplaceFind(String),
    ReplaceWith { query: String, value: String },
    Comment(String),
    HandoffInstruction(String),
    ImageAlt(String),
}

impl Prompt {
    pub fn label(&self) -> &'static str {
        match self {
            Self::ProjectSearch(_) => "Project search",
            Self::Find(_) => "Find",
            Self::ReplaceFind(_) => "Replace",
            Self::ReplaceWith { .. } => "With",
            Self::Comment(_) => "Comment",
            Self::HandoffInstruction(_) => "Agent instruction",
            Self::ImageAlt(_) => "Image alt text",
        }
    }

    pub fn value(&self) -> &str {
        match self {
            Self::ProjectSearch(value)
            | Self::Find(value)
            | Self::ReplaceFind(value)
            | Self::Comment(value)
            | Self::HandoffInstruction(value)
            | Self::ImageAlt(value) => value,
            Self::ReplaceWith { value, .. } => value,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandoffStage {
    Targets,
    Preview,
}

#[derive(Debug, Clone)]
struct HandoffState {
    stage: HandoffStage,
    prepared: PreparedHandoff,
    targets: Vec<AgentTarget>,
    cursor: usize,
    selected_target: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub struct ActiveComment<'a> {
    pub comment: &'a ReviewComment,
    pub state: AnchorState,
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error(transparent)]
    Document(#[from] DocumentError),
    #[error(transparent)]
    Workspace(#[from] WorkspaceError),
    #[error("application I/O failed: {0}")]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Review(#[from] ReviewError),
    #[error(transparent)]
    Handoff(#[from] HandoffError),
    #[error(transparent)]
    Image(#[from] ImageError),
    #[error("the path has no parent directory")]
    MissingParent,
    #[error("the active file is outside the workspace")]
    OutsideWorkspace,
    #[error("the command requires an active editable document")]
    NotEditable,
}

#[derive(Debug)]
pub struct App {
    workspace: Workspace,
    document: Option<Document>,
    active_path: Option<PathBuf>,
    focus: Focus,
    mode: Mode,
    sidebar_mode: SidebarMode,
    tree_visible: bool,
    sidebar_cursor: usize,
    search_results: Vec<SearchResult>,
    prompt: Option<Prompt>,
    status: String,
    should_quit: bool,
    drag_anchor: Option<usize>,
    vertical_cell: Option<usize>,
    review: ReviewStore,
    herdr_executable: PathBuf,
    handoff: Option<HandoffState>,
}

impl App {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, AppError> {
        let path = fs::canonicalize(path)?;
        let (root, initial) = if path.is_dir() {
            (path, None)
        } else {
            let root = path.parent().ok_or(AppError::MissingParent)?.to_path_buf();
            let relative = path
                .strip_prefix(&root)
                .map_err(|_| AppError::OutsideWorkspace)?
                .to_path_buf();
            (root, Some(relative))
        };
        let workspace = Workspace::open(root)?;
        let review = ReviewStore::open(workspace.root())?;
        let mut app = Self {
            workspace,
            document: None,
            active_path: None,
            focus: Focus::Document,
            mode: Mode::Edit,
            sidebar_mode: SidebarMode::Tree,
            tree_visible: true,
            sidebar_cursor: 0,
            search_results: Vec::new(),
            prompt: None,
            status: "ready".to_string(),
            should_quit: false,
            drag_anchor: None,
            vertical_cell: None,
            review,
            herdr_executable: PathBuf::from("herdr"),
            handoff: None,
        };
        if let Some(initial) = initial {
            app.open_file(&initial)?;
        } else if let Some(entry) = app
            .workspace
            .tree()
            .entries
            .into_iter()
            .find(|entry| entry.kind == EntryKind::File)
        {
            app.open_file(&entry.path)?;
        }
        Ok(app)
    }

    pub fn workspace(&self) -> &Workspace {
        &self.workspace
    }

    pub fn document(&self) -> Option<&Document> {
        self.document.as_ref()
    }

    pub fn active_path(&self) -> Option<&Path> {
        self.active_path.as_deref()
    }

    pub const fn focus(&self) -> Focus {
        self.focus
    }

    pub const fn mode(&self) -> Mode {
        self.mode
    }

    pub const fn sidebar_mode(&self) -> SidebarMode {
        self.sidebar_mode
    }

    pub const fn tree_visible(&self) -> bool {
        self.tree_visible
    }

    pub const fn sidebar_cursor(&self) -> usize {
        self.sidebar_cursor
    }

    pub fn search_results(&self) -> &[SearchResult] {
        &self.search_results
    }

    pub fn prompt(&self) -> Option<&Prompt> {
        self.prompt.as_ref()
    }

    pub fn handoff_stage(&self) -> Option<HandoffStage> {
        self.handoff.as_ref().map(|handoff| handoff.stage)
    }

    pub fn prepared_handoff(&self) -> Option<&PreparedHandoff> {
        self.handoff.as_ref().map(|handoff| &handoff.prepared)
    }

    pub fn handoff_targets(&self) -> &[AgentTarget] {
        self.handoff
            .as_ref()
            .map_or(&[], |handoff| handoff.targets.as_slice())
    }

    pub fn handoff_cursor(&self) -> usize {
        self.handoff.as_ref().map_or(0, |handoff| handoff.cursor)
    }

    pub fn handoff_target(&self) -> Option<&str> {
        self.handoff
            .as_ref()
            .and_then(|handoff| handoff.selected_target.as_deref())
    }

    pub fn active_comments(&self) -> Vec<ActiveComment<'_>> {
        let (Some(path), Some(document)) = (self.active_path.as_ref(), self.document.as_ref())
        else {
            return Vec::new();
        };
        let Some(path) = path.to_str() else {
            return Vec::new();
        };
        self.review
            .comments()
            .iter()
            .filter(|comment| comment.path == path)
            .map(|comment| ActiveComment {
                comment,
                state: self.review.resolve(comment, document),
            })
            .collect()
    }

    pub fn status(&self) -> &str {
        &self.status
    }

    pub const fn should_quit(&self) -> bool {
        self.should_quit
    }

    pub fn tree_view(&self) -> TreeView {
        self.workspace.tree()
    }

    pub fn toggle_tree(&mut self) {
        self.tree_visible = !self.tree_visible;
        if !self.tree_visible && self.focus == Focus::Tree {
            self.focus = Focus::Document;
        }
    }

    pub fn open_file(&mut self, relative: &Path) -> Result<(), AppError> {
        let path = self.workspace.resolve(relative)?;
        self.document = Some(Document::open(path)?);
        self.active_path = Some(relative.to_path_buf());
        self.mode = Mode::Edit;
        self.focus = Focus::Document;
        self.drag_anchor = None;
        self.vertical_cell = None;
        self.status = format!("opened {}", relative.display());
        Ok(())
    }

    pub fn pointer_tree(&mut self, row: usize) -> Result<(), AppError> {
        self.sidebar_cursor = row;
        self.focus = Focus::Tree;
        self.activate_sidebar()
    }

    pub fn pointer_document(
        &mut self,
        row: usize,
        cell: usize,
        extend: bool,
        width: u16,
    ) -> Result<(), AppError> {
        self.focus = Focus::Document;
        let Some(document) = self.document.as_mut() else {
            return Ok(());
        };
        let byte = match self.mode {
            Mode::Edit => document.byte_at_cell(row, cell),
            Mode::Read => MarkdownView::render(&document.text(), document.revision(), width)
                .source_at(row, cell as u16)
                .map(|range| range.start),
        };
        let Some(byte) = byte else {
            return Ok(());
        };
        if self.mode == Mode::Read {
            let plan = MarkdownView::render(&document.text(), document.revision(), width);
            if let Some(range) = plan.source_at(row, cell as u16) {
                document.select(range)?;
            }
            return Ok(());
        }
        self.vertical_cell = None;
        if extend {
            let anchor = self.drag_anchor.unwrap_or(document.cursor());
            document.select(SourceRange::new(anchor.min(byte), anchor.max(byte)))?;
        } else {
            document.set_cursor(byte)?;
            self.drag_anchor = Some(byte);
        }
        Ok(())
    }

    fn activate_sidebar(&mut self) -> Result<(), AppError> {
        match self.sidebar_mode {
            SidebarMode::Tree => {
                let Some(entry) = self
                    .workspace
                    .tree()
                    .entries
                    .get(self.sidebar_cursor)
                    .cloned()
                else {
                    return Ok(());
                };
                match entry.kind {
                    EntryKind::Directory => {
                        self.workspace.toggle_directory(&entry.path)?;
                        self.status = format!("toggled {}", entry.path.display());
                    }
                    EntryKind::File => self.open_file(&entry.path)?,
                }
            }
            SidebarMode::Search => {
                let Some(result) = self.search_results.get(self.sidebar_cursor).cloned() else {
                    return Ok(());
                };
                self.open_file(&result.path)?;
                if let Some(document) = self.document.as_mut() {
                    document.select(result.range)?;
                }
            }
            SidebarMode::Review => {
                let selected = self
                    .active_comments()
                    .get(self.sidebar_cursor)
                    .map(|review| (review.state, review.comment.id.clone()));
                let Some((state, id)) = selected else {
                    return Ok(());
                };
                match state {
                    AnchorState::Attached(range) => {
                        if let Some(document) = self.document.as_mut() {
                            document.select(range)?;
                            self.focus = Focus::Document;
                            self.status = format!("selected {id}");
                        }
                    }
                    AnchorState::Detached => {
                        self.status = format!("{id} is detached");
                    }
                }
            }
        }
        Ok(())
    }
}
