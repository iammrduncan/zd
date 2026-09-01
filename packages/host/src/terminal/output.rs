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
    dropped_since_drain: u64,
    read_error: Option<String>,
}

impl BoundedOutput {
    pub(super) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            bytes: VecDeque::with_capacity(capacity),
            first_offset: 0,
            next_offset: 0,
            dropped_since_drain: 0,
            read_error: None,
        }
    }

    pub(super) fn push(&mut self, incoming: &[u8]) {
        if incoming.is_empty() {
            return;
        }

        self.next_offset = self.next_offset.saturating_add(incoming.len() as u64);
        if incoming.len() >= self.capacity {
            let released = self.bytes.len() + incoming.len() - self.capacity;
            self.dropped_since_drain = self.dropped_since_drain.saturating_add(released as u64);
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
        self.dropped_since_drain = self.dropped_since_drain.saturating_add(overflow as u64);
        self.bytes.extend(incoming.iter().copied());
    }

    pub(super) fn fail(&mut self, error: String) {
        if self.read_error.is_none() {
            self.read_error = Some(error);
        }
    }

    pub(super) fn drain(&mut self) -> TerminalOutputBatch {
        let batch = TerminalOutputBatch {
            offset: self.first_offset,
            dropped_before: std::mem::take(&mut self.dropped_since_drain),
            bytes: self.bytes.drain(..).collect(),
            read_error: self.read_error.take(),
        };
        self.first_offset = self.next_offset;
        batch
    }
}
