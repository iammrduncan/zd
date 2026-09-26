# Terminal editor landscape findings

Date: 2026-09-26

This document decides whether `zd` should fork, embed, extend, or learn from an existing editor.

## Established

- Helix has a strong Rust editor decomposition and mature selection/search behavior, but no stable
  application-extension boundary for replacing its surrounding UI. A derivative also carries
  MPL-2.0 obligations for modified covered files.
- Neovim has the strongest supported embedding interface. Its RPC UI and edit-tracking extmarks fit
  comments well, but it adds a C/Lua editor runtime instead of producing the requested focused Rust
  TUI.
- Kakoune has an excellent selection-first model and control socket, but deliberately delegates
  file exploration and is not an embeddable Rust library.
- Fresh is the closest functional editor match, but it is a large GPL workspace that also owns
  plugins, LSP, PTYs, orchestration, client/server modes, and GUI/web concerns. Its own documents
  record project-replace correctness defects.
- `mdt` is compact and MIT, but its tree is Markdown-only and depth-limited; its search is not
  project-content search; and its mouse handling does not provide full editor positioning and drag
  selection. Its private binary modules are useful rendering references, not a reusable boundary.
- Oride exposes promising MIT Rust crates, but upstream is replacing and archiving the Rust
  implementation. Its current traversal, search, watcher, and grapheme behavior would all need
  replacement.
- Focused widgets such as `ratatui-textarea` and `edtui` provide editing primitives but do not own
  the project tree, durable anchors, Markdown source mapping, handoff, or image workflow.

The comparison, source links, and weighted decision matrix are preserved in
[`subagent_outputs/01-editor-landscape.md`](subagent_outputs/01-editor-landscape.md).

## Claimed, not run

No candidate was built or benchmarked. Upstream feature claims were checked against public source
where possible, but actual build health and behavior remain unverified.

## Inferred

A focused MIT Rust TUI is the only option that fits the product and retains a small ownership
boundary. Forking an application does not remove the differentiated work: exact source selection,
readable Markdown mapping, comment anchoring, safe agent handoff, and image insertion still need a
`zd` document model.

Fresh-as-host could reduce short-term editor work, but only by changing the product boundary to a
GPL Fresh extension written partly in TypeScript/QuickJS. That contradicts the owner's Rust-native,
simplified direction. Full forks of Fresh, Helix, Amp, Oride, and `mdt` should be rejected.

Use existing systems as references:

- Helix and Kakoune for selection-first editing;
- Neovim extmarks for transformable annotation anchors;
- `mdt` for terminal Markdown blocks and rewrapping; and
- Fresh for discoverable mouse-first editor behavior and failure cases.

The editor should sit behind an application-owned `Document` boundary. A widget may accelerate
input fields or an early spike, but it must not own canonical text, range transformations, or undo
semantics.

## Gaps

- The chosen document core still needs corpus tests for graphemes, wide cells, tabs, wrapping,
  mouse hit testing, replacement, and undo grouping.
- No candidate offers the requested clipboard-image workflow.
- A legal review would be required before revisiting Fresh or Amp; it is unnecessary for the
  selected MIT-focused path.

