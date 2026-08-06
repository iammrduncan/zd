# CLI reference

## Synopsis

```text
zd
zd md
zd md <path>
zd <path>
```

`md` is the default and currently the only mini app.

## Launch forms

| Command | Result |
| --- | --- |
| `zd` or `zd md` | Start `md` without a document. The v0.1 build shows its no-document surface. |
| `zd md .` | Open the current directory as a Markdown workspace. |
| `zd md <file>` | Open one file. A missing file is created on its first successful save. |
| `zd <path>` | Open the path with the default `md` mini app. |

## Path resolution

- Relative paths resolve from the process working directory—the directory where `zd` was invoked.
- Absolute paths are used unchanged.
- `.` components are normalized before the launch reaches the frontend.
- Opening a file scopes native file access to its parent directory. Opening a directory scopes
  access to that directory.
- A workspace lists Markdown files recursively in stable path order.

## Native launches

Opening `zd.app` from Finder, Spotlight, or the Dock is equivalent to launching without a document.
Opening an associated `.md` or `.markdown` file queues that file for the current app. A document
with unsaved work must accept the switch before the native filesystem scope moves.

## Shortcuts

Hold `Cmd+.` on macOS or `Ctrl+.` elsewhere to display the commands available in the current
context. That view is the authoritative shortcut reference because it is generated from the live
command registry.

The desktop app reports anonymous live presence to SSPS while it is open. Press `Cmd+Option+P` on
macOS or `Ctrl+Alt+P` elsewhere to disable or re-enable reporting for every open window. The choice
persists across launches.
