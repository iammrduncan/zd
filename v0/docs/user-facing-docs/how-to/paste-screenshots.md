# Paste a screenshot into a document

Paste a clipboard image into editable Markdown or plain text. `zd` saves the image in the active
worktree and inserts a document-relative Markdown image link at the caret.

## Paste the image

1. Copy an image or take a screenshot with your operating system's screenshot shortcut.
2. Open an editable Markdown or plain-text file in `zd`.
3. Put the caret where the image reference should appear, or select text that the reference should
   replace.
4. Paste with `Cmd+V` on macOS or `Ctrl+V` elsewhere.

`zd` saves the image below `docs/screenshots` with a collision-safe name such as
`screenshot-1787501185841743000.png`. It then inserts a Markdown image with `Screenshot` as the alt
text and a document-relative target such as `../screenshots/screenshot-1787501185841743000.png`.

The relative path depends on the location of the open document. Save the document normally with
`Cmd+S` or `Ctrl+S`.

## If the image is not inserted

Image paste accepts PNG, JPEG, GIF, and WebP images up to 16 MiB. It is available only in editable
Markdown and plain-text files in the desktop app. Code files keep the clipboard operation as an
ordinary paste and do not insert a Markdown image link.

If the image cannot be validated or written, `zd` leaves the document unchanged and shows a notice.
Check that the worktree is available and writable, then copy the image and try again. Wait for a
pending screenshot save to finish before switching files or closing the window.

See [Review Markdown with comments](review-markdown-with-comments.md) to attach a request to the
text around a screenshot.
