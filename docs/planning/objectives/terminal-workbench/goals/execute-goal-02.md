# Execute goal 02: Deliver the terminal editor and Markdown reader

## Prerequisites

- [Goal 00](_completed/execute-goal-00.md) is complete and supplies the v1 root/runtime.
- [Goal 01](_completed/execute-goal-01.md) is complete and supplies authoritative documents,
  workspace tree, search results, and coordinate conversions.
- This goal owns the app state, terminal lifecycle, UI, Markdown projection, command bindings, and
  their tests. Goal 03 must not edit those files concurrently.

### Needed from the owner before starting

Nothing. Final taste and Ghostty acceptance occur after the automated interaction contract exists.

## `/goal` objective

This goal delivers Phase 2 from [`02-DELIVERY-PLAN.md:39-50`](../02-DELIVERY-PLAN.md#phase-2--deliver-the-terminal-workbench-and-markdown-read-mode).

Produce the usable local workbench: open the project, navigate/collapse the tree, search files,
edit code with keyboard and mouse, find/replace, and read Markdown through a source-mapped calm view.

## Required outcome

When the work is complete, the repository must have:

1. panic/error/quit-safe Crossterm setup and teardown for raw mode, alternate screen, bracketed paste,
   mouse capture, focus, resize, and cursor visibility;
2. one `App` state machine and semantic command registry for focus, tree navigation/collapse, file
   activation, project search, editing, save, undo/redo, find/replace, Read/Edit mode, and quit;
3. a quiet Ratatui layout with a collapsible tree, active document, local status, overlays, and
   narrow-terminal fallback;
4. keyboard and mouse tree mechanics plus editor caret/drag selection that use core hit mapping;
5. a safe pulldown-cmark Read projection for headings, emphasis, lists, quotes, links, images,
   tables, code spans/fences, wrapping, inert raw HTML, and source ranges; and
6. deterministic UI and event tests plus a PTY lifecycle smoke.

## In scope

- **Application.** Owns `src/app/**`, semantic actions/commands, and application tests.
- **Terminal/UI.** Owns `src/terminal/**`, `src/ui/**`, `src/main.rs`, and terminal/UI tests.
- **Markdown.** Owns `src/markdown/**` and golden render/source-map fixtures.
- **Shared metadata.** May update Cargo metadata and `src/lib.rs`; this is serialized after Goal 01.

## Required tests and evidence

At minimum, prove the Document, Workspace, Markdown, Layout, Mouse, Terminal lifecycle, and relevant
Quality rows at [`04-ACCEPTANCE-PLAN.md:12-22`](../04-ACCEPTANCE-PLAN.md#automated-release-blocking-evidence), including:

- TestBackend output at 40×12, 80×24, and 160×50;
- collapsing the tree reallocates all available width without changing the document selection;
- keyboard-only operation covers launch, tree, search results, edit, find/replace, save, modes, and
  quit;
- mouse events activate tree rows, place the caret, and extend source selection over wrapped/wide
  content;
- every selectable Read span maps to exact source or an explicit whole-node range, and synthetic
  cells are not guessed;
- remote images and raw HTML do not execute or fetch; and
- locked tests, format, strict Clippy, release build, PTY smoke, and `git diff --check` pass.

## Explicit non-goals

- Do not add comments, agent handoff, image clipboard access, file watching, PTYs, or terminals.
- Do not add LSP, completion, diagnostics, multi-buffer tabs, splits, or configurable keymaps.
- Do not require Kitty graphics; render image alt/path text safely.
- Do not replace the source model with widget state to simplify rendering.

## Engineering constraints

- Follow root instructions and add tests with every behavior change.
- Views are pure projections of `App`/core state. They do not keep competing cursor, selection,
  active-file, expansion, mode, or query state.
- Never leave the terminal in raw/alternate/mouse mode after any exit path.
- Keep rendering proportional to visible rows and sanitize control characters before display.
- Keep files cohesive and below the repository's size limits; commit focused green slices.

## Completion definition

The goal is complete only when the release binary provides the complete keyboard/mouse tree,
workspace search, code-edit/save/find/replace, and source-mapped Markdown Read/Edit slice; the stated
UI sizes and lifecycle exits are deterministic; every required automated gate is green; and no
review, agent, clipboard-image, PTY, or IDE surface leaked into the change.

If Read-mode hit mapping cannot preserve exact source ranges for a construct, mark that construct
non-selectable or whole-node and report it. Do not fabricate cell-precise offsets to satisfy a visual
test; Goal 03 depends on selections being truthful.
