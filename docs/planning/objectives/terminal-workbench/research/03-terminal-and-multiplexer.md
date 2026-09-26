# Terminal and multiplexer findings

Date: 2026-09-26

This document defines what `zd` may assume from Ghostty, Herdr, tmux, Zellij, and terminal
protocols.

## Established

- Bracketed paste, SGR mouse, and OSC 52 are widely implemented xterm extensions. Kitty keyboard,
  graphics, and rich clipboard protocols are Kitty extensions. None supplies portable pane or
  agent discovery.
- Outer terminal and multiplexer selection identifies rendered cells, not Markdown source. `zd`
  must own selection and map mouse and keyboard gestures to the same source range.
- Ghostty 1.3.1 supports Kitty keyboard/graphics, bracketed paste, SGR mouse, and policy-controlled
  OSC 52 text clipboard access. Its stable line does not expose a supported terminal-native image
  clipboard path.
- Herdr 0.9.1 exposes structured agent discovery, targeted prompting, pane reads, and text/key
  delivery through its CLI and local JSON socket API. It keeps the agent's actual terminal visible;
  `zd` does not need a PTY, shell, or lifecycle model.
- Herdr's image bridge is for a remote Herdr client that can stage the viewing computer's image on
  the remote host. A Herdr server alone cannot read a different computer's GUI clipboard.
- tmux and Zellij expose pane targeting and bracketed text delivery, but neither offers semantic
  agent identity comparable to Herdr. Image and graphics support depends on the outer terminal and
  multiplexer configuration.

Primary protocol and project links, including the exact Herdr operations, are in
[`subagent_outputs/02-terminal-integration.md`](subagent_outputs/02-terminal-integration.md).

The live environment added one observation: `herdr 0.9.1` is installed, `herdr agent list` returned
structured JSON for the active Codex pane, and `herdr agent prompt --help` confirmed explicit target,
text, wait, status, and timeout arguments. Ghostty itself is not installed in this Linux shell, so
no claim about the user's interactive Ghostty behavior was tested here.

## Upstream claims not observed

- Ghostty, Herdr, and Zellij claim Kitty-graphics behavior that was not exercised in a nested stack.
- Herdr claims its remote image bridge stages local clipboard images into remote sessions; retention
  and cleanup limits were not established.
- Future Ghostty clipboard work appears on its main branch, but unreleased behavior cannot define
  v1.0.1.

## Inferred

The compatibility baseline is capability-oriented, not emulator-name-oriented:

```text
keyboard: legacy, optionally Kitty
mouse: SGR cells
paste: bracketed text
selection: owned by zd
graphics: optional with text fallback
clipboard image: same-host OS API, staged path, or unavailable
multiplexer: optional Herdr, tmux, or Zellij adapter
```

For v1.0.1, Herdr is the first semantic handoff adapter. `zd` lists agent targets and sends an
explicitly previewed, bounded payload. Insert and submit are distinct concepts. Selected text never
enters a shell command string; the adapter uses typed socket data, stdin, or separated arguments.
An unknown host falls back to copying or displaying the prepared prompt for manual delivery.

`zd` must remain an ordinary foreground TUI. It must not start agents, own their sessions, emulate
terminal output, or infer lifecycle from pane pixels. Optional graphics never become document
state, and lack of graphics never makes Markdown unreadable.

## Gaps

- Ghostty→Herdr→`zd` mouse modifiers, keyboard enhancements, paste, resize, and teardown need an
  interactive smoke test.
- The Herdr socket's permission contract and a stable client schema need source-level validation
  before replacing the CLI adapter.
- Image paste through SSH remains unavailable unless a multiplexer stages a readable host path.
- tmux and Zellij handoff should remain fallback/manual in v1.0.1 until tested.

