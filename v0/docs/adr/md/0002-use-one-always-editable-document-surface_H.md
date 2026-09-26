# 0002: Use one always-editable document surface

## Status

Accepted

## Context

The first rebuild plan separated a reader from a later editor. Human feedback accepted a different
product model: the rendered Markdown surface must remain directly editable.

Focus, caret movement, source notation, word wrap, dirty state, and save behavior all refer to one
document position. Two surfaces would need synchronization or repeated implementation.

## Decision

We will use one CodeMirror document as the rendered and editable surface.

Decorations will shape Markdown for reading while the source remains editable. The caret, focus
target, save state, notation, and typewriter movement will derive from the same editor state.

Raw mode can reveal literal source. It will not create another document or editor.

## Consequences

- The text on screen is the text that the app edits and saves.
- A user does not lose position during a preview or edit mode change.
- Product features use one document state and one selection.
- Decorations must remain correct while the user types through incomplete Markdown constructs.
- Browser tests must cover interactions between rendered widgets and editable source.
