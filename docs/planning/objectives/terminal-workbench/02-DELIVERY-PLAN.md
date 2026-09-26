# v1.0.1 delivery plan

Date: 2026-09-26

This document sequences the repository cutover and prototype implementation. Each phase leaves a
buildable, reviewable state and has a reason it cannot safely move earlier.

## Phase 0 — cut over authority and repository root

Move the old product island to `v0/` using tracked paths only. Keep operator tooling and `LICENSE` at
the root. Promote this objective into a minimal new docs tree, write v1 vision/design and successor
ADRs, create the new `zd` v1.0.1 Cargo package, a locked build, a Rust-only CI workflow, and a
minimal launch smoke test.

This is first because the old tag workflow and Accepted browser/host records would otherwise remain
authoritative while v1 code lands
([migration evidence](research/01-repository-and-migration.md#established)). Verify the v0 island
from `v0/` and the new skeleton from the root before continuing.

Estimated human-equivalent effort: **0.5–1 day**. Main risk: path-dependent old tests and ignored
local artifacts during the move.

## Phase 1 — own documents and workspace truth

Implement the headless `Document` and `Workspace` modules before drawing the full UI:

- UTF-8/grapheme-safe movement, selection, editing, history, dirty/save state;
- literal and regular-expression find/replace with terminating zero-width behavior;
- canonical root and path checks;
- ordered, collapsible, ignore-aware tree state; and
- bounded project content search with stable source results.

This precedes Markdown and mouse UI because both require authoritative source/cell and tree/result
identities. A widget-first UI would force these invariants to be reconstructed later
([editor findings](research/02-editor-landscape.md#inferred)).

Estimated effort: **1.5–2.5 days**. Main risk: grapheme/scalar/byte/cell conversions.

## Phase 2 — deliver the terminal workbench and Markdown Read mode

Implement terminal setup/teardown, the application state machine, collapsible tree, code editing,
mouse hit testing/drag selection, overlays, status, and source-mapped Markdown rendering. Make Read
and Edit mode switch without losing the source anchor. Add deterministic `TestBackend` snapshots at
small, ordinary, and wide sizes.

This follows the core so input and rendering dispatch semantic document/workspace operations rather
than becoming new state owners. Markdown source mapping follows the single-buffer contract in
[research](research/04-markdown-review-and-images.md#inferred).

Estimated effort: **2–3.5 days**. Main risk: wrapped source-to-cell mapping and nested mouse capture.

## Phase 3 — add review, Herdr handoff, and image paste

Add the `.zd/review-v1.json` store and deterministic re-anchoring, comment and agent-target overlays,
shell-free Herdr discovery/submission, fallback prepared prompts, local clipboard image validation,
PNG installation under document-local `zd-images/`, and transactional link insertion.

This follows selection and Read-mode hit mapping because all three features consume the same source
selection. Implementing separate ranges for comments or handoff would create drift.

Estimated effort: **1–2 days**. Main risk: platform clipboard behavior, which must fail safely when
unavailable.

## Phase 4 — make the prototype testable by the owner

Run locked tests, Clippy, formatting, terminal-restoration smoke, release build, and help/version
smokes. Exercise the built binary inside the live Herdr 0.9.1 environment. Write the compact user
guide and a Ghostty/Herdr acceptance checklist, record unavailable checks honestly, and leave a
single command for launching the v1.0.1 prototype.

This is last because real terminal behavior cannot validate missing feature paths, and release docs
must describe only observed behavior.

Estimated effort: **0.5–1 day** plus owner-side Ghostty smoke time.

## Total effort and uncertainty

Expected human-equivalent effort is **5.5–10 days** for a testable prototype. The range assumes the
existing Linux build container can compile the new dependency set and no platform clipboard crate
failure requires native replacement code. Source-to-cell mapping is most likely to exceed the range.

## Deliberately not done

- No terminal emulator, PTY keeper, shell, or agent session ownership.
- No generic multiplexer automation beyond tested Herdr handoff and manual fallback.
- No fork of Fresh, Helix, Oride, or `mdt`.
- No Tree-sitter, LSP, completion, diagnostics, refactoring, or plugin runtime.
- No workspace mutation beyond saving the active document, the review sidecar, and explicit image
  paste.
- No release tag, package publication, or claim that unobserved Ghostty/platform behavior works.
- No deletion of ignored user/build state during the archive move.

