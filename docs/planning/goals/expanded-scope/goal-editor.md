# Editor Goal

## Outcome

CodeMirror is the one editor engine for Markdown and code. Markdown keeps the current rendered,
directly editable reading experience; other supported text files receive a restrained code
presentation with syntax highlighting and complete current-file find/replace.

## Decision

Keep CodeMirror. It is faster and smaller than Monaco for this workbench, already supports the
custom Markdown surface, and avoids maintaining two editor state, theme, search, and input stacks.

## Acceptance Criteria

1. Markdown preserves the current semantic typography, rendered constructs, source honesty,
   selection, editing, focus targeting, Raw Mode, undo history, and safe rendering behavior.
2. Non-Markdown text opens in the same editor module without Markdown parsing or decoration. It
   uses the shared canvas, code typography, wrapping preference, selection, undo/redo, and atomic
   save path.
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
  IDE gutters unless a later goal explicitly adds them.
- Workspace-wide content search; current-file Find and file-tree filtering have separate owners.
