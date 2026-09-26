# Editor Goal

Status: **complete — 2026-08-22**

## Outcome

CodeMirror is the one editor engine for Markdown and code. Markdown keeps the current rendered,
directly editable reading experience; other supported text files receive a restrained code
presentation with line numbers, syntax highlighting, and complete current-file find/replace.

## Visual References

- [Current reader](../../../user-facing-docs/assets/zd-reader.jpeg) and
  [current comments view](../../../user-facing-docs/assets/zd-comments.png) are the actual baseline
  for retained Markdown typography, rendered editing, focus treatment, measure, and light-theme
  behavior.
- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) shows the editor owning the
  centre surface by itself.
- [Approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) shows the same editor
  reflowed beside a thread without adding a toolbar, breadcrumb strip, or minimap.

The current screenshots govern retained editor character; the concepts govern workbench placement.
Apply the shared Visual Reference Contract in `goal.md`.

## Decision

Keep CodeMirror. It is faster and smaller than Monaco for this workbench, already supports the
custom Markdown surface, and avoids maintaining two editor state, theme, search, and input stacks.

## Acceptance Criteria

1. Markdown preserves the current semantic typography, rendered constructs, source honesty,
   selection, editing, focus targeting, Raw Mode, undo history, and safe rendering behavior.
2. Non-Markdown text opens in the same editor module without Markdown parsing or decoration. It
   opens at line one at the top of a full-width code plane and uses a compact line-number gutter,
   the shared canvas, code typography, wrapping preference, selection, undo/redo, and atomic save
   path.
3. A versioned language registry maps filenames and extensions to bundled CodeMirror language
   packages. Adding a language changes one registry and one test inventory rather than branching
   across the shell and editor.
4. Rust, JavaScript, JSX, TypeScript, TSX, and HTML remain supported. The execution task selects
   the additional workbench languages from real repository fixtures; unsupported text remains
   honest monospaced plain text.
5. Binary, undecodable, missing, permission-denied, and over-limit files remain inspectable where
   safe and state exactly why editing is unavailable. The editor never guesses an encoding and
   corrupts a file on save.
6. Current-file Find supports next, previous, result position/count, case sensitivity, whole-word,
   and regular-expression options. Replace next and Replace all are single undoable editor
   transactions and never mutate a read-only buffer.
7. Markdown Find has a documented rule for visible rendered text versus hidden source. Every match
   shown on the surface maps to a real source range, including links, widgets, and Raw Mode.
8. Focus Mode is off by default and remains an explicit toggle. Focus and Find receive distinct,
   platform-reviewed command bindings from the shared registry.
9. Search, syntax parsing, and decoration work remain incremental or viewport-bounded. A
   multi-megabyte text fixture records open, find, scroll, edit, memory, and long-line behavior in a
   release build before the goal closes.
10. Unit and browser tests cover language resolution, unsupported text, read-only/error states,
    find options, replacement and undo, rendered-source mapping, shortcuts, saving, large files,
    and preservation of existing Markdown behavior.

## Completion Evidence

- `packages/app/src/editor/` is the stable CodeMirror facade for buffer states, filename-driven
  language resolution, syntax presentation, Find/Replace, read-only use, and lifecycle handles.
- Markdown continues through the retained rendered-source editor, while Rust, JavaScript/JSX,
  TypeScript/TSX, HTML, CSS, JSON, and honest plain text share the same editor owner and themes.
  Non-Markdown buffers use a compact line-number gutter, the full code plane, and all seven theme
  syntax roles while Markdown retains its reader geometry.
- The current-file coordinator maps bounded native results to text, binary, undecodable, missing,
  denied, over-limit, and read-only states and keeps atomic save/dirty-close behavior intact.
- Release-browser evidence for the 3.72 MB, 48,000-line fixture recorded 142 ms open, 33 ms find,
  36 ms edit, 23 ms scroll settle, and 21 live CodeMirror lines; focused unit/browser coverage also
  proves replacement undo and rendered Markdown source mapping.

## Terminal Condition

A user can open, identify, edit, search, replace, save, and reopen supported Markdown and code
files through one CodeMirror owner, while large files remain responsive and the Markdown surface
retains its established behavior and appearance.

## Dependencies

- Requires the Workbench Reorganization Goal's current-file region, command registry, theme
  contract, and workbench state interface.
- Diff presentation in the File Tree Goal depends on the read-only editor-buffer interface from
  this goal, but the Files view and language work can proceed before diff integration.

## Exclusions

- Monaco or a second editor engine.
- Language servers, autocomplete, diagnostics, refactoring, debugging, breadcrumbs, minimaps, or
  IDE gutters beyond the compact line-number rail.
- Workspace-wide content search; current-file Find and file-tree filtering have separate owners.
