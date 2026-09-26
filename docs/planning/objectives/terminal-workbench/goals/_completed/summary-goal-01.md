# Summary — goal 01: Own document editing and workspace navigation

**Completed:** 2026-09-26
**Commits:** `4981d34`, `e19dc6a`
**Goal file:** [`execute-goal-01.md`](execute-goal-01.md)

## Action needed from the owner

Nothing in this summary needs you. The source-coordinate, traversal, and limit choices were already
settled by the accepted design and no product-taste decision arose during implementation.

## What was delivered

1. A Ropey-backed `Document` owns UTF-8 source, exact half-open byte selections, cursor movement,
   grapheme-safe backspace, edit transactions, a 256-entry undo/redo bound, revisions, and dirty
   state without exposing Ropey types.
2. One coordinate boundary converts bytes to logical line, scalar, grapheme, and terminal-cell
   columns and converts line/grapheme positions back to bytes.
3. Literal and regex find navigate next/previous with wrap; replace-one and replace-all preserve
   regex captures and record each operation as one undoable edit. Zero-width expressions terminate.
4. File open refuses binary, invalid UTF-8, and files above 10 MiB. Save writes and flushes a sibling
   temporary, preserves existing permissions, atomically renames, and clears dirty state only after
   success.
5. `Workspace` owns a canonical root, rejects parent/absolute/symlink paths, applies one ignore
   traversal policy, orders directories before files, and projects collapsible tree state with a
   visible 50,000-entry cap.
6. Project search uses the same scan, skips binary/invalid/oversize content, returns stable relative
   path/line/byte ranges, sanitizes control characters, and exposes the 10,000-hit cap.

## What I got wrong

Two initial test expectations were incorrect: a multiline byte range stopped before its trailing
newline, and a broad `a.a` regex truthfully matched an earlier cross-word substring. I corrected the
fixtures to select the intended complete lines and anchor the regex rather than distorting the
implementation.

The first edit-size check performed arithmetic before validating the source range, so a hostile
`usize::MAX` endpoint panicked. A failing regression now proves invalid ranges are rejected before
size arithmetic.

The first file-open path rejected invalid UTF-8 and oversize input but still admitted NUL-bearing
binary bytes. A failing real-file regression now pins explicit binary refusal.

## Traps worth knowing

- Ropey's byte-to-char conversion deliberately rounds a byte inside a multibyte scalar down. The
  document boundary therefore confirms the reverse char-to-byte result before accepting a source
  position.
- Tree expansion is a projection over a complete ignore-aware scan; project search is independent of
  current visual expansion but uses the same eligible entry set.
- Unsupported binary, invalid-UTF-8, and oversize files remain visible in the tree so the UI can
  explain them, but search never decodes or matches them.

## Evidence

| Check | Result |
|---|---|
| Unicode coordinates | combining sequence, emoji ZWJ, and CJK movement/backspace/cell width passed |
| Edit/history | multiline replace, paste, undo/redo, selection validity, and hostile range tests passed |
| Find/replace | case-insensitive literal wrap, regex, zero-width, captures, count, and one-group undo passed |
| Save | refused replacement preserved bytes/dirty state; successful save reopened byte-for-byte and cleared dirty |
| File classification | binary, invalid UTF-8, and sparse oversize fixtures were refused |
| Tree | nested ignore fixture proved directories-first order, collapse/expand, symlink/hidden exclusion, and cap |
| Search | stable paths/lines/ranges, unsupported-content skips, preview sanitization, and cap passed |
| Quality gate | all 17 root tests, format, strict Clippy, locked release build, and `git diff --check` passed |
| Source cohesion | all document/workspace production files remain below 500 lines |

## What this unblocks

- Goal 02 can build terminal input, layout, mouse hit testing, and Markdown source maps over one
  authoritative document/workspace API.
- Goal 03 can later persist review anchors and image edits in stable byte ranges and transactions.

## What remains blocked

- Goals 03 and 04 remain serialized behind the terminal UI and Markdown work in Goal 02.
