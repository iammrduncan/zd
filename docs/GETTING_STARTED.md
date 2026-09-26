# Get started with the terminal workbench

This tutorial takes you through one disposable Markdown edit, a review comment, Read mode, and a
safe handoff preview. It is for a first-time evaluator using an interactive terminal.

## 1. Build the prototype

From the repository root, run the locked release build:

```sh
scripts/dev-container.sh cargo build --release --locked
```

The helper uses installed Rust plus a C linker when available, or Podman otherwise.

## 2. Create a disposable project

```sh
tour_dir="$(mktemp -d)"
printf '# Tour\n\nSelect this sentence.\n' > "$tour_dir/README.md"
target/release/zd "$tour_dir/README.md"
```

If the helper built inside Podman and no host binary exists, launch through the helper instead:

```sh
scripts/dev-container.sh cargo run --release -- "$tour_dir/README.md"
```

You should see `README.md`, the literal Markdown source, and `EDIT` in the status row.

## 3. Navigate and edit

Press `Tab` to focus the file tree and `Tab` again to return to the document. Press `Ctrl-B` twice
to hide and restore the tree.

In the document, use the arrow keys or click to place the caret. Type a short sentence, then press
`Ctrl-Z` and `Ctrl-Y` to observe undo and redo. Press `Ctrl-S` to save.

Press `Ctrl-F`, enter `Select`, and press `Enter`. The matching source becomes the active selection.
Press `Ctrl-E`, enter `sentence`, press `Enter`, enter `line`, and press `Enter` again. The file now
contains the replacement as one undoable edit.

## 4. Read and review Markdown

Press `Ctrl-R` to enter Read mode. Click rendered text to select its truthful source span. Press
`Ctrl-N`, type a comment, and press `Enter` to save it.

Press `Ctrl-L` to open the Reviews sidebar. The comment is marked `attached`. If its exact/context
anchor later becomes missing or ambiguous, the same sidebar marks it `detached` instead of moving it
silently.

The review data is now visible at `$tour_dir/.zd/review-v1.json`.

## 5. Preview an agent handoff safely

With source selected, press `Ctrl-G`, type an instruction, and press `Enter`. If Herdr 0.9.1 is
available, choose a listed target and press `Enter` to inspect the complete payload.

Press `Esc` at the preview. A second `Enter` would submit to the named target; this tutorial does not
send anything. When Herdr is unavailable, the preview remains available for manual delivery.

## 6. Finish

Press `Ctrl-Q`. The alternate screen, mouse capture, bracketed paste, focus reporting, cursor, and
raw mode are restored. Inspect the disposable file and review sidecar if you want to see the saved
results.

Continue with the [prototype reference](REFERENCE.md) for every command and limit. Use the
[owner acceptance checklist](acceptance/GHOSTTY-HERDR.md) for Ghostty mouse, clipboard, and real
Herdr verification.
