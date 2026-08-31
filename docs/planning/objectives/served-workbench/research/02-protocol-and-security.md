# Protocol and remote security

This document answers research question 3 and the diagnostic part of question 5. The raw evidence is
in [the protocol return](subagent_outputs/01-protocol-security.txt).

## Established

Browser origins include the scheme, host, and port, so two loopback ports are different origins.
Browsers send an `Origin` header during a WebSocket handshake, and RFC 6455 recommends rejecting an
origin the server does not expect. `Origin` is a browser cross-site defense, not authentication,
because a non-browser client can forge it. [RFC 6454](https://datatracker.ietf.org/doc/html/rfc6454#section-5)
and [RFC 6455](https://datatracker.ietf.org/doc/html/rfc6455#section-10.2) define these properties.

Cookies are not isolated by port, which makes ambient cookie authentication a poor fit for unrelated
services on random loopback ports. A browser WebSocket also cannot set an arbitrary `Authorization`
header. Bearer values in URI queries are likely to enter logs or history and should be avoided.
[RFC 6265](https://datatracker.ietf.org/doc/html/rfc6265#section-8.5),
[WHATWG WebSockets](https://websockets.spec.whatwg.org/#the-websocket-interface), and
[RFC 6750](https://datatracker.ietf.org/doc/html/rfc6750#section-2.3) support those constraints.

Binding `127.0.0.1:0` lets the operating system allocate and retain a free port atomically. The
selected port is available through `local_addr`; there is no safe need to probe a port and bind it
later. Loopback HTTP is considered potentially trustworthy by browser secure-context rules, but that
classification does not encrypt traffic outside the machine.
[Tokio `TcpListener`](https://docs.rs/tokio/latest/tokio/net/struct.TcpListener.html#method.bind)
and [Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy) define those
behaviors.

OpenSSH `-L` carries a local listener through SSH's authenticated, encrypted connection to a target
socket. This permits a remote browser workflow while the `zd` process listens only on its own
loopback interface. [OpenSSH `ssh(1)`](https://man.openbsd.org/ssh#L) documents the forwarding
semantics.

The current terminal API fixes the executable and starting directory, but an authenticated person
can type `cd` and arbitrary shell commands. A served session with terminal access therefore has the
host operating-system user's shell authority. The project grant bounds path-addressed `zd` file and
Git operations; it is not an operating-system sandbox.

## Claimed

The intended first use case is one owner controlling one host, not mutually distrusting users,
accounts, or collaboration. The owner wants standard browser access and diagnosable behavior more
than a custom SSH-aware product protocol.

## Inferred

The smallest coherent privileged protocol is one versioned WebSocket. HTTP serves only the packaged
application and an optional state-free readiness response. The socket carries closed request,
response, and event envelopes:

```text
request  { version, type, requestId, method, payload }
response { version, type, requestId, outcome, timing, payload | problem }
event    { version, type, epoch, sequence, name, payload }
```

One socket supports terminal input and asynchronous output without an HTTP request per keystroke. It
also keeps authentication, backpressure, cancellation, request correlation, and protocol versioning
in one place. Workspace files are never static HTTP assets.

The first security profile is deliberately closed:

- bind numeric `127.0.0.1`, with port zero by default and an optional explicit port for tunnels;
- offer no wildcard, LAN, proxy-header, or public-bind mode;
- generate a process-scoped random owner secret independent of grant and session IDs;
- print the URL and secret separately for a direct CLI launch;
- require the secret in the first socket frame, before returning state or accepting a method;
- keep an accepted secret only in memory or `sessionStorage`, not `localStorage` or a cookie;
- accept only the numeric IPv4 loopback host in `Host`, and require a present HTTP Origin whose
  authority exactly matches that request authority;
- emit no CORS permission and send a restrictive CSP from the server;
- allow one authenticated controller and reject a second connection;
- bound unauthenticated sockets, frame/message size, pending requests, output queues, terminals,
  watchers, and shutdown time; and
- never log secrets, headers, source text, terminal output, absolute paths, or raw error text.

For remote use, SSH remains outside the application:

```sh
# Remote machine
zd serve . --port 7331

# Viewing machine
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:7331:127.0.0.1:7331 user@host
```

The server should compare Origin with the forwarded request authority rather than its own bound
port, so different local and remote ports can also work safely. Both authorities must still name
numeric `127.0.0.1`; forwarded host and proxy headers are ignored.

Diagnostics can answer the owner's latency question without pretending clocks on two computers are
synchronized. Each request gets one request ID. The client records input-to-send, total round trip,
and receive-to-render spans on its monotonic clock. The host records queue, dispatch, operation, and
serialization spans on its monotonic clock. A heartbeat estimates current socket/tunnel round trip.
The client round trip minus reported host work is a transport-and-scheduling residual, not a precise
one-way network measurement.

## Gaps

- Reconnect needs an authoritative snapshot, stream epoch, sequence, and explicit missed-event
  recovery.
- The owner secret bootstrap into a future Tauri webview needs a private, tested handoff.
- Persistent work must move away from random-origin-only storage before served editing ships.
- Direct HTTPS, reverse proxies, Tailscale identity, and trusted forwarding headers require a
  separate threat model.
- Resource limits need measured values during implementation; this plan fixes their existence and
  failure behavior, not arbitrary numbers.
