# Goal 06: Make rendered tables directly editable

Status: **superseded on 2026-08-22** by the [expanded-scope execution plan](../../../goals/expanded-scope/goal.md).
This file is retained as a historical planning snapshot and does not direct current implementation.

## Outcome

Markdown tables remain visually rendered on the single document surface while supporting direct
cell and structure edits that preserve valid, undoable source.

## Source todos

- **WU-036:** Edit table cells, rows, columns, and ordering in rendered form.
- **WU-037:** Decide whether Notion becomes a stated design inspiration.

## Acceptance criteria

1. The human owner answers whether Notion joins iA Writer and OmmWriter in the product vision. Any
   resulting vision or design clarification lands before table interaction is finalized.
2. A user can enter and edit every rendered table cell without switching the complete document to
   Raw Mode. Inline Markdown in a cell retains the shared safe renderer and editing semantics.
3. Keyboard and pointer operations can add and remove rows and columns. Destructive operations
   have an explicit target and cannot silently delete unrelated source.
4. A visible, keyboard-accessible handle can reorder rows or columns as approved by the design.
5. Table selection, caret movement, focus dimming, undo/redo, dirty state, save, and raw source all
   remain synchronized with the one CodeMirror document.
6. Editing produces valid Markdown with deterministic alignment behavior and no hidden data model
   that can diverge from the saved text.
7. Browser tests cover cell entry, inline content, each structural operation, keyboard access,
   undo/redo, focus, and saved source.

## Terminal condition

Both source todos are closed, the inspiration decision is recorded, and a user can edit cells,
add/remove/reorder table structure, undo the changes, and save/reopen the same Markdown through the
rendered surface.

## Exclusions

- Spreadsheet formulas, calculations, sorting, filtering, merged cells, or rich spreadsheet
  clipboard formats.
- A second table document model stored outside Markdown source.
- General block-widget editing unrelated to tables.

after finishing this goal write a goal-summary.md in this folder explaining how you completed the goal.
