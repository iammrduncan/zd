# 0009: Let browsers connect directly to served hosts

## Status

Superseded by
[0010: Keep terminal sessions below server lifetime](0010-keep-terminal-sessions-below-server-lifetime_H.md).

Supersedes
[0008: Serve one host backend to browser and desktop clients](0008-serve-one-host-backend-to-browser-and-desktop-clients_H.md).

## Context

The workbench uses one host protocol for browser and desktop clients. The host authenticates one
controller before it reveals project state or accepts privileged work.

ADR 0008 required a person on the viewing computer to create a protected tunnel before a browser
could reach a remote host. That tunnel makes connection setup part of the client. The required
product has a browser-only client: a person starts `zd serve` on a reachable host, opens the printed
host URL, and authenticates without a helper process, extension, or desktop application.

A process secret authenticates the controller but does not encrypt network traffic. Direct plain
HTTP is suitable only when the network path is already protected, such as by Tailscale, another
encrypted private network, or an equivalent trusted transport. Public Internet access needs a
separate TLS and proxy-identity decision.

## Decision

We will serve one host backend directly to browser and desktop clients.

`zd serve <folder>` will listen on all host IPv4 interfaces and an operating-system-assigned port by
default. An operator may restrict the listener to one numeric IP address. The command will print
connection information after the listener and routes are ready. A remote browser will connect
directly to that listener. It will not need a local tunnel, helper, extension, or native client.

The server will require an exact same-authority browser Origin and Host for its WebSocket. It will
authenticate the first socket frame with the process secret before it sends project state. It will
reject proxy forwarding headers, cross-origin requests, and additional controllers. Project files
will remain protocol data and will never become trusted HTTP assets.

The desktop application will launch and supervise the same `zd serve` executable with an explicit
loopback bind. Tauri will remain a client shell and host-lifecycle owner. It will not retain a
parallel path for files, Git, watchers, or pseudoterminals.

## Consequences

- A remote client needs only a browser and network reachability to the host.
- Tailscale, a private network, or host firewall policy owns network admission and transport
  encryption for the initial direct HTTP mode.
- The default listener exposes the static workbench and locked protocol endpoint on every IPv4
  interface. The process secret remains mandatory, high entropy, and absent from URLs and stored
  browser state.
- The CLI, browser integration tests, installed smoke tests, and user documentation must prove a
  non-loopback connection.
- The desktop wrapper must always select loopback explicitly and validate the child readiness
  record before navigation.
- Reverse proxies, public Internet exposure, trusted forwarding headers, managed certificates, and
  collaboration remain separate decisions.
