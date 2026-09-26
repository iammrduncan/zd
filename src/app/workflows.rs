use std::path::Path;

use crossterm::event::{KeyCode, KeyEvent};

use crate::handoff::{HerdrClient, prepare_handoff};
use crate::image::{ClipboardImage, ImageInstall, SystemClipboard, paste_image};

use super::{App, AppError, HandoffStage, HandoffState, Mode, SidebarMode};

impl App {
    pub fn set_herdr_executable(&mut self, executable: impl AsRef<Path>) {
        self.herdr_executable = executable.as_ref().to_path_buf();
    }

    pub fn add_active_comment(&mut self, comment: &str) -> Result<(), AppError> {
        let path = self.active_path.as_deref().ok_or(AppError::NotEditable)?;
        let document = self.document.as_ref().ok_or(AppError::NotEditable)?;
        let mut staged = self.review.clone();
        staged.add_comment(path, document, comment)?;
        staged.save()?;
        self.review = staged;
        self.status = "comment saved".to_string();
        Ok(())
    }

    pub fn paste_image_from(
        &mut self,
        clipboard: &mut impl ClipboardImage,
        alt_text: &str,
    ) -> Result<ImageInstall, AppError> {
        if self.mode != Mode::Edit {
            return Err(AppError::NotEditable);
        }
        let path = self.active_path.clone().ok_or(AppError::NotEditable)?;
        let document = self.document.as_mut().ok_or(AppError::NotEditable)?;
        let installed = paste_image(&self.workspace, &path, document, clipboard, alt_text)?;
        self.status = format!("inserted {}", installed.relative_path.display());
        Ok(installed)
    }

    pub(super) fn start_handoff(&mut self, instruction: &str) -> Result<(), AppError> {
        let path = self.active_path.as_deref().ok_or(AppError::NotEditable)?;
        let document = self.document.as_ref().ok_or(AppError::NotEditable)?;
        let prepared = prepare_handoff(path, document, instruction)?;
        let client = HerdrClient::new(&self.herdr_executable);
        match client.discover() {
            Ok(targets) => {
                self.handoff = Some(HandoffState {
                    stage: HandoffStage::Targets,
                    prepared,
                    targets,
                    cursor: 0,
                    selected_target: None,
                });
                self.status = "choose an agent target".to_string();
            }
            Err(error) => {
                self.handoff = Some(HandoffState {
                    stage: HandoffStage::Preview,
                    prepared,
                    targets: Vec::new(),
                    cursor: 0,
                    selected_target: None,
                });
                self.status = format!("{error}; prepared prompt is available for manual delivery");
            }
        }
        Ok(())
    }

    pub(super) fn handle_handoff_key(&mut self, key: KeyEvent) {
        let Some(handoff) = self.handoff.as_mut() else {
            return;
        };
        match (handoff.stage, key.code) {
            (_, KeyCode::Esc) => {
                self.handoff = None;
                self.status = "handoff cancelled".to_string();
            }
            (HandoffStage::Targets, KeyCode::Up) => {
                handoff.cursor = handoff.cursor.saturating_sub(1);
            }
            (HandoffStage::Targets, KeyCode::Down) => {
                handoff.cursor = (handoff.cursor + 1).min(handoff.targets.len().saturating_sub(1));
            }
            (HandoffStage::Targets, KeyCode::Enter) => {
                if let Some(target) = handoff.targets.get(handoff.cursor) {
                    handoff.selected_target = Some(target.target.clone());
                    handoff.stage = HandoffStage::Preview;
                    self.status = "review the handoff and press Enter to submit".to_string();
                }
            }
            (HandoffStage::Preview, KeyCode::Enter) => {
                let Some(target) = handoff.selected_target.clone() else {
                    self.status =
                        "prepared prompt remains available for manual delivery".to_string();
                    return;
                };
                let client = HerdrClient::new(&self.herdr_executable);
                match client.submit(&target, &handoff.prepared) {
                    Ok(()) => {
                        self.handoff = None;
                        self.status = format!("submitted handoff to {target}");
                    }
                    Err(error) => self.status = error.to_string(),
                }
            }
            _ => {}
        }
    }

    pub(super) fn save_comment_from_prompt(&mut self, comment: &str) {
        if let Err(error) = self.add_active_comment(comment) {
            self.status = error.to_string();
        }
    }

    pub(super) fn start_handoff_from_prompt(&mut self, instruction: &str) {
        if let Err(error) = self.start_handoff(instruction) {
            self.status = error.to_string();
        }
    }

    pub(super) fn paste_system_image(&mut self, alt_text: &str) {
        let mut clipboard = SystemClipboard;
        if let Err(error) = self.paste_image_from(&mut clipboard, alt_text) {
            self.status = error.to_string();
        }
    }

    pub(super) fn show_reviews(&mut self) {
        self.sidebar_mode = SidebarMode::Review;
        self.sidebar_cursor = 0;
        self.tree_visible = true;
        self.focus = super::Focus::Tree;
        self.status = format!("{} comments", self.active_comments().len());
    }
}
