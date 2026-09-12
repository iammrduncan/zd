# CLI reference

## Synopsis

```text
zd
zd <folder>
zd <file>
zd serve [<folder>] [--bind <ip>] [--port <port>] [--secret <text>]
```

## Launch forms

| Command | Result |
| --- | --- |
| `zd` | Open the workbench without selecting a project or file. |
| `zd .` | Open the current directory as an approved project. |
| `zd <folder>` | Open that directory as an approved project. |
| `zd <file>` | Approve the file’s parent as a project and open the file. A missing file is created on its first successful save. |
| `zd serve [<folder>] [--bind <ip>] [--port <port>] [--secret <text>]` | Run a foreground workbench host for direct browser access. The folder defaults to the current directory. |

The first positional argument in a desktop launch is the launch path. `serve` is the only public
subcommand. Use `./serve` to open a folder named `serve` instead.

## Serve options

| Option | Value and default |
| --- | --- |
| `<folder>` | One folder to approve. The default is the process working directory. |
| `--bind <ip>` | One numeric IPv4 address. The default is `0.0.0.0`, which listens on all IPv4 interfaces. Use the host's protected-network address for remote access or `127.0.0.1` for same-machine access. |
| `--port <port>` | An integer from `0` through `65535`. The default port `0` asks the operating system to choose a free port. |
| `--secret <text>` | A fixed process secret you choose, for typing by hand. When it is supplied the host binds `127.0.0.1` unless `--bind` names a loopback or Tailscale-range (`100.64.0.0/10`) address; any other bind is refused. Omit it for a generated secret. |

The foreground process prints `zd serve URL:` and `zd serve secret:` on separate lines when it is
ready. It keeps running until `Ctrl+C` or a termination signal stops it. See
[Serve a workbench](../how-to/serve-a-workbench.md) for the complete remote-browser and security
steps.

After one successful secret-based unlock, the browser receives a one-year, HTTP-only,
`SameSite=Strict` cookie restricted to `/api/host`. The cookie works for the same host name or IP
address across port and process-secret changes. It is not available to page scripts,
`localStorage`, or `sessionStorage`.

## Path resolution

- Relative paths resolve from the process working directory—the directory where you invoked `zd`.
- Absolute paths are used unchanged.
- `.` components are normalized before the launch reaches the frontend.
- A folder launch grants access to that folder. A file launch grants access to its parent.
- A served folder is resolved by the same rules and approved before the network listener starts.
- In a served browser, **Open** uses a host-controlled remote folder browser. The browser can submit
  only host-issued directory handles and a direct-child name filter; it cannot submit a root path.
  A selected project is restored beside the startup project until it is closed in the UI.
- In the desktop wrapper, **Open** uses the viewing computer's native folder picker. Structured Git
  worktree operations can add another worktree to an existing project.

## Native launches

Opening `zd.app` from Finder, Spotlight, or the Dock opens the same root workbench without selecting
a file. Opening an associated `.md` or `.markdown` file queues that file for the running app. A
recoverable draft keeps unsaved text and does not block the switch. Returning to the previous file
restores that text.

Ordinary activation reuses the one root window. The global shortcut presents that same window as
quick access; repeated summon, Escape, or focus loss hides it without closing projects, files, or
terminal sessions.

See the [shortcut reference](shortcuts.md) for the default keys.
