# Summary — goal 02: Deliver the terminal editor and Markdown reader

**Completed:** 2026-09-26
**Commits:** `dc0f2fa`, `3174c86`, `f12b29a`, `cf4cb89`, `0bc8706`
**Goal file:** [`execute-goal-02.md`](execute-goal-02.md)

## Action needed from the owner

Nothing yet. Ghostty interaction and visual taste remain part of the final Goal 04 acceptance pass;
this goal established the automated and Linux PTY contract first.

## What was delivered

1. A pulldown-cmark Read projection renders headings, emphasis, lists, quotes, links, image text,
   tables, code, and inert raw HTML with bounded wrapping and truthful exact or whole-node source
   ranges. Synthetic cells remain non-selectable.
2. One `App` owns focus, sidebar mode, active file, Edit/Read mode, prompts, status, selection-driven
   actions, and semantic bindings for tree navigation, project search, editing, save, undo/redo,
   find/replace, modes, and quit.
3. The Ratatui projection supplies a collapsible tree/search sidebar, document and source-visible
   selection, local status, command overlay, and a focused narrow-terminal fallback at 40 columns.
4. Keyboard movement is grapheme-safe and preserves terminal-cell columns vertically. Mouse events
   activate visible tree rows, place the edit caret, drag across wide characters, and select mapped
   Markdown spans without creating a second selection model.
5. The foreground Crossterm loop handles key, bracketed paste, mouse, focus, and resize events. Its
   RAII guard pairs raw mode, alternate screen, paste, mouse, focus, and cursor setup with reverse
   teardown on quit or returned error.
6. `zd [PATH]` now launches the TUI on a terminal while retaining deterministic non-TTY output for
   scripts and CLI tests. Help lists the shipped command keys.

## What I got wrong

The first terminal implementation passed Ratatui's `Terminal::size()` value where event dispatch
expected a `Rect`. The compile-failing PTY test exposed the mismatch; dispatch now constructs the
origin-based rectangle explicitly.

The first narrow layout projected the tree and document into the same rectangle, so document paint
covered the focused tree. A failing 40-column regression now proves the tree replaces the document.

Initial mouse translation used outer widget coordinates. Ratatui reserves a title row, which made
real clicks one row off even though direct App tests passed. Shared sidebar/document content-area
functions now drive both rendering expectations and terminal hit translation.

## Traps worth knowing

- Ratatui block titles consume an inner row even when only a bottom or right border is requested.
  Mouse hit testing must use `document_content_area` and `sidebar_content_area`, not outer regions.
- A terminal cell inside a wide grapheme maps to that grapheme's first byte; a click beyond line
  content clamps to the line end. Stored ranges remain half-open UTF-8 byte offsets.
- Read-mode selection styles a parser-declared source span. It never invents a byte offset for
  synthetic list, quote, rule, or image markers.
- The non-TTY launch surface intentionally does not initialize Crossterm, which keeps help and
  automation safe when stdout is piped.

## Evidence

| Check | Result |
|---|---|
| Markdown | reader constructs, wrapping, inert HTML/remote image text, and exact/whole-node maps passed |
| Application | keyboard tree/search/edit/find/replace/save/mode/quit workflow and vertical wide-cell movement passed |
| Layout | TestBackend at 40×12, 80×24, and 160×50 plus tree-width reallocation and narrow focus passed |
| Mouse | constructed press/drag/release activated a tree file and selected across a wide grapheme |
| Rendering safety | source selection is visible and control characters in document paths are inert |
| Terminal lifecycle | PTY quit and startup-error paths restored escape modes and the original termios state |
| Quality gate | all 28 root tests, format, strict Clippy, locked release build, and `git diff --check` passed |
| Source cohesion | all handwritten production files remain below 500 lines |

## What this unblocks

- Goal 03 can consume the one visible exact source selection for comments, handoff, and image-link
  insertion.
- Goal 04 can exercise a real terminal binary instead of a CLI skeleton.

## What remains blocked

- Persistent review, Herdr handoff, and clipboard-image insertion remain in Goal 03.
- Live Herdr and owner-side Ghostty evidence remains in Goal 04.
