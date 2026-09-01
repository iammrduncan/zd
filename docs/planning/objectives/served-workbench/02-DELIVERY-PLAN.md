# Delivery plan: prove the host boundary before migrating authority

This document orders the implementation so each stage produces independent evidence and does not
force the riskiest lifecycle work into the first change. It derives from the
[diagnosis](00-DIAGNOSIS.md) and [target architecture](01-TARGET-ARCHITECTURE.md).

## Work packet 0: read-only served-host walking skeleton

Create a Tauri-free Rust host boundary for one CLI-approved project, a loopback served-host adapter,
the authenticated versioned socket, packaged frontend assets, and a real browser host client. Expose
only launch description, the startup grant, a bounded file-tree snapshot, and bounded file read.
Every served text result is non-writable, so the existing editor mounts read-only and creates no
local draft.

This packet comes first because it tests the four assumptions every later packet needs:

1. existing Rust authority can move below a public host interface;
2. the current TypeScript workbench can boot through a real network adapter;
3. loopback authentication and Origin handling work in a browser; and
4. real browser-to-Rust tests can replace fixture-only confidence.

It deliberately does not change the default Tauri application, write files, watch directories, run
Git, start a PTY, persist browser work, or publish an installed `zd serve` artifact. Its runnable
developer command and browser evidence are the narrow first goal requested by the owner.

Change surface: medium. It crosses Rust composition, asset serving, a small protocol schema, and
browser boot, but avoids mutation, reconnect, desktop lifecycle, and packaging.

## Work packet 1: durable file and Git authority

After packet 0 proves the boundary, move file writes, stamps, images, mutations, Git reads, worktree
operations, workspace recovery, validated themes, and durable workbench storage behind the host
service and protocol. Give grants stable persisted identities and move drafts/reviews/workbench
snapshots away from origin-only storage before served editing is enabled.

This cannot safely precede packet 0 because a write-capable protocol magnifies mistakes in
authentication, path scoping, type closure, and test harnesses. It cannot be deferred past PTYs
because the terminal reconnect snapshot needs stable project, worktree, thread, and server identities.

Change surface: large. Synchronous frontend preference/draft access, durable schema migration, and
write bounds are the main uncertainty.

## Work packet 2: watchers, PTYs, and reconnect

Move file-watch events and the full terminal lifecycle onto the socket. Add session epoch and event
sequence handling, bounded slow-client queues, heartbeat, disconnect grace, resource snapshot, and
explicit terminal reattachment or terminal-loss results. Preserve current descendant cleanup on
shutdown.

This follows durable identity work because the current terminal handles are frontend-runtime values.
Adding a socket without restart/reconnect semantics would strand processes whenever SSH or the page
reloads. It also follows the request protocol so streaming builds on proven auth, bounds, errors, and
correlation rather than inventing a second message model.

Change surface: large and highest-risk. PTY lifecycle across disconnects and real Windows process
containment are the most likely sources of redesign.

## Work packet 3: stable CLI dispatch and Tauri client shell

Make `zd serve [<folder>] [--port <port>]` a stable foreground execution mode before the desktop
wrapper depends on it. Tauri launches and supervises that same executable in `serve` mode, waits for
a private bounded readiness record, validates its exact loopback origin and protocol version, and
then navigates the `main` webview. Compose the same `WorkbenchHost` with `TauriShell`.

Define primary-instance arbitration so a webview reload or secondary desktop launch reuses the
existing child instead of creating another server. Preserve safe close, quick access, trusted open
requests, notifications, and external links through a narrowly scoped shell bridge. Continuously
drain child output; surface startup, early-exit, and disconnect failures; and implement graceful
shutdown, deadline-based forced termination, and reaping. Do not automatically restart a ready child
that exits; a later explicit retry can start a new generation only after conclusive reaping. Remove
migrated filesystem, Git, watcher, diagnostic-host, and terminal invoke handlers.

This follows the full host migration because navigating a privileged external page while old Tauri
commands remain exposed creates an unnecessary second authority surface. It follows PTY reconnect
because reload and wrapper lifecycle must not orphan terminal processes. Stable CLI dispatch comes
before wrapper delegation so the desktop path cannot silently fall back to an in-process server.

Change surface: large and platform-sensitive. Dynamic-origin persistence, Tauri capability scoping,
event-loop shutdown, and native smoke coverage carry the uncertainty.

## Work packet 4: release delivery

Package one authoritative frontend asset build and the stable foreground server for supported
remote hosts. Resolve the Windows console/GUI executable layout, update the macOS CLI link, add Linux
release coverage, and test installed readiness, shutdown, forced termination, reaping, and descendant
cleanup.

This comes last because artifact names, sidecars, or launcher topology should package a stable host,
CLI, and wrapper contract. Solving installers earlier would repeatedly encode changing server and
wrapper behavior.

Change surface: medium to large, dominated by Windows and new Linux release matrices rather than
product code.

## Release gates

| Gate | Evidence required before the next packet |
| --- | --- |
| 0 | Browser opens a real file from a temporary approved root; traversal, foreign Origin, and pre-auth requests fail; protocol timing is correlated |
| 1 | Writes and Git remain grant-scoped; durable drafts and state survive a different port and server restart; migrations fail closed |
| 2 | Tunnel interruption/reload has an explicit PTY result; event gaps resnapshot; slow clients remain bounded; descendants exit on shutdown |
| 3 | Browser and Tauri run the same host contract and executable entry point; reload does not duplicate the child; served origin cannot call retired native authority; desktop close and quick-access behavior remain intact |
| 4 | Installed macOS, Windows, and selected Linux artifacts exercise `zd serve`, browser connection, wrapper startup, and complete cleanup |

## Effort and review strategy

No calendar estimate is useful before packet 0 proves the crate and browser boundaries. Review each packet
as one independently revertible capability boundary. The highest variance is packet 2, followed by
Windows packaging in packet 4. If packet 0 cannot stay read-only and bounded, stop and re-plan rather
than pulling later packets into it.

## Deliberately not doing

- No product-managed SSH connection, remote installation, or certificate lifecycle.
- No direct `0.0.0.0`, LAN, public, reverse-proxy, or trusted-header mode.
- No accounts, permissions matrix, collaboration, simultaneous controllers, or takeover flow.
- No generic filesystem paths, executable/argv/environment terminal method, or route-per-Tauri-command
  mirror.
- No Vite HMR reverse proxy in the first packet.
- No user-facing release documentation until the corresponding behavior passes packaged evidence.
- No Tauri-specific in-process server path that bypasses the `zd serve` lifecycle.

## Coverage status

Work packet 0 is complete in goal 00. Goal 01 completed the stable-identity and durable-state half of
work packet 1. Their evidence fixed the host, protocol, browser, persistence, and test shapes needed
for the remaining work:

- goal 02 completes packet 1 by moving non-streaming file, Git, worktree, theme, and diagnostic
  authority behind the host;
- goal 03 delivers packet 2's watchers, PTYs, event sequencing, and reconnect behavior;
- goal 04 delivers packet 3's stable CLI and literal Tauri wrapper; and
- goal 05 delivers packet 4's macOS, Windows, and Linux release evidence.

The goals are serialized because every packet changes the host/protocol integration shape consumed
by the next. Goal 03 remains the highest-risk packet because it must reconcile process lifetime,
bounded output, tunnel interruption, replay gaps, and cross-platform descendant cleanup.
