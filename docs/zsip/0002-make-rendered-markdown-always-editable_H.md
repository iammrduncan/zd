# 0002: Make rendered Markdown always editable

## Status

Accepted

## Summary

Use one rendered Markdown surface that stays editable. Do not make readers switch between a preview
and a source editor.

## Motivation

The first rebuild plan separated reading from editing. Feedback showed that focus, caret movement,
word wrap, source notation, and save state all depend on one document position. Two modes would
make those features arrive twice or synchronize two representations.

The accepted decision appears in the
[task archive](../_objectives/todo-archive.txt): “unify reading and editing into one mode.”

## Proposal

- Make CodeMirror the only source buffer and document surface.
- Render Markdown structure with decorations and widgets around editable source.
- Keep a caret available without making the surface look like an IDE.
- Derive focus, typewriter motion, save state, and visible notation from the same editor state.
- Keep word wrap available at all times.

## Alternatives

- Use separate reading and editing modes with a mode switch.
- Keep a read-only rendered document synchronized with a hidden or secondary source editor.
- Open a separate source window when the user wants to edit.

## Effects

### Positive

- The text being read is exactly the text being edited and saved.
- Focus and navigation use one document position.
- Users do not lose context during a mode change.
- The product has one surface model instead of synchronization logic.

### Negative

- CodeMirror decorations must preserve editing semantics while hiding or shaping notation.
- Browser tests must cover selection, widgets, parsing delay, and viewport rendering together.

### Neutral

- Raw mode can still expose unshaped source without creating a second document.
- Reading remains the visual priority even though the surface is editable.

## If we do not adopt this proposal

The app needs two surfaces or two modes. New caret-dependent behavior must either wait for the
editor or be rebuilt after the editor arrives.

## Resulting ADRs

- [md ADR 0002: Use one always-editable document surface](../adr/md/0002-use-one-always-editable-document-surface_H.md)
