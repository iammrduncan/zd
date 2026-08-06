# Review a workspace with comments

Use comments to attach review notes to selected Markdown and collect them in one
`zd-feedback.txt` file for a person or coding agent. Comments do not change the reviewed Markdown.

## Add a comment

Open the folder you want to review:

```sh
zd md .
```

Select the exact text that needs attention. A comment box appears beside the selection. Write the
requested change, then choose **Add comment**.

The comment appears as a tag at the end of the selection's first line. Select that tag to open the
feedback view at the matching comment.

Repeat this in any Markdown file in the workspace. The **Feedback** control at the bottom of the
file sidebar shows the total number of comments across the folder.

## Review the handoff

Choose **Feedback** in the file sidebar. If you opened one file instead of a folder, select any
inline comment tag to reach the same view.

The feedback view shows every comment and the generated `zd-feedback.txt` content. Each comment is
one line with the file, source line range, selected text, and requested change:

```text
[plans/roadmap.md][LN12:LN14] [Ship the first useful slice.] Name the owner and due date.
```

`zd` writes `zd-feedback.txt` at the workspace root after every added or deleted comment. For a
single-file launch, it writes the file beside that document. The reviewed Markdown remains
unchanged.

You can now point a person or coding agent at `zd-feedback.txt`. Treat it as generated output:
editing it directly is temporary because the next comment change replaces its contents.

## Delete or replace a comment

Open the feedback view and choose **Delete** beside a comment. The inline tag disappears and
`zd-feedback.txt` is regenerated.

Comments cannot be edited in place. Delete the old comment, select the source again, and add the
replacement.

## Recover a missing feedback file

Open the feedback view and choose **Save feedback file** to regenerate `zd-feedback.txt` from the
comments stored for that workspace. If the view reports that it could not save the file, confirm
that the workspace is still available and writable, then try again.

Inline tags are local to the current installation and workspace. Moving only `zd-feedback.txt` to
another computer moves the handoff text, not the tags. Line references record where the selection
was when the comment was created, so verify them after reorganizing a document.
