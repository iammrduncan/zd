# Herdr as a substrate for ZD

Research checked: 2026-08-11

## Bottom line

**Herdr is an excellent replacement for the “many terminals running many agents” layer, but a poor host for the whole ZD product.** It intentionally stays inside an existing terminal emulator, keeps real PTYs alive in a background server, organizes them into workspaces/tabs/panes, detects agent state, supports local and remote attach, and exposes a strong CLI/socket API. That is directly useful to Joseph’s agent-steering workflow ([overview](https://herdr.dev/), [concepts](https://herdr.dev/docs/concepts/), [socket API](https://herdr.dev/docs/socket-api/)).

Its deliberate boundary is also decisive: Herdr is not a desktop app, not a terminal emulator, not a browser dashboard, and not a native GUI extension host. Plugin v1 launches executable workflows and terminal panes; the documentation explicitly says native non-terminal plugin UI is not part of v1 ([plugins](https://herdr.dev/docs/plugins/)). A full Markdown/code editor, browser, visual todo/goal system, and graph editor would each have to be terminal applications running inside panes—or separate apps alongside Herdr.

My verdict: **adopt or trial Herdr as an optional terminal/agent runtime beneath or beside ZD, not as the foundation of ZD’s GUI.** The most promising composition is a small macOS-global terminal overlay (Joseph already uses Warp this way) that opens directly into a persistent Herdr session, while ZD remains the opinionated document/planning/graph surface and talks to Herdr through its CLI/socket API.

## What Herdr actually is

Herdr is a Rust terminal workspace manager and agent-aware terminal multiplexer. It follows a tmux-like client/server model:

- A background **server** owns the terminal processes and session state.
- One or more terminal **clients** attach, render, send input, and detach.
- A **workspace** is the project-level container.
- A workspace owns **tabs**, each of which owns split **panes**.
- Every pane is a real PTY; agents, shells, servers, tests, and full-screen TUIs run unchanged.
- Herdr recognizes supported agent processes and rolls `blocked`, `working`, `done`, `idle`, or `unknown` state up through panes, tabs, and workspaces ([concepts](https://herdr.dev/docs/concepts/), [agents](https://herdr.dev/docs/agents/)).

It runs *inside* Ghostty, Warp, iTerm, Kitty, Alacritty, or another terminal. Herdr does not replace that emulator. Local use is `herdr`; detach is `ctrl+b q`; later `herdr` reattaches to the same server-owned panes. It can also run remotely after normal SSH or expose a thin local client with `herdr --remote host` ([how to work](https://herdr.dev/docs/how-to-work/)).

This is a very good answer to “where do all my live CLI agent harnesses go?” It is not itself an answer to “where do my rich ZD documents and graphs render?”

## Architecture and extensibility

### Core architecture

Herdr ships as one Rust binary rather than Electron. Its current manifest uses `portable-pty`, Tokio, Ratatui, Crossterm, interprocess sockets/pipes, Serde, and a vendored terminal implementation ([Cargo manifest](https://github.com/herdrdev/herdr/blob/master/Cargo.toml)). The runtime has a clean deep-module shape: Herdr owns persistence, terminal state, layouts, agent recognition, and client rendering; the program inside each PTY remains ordinary terminal software.

The local socket API and equivalent CLI wrappers can create/focus/rename/close workspaces and tabs; inspect/split/move/resize/read/close/send input to panes; start/read/prompt/wait on agents; report custom agent state; and subscribe to events ([socket API](https://herdr.dev/docs/socket-api/), [CLI reference](https://herdr.dev/docs/cli-reference/)). This makes Herdr unusually automation-friendly: ZD could observe the herd, jump to a blocked agent, create project layouts, send prompts, and wait for outcomes without scraping a TUI.

### Agent integrations

Any CLI agent can run in a pane. Built-in detection and optional integrations add better labels, semantic lifecycle state, and native conversation resume. Official docs cover Pi, OMP, Claude Code, Codex, Copilot, Devin, Droid, Kimi, OpenCode, Kilo, Hermes, QoderCLI, Cursor, and others ([integrations](https://herdr.dev/docs/integrations/), [agents](https://herdr.dev/docs/agents/)).

This is especially aligned with Joseph’s interest in continuing to run agent harnesses as CLIs and experimenting with Hermes and Pi without making ZD own each TUI.

### Plugin model

Herdr plugins are executable workflow packages described by `herdr-plugin.toml`. A plugin can be written in Bash, JavaScript, Lua, Rust, Python, Go, or any other runnable language. Manifests can declare:

- installation/build commands;
- startup hooks;
- actions and event hooks;
- terminal pane entry points;
- keybindings;
- URL link handlers;
- supported platforms and minimum Herdr version.

Plugin commands receive invocation context and paths for plugin config/state, then call the whole Herdr CLI or raw socket API. Panes may open as overlay, popup, split, tab, or zoomed ([plugin guide](https://herdr.dev/docs/plugins/)).

This is a powerful **workflow** extension model and a weak **GUI composition** model. The documentation is explicit that there is no separate restricted SDK, no managed plugin storage API, and no runtime/native non-terminal plugin UI in v1. Plugins are ordinary unsandboxed user processes and must own their database/files.

For ZD, that means:

- A todo picker, fuzzy project switcher, log viewer, or graph TUI can be a plugin pane.
- An event hook can mirror Herdr activity into ZD or launch a task workflow.
- A plugin cannot add a rich React/Swift panel into Herdr’s sidebar or replace part of its renderer.
- Building the current ZD editor inside Herdr means rebuilding it as a terminal editor, losing the existing web UI, or merely launching ZD as a separate process.

## Fit against Joseph’s requirements

| Requirement | Current fit | Evidence and interpretation |
| --- | --- | --- |
| Global summon/hide hotkey and overlay | **Indirect only** | Herdr has in-terminal prefix keybindings, but no macOS-global window because it is not a terminal emulator or desktop app. Pair it with Warp/Ghostty/iTerm’s global hotkey window: summon terminal → Herdr is already attached → hide terminal. Herdr itself cannot guarantee the active-Space overlay behavior. |
| Multiple projects and fast switching | **Strong inside a terminal** | One workspace per repo/task/investigation, with tabs and panes underneath; mouse and keyboard navigation are first-class ([concepts](https://herdr.dev/docs/concepts/), [quick start](https://herdr.dev/docs/quick-start/)). Bindings can approximate project slots, but `Command-1/2/3` is mediated by the host terminal and Herdr key protocol rather than a native Mac menu. |
| Markdown editor | **Bring your own TUI** | Herdr provides only terminal panes. Run Neovim, Helix, Zed CLI, a Markdown TUI, or a custom ZD terminal client. Community plugins may render Markdown, but Herdr has no first-party rich Markdown editor and marketplace listings are unreviewed ([plugins](https://herdr.dev/docs/plugins/), [marketplace](https://herdr.dev/docs/marketplace/)). |
| General code editor | **Bring your own** | Excellent place to run terminal editors and their LSPs; not itself an editor. Graphical Zed remains a separate window/process. |
| Terminal | **Excellent** | This is the core product: persistent real PTYs, splits, copy mode, mouse support, detach/reattach, direct terminal attach, remote sessions, and native agent state ([concepts](https://herdr.dev/docs/concepts/), [session state](https://herdr.dev/docs/session-state/)). |
| Browser integration | **Weak** | Terminal hyperlinks can open the external browser and plugin link handlers can intercept modified clicks, but there is no embedded web view. A text browser could run in a pane; that is not equivalent to the desired integrated browser. |
| Custom todos, goals, objectives | **Possible as a separate TUI/plugin** | Plugins own ordinary files/databases and can open panes or react to events. Herdr supplies no host UI/data primitives for these domain models. ZD would build the whole interaction layer. |
| Custom state-machine graphs | **Poor for rich visuals** | ASCII/Kitty-graphics TUIs are possible, and experimental Kitty graphics support exists, but the host supplies no canvas or graphical plugin surface ([configuration reference](https://herdr.dev/docs/config-reference/)). |
| Multiple agent harnesses | **Excellent** | Real terminal panes work with any CLI; detection and integrations cover a broad set including Codex, Claude Code, Pi, OpenCode, and Hermes ([agents](https://herdr.dev/docs/agents/), [integrations](https://herdr.dev/docs/integrations/)). |
| Review and steer agents quickly | **Excellent in terminal** | Rolled-up agent state, direct attach, pane reads, prompt/send input, waits, events, and remote/phone attach are the center of the product ([agent automation](https://herdr.dev/docs/agent-automation/), [socket API](https://herdr.dev/docs/socket-api/)). |
| Remote continuity | **Excellent** | Server-owned panes survive client detach; normal SSH and `--remote` both reach the same session, including narrow phone layouts ([how to work](https://herdr.dev/docs/how-to-work/), [persistence/remote](https://herdr.dev/docs/persistence-remote/)). |

## Session durability: important nuance

Herdr cleanly distinguishes several cases:

- **Client detach/reattach:** processes, layout, current screen, and agent conversation stay alive because the server never stopped.
- **Server restart:** processes cannot survive; the saved layout returns. Screen history only returns when that feature is enabled, and agent conversation only resumes for integrations that support native session restore.
- **Update:** compatible running servers may remain; protocol-incompatible updates may require stopping the server and therefore terminating panes. Experimental live handoff covers some cases ([session state](https://herdr.dev/docs/session-state/), [install/update guide](https://herdr.dev/docs/install/)).

This is still a large improvement over loose terminal tabs, but “close the laptop and nothing dies” should not be mistaken for arbitrary crash/reboot process persistence. A ZD integration must show these states honestly.

## Platform, maturity, license, and trust

- **License:** Herdr `0.8.0` relicensed from AGPL to **Apache-2.0**, a permissive license with an explicit patent grant ([0.8.0 release](https://github.com/herdrdev/herdr/releases/tag/v0.8.0), [license](https://github.com/herdrdev/herdr/blob/master/LICENSE)). Older articles and repository snapshots that say AGPL are stale.
- **Platforms:** stable binaries support macOS (Intel and Apple Silicon) and Linux (x86_64/aarch64). Native Windows is preview-only beta ([install guide](https://herdr.dev/docs/install/)).
- **Maturity:** created in March 2026, Herdr reached `0.8.0` on August 3 and had roughly 27.5k stars, 1.9k forks, 1,300+ commits, and 80 commits after that release at review time ([repository](https://github.com/herdrdev/herdr), [0.8.0 release](https://github.com/herdrdev/herdr/releases/tag/v0.8.0)). That is exceptional momentum but still a five-month-old pre-1.0 system.
- **Release evidence:** the `0.8.0` notes are extensive and include terminal protocol, clipboard, session restore, remote attach, Windows, plugin, performance, and agent-detection fixes. This suggests serious engineering attention while also exposing how many edge cases a terminal multiplexer owns ([release notes](https://github.com/herdrdev/herdr/releases/tag/v0.8.0)).
- **Plugin trust:** plugin install previews source/commands and supports pinned Git refs, but plugins run unsandboxed as the user with the full environment and Herdr CLI. The automatic marketplace is not reviewed or vetted ([plugins trust guidance](https://herdr.dev/docs/plugins/#trust-and-security), [marketplace](https://herdr.dev/docs/marketplace/)).
- **Privacy:** the official positioning is local binary, no web account, and no hosted control plane. Remote access is through the user’s SSH infrastructure ([homepage](https://herdr.dev/), [how to work](https://herdr.dev/docs/how-to-work/)).

## Pros for ZD

- Solves the hardest terminal-specific work correctly: PTYs, rendering, splits, mouse/keyboard input, persistence, remote attach, copy mode, and process lifecycle.
- Treats agents as first-class stateful entities rather than opaque shell tabs.
- Works with CLI harnesses without forcing a provider-specific rewritten chat UI.
- Local CLI/socket APIs are broad, deterministic, JSON-oriented, and agent-accessible.
- Workspace/tab/pane hierarchy maps naturally to project/context organization.
- One Rust binary is operationally simpler and lighter than embedding another terminal stack into ZD.
- Remote and phone workflows are much stronger than a local-only desktop app.
- Apache-2.0 permits integration, modification, redistribution, or vendoring without copyleft pressure.

## Cons and risks

- It does not solve the desktop summon window; it only fits inside one. ZD still needs Warp/Ghostty/iTerm or its own Mac shell for global hotkey behavior.
- It cannot host the current rich ZD UI. Native non-terminal plugin UI is explicitly absent from plugin v1.
- No integrated graphical browser, code editor, Markdown editor, task UI, or graph canvas.
- Anything visually ambitious becomes a custom TUI, inheriting terminal rendering/input/clipboard/accessibility limitations.
- The project is very young and pre-1.0 despite strong adoption. CLI, socket, plugin, persistence, and config contracts may still change.
- Agent status detection mixes process/output heuristics and integrations; custom wrappers or novel harness versions can be wrong or `unknown`.
- Unsandboxed marketplace plugins have full user privileges. A plugin can read secrets or execute arbitrary commands.
- Session restoration after server restart is not process continuation and varies by agent integration.
- If ZD tightly couples its model to Herdr identifiers/layout semantics, it could become difficult to support other terminals or standalone mode.

## Recommended role in the ZD architecture

Use Herdr behind a **narrow adapter**, not as ZD’s UI framework:

```text
macOS global-hotkey terminal window
             |
             v
          Herdr
   (PTYs, projects, agents,
    detach, remote, status)
             ^
             | CLI/socket adapter
             v
             ZD
  (Markdown/code UX, todos,
   goals, objectives, graphs)
```

ZD should treat Herdr as one runtime provider with capabilities such as `list_workspaces`, `focus_workspace`, `list_agents`, `focus_agent`, `read_agent`, `send_prompt`, `wait_for_state`, and `open_terminal`. Keep ZD’s domain data independent of Herdr session IDs; store a small optional mapping from ZD project to Herdr workspace.

That gives Joseph two useful modes:

1. **Fast terminal mode:** global shortcut opens the existing terminal window directly on the herd; navigate or steer with Herdr immediately.
2. **Rich ZD mode:** ZD shows documents, plans, graphs, and aggregated agent state, then uses the adapter to jump into or control the relevant Herdr pane.

Avoid making Herdr mandatory until the adapter proves stable. A no-Herdr backend should remain possible so ZD is not captured by one pre-1.0 runtime.

## Suggested validation spike

1. Install stable Herdr and create three workspaces for real repositories.
2. Run at least Codex, Pi, and Hermes/another harness concurrently; record status accuracy, native resume behavior, and full-screen TUI fidelity.
3. Put Herdr in Joseph’s existing Warp global-hotkey terminal and measure the actual summon → project → agent → steer → dismiss interaction.
4. Build a read-only ZD adapter using CLI JSON first, not the raw socket: list workspaces/agents, map them to ZD projects, and jump to a blocked pane.
5. Add one ZD action to create a workspace/tab/pane and launch an agent with a prompt.
6. Test detach, terminal window close, laptop sleep, network loss, Herdr update, server stop/restart, and Mac reboot. Record which state survives.
7. Prototype one Herdr plugin pane that shows ZD todo data. If the TUI feels like a second-class copy of ZD, stop there; do not force the rich product into the terminal.

## Evidence gaps / unknowns

- No hands-on Herdr session was run for this research.
- The practical interaction between Herdr’s prefix keys and Warp/Ghostty/iTerm global-hotkey windows, macOS Command shortcuts, and non-US layouts needs testing.
- Current status accuracy for Joseph’s exact Codex, Pi, Hermes, and wrapper configurations is unknown.
- The official docs list broad integration support, but each integration exposes different semantic state and resume guarantees.
- The raw socket schema is versioned with the installed binary, but a formal long-term compatibility/deprecation policy was not found.
- The operational behavior of very large scrollback, dozens of panes, many clients, or long-running sessions was not benchmarked.
- Accessibility of a TUI-heavy workflow—screen reader, keyboard discoverability, reduced motion, large text—is not assessed here.
- Community claims such as “150+ plugins” change quickly; the marketplace is automatic and unreviewed, so plugin count is not treated as capability proof.
- Apache relicensing is current and explicit, but downstream dependencies and bundled/vendored code still need normal license review before redistribution.
- A host-terminal API for directly selecting/focusing the global hotkey window is outside Herdr and varies by emulator.

## Primary sources

- [Herdr homepage](https://herdr.dev/)
- [Repository and README](https://github.com/herdrdev/herdr)
- [Concepts](https://herdr.dev/docs/concepts/)
- [How to work with Herdr](https://herdr.dev/docs/how-to-work/)
- [Agents](https://herdr.dev/docs/agents/)
- [Integrations](https://herdr.dev/docs/integrations/)
- [Session state and restore](https://herdr.dev/docs/session-state/)
- [Socket API](https://herdr.dev/docs/socket-api/)
- [CLI reference](https://herdr.dev/docs/cli-reference/)
- [Plugin guide and trust model](https://herdr.dev/docs/plugins/)
- [Marketplace](https://herdr.dev/docs/marketplace/)
- [Install/platform guide](https://herdr.dev/docs/install/)
- [Herdr 0.8.0 release](https://github.com/herdrdev/herdr/releases/tag/v0.8.0)
- [Apache-2.0 license](https://github.com/herdrdev/herdr/blob/master/LICENSE)
