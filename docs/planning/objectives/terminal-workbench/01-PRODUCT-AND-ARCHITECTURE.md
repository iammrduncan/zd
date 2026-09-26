# v1 product and architecture

Date: 2026-09-26

This document defines the v1.0.1 prototype vocabulary, product boundary, state ownership, and module
shape.

## Vocabulary

- **Project:** the canonical root supplied to `zd` at launch.
- **Document:** one UTF-8 source buffer, its cursor/selection, edit history, saved revision, and
  source-coordinate conversions.
- **Edit mode:** the literal source projection used for code and Markdown editing.
- **Read mode:** a styled Markdown projection whose selectable spans map back to source ranges.
- **Source range:** a half-open UTF-8 byte range in one document revision.
- **Review anchor:** path, revision, source range, exact source, and bounded prefix/suffix context.
- **Handoff:** an explicit transfer of a prepared source selection to an external agent adapter.
- **Host capability:** optional terminal/multiplexer/clipboard behavior detected or configured at
  runtime, never inferred solely from a product name.
- **v0:** the complete historical browser/Tauri product below `v0/`, runnable but inactive.

## Product boundary

`zd [path]` opens one project in an alternate-screen TUI. It shows a collapsible file tree and the
active document. It reads all supported text files, searches project content, edits text, performs
current-document find/replace, reads rendered Markdown, captures source-backed comments, hands a
selection to Herdr, and pastes a same-host clipboard image into Markdown.

It does not start a shell, emulate a terminal, manage an agent, persist a terminal session, serve a
web client, or require a desktop wrapper. This follows the observed Herdr boundary
([research](research/03-terminal-and-multiplexer.md#inferred)).

## One source model

`Document` is the deepest module. It owns Ropey, grapheme and cell conversions, cursor/selection,
edits, grouped undo/redo, find/replace, dirty state, save confirmation, and transformations of
review anchors. Neither Ratatui widgets nor Markdown parser events own canonical positions.

Markdown builds a width-dependent `RenderPlan` from a document revision. Each selectable rendered
span maps to a source range. Synthetic layout is non-selectable when it has no honest source. Read
and Edit mode retain a semantic anchor when switching
([Markdown findings](research/04-markdown-review-and-images.md#inferred)).

## Deep modules

```text
Document
  UTF-8 rope, movement, selection, edit transactions, history, find/replace, save state

Workspace
  canonical root, ignore policy, ordered tree, expansion, bounded search, rescan reconciliation

Markdown
  safe parse, styled rows, source hit map, wrapping, code-span/fence highlighting

Review
  review-v1 sidecar, anchor transforms/re-anchoring, comment and handoff payloads

Image
  clipboard capability, validation, PNG encoding, collision-safe install, link transaction

App/UI
  one state machine, semantic commands, focus/layout, effects, Ratatui and Crossterm adapters
```

The dependency direction is UI → core. The new root never depends on `v0`. Candidate dependencies
and their reasons are established in the
[architecture research](research/05-rust-prototype-architecture.md#inferred-decision).

## State and effects

One `App` snapshot owns active path, focus, tree visibility, mode, overlays, results, status, and the
current document. Every key, mouse event, and command dispatches one semantic action. File reads,
saves, search, clipboard work, Herdr commands, and future watches enter through narrow effects.

The first prototype may execute bounded small-project work synchronously, but core return types carry
document revisions/generations so moving traversal, search, parsing, and PNG encoding to workers does
not change state semantics. No unbounded queue or ambient polling is allowed.

## Files and limits

- Tree and search share one `.gitignore`-aware, non-symlink-following policy.
- Directories sort before files; names sort case-insensitively with a stable path tie-break.
- The tree caps at 50,000 entries and search at 10,000 matches; truncation is visible.
- Editable UTF-8 files cap at 10 MiB. Unsupported/binary/oversize input is explained and never
  lossy-saved.
- Saving writes and flushes a sibling temporary file, then renames it; dirty state clears only after
  success.
- A dirty buffer wins over an external change until the person explicitly reloads or overwrites.

## Review and agent handoff

`.zd/review-v1.json` is bounded, versioned, and untrusted. Ambiguous anchors detach visibly. `zd`
does not edit `.gitignore`; a project may version or ignore review state.

Herdr 0.9.1 is the first target adapter. The prototype uses separate process arguments without a
shell and shows target/payload before submission. The local socket can replace this adapter after
its permission and schema contract is tested. Unknown multiplexers receive a prepared prompt for
manual copy rather than guessed pane control.

## Image transaction

`Paste Image` works only in editable Markdown. It obtains decoded RGBA from the same host, validates
checked dimensions and limits, encodes a content-hashed PNG, refuses a symlinked destination, and
writes to `./zd-images/` beside the document. It inserts the relative link only after the write
succeeds. The image write plus link insertion behaves as one user action; a failure leaves the
document unchanged.

## Options and cost

Ratatui/Crossterm was selected over Cursive/Termwiz because cell rendering and testability are
sufficient and the document remains backend-independent. Ropey was selected over a widget-owned
`Vec<String>` so anchors and large edits have a stable owner. Syntect was selected over Tree-sitter
for the prototype because syntax color is secondary and precise incremental parse edits would widen
the core prematurely.

The cost is more code in `Document` and explicit coordinate tests. The benefit is one model instead
of synchronization among editor, renderer, comments, and handoff.

## Not covered

Multiple open buffers, split editing, language servers, completion, diagnostics, embedded terminals,
Git mutation, executable plugins, collaboration, remote serving, and guaranteed inline image
graphics are outside v1.0.1.

