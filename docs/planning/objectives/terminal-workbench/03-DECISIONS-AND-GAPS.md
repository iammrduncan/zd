# Decisions, records, and gaps

Date: 2026-09-26

This document distinguishes owner decisions already made, technical decisions delegated by the
objective, and evidence that remains unavailable until the prototype runs in a real terminal.

## Owner decisions already made

The objective decides that:

1. the existing product and its docs/ADRs move below `v0/`;
2. v1 is a native Rust TUI;
3. v1 does not serve a UI or own the agent/runtime system; and
4. v1.0.1 is a prototype to test in terminal/multiplexer workflows.

These statements are explicit at [objective.md:8-27](objective.md#what-we-want). They are sufficient
authority to write successor human-owned ADRs during the cutover.

## Technical decisions made by this plan

- Build a focused application instead of forking or embedding an editor.
- Own one Ropey-backed source document and project read/edit projections from it.
- Use Ratatui/Crossterm as adapters, not state owners.
- Use Herdr as the first semantic handoff adapter and offer a manual fallback elsewhere.
- Store review anchors in a bounded `.zd/review-v1.json` sidecar.
- Store pasted images in document-local `./zd-images/` and insert a relative link only after write
  success.
- Treat terminal graphics, remote clipboard images, tmux automation, and Zellij automation as
  optional future capabilities.

Research support appears in the [editor](research/02-editor-landscape.md#inferred),
[terminal](research/03-terminal-and-multiplexer.md#inferred),
[Markdown](research/04-markdown-review-and-images.md#inferred), and
[architecture](research/05-rust-prototype-architecture.md#inferred-decision) findings.

## Required architecture records

The new root must record two decisions before substantive v1 implementation:

1. **Build `zd` as a native Rust terminal workbench and archive v0.** This replaces the active
   browser, Tauri, served-host, PTY-keeper, and release architecture.
2. **Own one source-ranged document model.** This replaces CodeMirror/browser layout while retaining
   the deeper promises of one source truth, truthful save state, and untrusted Markdown.

The old records move intact into `v0/docs/adr/` and are historical. The new root index explicitly
links the archived decision set. No old Context, Decision, or Consequences section is rewritten.

## Gaps that do not block implementation

- Real Ghostty/Herdr mouse modifiers, enhanced keys, resize, paste, and terminal cleanup are an
  interactive acceptance gate.
- Same-host clipboard image access depends on platform GUI state. Unsupported environments must
  produce a no-mutation error.
- Inline terminal graphics are not required for v1.0.1; Markdown uses a styled text/alt-path
  fallback.
- Performance numbers are hypotheses until a named fixture and machine record measurements.
- Review anchors do not follow file renames in v1.0.1; unresolved entries stay detached.
- Full external-change reconciliation is deferred. The prototype refuses to overwrite a dirty
  buffer silently.
- macOS build/run evidence cannot be produced from the current Linux shell.

## Decision needed from the owner

None before implementation. The plan makes reversible implementation choices inside the owner's
explicit product direction. The owner remains the final acceptance authority for the Ghostty/Herdr
experience after receiving the prototype.

## Not covered

This record does not accept future platform support, public packaging, editor services, or protocol
extensions. Each needs evidence and, where architectural, a later owner decision.

