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

The project appears in the Threads region on the left. Its expanded file tree appears under
**Files** on the right. Native access is limited to the project you opened.

## 2. Create a thread

Under the project heading, choose **+ Thread**. Name the thread `First pass`, leave **Terminal** and
**Project root** selected, then choose **Create**.

The centre switches to the thread’s terminal. Run a harmless command:

```sh
git status --short
```

A Codex, Claude Code, or OpenCode thread still starts your normal shell; choose its agent label and
start that agent from the terminal as you normally would. The label lets `zd` present the right
lifecycle and attention state without accepting arbitrary process commands from the webview.

## 3. Open and edit a file

Choose `notes.md` under **Files**. The centre switches to the current file while the thread remains
available under its project. Add a second paragraph, then press `Cmd+S` on macOS or `Ctrl+S`
elsewhere.

Markdown remains directly editable, including cells inside rendered tables. Press `Cmd+E` or
`Ctrl+E` when you need to edit the table delimiters or other literal Markdown source. Code and
configuration files use the same editor with a filename-derived language mode.

To copy a file path for a command or note, right-click the file under **Files**. Choose **Copy
Relative Path** for a path from the worktree root, such as `notes.md`, or **Copy Full Path** for its
absolute path on your computer. You can open the same menu from the keyboard with `Shift+F10` or the
Context Menu key.

## 4. Inspect the change

Choose **Changes** on the right. Select `notes.md` in the working-tree list to open its read-only
before-and-after buffers. Your live editor buffer is not replaced or marked dirty by the diff.
Use **Hide Files** at the upper-right edge when you want the centre to take the full width; the
action remains available as **Show Files**.

You have completed the core loop: project, thread, file, and Git state stayed in one workbench. See
[Manage projects and threads](../how-to/manage-projects-and-threads.md) to add another repository or
worktree, and [Inspect Git changes](../how-to/inspect-changes.md) for history comparisons.
