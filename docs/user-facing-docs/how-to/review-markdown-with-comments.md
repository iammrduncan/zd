# Review Markdown with comments

Use comments to attach a precise note to selected Markdown and collect the complete handoff in
`zd-feedback.txt`. The comments do not change the reviewed Markdown.

## Add a comment

1. Open a Markdown file in the current file surface.
2. Select the exact text that needs attention.
3. Enter the requested change in the comment box that appears beside the selection.
4. Choose **Add comment**.

The note appears as an inline tag at the end of the selection's first line. `zd` also creates or
regenerates `zd-feedback.txt` at the current worktree root.

Repeat these steps in any Markdown file in the worktree. Each feedback line records the relative
file path, original line range, selected text, and comment:

```text
[plans/roadmap.md][LN12:LN14] [Ship the first useful slice.] Name the owner and due date.
```

Give `zd-feedback.txt` to a person or coding agent as the review handoff. Treat the file as generated
output: the next comment change replaces its contents.

## Open the complete feedback list

Choose **Feedback** in the current Markdown file header. The feedback view shows every comment in
the active worktree and the exact text written to `zd-feedback.txt`.

Choose an inline comment tag to open the same view with that comment's **Delete** action focused.

## Delete or replace a comment

Open the feedback view and choose **Delete** beside the comment. The inline tag disappears and
`zd-feedback.txt` is regenerated.

Comments cannot be edited in place. Delete the old comment, select the source again, and add the
replacement.

## Regenerate the feedback file

Open the feedback view and choose **Save feedback file**. Use this after restoring a worktree or if
another program removed `zd-feedback.txt`.

Comments are stored locally for the project and worktree. Moving only `zd-feedback.txt` moves the
handoff text, not the inline tags. Line references record the selection at the time you added the
comment, so check them after reorganizing the document.

Start with [Read and review Markdown](../tutorials/read-and-review-markdown.md) to learn the complete
focused reading and commenting loop.
