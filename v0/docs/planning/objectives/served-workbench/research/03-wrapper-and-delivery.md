# Tauri wrapper and delivery constraints

This document answers research question 4 and the lifecycle part of question 5. The raw evidence is
in [the wrapper return](subagent_outputs/02-tauri-wrapper.txt).

## Established

The current executable always enters Tauri. Its parser would interpret `serve` as a path. Tauri
creates every grant, watcher, terminal, workspace, diagnostic, notification, and window service in
one process and exposes roughly fifty commands. Exit cleanup is attached to the Tauri event loop.

The current macOS installer links `/usr/local/bin/zd` to the application executable. Windows release
builds mark that executable with the GUI subsystem, which does not provide normal foreground console
behavior. Release automation produces macOS and Windows desktop artifacts and no Linux server
artifact. The standalone server also has no current way to embed or locate `packages/app/dist`.

Tauri can navigate a webview to an HTTP origin, but an external page does not automatically receive
Tauri API access. The HTTP server must send its own CSP and security headers. Rust child processes
are not killed or reaped when a `Child` handle is dropped, so a supervised-server design needs an
explicit readiness channel, continuous pipe draining, graceful shutdown, forced termination, and
`wait` on every path. [Tauri's webview documentation](https://docs.rs/tauri/latest/tauri/webview/struct.WebviewWindowBuilder.html),
[Tauri capabilities](https://v2.tauri.app/security/capabilities/), and
[`std::process::Child`](https://doc.rust-lang.org/std/process/struct.Child.html) establish these
constraints.

## Claimed

The owner wants Tauri to be a literal wrapper: it should present the TypeScript workbench and retain
client-local desktop behavior, while files, Git, watchers, and PTYs use the same host as a browser.

## Inferred

Two wrapper topologies are viable:

| Topology | Benefit | Cost |
| --- | --- | --- |
| Start the host library inside the Tauri process | Fewest lifecycle and packaging parts; no readiness pipe, orphan server, sidecar signing, or nested process containment | A host failure remains an application failure; the desktop and server artifacts share code rather than a process boundary |
| Spawn the standalone `zd serve` executable | Exact executable parity and crash isolation | Readiness/auth handoff, pipe backpressure, reaping, parent-death handling, PTY containment, Windows console/GUI artifacts, signing, and sidecar packaging |

The research agent preferred a supervised child, and this plan selects it because the owner asked
for Tauri to be a literal wrapper around `zd serve`. The console command and any temporary migration
adapter still use the same public host library underneath, but the final desktop path must exercise
the same executable, listener, protocol, and lifecycle as a terminal launch.

That choice makes process supervision part of the desktop contract. The wrapper must continuously
drain child output, enforce a bounded readiness deadline, report early exit, keep credentials out of
arguments and logs, and show startup or disconnect failure in the client shell. Reload and a
secondary desktop launch reuse the existing child instead of starting another server. Safe close
requests graceful shutdown, waits for host cleanup, forces termination after a deadline, and reaps
the child. A private parent-control channel gives the host a positive parent-loss signal where the
platform permits it.

Tauri remains responsible for the local window, focus and close negotiation, quick access, native
notifications, external links, and same-machine folder picking. Those operations need a tiny,
URL-scoped shell bridge. The served origin must not retain access to old Tauri file, Git, watcher, or
terminal commands after each capability migrates.

Production application assets should have one build output. The standalone server embeds or packages
that output, and the Tauri wrapper navigates to the host origin after it is ready. The Tauri localhost
plugin is not the backend; using it would add another asset-serving path without solving host
authority. Development can initially build/watch static assets with manual browser reload. Vite HMR
proxying is follow-up work, not part of the correctness boundary.

The desktop shutdown sequence is explicit: safe-close completes, the wrapper asks the child to stop,
the host stops accepting work, flushes durable state and diagnostics, closes watchers, terminates
and reaps PTYs, and closes the listener. The wrapper then waits for the child, force-terminates it
after a deadline if necessary, reaps it, and only then exits. Hiding and quick-access dismissal do
not stop it. A directly launched `zd serve` uses the same host shutdown path for SIGINT and SIGTERM
but remains independent of browser disconnects.

## Gaps

- A Tauri-hosted page on a random port cannot keep current origin-local persistence across launches.
- Reload with live PTYs has no reattach contract.
- The Windows and Linux CLI artifact layout is not decided or tested.
- macOS CLI symlink behavior must change if the desktop executable stops being the console entry
  point.
- Single-instance and file-association events must eventually become trusted host open requests
  without exposing an arbitrary browser path method.
- A real packaged Tauri/webview test harness does not exist.

These gaps are why the complete change is an objective rather than one simple goal. The first goal
will prove the standalone, read-only server boundary and leave the Tauri cutover until the host protocol
has real evidence.
