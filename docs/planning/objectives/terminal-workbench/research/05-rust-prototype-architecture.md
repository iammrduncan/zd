# Rust prototype architecture findings

Date: 2026-09-26

This document compares concrete Rust implementation shapes and sets the v1.0.1 prototype boundary.

## Established

- Ratatui renders cells and exposes a deterministic `TestBackend`; it deliberately does not own
  input or application state. Crossterm supplies key, mouse, paste, focus, and resize events.
- Ropey provides a mature UTF-8 rope with logarithmic edits and conversions. It uses Unicode scalar
  indices, so grapheme and terminal-cell conversion still belongs in the document owner.
- Syntect supports stateful per-line highlighting without the grammar/query/version surface of
  Tree-sitter. Tree-sitter becomes valuable later if incremental structural editing justifies its
  edit bookkeeping.
- `ignore` and ripgrep component crates provide bounded, ignore-aware traversal and streaming
  search without requiring an installed `rg` executable.
- Watcher events differ by platform and can be lost. They can invalidate state, but a rescan must
  remain authoritative.
- No evaluated dependency provides the one source model required by edit, Read mode, review
  anchors, and agent handoff.

The dependency analysis, two architectures, risks, and full proposed test matrix are in
[`subagent_outputs/04-rust-architecture.md`](subagent_outputs/04-rust-architecture.md).

## Options

### Focused application with owned core

One headless library owns documents, workspace traversal/search, Markdown projection, reviews, and
image ingestion. A thin binary owns the application state machine, Ratatui rendering, Crossterm,
clipboard access, and Herdr adapter.

### Pinned, stripped Oride fork

This starts with more visible editor behavior, but its correctness changes cross most retained
crates and upstream is archiving the Rust implementation. It transfers a broad maintenance surface
to `zd` immediately.

## Inferred decision

Choose the focused application. The deep modules are:

```text
Document   text, graphemes/cells, cursor/selection, edits, undo, find/replace, save state
Workspace  tree, ignore policy, bounded search, reconciliation
Markdown   source-ranged Read projection and hit map
Review     durable anchors, comments, handoff payloads
Image      validated PNG install and link transaction
App/UI     commands, focus/layout, bounded effects, Ratatui/Crossterm adapters
```

Use Ratatui/Crossterm, Ropey 1.6, Unicode segmentation/width, pulldown-cmark 0.13, Syntect,
`ignore` plus ripgrep crates, `notify`, Arboard, PNG encoding, and Serde. Pin compatible releases in
the lockfile. Do not use Tokio, a PTY, an embedded shell, a plugin runtime, LSP, or Tree-sitter in
the prototype.

The app has one UI thread and bounded worker channels. Search, traversal, rendering work beyond the
visible viewport, watch reconciliation, and PNG encoding never create unbounded queues. Results
carry a generation or document revision so stale work cannot replace current state.

Prototype bounds are visible product states, not hidden failures: 10 MiB editable files, 50,000
tree entries, and 10,000 search hits. Binary/non-UTF-8 files remain read-only with an explanation.

## Verification direction

Automated gates cover document editing and Unicode invariants, tree policy, search/cancellation,
Read source mapping, review re-anchoring, shell-free handoff, image transactions, watch
reconciliation, deterministic rendered frames, terminal teardown, and a locked build. Interactive
smokes cover Ghostty/Herdr behavior and local clipboard availability because a fake terminal cannot
prove them.

## Gaps

- Performance targets need calibration on a named reference machine; proposed numbers are test
  hypotheses, not portable guarantees.
- Host clipboard and nested-terminal behavior remain real-environment acceptance items.
- External-change handling should retain a dirty local buffer and require an explicit reload or
  overwrite decision; the full conflict UX is beyond the prototype.

