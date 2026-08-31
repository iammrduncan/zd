# 0008: Serve one host backend to browser and desktop clients

## Status

Accepted

Supersedes
[0001: Use Tauri with a portable web frontend](0001-use-tauri-with-portable-web-frontend_H.md).

## Context

The TypeScript workbench can render in a normal browser, but only the Tauri adapter can currently
use projects, files, Git, filesystem watchers, or pseudoterminals. Adding a separate browser backend
would create two orchestration paths for the same host operations.

A person also needs to run `zd` on another computer and use the workbench through a browser. A
custom SSH application protocol would couple remote connection, product messages, and process
lifecycle. It would also make a slow frontend, tunnel, host operation, and child process difficult
to distinguish.

Tauri still has legitimate client-local responsibilities. The viewing computer, not a remote host,
must own its window, focus, global shortcut, native notifications, external-link opening, and other
desktop presentation behavior.

## Decision

We will put host authority behind one versioned `zd` host protocol. The host will own approved
project and worktree grants, files, Git, filesystem watchers, pseudoterminals, host persistence, and
host diagnostics.

`zd serve <folder>` will approve the folder before it listens, serve the TypeScript workbench, and
accept an authenticated client on a loopback address. A browser on another computer will reach the
same loopback service through an explicit protected tunnel such as SSH port forwarding. Direct
public-network listening is a separate decision.

The desktop application will launch and supervise the same `zd serve` executable that an operator
starts from a terminal, then connect the TypeScript workbench to the same protocol. Tauri will
remain only as a client shell and host-lifecycle owner. It will not retain a parallel Tauri command
path for files, Git, watchers, or pseudoterminals after those capabilities migrate.

The frontend boundary will distinguish host capabilities from client-shell capabilities. Product
features will continue to depend on narrow product-oriented interfaces, not transport messages or
Tauri APIs. One frontend workbench state owner will continue to coordinate active project, thread,
file, region, and focus state.

## Consequences

- Browser and desktop clients use one backend implementation for host operations.
- SSH becomes an ordinary encrypted port forward, not a second product protocol.
- Request IDs and client, transport-residual, queue, handler, and rendering spans can share one
  boundary.
- The Tauri shell still needs a small, explicitly scoped bridge for client-local desktop behavior.
- The Tauri wrapper must bound server readiness, report early failure, drain child output, request
  graceful shutdown, force termination after a deadline, and reap the child on every exit path.
- The server protocol becomes a privileged security boundary with authentication, origin checks,
  message bounds, versioning, reconnect rules, and compatibility tests.
- A client that can control a pseudoterminal has the authority of the host operating-system user;
  project file grants do not sandbox commands typed into that shell.
- Free ports create distinct browser origins, so durable work cannot depend only on origin-local
  browser storage.
- Multi-client collaboration, direct public exposure, and proxy identity remain separate product
  and threat-model decisions.
