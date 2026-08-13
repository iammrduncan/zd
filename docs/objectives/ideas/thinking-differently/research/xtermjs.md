# xterm.js as ZD's terminal surface

Research date: 2026-08-11

Project: [xterm.js](https://xtermjs.org/)

## What it is

xterm.js is an MIT-licensed browser terminal component. It supplies terminal parsing, state, and a
browser renderer, and exposes addons and a documented public API. It is used by VS Code's integrated
terminal and other established products. It is a frontend only: ZD must connect it to an operating
system PTY, handle process lifecycle, resize, working directories, environment, and shutdown in its
native layer.

This fits ZD's existing web frontend much more directly than a Node binding to Ghostty's state
engine.

Sources:

- [xterm.js project and getting started](https://xtermjs.org/)
- [xterm.js documentation](https://xtermjs.org/docs/)
- [Encoding and PTY bridge guide](https://xtermjs.org/docs/guides/encoding/)
- [Security guide](https://xtermjs.org/docs/guides/security/)
- [Addon guide](https://xtermjs.org/docs/guides/using-addons/)

## Pros

- Designed to embed in exactly the browser surface ZD already uses.
- Mature public API, terminal-sequence documentation, addons, and a large production adoption base.
- Solves rendering as well as VT state, unlike `libghostty-vt-node`.
- Existing CSS/theming surface can be made visually coherent with ZD.
- Stable TypeScript/npm integration and permissive license.
- ZD can keep its native module deep: create PTY, stream bytes, resize, signal, and dispose.
- Cross-platform UI behavior, with platform-specific PTY details isolated below it.

## Cons

- Still requires a native PTY bridge and rigorous process cleanup.
- Terminal I/O and keystrokes pass through JavaScript; any script in the same context can observe or
  alter them.
- The official security guide warns that embedding a terminal inherits the trust of every script
  reachable in that page.
- System webviews and browser rendering may not match Ghostty's native performance, text shaping,
  or platform feel.
- Addons expand the dependency and security surface.
- Advanced terminal protocols, IME behavior, clipboard, links, drag/drop, and accessibility require
  integration testing.
- A terminal session is durable runtime state; careless project switching can kill or orphan PTYs.

## Security boundary

xterm.js should never share a scripting context with an embedded arbitrary website. The official
security guide recommends avoiding third-party resources and isolating the terminal in a smaller
context for complex applications. In ZD, that means:

- bundle every terminal dependency locally;
- put the terminal in its own local webview or an equally strong isolated context;
- grant that view only the minimal PTY commands for a specific session;
- never grant a browser webview terminal or filesystem IPC;
- validate terminal hyperlinks before opening them;
- treat all terminal output and title sequences as untrusted data;
- make session ownership and cleanup explicit in the Rust layer.

## Verdict

Best current candidate for a first integrated ZD terminal. It is the 80/20 choice that lets ZD own
the workflow and visual shell without pretending to become a terminal-emulation project. Build one
PTY, one view, resize, copy/paste, exit, and cleanup before considering multiplexing. Reevaluate a
stable embeddable `libghostty` renderer later based on measured deficiencies, not theoretical
performance.

## Evidence gaps

- No current ZD spike has proven xterm.js under the macOS and Windows system webviews.
- The Rust PTY crate/sidecar choice still needs a separate dependency evaluation.
- Performance and accessibility acceptance thresholds have not been written.
