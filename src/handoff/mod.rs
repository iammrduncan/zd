use std::collections::HashSet;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Deserialize;
use thiserror::Error;

use crate::document::Document;

pub const MAX_HANDOFF_BYTES: usize = 32 * 1024;
const MAX_DISCOVERY_BYTES: usize = 1024 * 1024;
const MAX_TARGETS: usize = 128;
const MAX_INSTRUCTION_BYTES: usize = 4 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AgentTarget {
    pub target: String,
    pub label: String,
    pub focused: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PreparedHandoff {
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct HerdrClient {
    executable: PathBuf,
}

#[derive(Debug, Error)]
pub enum HandoffError {
    #[error("Herdr process failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("Herdr exited unsuccessfully with status {0}")]
    Exit(String),
    #[error("Herdr discovery output exceeded {MAX_DISCOVERY_BYTES} bytes")]
    OutputTooLarge,
    #[error("Herdr returned malformed agent data: {0}")]
    Malformed(#[from] serde_json::Error),
    #[error("Herdr reported no available agents")]
    NoAgents,
    #[error("the handoff requires a non-empty exact source selection")]
    EmptySelection,
    #[error("the handoff path must be a normal project-relative UTF-8 path")]
    InvalidPath,
    #[error("the Herdr target is empty, excessive, or contains control characters")]
    InvalidTarget,
}

#[derive(Debug, Deserialize)]
struct DiscoveryEnvelope {
    result: DiscoveryResult,
}

#[derive(Debug, Deserialize)]
struct DiscoveryResult {
    agents: Vec<DiscoveredAgent>,
}

#[derive(Debug, Deserialize)]
struct DiscoveredAgent {
    agent: String,
    pane_id: String,
    #[serde(default)]
    terminal_title_stripped: String,
    #[serde(default)]
    focused: bool,
}

impl HerdrClient {
    pub fn new(executable: impl Into<PathBuf>) -> Self {
        Self {
            executable: executable.into(),
        }
    }

    pub fn discover(&self) -> Result<Vec<AgentTarget>, HandoffError> {
        let mut child = Command::new(&self.executable)
            .args(["agent", "list"])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()?;
        let mut output = Vec::new();
        child
            .stdout
            .take()
            .expect("piped stdout is present")
            .take(MAX_DISCOVERY_BYTES as u64 + 1)
            .read_to_end(&mut output)?;
        if output.len() > MAX_DISCOVERY_BYTES {
            let _ = child.kill();
            let _ = child.wait();
            return Err(HandoffError::OutputTooLarge);
        }
        let status = child.wait()?;
        if !status.success() {
            return Err(HandoffError::Exit(status.to_string()));
        }
        let envelope: DiscoveryEnvelope = serde_json::from_slice(&output)?;
        let mut seen = HashSet::new();
        let mut targets = envelope
            .result
            .agents
            .into_iter()
            .filter_map(|agent| {
                if !valid_target(&agent.pane_id) || !seen.insert(agent.pane_id.clone()) {
                    return None;
                }
                let agent_name = one_line(&agent.agent, 64);
                let title = one_line(&agent.terminal_title_stripped, 80);
                let label = if title.is_empty() {
                    format!("{agent_name} — {}", agent.pane_id)
                } else {
                    format!("{agent_name} — {title} — {}", agent.pane_id)
                };
                Some(AgentTarget {
                    target: agent.pane_id,
                    label,
                    focused: agent.focused,
                })
            })
            .take(MAX_TARGETS)
            .collect::<Vec<_>>();
        targets.sort_by_key(|target| !target.focused);
        if targets.is_empty() {
            return Err(HandoffError::NoAgents);
        }
        Ok(targets)
    }

    pub fn submit(&self, target: &str, prepared: &PreparedHandoff) -> Result<(), HandoffError> {
        if !valid_target(target) {
            return Err(HandoffError::InvalidTarget);
        }
        let status = Command::new(&self.executable)
            .args(["agent", "prompt", target, &prepared.text])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()?;
        if !status.success() {
            return Err(HandoffError::Exit(status.to_string()));
        }
        Ok(())
    }
}

impl Default for HerdrClient {
    fn default() -> Self {
        Self::new("herdr")
    }
}

pub fn prepare_handoff(
    path: &Path,
    document: &Document,
    instruction: &str,
) -> Result<PreparedHandoff, HandoffError> {
    let path = valid_path(path)?;
    let selection = document.selection();
    if selection.is_empty() {
        return Err(HandoffError::EmptySelection);
    }
    let source = document.text();
    let selected = source
        .get(selection.start..selection.end)
        .ok_or(HandoffError::EmptySelection)?;
    let instruction =
        bounded_sanitized(instruction, MAX_INSTRUCTION_BYTES, "instruction truncated");
    let revision = blake3::hash(source.as_bytes()).to_hex();
    let header = format!(
        "Review this exact source selection.\nPath: {path}\nRevision: {revision}\nRange: {}..{}\n\nInstruction:\n{instruction}\n\nSelected source:\n",
        selection.start, selection.end
    );
    let marker = "\n[selection truncated]";
    let room = MAX_HANDOFF_BYTES.saturating_sub(header.len());
    let selected = sanitize_controls(selected);
    let body = if selected.len() <= room {
        selected
    } else {
        let available = room.saturating_sub(marker.len());
        format!("{}{marker}", truncate_utf8(&selected, available))
    };
    let mut text = format!("{header}{body}");
    text.truncate(floor_boundary(&text, MAX_HANDOFF_BYTES.min(text.len())));
    Ok(PreparedHandoff { text })
}

fn valid_path(path: &Path) -> Result<String, HandoffError> {
    if path.as_os_str().is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|part| !matches!(part, Component::Normal(_)))
    {
        return Err(HandoffError::InvalidPath);
    }
    let path = path.to_str().ok_or(HandoffError::InvalidPath)?;
    if path.chars().any(char::is_control) || path.len() > 4 * 1024 {
        return Err(HandoffError::InvalidPath);
    }
    Ok(path.to_string())
}

fn valid_target(target: &str) -> bool {
    !target.is_empty() && target.len() <= 1024 && !target.chars().any(char::is_control)
}

fn bounded_sanitized(text: &str, limit: usize, label: &str) -> String {
    let text = sanitize_controls(text);
    if text.len() <= limit {
        return text;
    }
    let marker = format!("\n[{label}]");
    let available = limit.saturating_sub(marker.len());
    format!("{}{marker}", truncate_utf8(&text, available))
}

fn sanitize_controls(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    for character in text.chars() {
        match character {
            '\n' | '\t' => output.push(character),
            character if character.is_control() => {
                output.push_str(&format!("\\u{{{:x}}}", u32::from(character)));
            }
            character => output.push(character),
        }
    }
    output
}

fn one_line(text: &str, limit: usize) -> String {
    let sanitized = sanitize_controls(text).replace(['\n', '\t'], " ");
    truncate_utf8(&sanitized, limit).to_string()
}

fn truncate_utf8(text: &str, limit: usize) -> &str {
    &text[..floor_boundary(text, limit.min(text.len()))]
}

fn floor_boundary(text: &str, mut byte: usize) -> usize {
    while !text.is_char_boundary(byte) {
        byte -= 1;
    }
    byte
}
