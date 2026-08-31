# Decisions and remaining gaps

This document records which choices are authoritative now, which implementation choices the plan
makes, and which gaps deliberately remain outside the first goal.

## Authority reconciled

[ADR 0008](../../../adr/suite/0008-serve-one-host-backend-to-browser-and-desktop-clients_H.md)
supersedes the original Tauri-as-authority decision. [`VISION.md`](../../../VISION.md) now includes
`zd serve <folder>`, host-owned project authority, one controlling served client, and protected
remote access. [`DESIGN.md`](../../../DESIGN.md) assigns files, Git, watchers, PTYs, persistence, and
host diagnostics to the host while keeping window behavior in the client shell.

ADR 0002's typed platform boundary, ADR 0005's single frontend workbench-state owner, ADR 0006's
grant and relative-resource model, and ADR 0007's command registry remain in force. The server does
not turn those into transport-shaped product APIs.

## Owner decisions applied

- Remote work is now in scope.
- `zd serve` is the eventual foreground entry point.
- Browser and Tauri clients use one host implementation.
- Tauri is a desktop client shell, not a second file or terminal backend.

## Planning decisions

- Loopback plus an explicit SSH port forward is the first remote transport.
- One authenticated WebSocket carries privileged protocol traffic.
- One process-scoped owner secret and one controller are sufficient for the first product.
- The CLI startup path creates the only initial grant; browser input cannot widen it.
- The first walking skeleton is read-only and does not modify the default desktop app.
- Durable work moves behind host persistence before served writes ship.
- PTY reconnect is designed before terminals migrate.
- Tauri launches and supervises the same `zd serve` executable used from a terminal.

## Known gaps after the first goal

1. Numeric request, queue, file, watcher, terminal, and shutdown limits need measured fixtures.
2. Durable state schema and migration need a separate contract.
3. PTY reattachment and disconnect grace need real Unix and Windows evidence.
4. Absolute host-path display needs a privacy/product review for remote clients.
5. Windows console/GUI names and Linux distribution targets need release experiments.
6. Direct HTTPS or managed proxies need a new threat model and architecture decision.
7. Multi-client access needs new watcher, terminal, conflict, and state ownership semantics.

## Stop conditions

Stop and return to planning if implementation requires a non-loopback listener, a browser-supplied
root, a generic command or filesystem method, a second host implementation, durable work in random
origin-only storage, or concurrent controllers. Each changes the authority or threat model rather
than filling in an implementation detail.

## Not covered

This objective does not design cloud accounts, collaboration, public hosting, a remote installation
manager, or an SSH client. Those are independent products, not hidden completion criteria for a
loopback served workbench.
