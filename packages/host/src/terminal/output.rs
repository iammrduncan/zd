use std::collections::VecDeque;

use super::TerminalOutputBatch;

/// Raw PTY bytes waiting for the renderer.
///
/// A slow or hidden webview cannot make this allocation exceed `capacity`.
/// Absolute offsets let the renderer detect the exact discontinuity after an
/// overflow without retaining the released prefix.
pub(super) struct BoundedOutput {
    capacity: usize,
    bytes: VecDeque<u8>,
    first_offset: u64,
    next_offset: u64,
    drain_offset: u64,
    read_error: Option<String>,
}

impl BoundedOutput {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            bytes: VecDeque::with_capacity(capacity),
            first_offset: 0,
            next_offset: 0,
            drain_offset: 0,
            read_error: None,
        }
    }

    pub(super) fn push(&mut self, incoming: &[u8]) {
        if incoming.is_empty() {
            return;
        }

        self.next_offset = self.next_offset.saturating_add(incoming.len() as u64);
        if incoming.len() >= self.capacity {
            self.bytes.clear();
            self.bytes
                .extend(incoming[incoming.len() - self.capacity..].iter().copied());
            self.first_offset = self.next_offset - self.bytes.len() as u64;
            return;
        }

        let overflow = self
            .bytes
            .len()
            .saturating_add(incoming.len())
            .saturating_sub(self.capacity);
        self.bytes.drain(..overflow);
        self.first_offset = self.first_offset.saturating_add(overflow as u64);
        self.bytes.extend(incoming.iter().copied());
    }

    pub(super) fn fail(&mut self, error: String) {
        if self.read_error.is_none() {
            self.read_error = Some(error);
        }
    }

    pub(super) fn drain(&mut self) -> TerminalOutputBatch {
        let batch = self.read_from(Some(self.drain_offset));
        self.drain_offset = self.next_offset;
        batch
    }

    pub(super) fn read_from(&self, after_offset: Option<u64>) -> TerminalOutputBatch {
        let requested = after_offset.unwrap_or(self.first_offset);
        let offset = requested.clamp(self.first_offset, self.next_offset);
        let skip = offset.saturating_sub(self.first_offset) as usize;
        let batch = TerminalOutputBatch {
            offset,
            dropped_before: self.first_offset.saturating_sub(requested),
            bytes: self.bytes.iter().skip(skip).copied().collect(),
            read_error: self.read_error.clone(),
        };
        batch
    }

    pub(super) fn offsets(&self) -> (u64, u64) {
        (self.first_offset, self.next_offset)
    }
}
