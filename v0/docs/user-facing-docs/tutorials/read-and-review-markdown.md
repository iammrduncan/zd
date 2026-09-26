# Read and review Markdown

This tutorial takes you through `zd` as a focused Markdown reader and editor. You will open a
document, give it the full window, move through it one block at a time, and leave a comment that
appears in `zd-feedback.txt`.

Use a project with a Markdown README that you can review.

## 1. Open the document

From the project root, open its README directly:

```sh
zd README.md
```

`zd` opens the file as rendered Markdown. Headings, emphasis, lists, tables, fenced code, local
images, and Mermaid diagrams use document typography, but the surface remains directly editable.
There is no separate preview to open.

## 2. Give Markdown the full window

Choose `[p]` in the top strip to hide Projects. Choose `[f]` to hide Files and Changes.

The project panel, thread, and file panel are now out of the way. The Markdown document fills the
workbench beneath the quiet top strip. Choose the same controls again whenever you want those panels
back.

## 3. Focus one paragraph

Click inside a paragraph that you want to read. Press `Cmd+Shift+F` on macOS or `Ctrl+Shift+F` on
Windows and Linux.

Focus Mode keeps that paragraph at full contrast and dims the surrounding document. The caret is
the focus target, so clicking another paragraph moves the emphasis there without changing the file.

## 4. Move through the document by block

Press `Option+Down` on macOS or `Alt+Down` on Windows and Linux. The caret moves to the next Markdown
block and brings it to the reading position. Press `Option+Up` or `Alt+Up` to move back.

Continue for a few blocks. A paragraph, list, table, heading, or code example moves as a meaningful
unit instead of one wrapped source line at a time.

Press `Escape`, then scroll. With the caret dropped, Focus Mode follows the block at the centre of
the reading surface. Click in the document when you want the caret to own focus again.

## 5. Edit where you read

Click the sentence you want to change and edit it in place. The rendered document is the editor, so
your selection, caret, Find results, and undo history stay on the text you are reading. Press
`Cmd+S` on macOS or `Ctrl+S` elsewhere to save.

Press `Cmd+E` on macOS or `Ctrl+E` elsewhere to turn on **Raw Mode**. Markdown delimiters and fences
become visible without moving your caret. Press the shortcut again to return to rendered editing.

For a long document, press `Cmd+Option+T` on macOS or `Ctrl+Alt+T` elsewhere to turn on
**Typewriter Mode**. The caret line stays at a stable reading position while the document moves.
Press the shortcut again to turn it off.

### Undo an accidental editing session

A bold file name in Files has recoverable unsaved changes. Select one or more dirty files, or select
a folder that contains them. Right-click the selection and choose **Discard Unsaved Changes…**.
Check the number of files in the confirmation, then choose **Discard Changes**.

The affected files close. Open them again to read their saved copies. This action does not revert a
change that you already saved to disk.

## 6. Leave a precise comment

Select the exact words that need attention. Enter `Clarify this result.` in the comment box beside
the selection, then choose **Add comment**.

An inline comment tag appears beside the selected text. `zd` also creates or regenerates
`zd-feedback.txt` at the worktree root with the Markdown path, line range, quoted text, and your
comment.

Choose **Feedback** in the Markdown file header to see the complete review handoff. The file is now
ready for a person or coding agent to act on without searching for the passage you meant.

## 7. Finish the reading session

Press `Cmd+Shift+F` or `Ctrl+Shift+F` to leave Focus Mode. Choose `[p]` and `[f]` when you want the
project and file panels back.

You have completed the Markdown reading loop: open the rendered document, remove the workbench
chrome, focus and navigate its blocks, edit in place, and hand off a source-anchored comment.

Next, learn how to [review Markdown with comments](../how-to/review-markdown-with-comments.md) in an
active project or [paste a screenshot into a document](../how-to/paste-screenshots.md). The
[shortcut reference](../reference/shortcuts.md) lists every reading command in one table.
