# Manage projects and threads

Use the Projects pane to keep several approved projects and their terminal sessions in one
workbench. Each thread remembers its project, worktree, current file, and terminal context.

## Add a project

Choose **Open** in the `PROJECTS` header, then select a folder in the native picker.
`zd` adds that folder as an approved project without replacing projects that are already open.

Choose a project heading to activate its remembered worktree, thread, and file together. Use
`Cmd+1` through `Cmd+9` on macOS, or `Ctrl+1` through `Ctrl+9` elsewhere, to activate the first nine
projects in their displayed order.

If a project moved or became unavailable, use its **Locate** action to approve the new location.
Removing a project revokes its native grant only after running terminals allow the transition. It
does not delete the folder. Ordinary project switches keep unsaved files as recoverable drafts and
restore them when you return.

## Collapse the Projects pane

Choose the left chevron at the bottom of the Projects pane to turn it into a 56 px icon rail. Project
monograms identify project headings; terminal or agent icons and state dots identify their threads.
Choose the right chevron to restore the previous full width. Collapsing does not change the active
project, thread, file, scroll position, or live terminal session.

Use `[p]` in the top drag strip to hide or restore the whole Projects pane. Project monograms appear
only in the collapsed icon rail, not beside names in the full pane.

## Create a terminal thread

Under a project heading, choose **+ Thread**, enter a name, and select a type:

- **Terminal** for an ordinary shell session.
- **Codex**, **Claude Code**, or **OpenCode** when that terminal will host the named agent.

Choose where the shell starts:

- **Project root** uses the approved root folder.
- **Worktree** uses an existing approved Git worktree.
- **New worktree** asks for a worktree name, branch, and optional base revision. `zd` checks Git
  collisions and locks before creating and approving it.

Choose **Create**. The native shell starts the user shell inside the selected scope. `zd` does not
accept an executable, argument list, environment, or arbitrary path from the frontend.

## Switch, rename, or reorder threads

Choose a thread row to activate the complete project/worktree/thread context. Secondary-click a
thread (or press the keyboard Context Menu key) to choose whether every row's second line shows the
running app/status, current approved directory, or branch/worktree. The choice is remembered.
Attention remains available in the row's state and accessible label. Rename and reorder actions
preserve its stable identity and terminal session.

Choose the active thread row again to return to its current or last-opened file. Choose it once more
to show the still-mounted terminal again; this is the same switch as `Cmd+J` on macOS or `Ctrl+J`
elsewhere.

Each row has one removal action. Removing a live thread terminates and disposes its terminal before
removing the row; removing an exited thread removes the row directly. It never deletes the thread's
Git worktree or branch. If termination fails, the row stays visible with the specific failure
instead of switching to a partial context.

## Configure completion attention

Press `Cmd+,` on macOS or `Ctrl+,` elsewhere to open **Settings**. Desktop completion notifications
and sounds are both off by default. Native notifications and completion sounds are currently
available on macOS; other platforms show the controls as unavailable. When sound is on, changing a
per-agent sound plays the new choice once at the selected volume. Press the Settings shortcut again
to close the sheet. The `[s]` action in the top drag strip opens the same Settings sheet.

When enabled, one supported-agent transition from busy to waiting may show one notification. **View**
returns to the ordinary workbench and activates that exact thread. Notification text contains only
the project name, thread name, and agent label. Mute, volume, and per-agent sound choices are stored
locally.
