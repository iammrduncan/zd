# Served workbench research

> **Superseded transport conclusion:** ADR 0009 replaces this research packet's loopback-plus-SSH
> recommendation. The remote client is browser-only and connects directly over an already-protected
> network. The remaining host, protocol, persistence, wrapper, and delivery findings still apply.

Research is complete. It found a strong existing frontend boundary and reusable Rust operations, but it
also found that the requested destination spans several independently verifiable changes. The work
was therefore promoted from a simple goal to an objective.

## Document map

| Document | Answers |
| --- | --- |
| [Research plan](00-research-plan.md) | Questions, sources, constraints, and delegated lines of inquiry |
| [Current system](01-current-system.md) | Existing production paths, reusable boundaries, actual duplication, persistence and single-client constraints |
| [Protocol and security](02-protocol-and-security.md) | Loopback binding, SSH forwarding, authentication, WebSocket shape, bounds, and latency evidence |
| [Wrapper and delivery](03-wrapper-and-delivery.md) | Tauri ownership, process-topology choice, shutdown, assets, release constraints, and test boundaries |

Raw subagent returns remain unedited under [`subagent_outputs/`](subagent_outputs/).

## Headline conclusions

- Do not build an SSH-aware `zd` protocol. Run one loopback host and use SSH only as a protected port
  forward.
- Use one authenticated, versioned WebSocket for privileged requests, responses, and events. Serve
  only packaged application assets over HTTP.
- Split the frontend platform into host capabilities and viewing-computer shell capabilities.
- Extract a public Rust host service before adding routes. The standalone `zd serve` executable uses
  that service; the final Tauri path supervises the executable instead of retaining host calls.
- Start with one CLI-approved project and one controlling client. Multi-client behavior is a product
  redesign, not a connection toggle.
- Correlate client round trip and rendering spans with host queue and operation spans using one
  request ID. Do not compare wall clocks across computers.
- Resolve durable state and PTY reattachment before enabling served writes and terminals.

## Questions resolved for planning

- Default bind: numeric IPv4 loopback with an OS-assigned port; optional explicit port for tunnels.
- Remote path: SSH local forwarding; no direct network listener in the first release.
- Authentication: process-scoped random owner secret in the first WebSocket frame; no cookie or URL
  query credential.
- Controller model: one authenticated controller.
- Initial authority: the CLI-approved startup folder only.
- First implementation slice: read-only launch grant, file tree, and bounded file read in a real
  browser against a real host; successful served text results are always non-writable.
- Desktop topology: Tauri launches and supervises the same `zd serve` executable used from a
  terminal; lifecycle and packaging work are part of the wrapper contract.

## Questions intentionally left for later goals

- Durable host/client ownership for drafts, reviews, preferences, and workbench restoration.
- PTY reattachment, disconnect grace, and event replay.
- Full file mutation, Git, worktree, watcher, and terminal resource limits.
- Windows console/GUI artifact layout and the first Linux server release.
- Direct HTTPS or managed-proxy modes.

None blocks the read-only walking skeleton. Each blocks claiming that the complete remote workbench
or literal Tauri wrapper has shipped.
