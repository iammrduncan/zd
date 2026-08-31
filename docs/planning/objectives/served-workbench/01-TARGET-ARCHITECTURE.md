# Target architecture: one host, two client shells

This document defines the objective's vocabulary and selects the backend, frontend, transport, and
desktop boundaries. It applies [ADR 0008](../../../adr/suite/0008-serve-one-host-backend-to-browser-and-desktop-clients_H.md)
and the compiled [protocol](research/02-protocol-and-security.md) and
[wrapper](research/03-wrapper-and-delivery.md) research.

## Vocabulary

- **Host service:** the Tauri-free Rust API that owns project authority and operating-system work.
- **Host protocol:** the versioned messages that expose selected host-service operations.
- **Served host:** the loopback HTTP/WebSocket server around one host-service instance.
- **Host client:** the TypeScript adapter that speaks the host protocol.
- **Client shell:** viewing-computer behavior supplied by a browser or Tauri.
- **Controller:** the one authenticated client allowed to issue privileged requests in the initial
  product.
- **Session epoch:** an opaque server-instance identity paired with monotonically increasing event
  sequence numbers.

## Selected shape

```text
Browser tab ─────┐
                 ├── packaged TypeScript workbench
Tauri webview ───┘             │             │
                               │             └── ClientShell
                               │                 ├── BrowserShell
                               │                 └── TauriShell
                               ▼
                         WorkbenchHost
                               │
                    authenticated WebSocket
                               │
                 optional SSH local port forward
                               │
                               ▼
                     `zd serve` process
                               │
                        Rust HostService
                      ├── grants / persistence
                      ├── files / Git / watchers
                      ├── PTYs / process cleanup
                      └── host diagnostics

Tauri wrapper ─── launches and supervises ───► same `zd serve` process
```

The runtime `WorkbenchState` remains frontend-owned. Host persistence stores versioned durable
snapshots and records; it does not become a competing state-transition owner.

## Rust boundary

Extract a public Tauri-free host library before exposing behavior on a socket. Its methods accept the
same resource-oriented identities already used by the product: project ID, optional worktree ID, and
relative path. The library owns grant resolution and never accepts an absolute root from an ordinary
client request.

Server handlers, and any temporary Tauri commands during migration, call the host service. A handler
does not reach around it into filesystem, Git, or PTY modules. Types used on the wire have one
versioned source of truth or explicit cross-language contract fixtures; handwritten command strings
in two adapters are not the permanent protocol.

## Transport boundary

HTTP serves only the packaged application and a state-free readiness response. One WebSocket carries
privileged requests, responses, and events. Every message has a protocol version, closed type,
bounded payload, and request ID or event epoch/sequence.

The served host binds `127.0.0.1:0` by default. It may accept an explicit loopback port for a simpler
SSH command. It has no non-loopback mode in this objective.

Each process generates a random owner secret. A CLI launch prints the URL and secret separately. The
client authenticates in its first socket frame, before receiving state. The server accepts only a
numeric `127.0.0.1` Host and an HTTP Origin with the same request authority, ignores forwarding
headers, uses no cookie or permissive CORS policy, and accepts one controller. The request port may
differ from the bound port when SSH forwards it. Session credentials do not enter URLs, logs, argv,
durable configuration, or diagnostic records.

## Remote connection

SSH authenticates the computers and encrypts the remote hop. `zd` does not parse SSH configuration,
copy binaries, start remote processes, or multiplex a private SSH protocol in this objective. The
operator starts `zd serve` on the host and creates a standard local port forward.

This separation makes failures legible: SSH can be tested as a tunnel, the WebSocket as a protocol,
the host service as local work, and the browser as rendering.

## Client-shell boundary

Browser and Tauri clients share `WorkbenchHost`. They differ only through `ClientShell`:

- browser focus, external navigation, and unsupported desktop actions;
- Tauri window focus/close, quick access, global shortcut, native notifications, and same-machine
  picker or file-association input.

The served page must not receive the retired Tauri file, Git, watcher, or terminal command surface.
Trusted Tauri launch/open events become narrow host-service inputs rather than arbitrary browser
paths.

## Desktop process topology

The Tauri wrapper launches the same `zd serve` executable used from a terminal and connects its
webview to that child's loopback origin. The executable and any temporary migration adapters call
the same public host library, but the final desktop path does not embed a Tauri-only server lifecycle.

The child binds, starts its routes, and then sends a private, bounded, versioned readiness record.
The wrapper validates the application version, protocol version, and literal loopback address before
navigating. Credentials travel through a private inherited channel, not arguments, URLs, or logs.
The wrapper continuously drains child output, applies a startup deadline, reports early exit, and
ensures that reload or a secondary desktop launch does not create a second served host.
After a ready child exits, the wrapper preserves the page's in-memory state, reports disconnection,
and does not restart automatically. A future explicit retry may create a new generation only after
the old child is conclusively reaped.

Safe close asks the child to shut down gracefully. The host first stops accepting work, then flushes
state and diagnostics, closes watchers, terminates and reaps PTYs, and closes its listener. The
wrapper force-terminates the child after a deadline and reaps it on every exit path. A private control
channel gives the child a positive parent-loss signal where supported, and cleanup hooks are
installed before entering any non-returning application loop.

This topology carries real supervision and packaging cost. It is selected because literal execution
of `zd serve` from the desktop wrapper is an owner requirement, not because child processes are an
automatic reliability improvement.

## Persistence and reconnect

Before served writes ship, durable work moves behind a versioned host persistence interface. This
includes workspace identities, workbench snapshots, drafts, review comments, and other state whose
loss would violate recovery. Runtime transitions remain client-owned.

Before served PTYs ship, reconnect returns an authoritative resource snapshot and subscription
epoch. A client either reattaches explicitly or receives a clear unavailable/exited result. It never
silently creates a duplicate terminal after a tunnel interruption.

## Observability

One request ID crosses client and host. The client records input-to-send, round trip, and
receive-to-render on its monotonic clock. The host records queue, dispatch, operation, and
serialization on its monotonic clock. Heartbeat round trip tracks current tunnel/socket latency.

Do not subtract wall-clock timestamps from different computers. The residual between client round
trip and host work includes transport, encoding, and scheduling; label it that way. Never record
tokens, content, terminal output, environment, full paths, or raw errors.

## Options rejected or deferred

- HTTP mutation endpoints plus a separate event socket: more authentication and CSRF surface without
  a first-version benefit.
- HTTP per terminal keystroke: adds avoidable round trips and head-of-line behavior.
- WebRTC, gRPC-Web, GraphQL, or a generic command API: no current need earns their complexity.
- Cookie sessions or query-string tokens: ambient cross-port authority or URL leakage.
- Direct LAN/public binding and self-signed TLS: certificate, origin, firewall, and abuse policy are a
  separate product.
- Multi-client fan-out: requires new state and resource ownership semantics.
- Server-owned DOM/workbench transitions: conflicts with the existing single frontend state owner.

## Cost

The selected design adds a protocol and a host-library boundary that must be maintained as public
interfaces. It also makes authentication, origin policy, resource limits, and compatibility tests
release obligations. Those costs replace future backend duplication and make remote behavior
measurable.

## Not covered here

This architecture does not set numeric resource limits, select a future public proxy, or decide the
final installer names. Those choices follow measured server behavior and platform packaging work.
