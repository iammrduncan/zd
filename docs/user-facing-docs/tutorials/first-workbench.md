# Start your first workbench

In this tutorial you will open a local project, create a terminal thread, edit one file, and inspect
the resulting Git change. You need `zd`, Git, and a terminal available on your computer.

## 1. Make a small project

```sh
mkdir zd-first-project
cd zd-first-project
git init
printf '# Field notes\n\nA quiet first paragraph.\n' > notes.md
git add notes.md
git commit -m "add field notes"
zd .
```

The project appears in the **Projects** pane on the left. Its expanded file tree appears under
**Files** on the right. Native access is limited to the project you opened.

## 2. Create a thread

Choose the `+` action in the project heading. Its accessible name is **New terminal in
zd-first-project**. You can press `Cmd+N` on macOS or `Ctrl+N` elsewhere to perform the same action
for the active project.

The centre switches to a terminal named `Terminal`, running your configured shell in the project
root. Run a harmless command:

```sh
git status --short
```

To use Codex, Claude Code, OpenCode, or another terminal program, enter its normal command in this
shell. `zd` does not install or launch an agent on your behalf.

## 3. Open and edit a file

Choose a folder row or its disclosure chevron to expand it; choose the row again to collapse it.
Choose `notes.md` under **Files**. The centre switches to the current file while the thread remains
available under its project. Add a second paragraph, then press `Cmd+S` on macOS or `Ctrl+S`
elsewhere.

Markdown remains directly editable, including cells inside rendered tables. Press `Cmd+E` or
`Ctrl+E` when you need to edit the table delimiters or other literal Markdown source. Code and
configuration files use the same editor with a filename-derived language mode.

You can also paste a clipboard image directly into this Markdown file. `zd` saves it below
`docs/screenshots` and inserts the relative image link at the caret. Select text when you want to
attach a review comment; the resulting inline note is also written to `zd-feedback.txt` at the
worktree root.

To copy a file path for a command or note, right-click the file under **Files**. Choose **Copy
Relative Path** for a path from the worktree root, such as `notes.md`, or **Copy Full Path** for its
absolute path on your computer. You can open the same menu from the keyboard with `Shift+F10` or the
Context Menu key.

The same menu opens files, creates children in a folder, renames files or folders, and moves them to
your operating system's Trash or Recycle Bin after confirmation. Right-click empty tree space to
create at the worktree root. Save or discard an unsaved draft before moving its path to Trash.

## 4. Inspect the change

Choose **Changes** on the right. Select `notes.md` in the working-tree list to open its read-only
before-and-after buffers. Your live editor buffer is not replaced or marked dirty by the diff.
Use `[f]` in the top drag strip when you want to hide or restore Files/Changes and give the centre
the full width.

You have completed the core loop: project, thread, file, and Git state stayed in one workbench. See
[Manage projects and threads](../how-to/manage-projects-and-threads.md) to add another repository or
worktree, [Review Markdown with comments](../how-to/review-markdown-with-comments.md) for a precise
handoff, [Paste a screenshot](../how-to/paste-screenshots.md) for visual context, and
[Inspect Git changes](../how-to/inspect-changes.md) for history comparisons.
