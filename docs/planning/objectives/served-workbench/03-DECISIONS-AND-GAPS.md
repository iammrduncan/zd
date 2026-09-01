# Decisions and remaining gaps

This document records which choices are authoritative now, which implementation choices the plan
makes, and which gaps deliberately remain outside the first goal.

## Authority reconciled

[ADR 0009](../../../adr/suite/0009-let-browsers-connect-directly-to-served-hosts_H.md)
supersedes the loopback-and-tunnel transport in ADR 0008 while preserving one host backend.
[`VISION.md`](../../../VISION.md) now includes `zd serve <folder>`, host-owned project authority, one
controlling served client, and direct browser access. [`DESIGN.md`](../../../DESIGN.md) assigns files,
Git, watchers, PTYs, persistence, and host diagnostics to the host while keeping window behavior in
the client shell.

ADR 0002's typed platform boundary, ADR 0005's single frontend workbench-state owner, ADR 0006's
grant and relative-resource model, and ADR 0007's command registry remain in force. The server does
not turn those into transport-shaped product APIs.

## Owner decisions applied

- Remote work is now in scope.
- `zd serve` is the eventual foreground entry point.
- Browser and Tauri clients use one host implementation.
- Tauri is a desktop client shell, not a second file or terminal backend.
- The remote client is only a browser and does not create a tunnel or run a helper.
- On 2026-09-01, the owner first deferred native Windows process-containment and wrapper execution
  from Goals 03 and 04, then removed Windows from the current objective's release gate. Those goals
  complete on Linux, portable Unix-process, and real-browser evidence. Windows remains unverified
  and deferred beyond this objective.

## Planning decisions

- Direct same-origin HTTP over an already-protected network is the first remote transport.
- Direct serve listens on all IPv4 interfaces by default; an operator may restrict the bind address.
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
3. PTY reattachment, disconnect grace, and wrapper supervision have real Linux and portable Unix
   evidence. Native Windows execution remains deferred beyond this objective.
4. Absolute host-path display needs a privacy/product review for remote clients.
5. Windows console/GUI names remain future work. Linux distribution targets need release
   experiments in Goal 05.
6. Public Internet access, direct HTTPS, and managed proxies need a new threat model and architecture
   decision.
7. Multi-client access needs new watcher, terminal, conflict, and state ownership semantics.

## Stop conditions

Stop and return to planning if implementation requires a browser-supplied root, a generic command or
filesystem method, a second host implementation, durable work in random origin-only storage,
concurrent controllers, trusted proxy headers, or public-Internet exposure. Each changes the
authority or threat model rather than filling in an implementation detail.

## Not covered

This objective does not design cloud accounts, collaboration, public hosting, a remote installation
manager, or an SSH client. Those are independent products, not hidden completion criteria for a
direct private-network workbench.
