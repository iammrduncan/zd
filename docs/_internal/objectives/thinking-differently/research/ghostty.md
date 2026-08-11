# Ghostty as a ZD platform layer

Research date: 2026-08-11

## Bottom line

Ghostty is an excellent candidate for **the terminal engine inside a future custom ZD app**, and a useful source of reference behavior for the global summon/hide interaction. It is not currently a strong host for ZD itself.

The immediate blocker is unusually concrete: Ghostty's macOS quick terminal is a singleton and **does not support tabs**. The exact interaction ZD wants—summon from any Space, then press `Cmd+1`, `Cmd+2`, or `Cmd+3` to select a persistent project—is therefore split across two Ghostty modes:

- the quick terminal has the right summon/hide and cross-Space behavior;
- normal Ghostty windows have native tabs and indexed tab actions.

Ghostty 1.3 added a capable AppleScript object model, and its MIT-licensed `libghostty` architecture is strategically attractive. But Ghostty has no documented third-party GUI/plugin surface for adding ZD's Markdown editor, goal/task UI, state-machine graphs, or browser pane. The full `libghostty` C API is also not versioned or stable yet. Those facts make Ghostty a **terminal substrate to watch or embed**, not the lowest-complexity extension host today.

## What was evaluated

The target described in `thoughts.txt` is more than a terminal:

1. A macOS-global hotkey summons the working environment above whatever app or Space is active.
2. Pressing the same hotkey hides it and returns focus to the previous app.
3. Number shortcuts switch among persistent project contexts.
4. Each project retains terminal sessions, editors, agent harnesses, and other working state.
5. ZD supplies a rich Markdown editor, code-oriented views, tasks/goals/objectives, custom agent workflows, and graph/state-machine views.
6. Browser adjacency is desirable.
7. The solution should avoid rebuilding terminal emulation without surrendering ZD's product direction.

## Product and project status

Ghostty describes itself as a fast, GPU-accelerated terminal with native platform interfaces. On macOS the GUI uses AppKit and SwiftUI, rendering uses Metal and CoreText, and the shared core is written in Zig. Windows, tabs, and splits use native UI components rather than terminal-drawn widgets. See the official [About](https://ghostty.org/docs/about) and [feature overview](https://ghostty.org/docs/features).

The first public stable series arrived at the end of 2024. The latest documented stable release at research time is 1.3.1, released March 13, 2026; the [release index](https://ghostty.org/docs/install/release-notes) shows a regular sequence from 1.0.1 through 1.3.1. Version 1.3 reported 180 contributors and 2,858 commits over its six-month cycle, added AppleScript, and made a substantial stability and fuzz-testing investment. The same release notes still call out historical bugs, including a long-lived memory leak triggered heavily by Claude Code, and 1.3.1 was a quick regression-fix release. This is a healthy, fast-moving young project, not yet an iTerm2-like decade-old compatibility baseline. See [Ghostty 1.3.0 release notes](https://ghostty.org/docs/install/release-notes/1-3-0) and [1.3.1 release notes](https://ghostty.org/docs/install/release-notes/1-3-1).

The repository is [MIT licensed](https://github.com/ghostty-org/ghostty/blob/main/LICENSE). That is friendly to both an open-source and a proprietary ZD distribution, subject to retaining the license notice.

## Global hotkey and quake-style behavior

This is one of Ghostty's strongest areas.

Ghostty keybindings support a macOS-only `global:` prefix. Global bindings work when Ghostty is not focused and require macOS Accessibility permission. A direct configuration for the desired interaction is:

```text
keybind = global:cmd+backquote=toggle_quick_terminal
```

The `toggle_quick_terminal` action preserves the terminal between appearances. The quick terminal can be positioned at the top, bottom, left, right, or center; sized in pixels or screen percentages; animated; auto-hidden on focus loss; and targeted to the keyboard-active, mouse, or menu-bar display. On macOS it defaults to following the active Space. These controls are documented in the [keybinding guide](https://ghostty.org/docs/config/keybind), [action reference](https://ghostty.org/docs/config/keybind/reference#toggle_quick_terminal), and [configuration reference](https://ghostty.org/docs/config/reference#quick-terminal-position).

Important constraints:

- There can be only one quick-terminal instance.
- macOS quick terminals do not support tabs because Ghostty's native tabs require a title bar.
- A quick terminal is not restored when Ghostty restarts, unlike eligible normal windows.
- Full-screen quick terminals use non-native full screen.
- Hiding Ghostty from the Dock/app switcher is possible, but Ghostty documents a macOS limitation: automatic keyboard-layout changes stop working in that mode.
- Global keybindings require Accessibility permission and consume the key; shortcut conflicts need to be tested on the target Mac.

Ghostty also has a macOS-only `toggle_visibility` action that shows or hides all normal windows and yields focus back to the next OS-selected application. That could put native tabs behind one global shortcut, but it is not equivalent to the quick terminal: it acts on **all** Ghostty windows and does nothing when the focused surface is full screen. Normal windows can be manually toggled to float above other windows, but they always start non-floating. These details are in the [action reference](https://ghostty.org/docs/config/keybind/reference#toggle_visibility).

## Windows, tabs, splits, and session state

Normal Ghostty windows support tabs and split panes. The action surface includes `new_tab`, previous/next/last tab, `goto_tab:<index>`, tab reordering, directional splits, directional split focus, split resizing, split zoom, and undo of recently closed windows/tabs/splits. The indexed action could implement `Cmd+1` through `Cmd+9` in a normal window. See the [action reference](https://ghostty.org/docs/config/keybind/reference#goto_tab).

On macOS, `window-save-state` can preserve window position, size, tabs, and splits. Working-directory restoration depends partly on shell integration. This is layout/state restoration, not a documented promise that arbitrary child processes survive a quit or reboot. For durable agent processes, a separate supervisor or multiplexer such as tmux/Zellij remains the safer boundary. See [`window-save-state`](https://ghostty.org/docs/config/reference#window-save-state) and [shell integration](https://ghostty.org/docs/features/shell-integration).

This yields three possible project mappings:

### 1. Quick terminal plus a terminal multiplexer

Run tmux, Zellij, or a ZD TUI inside Ghostty's one quick-terminal surface; the multiplexer owns project tabs/workspaces and process persistence.

This preserves the ideal global interaction with little Ghostty-specific code, but it deliberately gives up native Ghostty tabs. ZD's Markdown/editor/graph UI would need to be terminal-native or separately surfaced. It is a good workflow experiment, not a host architecture for the current graphical ZD.

### 2. Normal tabbed window plus global visibility

Use a single normal window, make each Ghostty tab a project, bind numbered `goto_tab` actions, and summon/hide normal windows with `toggle_visibility` or macOS automation.

This gets closer to the desired tab model. It loses the quick terminal's exact overlay guarantees, conflates the ZD window with every other Ghostty window, and still has nowhere native to mount ZD's graphical editor or browser.

### 3. Custom ZD app embedding `libghostty`

Keep ZD's own window, project model, editor, graph UI, browser, and hotkey controller; use `libghostty` only for terminal emulation/rendering.

This is the strategic fit. It retains control over the product while moving terminal complexity behind a deep module. It is also the highest engineering risk today because the complete embedding API has no tagged version and is still changing.

## macOS APIs and automation

Ghostty 1.3 introduced a native AppleScript dictionary with this hierarchy:

```text
application -> windows -> tabs -> terminals
```

Scripts can query IDs, selection, terminal names, and working directories; create windows and tabs; split terminals; focus/select/close objects; send text, key, and mouse events; and execute Ghostty keybinding actions. Surface configurations can set an initial working directory, command, input, environment, and font size. This is enough to build repeatable project layouts and find/focus a project by metadata. The official guide includes a tmux-style project layout example. See [Ghostty AppleScript](https://ghostty.org/docs/features/applescript).

AppleScript is enabled by default but protected by macOS Automation/TCC permission; it can be disabled with `macos-applescript = false`. Ghostty also integrates with Apple Shortcuts, which can create terminals, run commands, send text, and invoke keybinding actions. Shortcuts access is configurable because it expands the automation attack surface. See [`macos-shortcuts`](https://ghostty.org/docs/config/reference#macos-shortcuts) and the [1.2 release notes](https://ghostty.org/docs/install/release-notes/1-2-0#macos-apple-shortcuts).

For ZD, AppleScript is suitable as a **thin launcher/orchestrator**. It is not a durable domain API for editor buffers, goals, tasks, graphs, or agent lifecycle. Project identity would also need an explicit convention—such as tab titles, environment variables, or a ZD registry—because the documented Ghostty objects do not expose arbitrary structured per-tab application state.

## Embedding and extensibility

Ghostty's architecture is the most important long-term differentiator. The GUI apps consume a C-ABI core called `libghostty`. As of 1.3:

- `libghostty-vt`, the parser and terminal-state portion, is usable from C and Zig on macOS, Linux, Windows, and WebAssembly, but its API signatures remain in flux.
- The larger `libghostty` is used by Ghostty itself and public examples such as Ghostling.
- It has not received a tagged version, and the project says it is still improving the C API and documentation.

The current status is described in the [official repository README](https://github.com/ghostty-org/ghostty#cross-platform-libghostty-for-embeddable-terminals), while the [About page](https://ghostty.org/docs/about#libghostty) retains the broader warning that the API is not yet a stable standalone library. The direction is credible; compatibility commitment is not yet there.

What Ghostty does **not** document is equally important:

- no general third-party plugin or extension host for custom native panels;
- no API to add a Markdown editor, project sidebar, task/goal view, or state graph to the shipping Ghostty app;
- no embedded browser/WebView pane in its window hierarchy;
- no stable cross-platform application-control API comparable to its new macOS AppleScript interface.

A ZD terminal UI can of course run inside Ghostty, and modern terminal protocols such as Kitty graphics expand what a TUI can draw. That is still a terminal application with terminal input/layout constraints, not an extension of Ghostty's native SwiftUI shell.

## Fit matrix

Scores are relative to the workflow in `thoughts.txt`, where 5 is an unusually strong fit.

| Capability | Shipping Ghostty as host | Custom ZD with `libghostty` | Evidence and interpretation |
|---|---:|---:|---|
| Global summon/hide on macOS | 5 | 3 | Shipping quick terminal is purpose-built; custom ZD must implement the macOS window/hotkey behavior itself. |
| Follow current Space/screen | 5 | 3 | Quick-terminal screen and Space behavior are configurable. |
| `Cmd+number` project switching | 2 | 5 | Normal windows have indexed tab actions, but macOS quick terminals cannot have tabs; custom ZD owns the model. |
| Multiple terminal panes | 4 | 5 | Native splits ship today; embedding can expose terminals inside ZD layouts once the API is adopted. |
| Persistent project/process state | 2 | 4 | Window layouts can restore, but durable processes require another layer; custom ZD can make lifecycle explicit. |
| ZD Markdown/code editor | 1 | 5 | No documented GUI extension point; a custom shell keeps the existing editor. |
| Goals/tasks/graphs/agent UI | 1 | 5 | Same constraint. |
| Browser in the project layout | 1 | 5 | No shipping browser pane; a custom macOS app can own a WKWebView. |
| Automation | 4 | 4 | Strong macOS AppleScript/Shortcuts support; a custom app can expose its own deeper API. |
| Terminal embedding readiness | 2 | 2 | Architecture and examples exist, but the full API is unversioned and unstable. |
| License flexibility | 5 | 5 | MIT. |
| Platform breadth | 3 | 4 | Shipping app supports macOS/Linux; VT core also targets Windows/Wasm, while full app integration is platform work. |

## Pros

- Best-in-class match for the summon/hide behavior on macOS, including current-Space movement, screen targeting, auto-hide, sizing, and animation.
- Native macOS UI, Metal rendering, CoreText, secure input, system window restoration, AppleScript, and Shortcuts.
- Fast, modern terminal engine and protocol support without an Electron shell.
- Normal windows provide native tabs/splits and indexed tab selection.
- AppleScript can create deterministic per-project terminal layouts with working directories, commands, environment, and input.
- MIT licensing creates few product-distribution constraints.
- `libghostty` is explicitly designed to let other applications avoid reimplementing terminal parsing/rendering.
- Active development and a meaningful contributor base.

## Cons

- The exact quick-terminal mode needed by ZD cannot contain tabs on macOS.
- Only one quick terminal exists, so "one quick terminal per project" is not available.
- No documented GUI extension ecosystem for adding ZD's editors, project management, graphs, or agent controls.
- No browser pane or WebView extension surface in the shipping app.
- `toggle_visibility` affects all windows and is disabled for a focused full-screen surface, so it is not a clean substitute for the quick terminal.
- Full `libghostty` embedding is not versioned or API-stable; upgrades can cause change amplification inside ZD.
- Ghostty window restoration does not replace explicit agent/process supervision.
- macOS automation and global shortcuts introduce Accessibility/TCC permissions that need onboarding and security explanation.
- The project is young enough that significant regressions and API movement remain plausible.

## Risks and unknowns

These questions are not answered strongly enough by current official documentation and should be treated as spike items, not assumptions:

1. **Embedding surface on macOS:** What is the supported lifecycle for hosting a `libghostty` terminal in an independent AppKit/SwiftUI app, including Metal view ownership, IME, accessibility, clipboard, drag/drop, and multiple terminals?
2. **API compatibility:** When will the full C API receive its first version, and what compatibility policy will it promise?
3. **Distribution:** What exact Zig/build/code-signing/update burden does vendoring `libghostty` add to ZD's macOS release process?
4. **Quick-terminal splits:** The docs forbid tabs but do not clearly promise every normal split/layout operation in the quick terminal. Test the intended multipane configuration directly.
5. **Global indexed actions:** Global bindings imply `all:` behavior. Test whether global `goto_tab:<n>` produces sensible focus semantics across multiple normal windows rather than assuming it selects a unique ZD project.
6. **Automation identity:** AppleScript exposes object IDs and titles, but the persistence/stability of IDs across restore/relaunch is not specified. ZD should not use them as durable project IDs without testing.
7. **Process continuity:** Confirm behavior across hide/show, app crash, ordinary quit, OS update, and reboot with the actual agent harnesses. Use a supervisor/multiplexer where continuity matters.
8. **Accessibility permission conflict:** Validate `Cmd+~`/`Cmd+T` against macOS, keyboard layouts, Secure Input, and the user's other global utilities.

## Evidence-linked verdict

Ghostty solves the hard terminal-emulation problem and already demonstrates nearly the exact macOS overlay interaction ZD wants. The [quick-terminal contract](https://ghostty.org/docs/config/keybind/reference#toggle_quick_terminal), however, explicitly excludes macOS tabs, while the [feature set](https://ghostty.org/docs/features) and [AppleScript API](https://ghostty.org/docs/features/applescript) remain terminal/window oriented rather than a general app-extension system. Meanwhile, [`libghostty` is deliberately embeddable but unversioned](https://github.com/ghostty-org/ghostty#cross-platform-libghostty-for-embeddable-terminals).

Recommendation:

1. **Do not rebuild ZD as a Ghostty extension.** There is no suitable extension surface.
2. **Use Ghostty for a small workflow prototype:** quick terminal + tmux/Zellij + CLI agent harnesses. This cheaply validates the summon/steer/hide rhythm and numbered project switching without changing ZD's architecture.
3. **Keep `libghostty` on the custom-app shortlist**, behind a deliberately narrow terminal-view boundary. Re-evaluate after a tagged full-library release or after a contained macOS embedding spike proves IME, accessibility, resizing, process lifecycle, and packaging.
4. **Do not make ZD's project model equal Ghostty's tab model.** Project identity/state should remain ZD-owned so the terminal implementation can change.

That direction uses Ghostty as a deep module—where it is strongest—without forcing ZD's unique product surface through a terminal emulator that was not designed to host it.

## Primary sources

- [Ghostty documentation](https://ghostty.org/docs)
- [About Ghostty and `libghostty`](https://ghostty.org/docs/about)
- [Feature overview](https://ghostty.org/docs/features)
- [Keybinding guide](https://ghostty.org/docs/config/keybind)
- [Keybinding action reference](https://ghostty.org/docs/config/keybind/reference)
- [Configuration reference](https://ghostty.org/docs/config/reference)
- [AppleScript guide](https://ghostty.org/docs/features/applescript)
- [Shell integration](https://ghostty.org/docs/features/shell-integration)
- [Ghostty 1.2.0 release notes](https://ghostty.org/docs/install/release-notes/1-2-0)
- [Ghostty 1.3.0 release notes](https://ghostty.org/docs/install/release-notes/1-3-0)
- [Ghostty 1.3.1 release notes](https://ghostty.org/docs/install/release-notes/1-3-1)
- [Official repository](https://github.com/ghostty-org/ghostty)
- [MIT license](https://github.com/ghostty-org/ghostty/blob/main/LICENSE)
