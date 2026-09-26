# Execute goal 01: Own document editing and workspace navigation

## Prerequisites

- [Goal 00](execute-goal-00.md) is complete. This goal needs the authoritative v1 Cargo
  package, root docs, and inert v0 archive.
- This goal owns core document/workspace source and tests. Goals 02–04 must not edit those files
  concurrently.
- The owner may review this headless core without waiting for the TUI; visible interaction is Goal 02.

### Needed from the owner before starting

Nothing. The source model, bounds, and safe defaults are defined in the plan.

## `/goal` objective

This goal delivers Phase 1 from [`02-DELIVERY-PLAN.md:23-37`](../02-DELIVERY-PLAN.md#phase-1--own-documents-and-workspace-truth).

Create the two authoritative data modules before widgets can become accidental state owners. Later
Markdown selection, mouse behavior, comments, image insertion, and Herdr handoff must all consume
these identities and edit transactions.

## Required outcome

When the work is complete, the repository must have:

1. `src/document/` with a Ropey-backed UTF-8 document, grapheme-safe movement/deletion, source
   selection, edit transactions, bounded undo/redo, literal/regex find and replace, dirty revision,
   and atomic save confirmation;
2. one centralized conversion boundary among bytes, Unicode scalars, graphemes, logical rows/columns,
   and terminal cells;
3. `src/workspace/` with canonical project scope, an ignore-aware non-symlink-following tree,
   directories-first stable ordering, expansion state, and visible entry cap;
4. bounded project content search that shares traversal policy with the tree and returns stable
   project-relative path, line, byte range, and sanitized preview; and
5. integration fixtures proving real file open/edit/save/reopen and project traversal/search.

## In scope

- **Document.** Owns `src/document/**` and document-focused tests.
- **Workspace.** Owns `src/workspace/**` and tree/search fixtures/tests.
- **Shared core.** May update `src/lib.rs`, `Cargo.toml`, and `Cargo.lock`; no later goal may edit these
  concurrently.
- **Adapted behavior.** Re-review v0 atomic-write and traversal behavior, then port only the needed
  code and tests without adding a v0 dependency.

## Required tests and evidence

At minimum, prove:

- movement/backspace treat combining sequences, emoji ZWJ sequences, and CJK width according to the
  documented grapheme/cell rules;
- multiline selection and insertion/delete/newline operations never produce an invalid source range;
- undo/redo round-trip typing, paste, multiline replace, and replace-all as semantic groups;
- literal and regex next/previous wrap, case behavior, zero-width patterns terminate, and replace
  reports exact counts;
- a failed or refused atomic write preserves dirty state and disk bytes; a successful write reopens
  byte-for-byte and clears dirty only afterward;
- tree/search agree on `.gitignore`, hidden, symlink, binary, invalid-UTF-8, oversize, ordering, and
  cap policy;
- search previews contain no raw terminal control characters and results are stable; and
- locked tests, format, strict Clippy, and `git diff --check` pass.

## Explicit non-goals

- Do not draw Ratatui views or interpret Crossterm events.
- Do not add Markdown parsing, syntax language packs, comments, Herdr, clipboard, or watcher threads.
- Do not expose Ropey or dependency-specific types in the public application boundary.
- Do not weaken Unicode or path tests to match a simpler implementation.

## Engineering constraints

- Follow root `AGENTS.md`, `docs/GOOD_ENGINEERING_H.md`, and `docs/DESIGN.md`.
- Every code change includes tests; a discovered failure gets a failing regression first.
- Keep `Document` and `Workspace` deep and direct. Avoid generic repositories, service layers, or
  async runtimes.
- Keep handwritten files below 500 lines when practical and split by responsibility.
- Use bounded inputs and explicit error types. Never lossy-decode an editable file.
- Preserve unrelated changes; make short, focused commits without coauthor tags.

## Completion definition

The goal is complete only when the headless APIs satisfy every Unicode/edit/history/find/save/tree/
search assertion against real temporary files, expose no widget-owned source state, keep paths inside
the project, visibly report caps, and pass the full root Rust gates.

If grapheme-safe edits cannot be reconciled with byte-stable review ranges through one conversion
owner, stop and report the mismatch. Do not redefine selection as terminal cells or defer the
coordinate invariant; Goal 02 and Goal 03 depend on it.
