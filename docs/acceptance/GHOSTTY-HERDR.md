# Accept v1.0.1 in Ghostty and Herdr

Use this checklist on the owner's actual macOS/Ghostty desktop. It verifies host behavior that the
Linux, fake-agent, and PTY tests cannot establish.

## Prepare

1. Build the exact commit under review with `cargo build --release --locked`.
2. Create a disposable Git project containing a Markdown file, a code file, ignored content, and a
   local image reference.
3. Start one disposable Herdr agent target. Do not use an agent that has unsaved or important work.
4. Run `target/release/zd /path/to/disposable-project/README.md` inside Herdr in Ghostty.

## Terminal and navigation

- [ ] The alternate screen opens at the current Ghostty size.
- [ ] `Tab`, arrows, `Enter`, and `Ctrl-B` navigate, expand, collapse, open, and hide the file tree.
- [ ] Ignored files do not appear in the tree or `Ctrl-P` results.
- [ ] At a narrow width, focus switches between the full tree and full document without lost state.
- [ ] Resizing narrow → wide → narrow preserves the active file, caret, selection, and mode.
- [ ] Ghostty's mouse-bypass modifier still permits native terminal text selection when desired.

## Editing and Markdown

- [ ] Keyboard and mouse place the caret correctly before, inside, and after emoji and CJK text.
- [ ] Drag selection remains correct after the document viewport scrolls.
- [ ] Bracketed text paste is one undoable edit.
- [ ] `Ctrl-F`, `Ctrl-E`, `Ctrl-Z`, `Ctrl-Y`, and `Ctrl-S` produce the expected file bytes.
- [ ] `Ctrl-R` preserves the source selection between Edit and Read mode.
- [ ] Raw HTML and remote image syntax remain inert; image alt/path text remains readable.

## Review and handoff

- [ ] `Ctrl-N` saves a comment from Edit selection and from selectable Read text.
- [ ] `Ctrl-L` shows attached comments and marks a deliberately ambiguous/deleted anchor detached.
- [ ] Reopening the project preserves `.zd/review-v1.json` comments.
- [ ] `Ctrl-G` lists the disposable Herdr agent and shows the exact target before preview.
- [ ] The preview contains the correct relative path, revision, byte range, instruction, and source.
- [ ] `Esc` cancels without sending.
- [ ] On a second attempt, the final `Enter` sends only to the disposable target.
- [ ] Stopping or hiding Herdr leaves a prepared manual prompt and does not start another session.

## Clipboard and cleanup

- [ ] Copy a small image in macOS, press `Ctrl-U`, enter alt text, and confirm.
- [ ] A valid PNG appears in the Markdown file's sibling `zd-images/` directory.
- [ ] The inserted relative link renders as safe alt/path text in Read mode.
- [ ] Undo/redo removes and restores the link as one edit; it does not delete the PNG.
- [ ] Text clipboard paste remains text and never invokes image paste.
- [ ] `Ctrl-Q` restores the cursor, normal screen, mouse behavior, paste behavior, and shell echo.
- [ ] Repeat the exit check after a refused clipboard operation and after closing the input stream.

## Record the result

Record the commit, macOS version, Ghostty version, Herdr version, pass/fail for each item, and any
terminal configuration that changes key or mouse behavior. Do not mark v1.0.1 accepted if a required
item is unobserved; write `not tested` and keep it open.
