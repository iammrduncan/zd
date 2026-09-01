# CLI reference

## Synopsis

```text
zd
zd <folder>
zd <file>
zd serve [<folder>] [--bind <ip>] [--port <port>]
```

## Launch forms

| Command | Result |
| --- | --- |
| `zd` | Open the workbench without selecting a project or file. |
| `zd .` | Open the current directory as an approved project. |
| `zd <folder>` | Open that directory as an approved project. |
| `zd <file>` | Approve the file’s parent as a project and open the file. A missing file is created on its first successful save. |
| `zd serve [<folder>] [--bind <ip>] [--port <port>]` | Run a foreground workbench host for direct browser access. The folder defaults to the current directory. |

The first positional argument in a desktop launch is the launch path. `serve` is the only public
subcommand. Use `./serve` to open a folder named `serve` instead.

## Serve options

| Option | Value and default |
| --- | --- |
| `<folder>` | One folder to approve. The default is the process working directory. |
| `--bind <ip>` | One numeric IPv4 address. The default is `0.0.0.0`, which listens on all IPv4 interfaces. Use the host's protected-network address for remote access or `127.0.0.1` for same-machine access. |
| `--port <port>` | An integer from `0` through `65535`. The default port `0` asks the operating system to choose a free port. |

The foreground process prints `zd serve URL:` and `zd serve secret:` on separate lines when it is
ready. It keeps running until `Ctrl+C` or a termination signal stops it. See
[Serve a workbench](../how-to/serve-a-workbench.md) for the complete remote-browser and security
steps.

## Path resolution

- Relative paths resolve from the process working directory—the directory where you invoked `zd`.
- Absolute paths are used unchanged.
- `.` components are normalized before the launch reaches the frontend.
- A folder launch grants access to that folder. A file launch grants access to its parent.
- A served folder is resolved by the same rules and approved before the network listener starts.
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
