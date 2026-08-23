# CLI reference

## Synopsis

```text
zd
zd <folder>
zd <file>
```

## Launch forms

| Command | Result |
| --- | --- |
| `zd` | Open the workbench without selecting a project or file. |
| `zd .` | Open the current directory as an approved project. |
| `zd <folder>` | Open that directory as an approved project. |
| `zd <file>` | Approve the file’s parent as a project and open the file. A missing file is created on its first successful save. |

The first positional argument is the launch path. There is no product or surface selector.

## Path resolution

- Relative paths resolve from the process working directory—the directory where you invoked `zd`.
- Absolute paths are used unchanged.
- `.` components are normalized before the launch reaches the frontend.
- A folder launch grants access to that folder. A file launch grants access to its parent.
- Adding projects or worktrees later requires an explicit native picker or structured worktree
  operation. Frontend code cannot widen those grants.

## Native launches

Opening `zd.app` from Finder, Spotlight, or the Dock opens the same root workbench without selecting
a file. Opening an associated `.md` or `.markdown` file queues that file for the running app. A
recoverable draft keeps unsaved text and does not block the switch. Returning to the previous file
restores that text.

Ordinary activation reuses the one root window. The global shortcut presents that same window as
quick access; repeated summon, Escape, or focus loss hides it without closing projects, files, or
terminal sessions.

See the [shortcut reference](shortcuts.md) for the default keys.
