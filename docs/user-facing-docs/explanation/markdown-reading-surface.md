# The Markdown reading surface

Markdown is the centre of `zd`. It is a reading surface that remains directly editable, not a
source editor paired with a separate preview.

## Rendered and editable are one state

Headings, emphasis, lists, quotations, links, local images, tables, fenced code, and Mermaid
diagrams receive document typography and layout in the same surface that owns the caret. Select or
edit the text where you are reading it. There is no preview switch that replaces the document or
moves your position.

Markdown notation stays tied to real source ranges. The editor can reveal structural characters
near the caret and map Find results, selection, undo, and comments back to the source. Press
`Cmd+E` on macOS or `Ctrl+E` elsewhere to use **Raw Mode** when you want every delimiter and fence
visible at once.

Rendered table cells are editable in place. Complete Mermaid fences and standalone `.mmd` or
`.mermaid` files render locally; Raw Mode reveals the diagram source. Invalid diagrams remain source
text instead of hiding the problem.

## Reading controls do not change the file

Focus Mode can dim surrounding text around the current line, paragraph, or section. Typewriter Mode
holds the caret line in a stable vertical position while the document moves beneath it. Word wrap
and theme selection apply without rebuilding the document or losing the caret.

These controls change presentation only. The file remains ordinary Markdown on disk.

## Review stays beside the source

Selecting Markdown can open a comment composer. Each note becomes an inline tag and one precise
entry in the worktree's `zd-feedback.txt`, so a person or coding agent can act on the same path,
line range, and quoted text you reviewed.

Pasting a clipboard image saves it below `docs/screenshots` and inserts a relative Markdown link.
That keeps a screenshot and its reference in the same project instead of sending either to a hosted
editor.

Remote images are blocked. Local images and Mermaid rendering stay inside the approved project and
the desktop application does not fetch remote content to complete the document.

Use [Review Markdown with comments](../how-to/review-markdown-with-comments.md) and
[Paste a screenshot into a document](../how-to/paste-screenshots.md) for the task steps.
