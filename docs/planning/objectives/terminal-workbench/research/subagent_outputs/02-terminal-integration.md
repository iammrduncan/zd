# Terminal, Ghostty, Herdr, and multiplexer integration

Research date: **2026-09-26**. Read-only research; no files changed.

## Sources

### Terminal protocols

- [xterm control sequences: bracketed paste, mouse, OSC 52](https://invisible-island.net/xterm/ctlseqs/ctlseqs.html)
- [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
- [Kitty graphics protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/)
- [Kitty rich clipboard protocol, OSC 5522](https://sw.kovidgoyal.net/kitty/clipboard/)
- [Kitty protocol extensions index](https://sw.kovidgoyal.net/kitty/protocol-extensions/)

### Ghostty

- [Ghostty feature matrix](https://ghostty.org/docs/features)
- [Ghostty release notes](https://ghostty.org/docs/install/release-notes/)
- [Ghostty 1.3.1 release notes](https://ghostty.org/docs/install/release-notes/1-3-1)
- [Ghostty 1.3.0 release notes](https://ghostty.org/docs/install/release-notes/1-3-0)
- [Ghostty OSC 52 behavior](https://ghostty.org/docs/vt/osc/52)
- [Ghostty configuration reference](https://ghostty.org/docs/config/reference)
- [Ghostty terminfo guidance](https://ghostty.org/docs/help/terminfo)
- [Ghostty AppleScript API](https://ghostty.org/docs/features/applescript)
- [Ghostty OSC 5522 proposal](https://github.com/ghostty-org/ghostty/discussions/8275)
- [Ghostty image-paste limitation discussion](https://github.com/ghostty-org/ghostty/discussions/10099)
- [Ghostty main-branch clipboard configuration](https://github.com/ghostty-org/ghostty/blob/main/src/config/Config.zig)

### Herdr

- [Herdr repository](https://github.com/herdrdev/herdr)
- [Herdr 0.9.1 release](https://github.com/herdrdev/herdr/releases/tag/v0.9.1)
- [Herdr documentation](https://herdr.dev/docs/)
- [Herdr concepts](https://herdr.dev/docs/concepts/)
- [Herdr keyboard and copy mode](https://herdr.dev/docs/keyboard/)
- [Herdr configuration reference](https://herdr.dev/docs/config-reference/)
- [Herdr graphics configuration](https://herdr.dev/docs/configuration/)
- [Herdr CLI reference](https://herdr.dev/docs/cli-reference/)
- [Herdr socket API](https://herdr.dev/docs/socket-api/)
- [Herdr agent automation](https://herdr.dev/docs/agent-automation/)
- [Herdr local/remote workflow](https://herdr.dev/docs/how-to-work/)
- [Herdr changelog](https://github.com/herdrdev/herdr/blob/master/CHANGELOG.md)
- [Herdr local paste regression/decision](https://github.com/herdrdev/herdr/issues/986)

### tmux

- [tmux manual](https://man.openbsd.org/tmux)
- [tmux clipboard documentation](https://github.com/tmux/tmux/wiki/Clipboard)
- [tmux copy-mode documentation](https://github.com/tmux/tmux/wiki/Getting-Started)
- [tmux upstream changes](https://github.com/tmux/tmux/blob/master/CHANGES)
- [tmux passthrough query-routing issue](https://github.com/tmux/tmux/issues/5530)

### Zellij

- [Zellij programmatic control](https://zellij.dev/documentation/programmatic-control.html)
- [Zellij CLI actions](https://zellij.dev/documentation/cli-actions)
- [Zellij CLI recipes](https://zellij.dev/documentation/cli-recipes.html)
- [Zellij terminal compatibility](https://zellij.dev/documentation/compatibility.html)
- [Zellij 0.45 Kitty graphics announcement](https://zellij.dev/news/nested-sessions-kitty-graphics-new-ui/)
- [Zellij options](https://zellij.dev/documentation/options.html)
- [Zellij plugin API commands](https://zellij.dev/documentation/plugin-api-commands)
- [Zellij default configuration](https://github.com/zellij-org/zellij/blob/main/zellij-utils/assets/config/default.kdl)

## Established facts

### Standards versus extensions

There is no single portable terminal standard covering the required feature set.

- Bracketed paste (`DECSET 2004`), SGR mouse (`1006`), pixel mouse (`1016`), and OSC 52 are **xterm extensions**, although widely implemented.
- The Kitty keyboard, graphics, and OSC 5522 rich-clipboard protocols are **Kitty-defined extensions**, not ECMA/ANSI standards.
- Bracketed paste carries text between start/end markers. It does not define MIME-aware clipboard access.
- OSC 52 carries a base64 payload associated with a clipboard/selection selector, but has no MIME negotiation. It therefore cannot reliably distinguish PNG bytes from text.
- OSC 5522 adds MIME-aware clipboard querying and transfer, including `image/png`, but support must be queried and cannot presently be assumed.
- No terminal protocol provides portable pane enumeration, OS process discovery, agent identity, or a source-aware “current selection” range. Those require application or multiplexer APIs.

### Input and selection

- Kitty keyboard mode can disambiguate keys that legacy terminal encoding conflates and can report press/repeat/release events. It is opt-in and should be treated as progressive enhancement.
- SGR mouse reports cells; SGR-pixel mode reports pixels. Cell coordinates are sufficient for the editor baseline.
- Outer terminal and multiplexer selections identify rendered cells. They do not identify Markdown source offsets and may include wrapped or visually transformed text.
- Consequently, `zd` must own editor selection in its document model. Mouse and keyboard selection should both resolve to the same source-range representation.
- Terminal or multiplexer copy mode remains useful for copying rendered output, but cannot be the source of truth for annotations or agent handoff.

### Ghostty boundary

As of the research date, Ghostty’s stable release line is **1.3.1**.

- Stable Ghostty advertises Kitty graphics, Kitty keyboard, bracketed paste, SGR mouse, and OSC 52.
- OSC 52 access is policy-controlled through `clipboard-read` and `clipboard-write`; reads may prompt, be allowed, or be denied.
- Stable 1.3 documents OSC 5522 parsing but not GUI clipboard integration. It therefore does **not** provide a supported terminal-native image-paste path.
- Main-branch source contains OSC 5522-related configuration marked for 1.4.0. This is unreleased code and must not define the v1.0.1 contract.
- Ghostty AppleScript is macOS-only, marked preview, and exposes terminal/window control and input injection. It does not document access to a source-aware selected range and cannot serve as a portable integration layer.
- `TERM=xterm-ghostty` and terminfo describe capabilities but are insufficient alone for runtime feature detection, especially through SSH or multiplexers.

### Herdr boundary

The inspected local installation and official release are **Herdr 0.9.1**.

- Herdr exposes structured workspace, tab, pane, and agent operations through its CLI and newline-delimited JSON socket API.
- Pane discovery includes stable Herdr pane IDs, cwd, shell PID, foreground process group, and foreground-process information where the OS exposes it.
- Agent discovery is semantic: `agent.list` and `agent.get` avoid guessing from pane titles or process names.
- `agent.prompt` sends a prompt plus Enter and honors bracketed-paste state. `pane.send_text` inserts literal text without submitting it.
- Herdr supports programmatic pane reads and targeted key/text delivery.
- Herdr owns its scrollback/copy-mode selection. When an inner TUI enables mouse reporting, that TUI receives mouse events; `zd` therefore still needs its own selection implementation.
- Herdr renders Kitty graphics emitted by panes in compatible outer terminals and tracks pane placement. Graphics can be disabled through configuration.
- The documented image-clipboard bridge is specifically a **remote-client feature**: `herdr --remote` can read the local desktop clipboard, transfer/stage an image on the remote host, and inject its path.
- Current configuration labels `keys.remote_image_paste` as remote-only. The changelog records removal of raw local `Ctrl+V` interception to avoid breaking applications such as Vim.
- Running Herdr only on the remote host does not give it access to the user’s local graphical clipboard.

### tmux boundary

- `list-panes -a -F ...` exposes pane IDs and format fields including current command, current path, and `pane_pid`.
- `pane_pid` is the process first started in the pane, not a full or authoritative foreground process tree.
- Reliable bulk text delivery can use `load-buffer` from stdin followed by targeted `paste-buffer`.
- `paste-buffer -p` uses bracketed-paste markers when the target requested them; `-r` preserves newlines; `-d` removes the temporary buffer.
- Submission should remain a distinct `send-keys Enter` operation.
- tmux clipboard integration is OSC 52/text oriented. It does not supply image MIME data.
- tmux can pass escape sequences through DCS wrapping when `allow-passthrough` is enabled. This is configuration-dependent; the documented `on` mode targets visible panes, while `all` also permits invisible panes.
- tmux has optional native Sixel support when built accordingly. It has no documented native Kitty-graphics renderer equivalent to current Herdr or Zellij.

### Zellij boundary

- `zellij action list-panes --json` provides pane IDs, commands, cwd, focus state, and geometry.
- Zellij documents targeted `paste`, `write-chars`, raw-byte `write`, and `send-keys` actions.
- `paste` uses bracketed paste; Enter can be sent separately.
- Zellij does not document agent identity or a portable pane PID/process-tree API.
- Current Zellij 0.45 documentation advertises native Kitty-graphics placement tracking and optional Sixel support when the outer terminal supports it.
- Zellij’s clipboard configuration is text-oriented through `copy_command` or OSC 52; it does not define rich image clipboard input.
- Shift can bypass Zellij mouse handling so the outer terminal can select rendered cells, but this still does not yield a source-aware application selection.

## Upstream claims

These are official upstream statements but were not validated in a live nested terminal matrix during this read-only research:

- Ghostty claims stable Kitty keyboard and graphics support.
- Herdr claims Kitty image placement survives pane layout operations and that its remote image bridge transfers clipboard images into remote sessions.
- Zellij claims Kitty image placements survive resize, scroll, and layout changes in 0.45.
- Herdr reports that local raw-`Ctrl+V` image interception was intentionally removed while remote image paste remains supported.
- tmux’s passthrough facility can theoretically carry Kitty graphics, but upstream issue reports show that query/reply routing can still collide or misroute in nested sessions. This is not a dependable compatibility promise.
- Ghostty main-branch source indicates richer clipboard support for 1.4.0, but its eventual release behavior is **unverified**.

## Inferences and recommended compatibility contract

The core should expose capabilities rather than emulator names:

```text
HostCapabilities
  keyboard: legacy | kitty(flags)
  mouse: none | sgr_cells | sgr_pixels
  text_paste: bracketed
  clipboard_text: local_os | osc52(write/read-policy)
  clipboard_image: local_os | osc5522 | readable_path | unavailable
  graphics: none | kitty | sixel
  multiplexer: none | herdr | tmux | zellij
```

Environment variables such as `TERM`, `TMUX`, `ZELLIJ`, and Herdr socket variables should select candidate adapters, not prove capabilities. Probe optional protocols where a safe query exists.

The portable baseline should be:

- Legacy keyboard input with optional Kitty enhancement.
- Bracketed text paste.
- SGR cell mouse.
- Source-aware selection owned by `zd`.
- Text/alt-path rendering when graphics are unavailable.
- No dependency on reading the system clipboard through the terminal.

Recommended integration behavior:

| Host | Discovery | Insert text | Deliberate submit | Image input |
|---|---|---|---|---|
| Herdr | Socket `agent.list`/pane APIs | `pane.send_text` or socket equivalent | `agent.prompt` | Local OS clipboard, or path produced by `herdr --remote` |
| tmux | `list-panes -a -F` | stdin-loaded buffer + `paste-buffer -p -r` | Separate `send-keys Enter` | Local OS clipboard or user-provided readable path |
| Zellij | `list-panes --json` | `action paste --pane-id` | Separate `send-keys ENTER` | Local OS clipboard or readable path |
| None/unknown | No pane discovery | Copy prepared prompt | User pastes/submits | Local OS clipboard or path |

For Herdr, prefer the socket API over shelling out when implementing the mature adapter. It preserves semantic agent targeting and avoids placing large or sensitive prompt text in process arguments.

For tmux, load selected text over stdin into a named temporary buffer, target an explicit pane ID, bracket-paste it, then delete the buffer. Never infer “the agent pane” solely from `pane_current_command`.

For Zellij, documented `paste TEXT` places the payload in a CLI argument. That implies process-list exposure and argument-size constraints. Small non-sensitive prompts are acceptable; large or sensitive payloads should use a permissioned companion plugin/pipe or fall back to clipboard/manual paste.

Agent handoff should include:

- Project-relative file path.
- Line/column or source-offset range.
- Selected source text.
- A preview of both target and payload.
- Separate “insert” and “submit” actions.

Do not shell-concatenate selected text. Use sockets, stdin, or properly separated argv. Reject or visibly escape NUL, ESC, and unexpected control bytes, apply a payload-size limit, and revalidate the destination immediately before sending.

Image paste should be an explicit `Paste image` action, not global interception of `Ctrl+V`. Acquisition order:

1. Local OS clipboard on the machine running `zd`.
2. OSC 5522 only after a successful capability query.
3. A bracketed-pasted file path readable on the `zd` host, including a Herdr remote-staged path.
4. An explicit path prompt or a clear unsupported message.

The image boundary should return either `{bytes, MIME}` or a readable local path. Core code should validate signature, MIME, dimensions, and byte limits before storing the asset and inserting Markdown. A filename extension alone is not evidence of image type.

Graphics should remain optional:

- Direct Ghostty: Kitty graphics.
- Ghostty → Herdr: Herdr’s Kitty renderer, after runtime confirmation.
- Ghostty → Zellij 0.45: Zellij’s native Kitty placement handling.
- Ghostty → tmux: text fallback unless a tested passthrough profile succeeds.

`zd` should reserve terminal cells for images but retain alt text or the asset path as the canonical fallback. Graphics placement must never replace document/source state.

## Gaps

Explicitly unverified:

- The user’s Ghostty version, clipboard policies, terminfo availability, and graphics limits.
- Live protocol behavior for Ghostty → Herdr → `zd`, Ghostty → tmux → `zd`, and Ghostty → Zellij → `zd`.
- Mouse-selection modifier interactions in each nested stack.
- OSC 5522’s eventual released Ghostty behavior.
- Herdr remote image temporary-file retention, maximum transfer size, and cleanup guarantees.
- Herdr socket authentication/permission guarantees beyond its local IPC design.
- Zellij’s practical CLI argument-size ceiling and visibility of pasted text on each OS.
- Reliable Kitty graphics query/reply routing through tmux passthrough.
- Platform-specific local clipboard access on Linux/Wayland, macOS, SSH, and headless hosts.

A small conformance harness should cover input modes, bracketed paste, mouse coordinates, clipboard policies, image acquisition, graphics placement, pane discovery, and explicit insert-versus-submit behavior before any capability is promoted from optional to supported.

Research goal completed in approximately 6 minutes 25 seconds.
