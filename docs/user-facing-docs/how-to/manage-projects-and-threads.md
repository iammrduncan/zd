# Manage projects and threads

Use the Projects pane to keep several approved projects and their terminal sessions in one
workbench. Each thread remembers its project, approved working directory, current file, and
terminal context.

## Add a project

Choose **Open** in the `PROJECTS` header, then select a folder in the native picker.
`zd` adds that folder as an approved project without replacing projects that are already open.

## Switch and arrange projects

Choose a project heading to activate its remembered thread and file together. You can also use:

- `Cmd+1` through `Cmd+9` on macOS, or `Ctrl+1` through `Ctrl+9` elsewhere, to activate one of the
  first nine displayed projects.
- `Cmd+Option+Up` or `Cmd+Option+Down` on macOS, or `Ctrl+Alt+Up` or `Ctrl+Alt+Down` elsewhere, to
  activate the previous or next project.

Drag a project heading to change the displayed order. The numbered and previous/next shortcuts use
that order.

If a project moved or became unavailable, choose **Locate folder** to approve the new location.
Secondary-click its heading and choose **Close** to remove it from the workbench. Closing revokes
the native grant only after running terminals allow the transition; it does not delete the folder.
Ordinary project switches keep unsaved files as recoverable drafts and restore them when you
return.

## Collapse the Projects pane

Choose the left chevron at the bottom of the Projects pane to turn it into a 56 px icon rail. Project
monograms identify project headings; terminal or agent icons and state dots identify their threads.
Choose the right chevron to restore the previous full width. Collapsing does not change the active
project, thread, file, scroll position, or live terminal session.

Use `[p]` in the top drag strip to hide or restore the whole Projects pane. Project monograms appear
only in the collapsed icon rail, not beside names in the full pane.

## Create a terminal thread

Choose the `+` action whose accessible name is **New terminal in _project_**. The terminal starts
immediately in that project's approved root folder.

To start a terminal in the active project without using the pointer, press `Cmd+N` on macOS or
`Ctrl+N` elsewhere. The action is unavailable when no active project has an approved folder.

The first thread is named `Terminal`; later threads use the next available number. A terminal title
can replace an automatic name. After you rename the thread yourself, terminal titles no longer
change it.

The new thread runs your configured shell. Start Codex, Claude Code, OpenCode, or another program by
entering its normal command in that shell. `zd` does not accept an executable, argument list,
environment, or arbitrary path from the webview.

## Switch, rename, or reorder threads

Choose a thread row to activate its complete project, working-directory, file, and terminal
context. Secondary-click a thread, or press the keyboard Context Menu key, to rename it or choose
whether every row's second line shows **App / status**, **Current directory**, or **Branch /
worktree**. The second-line choice is remembered. Drag a thread row to reorder it within its
project.

Choose the active thread row again to return to its current or last-opened file. Choose it once more
to show the still-mounted terminal again; this is the same switch as `Cmd+B` on macOS or `Ctrl+B`
elsewhere.

Use **Terminate and Remove Thread…** in the thread menu to stop a live terminal and remove its row.
An exited terminal uses **Remove Thread…**. Neither action deletes a Git worktree or branch. If
termination fails, the row stays visible with the reported failure.

## Use the project terminal

Press `Cmd+J` on macOS or `Ctrl+J` elsewhere to show or hide a shell for the active project. This
terminal is not a thread and does not add a row to the Projects pane. It stays mounted while hidden
and each project keeps its own runtime when you switch projects.

The project terminal docks at the bottom of the active file or thread side. Press `Cmd+D` or
`Ctrl+D` to split it side by side. Press `Cmd+Shift+D` or `Ctrl+Shift+D` to terminate and remove the
active split while another split remains. Closing a project asks you to terminate any live project
terminal first.

## Configure completion attention

Press `Cmd+,` on macOS or `Ctrl+,` elsewhere to open **Settings**. Desktop completion notifications
and sounds are both off by default. Native notifications and completion sounds are currently
available on macOS; other platforms show the controls as unavailable. When sound is on, changing a
per-agent sound plays the new choice once at the selected volume. Press the Settings shortcut again
to close the sheet. The `[s]` action in the top drag strip opens the same Settings sheet.

When enabled, one supported-agent transition from busy to waiting may show one notification.
**View** returns to the workbench and activates that exact thread. Notification text contains only
the project name, thread name, and agent label. Mute, volume, and per-agent sound choices are stored
locally.

The current **New terminal** action creates a shell thread. Starting an agent command inside that
shell does not relabel the thread as a supported-agent thread, so agent completion notifications do
not apply to newly created shell threads.
