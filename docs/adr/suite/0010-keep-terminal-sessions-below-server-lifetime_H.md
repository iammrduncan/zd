# 0010: Keep terminal sessions below server lifetime

## Status

Accepted

Supersedes
[0009: Let browsers connect directly to served hosts](0009-let-browsers-connect-directly-to-served-hosts_H.md).

## Context

The workbench uses one host protocol for browser and desktop clients. A remote browser connects
directly to `zd serve` and authenticates one controller before the host reveals project state or
accepts privileged work.

The server process currently owns each pseudoterminal and its child process. A browser disconnect
starts a cleanup deadline. Closing or restarting the server also terminates every child process.
The durable thread record then outlives the process that it identifies and appears as a detached
terminal after a page refresh.

A terminal must continue until a person closes it in the workbench or the terminal process exits.
Browser refresh, network loss, controller replacement, desktop-window close, and server restart
must not end it. An operating-system restart cannot preserve a live process.

An external terminal multiplexer would move the process lifetime, but it would also make an
optional system package part of core correctness. The browser-only client must not require a local
helper, extension, tunnel, or desktop application.

## Decision

We will run terminal sessions in a same-user `zd` terminal keeper below the lifetime of each served
HTTP process. The keeper will own pseudoterminals, child processes, bounded output, and stable
session identities. It will expose only the existing grant-scoped terminal operations through a
private operating-system-local channel.

`zd serve <folder>` will continue to serve the workbench directly to browser and desktop clients.
It will connect to the terminal keeper for terminal operations. Starting or stopping the HTTP
server will not start or stop an existing terminal session.

The durable workbench record will identify each logical terminal. A new browser or server process
will reattach that identity to the existing keeper session. It will not infer identity from project
order, silently create a replacement, or terminate a session because no controller is connected.

Only an explicit workbench close or terminate action may dispose a running terminal. A naturally
exited terminal will remain an exited record until the person closes or restarts it. If the keeper
or operating system loses a process, the workbench will report that loss and will not create a
duplicate automatically.

The server will keep its same-authority WebSocket checks and process-secret authentication. The
keeper channel will accept only the same operating-system user and will not be reachable from the
network.

## Consequences

- Page refresh, temporary network loss, desktop-window close, and server restart preserve terminal
  processes and buffered output.
- The browser still needs only the served URL, the process secret, and protected network reachability.
- Tauri supervises the served HTTP child, but closing Tauri no longer defines terminal lifetime.
- Stable logical identities replace scope-and-order matching during terminal reattachment.
- The keeper adds one local process boundary, a private protocol, stale-endpoint recovery, and an
  explicit same-user security check.
- Server shutdown continues to close network listeners and filesystem watchers, but it does not
  perform terminal cleanup.
- A keeper crash or operating-system restart still loses live processes. The durable records must
  present that loss without silently starting new shells.
- Linux and macOS can share a Unix-domain implementation. Windows support remains deferred and
  needs an equivalent same-user local channel before it can provide this behavior.
