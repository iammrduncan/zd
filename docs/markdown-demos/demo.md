# Markdown rendering demos

Open these files in zd to check one part of the Markdown reading and editing surface at a time. The
examples stay intentionally stable so visual changes are easy to compare.

| Demo | What it covers |
| --- | --- |
| [Typography](typography.md) | ATX and Setext headings, prose, emphasis, inline code, and escaping |
| [Lists and quotes](lists-and-quotes.md) | Ordered, unordered, nested, task, quote, and rule blocks |
| [Tables](tables.md) | Alignment, inline content, long cells, and editing geometry |
| [Code fences](code-fences.md) | Supported languages, unknown languages, and indented code |
| [Diagrams](diagrams.md) | Mermaid flowchart and sequence rendering |
| [Images and links](images-and-links.md) | Project-relative images, blocked remote images, and links |

## Restore the demo files after accidental edits

zd keeps unsaved edits as recoverable drafts. A file name becomes bold in Files when it has one of
these drafts.

To restore every dirty demo file at once:

1. Right-click the `docs/markdown-demos` folder in Files.
2. Choose **Discard Unsaved Changes…**.
3. Check the number of affected files, then choose **Discard Changes**.

The affected files close. Open them again to read the copies saved in the worktree. You can also
select individual dirty files before you use the same action.

This action does not revert a change that you already saved to disk. Use Git to restore a saved
change.
