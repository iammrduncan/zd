# bb (`get-bb/bb`) as a substrate for ZD

Research checked: 2026-08-11

## Bottom line

**bb is the closest existing project in this survey to the product Joseph described.** It already combines multiple projects, agent threads, worktrees, a real PTY terminal, desktop-only embedded browser tabs, file previews, a rich Markdown editor plugin, task tracking, workflow orchestration, and first-class web/desktop/CLI/HTTP control. Its stated direction is also unusually aligned: a programmable workspace that users and agents can operate through equivalent surfaces ([README](https://github.com/get-bb/bb#readme), [vision](https://github.com/get-bb/bb/blob/main/docs/VISION.md)).

It is not a drop-in answer. There is no documented OS-global summon/hide overlay, no first-party general code editor comparable to Zed, and several of the most useful app plugin slots are explicitly experimental. ZD would also inherit a large, fast-moving TypeScript/Electron/server/daemon system. The best interpretation is therefore **a serious candidate for a bounded integration prototype, not an immediate rewrite target**.

My verdict: **prototype ZD as a bb plugin before considering either a fork or abandoning the standalone ZD app.** Test whether the public plugin contracts can host the existing Markdown/editor, todo/goal/objective, graph, and agent-steering experiences. Treat the global hotkey as a separate small desktop-shell contribution or fork experiment. If those two seams work, bb could replace a great deal of infrastructure ZD would otherwise have to own.

## What bb actually is

bb calls itself an “agentic IDE that can control itself.” Desktop app, web app, CLI, and HTTP API are all intended to be first-class control surfaces; work is organized into live, steerable **threads** that can be handed between agents ([README](https://github.com/get-bb/bb/blob/main/README.md)).

The important distinction is that bb is not mainly a code editor with an agent panel. It is an **agent work orchestration platform with IDE-like workspace surfaces**:

- A **project** is normally a repository and can map to sources on more than one machine.
- A **thread** is an append-only agent conversation/work stream. Threads can be manager threads and can own child threads for delegation.
- An **environment** binds a directory/worktree to an execution host; several threads can share one.
- A **host daemon** owns local process execution and workspace provisioning.
- The app and CLI operate the same server model ([system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)).

That model is much closer to ZD’s desired “projects containing editors, terminals, agents, tasks, and durable work context” than a conventional editor extension API.

## Architecture and what ZD would inherit

bb is a TypeScript monorepo with four runtime pieces:

1. A central server stores state in SQLite, exposes HTTP APIs, and sends change notifications over WebSocket.
2. A host daemon on every execution machine provisions workspaces, starts provider processes and terminals, and reports events.
3. A React web app renders projects, threads, files, tools, and plugin UI.
4. An Electron desktop shell adds native capabilities such as the embedded browser and local window behavior.

Typed contract packages isolate app/server and server/daemon boundaries; the server deliberately does not know workspace provisioning details, and the daemon does not own project/thread policy ([system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md), [repository map](https://github.com/get-bb/bb/blob/main/docs/repository-overview.md)).

Consequences for ZD:

- **Excellent reused deep modules:** SQLite state, multi-project/thread model, remote machines, provider execution, PTYs, browser transport, file routing, worktrees, realtime UI, mobile browser access, and agent lifecycle.
- **Real operational weight:** Electron + React + Node 22 + server + per-machine daemon + native modules (`node-pty`, `better-sqlite3`, file watching). This is not a shallow library dependency.
- **Fork pressure is dangerous:** carrying desktop-shell or core-model changes against a project with thousands of commits in its first six months would create sustained merge cost. Prefer upstream contributions and public plugin contracts.

## Extensibility

bb’s plugin system is its strongest argument as a ZD host.

### Backend surface

Plugins can define settings, use namespaced key/value storage or a plugin-owned SQLite database, observe thread lifecycle, register authenticated HTTP/RPC endpoints, publish realtime signals, run background services, schedule work, expose CLI commands, provide agent tools/skills, and call the main bb SDK. The backend contract is typed and loaded into the server ([backend plugin contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/backend-contract.ts)).

This is sufficient in principle for ZD’s custom todo, goal, objective, and graph data models without asking bb to adopt them as core concepts.

### App surface

Plugins can add or replace meaningful UI regions: navigation panels, settings sections, homepage sections, thread panels, composer customizations, message actions/directives, a sidebar thread-list provider, thread header actions, and file opener/editor components. The file-opener contract explicitly lets a plugin become the viewer/editor for chosen extensions and render inside normal panel tabs ([app plugin contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts#L551-L568)).

This is materially deeper than a “run a command” extension system. It should allow ZD to bring its own React UI into the bb shell.

### Proof that nontrivial products fit in plugins

bb’s official plugins are not toy samples:

- **Docs** is a filesystem-first, rich Markdown/HTML document library with vaults across connected hosts, nested navigation, rich editing, tables, pasted images, file watching, safe compare-and-swap saves, chat mentions, and thread-panel editing. It also registers as the default `.md`/`.mdx`/`.markdown` editor ([Docs plugin](https://github.com/get-bb/bb/blob/main/plugins/docs/README.md)).
- **Tasks** is a Linear-style project/task tracker with folders, statuses, priorities, labels, subtasks, Markdown comments, attachments, agent presets, delegation, task-thread attachment, UI, CLI, and agent skill ([Tasks plugin](https://github.com/get-bb/bb/blob/main/plugins/tasks/README.md)).
- **Workflows** runs durable multi-agent orchestration scripts in a capability-limited QuickJS VM, persists runs/calls, exposes live progress UI, supports phases, controlled concurrency, validation, retries, and replay ([Workflows plugin](https://github.com/get-bb/bb/blob/main/plugins/workflows/README.md)).

Those are direct precedents for the ZD feature family. In particular, Tasks proves that custom planning state can remain plugin-owned while still integrating with agent dispatch and threads.

### The catches

- The source labels several powerful slots `experimental_`, and bb maintains an explicit audit list for APIs that have not yet earned stability ([API audit](https://github.com/get-bb/bb/blob/main/docs/api_to_audit.md)).
- App plugins are React components coupled to bb’s SDK and UI conventions, not portable web components.
- A plugin cannot currently add an Electron OS-global shortcut or change window-level behavior. That requires an upstream desktop-shell feature or a fork.
- A plugin can become a file editor, but a full Zed-class code editor involves far more than a text component: LSPs, diagnostics, navigation, search, refactors, keymaps, and enormous polish. bb does not make that complexity disappear.

## Fit against Joseph’s requirements

| Requirement | Current fit | Evidence and interpretation |
| --- | --- | --- |
| Global summon/hide hotkey and overlay | **Missing** | bb documents in-app and Electron menu shortcuts, but no OS-global toggle. Its current Electron entry point contains ordinary window/menu shortcut handling, not a documented `globalShortcut` overlay feature ([configuration](https://github.com/get-bb/bb/blob/main/docs/configuration.md), [desktop main](https://github.com/get-bb/bb/blob/main/apps/desktop/src/main.ts)). Likely a modest core feature, but outside the plugin API. |
| Multiple projects and fast switching | **Strong** | Projects are top-level repository containers; sidebar and thread-list APIs expose projects and live thread state. Threads can be opened in splits and projects can span hosts ([system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md), [app plugin contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts)). Exact `Command-1/2/3` project switching needs keymap/product validation. |
| Markdown editor | **Very strong** | The official Docs plugin is already a rich, filesystem-first Markdown editor with images, tables, frontmatter, mentions, and host-routed safe saves ([Docs](https://github.com/get-bb/bb/blob/main/plugins/docs/README.md)). ZD could port its current editor as another file opener or compare against Docs first. |
| General code editor | **Partial** | Built-in surfaces preview source/diffs and open files in an external configured editor. Plugins may register editors per extension, but there is no documented first-party general code editor or LSP-grade IDE surface ([file-opener API](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts#L551-L568)). |
| Terminal | **Strong** | bb owns PTYs in the host daemon using `node-pty` and renders them with xterm.js; terminals appear as normal workspace/thread side-panel tabs ([terminal manager](https://github.com/get-bb/bb/blob/main/apps/host-daemon/src/terminals/terminal-manager.ts), [terminal view](https://github.com/get-bb/bb/blob/main/apps/app/src/components/thread/terminal/ThreadTerminalView.tsx)). Durability across daemon/app restart needs a hands-on check. |
| Browser integration | **Strong on desktop, limited elsewhere** | The Electron app implements native in-panel browser views/tabs. The general app is still a web surface, so this capability is desktop-specific and has security policy around navigations/requests ([desktop browser view](https://github.com/get-bb/bb/blob/main/apps/desktop/src/desktop-browser-view.ts), [browser policy](https://github.com/get-bb/bb/blob/main/apps/desktop/src/desktop-browser-policy.ts)). |
| Custom todos and planning | **Very strong precedent** | The official Tasks plugin already supplies a deep agent-connected tracker. ZD can reuse it, interoperate, or implement its own schema as a plugin ([Tasks](https://github.com/get-bb/bb/blob/main/plugins/tasks/README.md)). |
| Goals and objectives | **Strong extension fit** | No evidence of a first-class objective hierarchy, but plugin-owned SQLite, panels, commands, tools, skills, events, and realtime signals are enough to build it without forking core ([backend contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/backend-contract.ts)). |
| Custom state-machine graphs | **Plausible, unproven** | A plugin can own a full nav/panel React UI and durable database; Workflows proves orchestration and progress surfaces. Need a spike to confirm graph-canvas libraries, persistence, deep links, and interaction ergonomics inside plugin panes. |
| Multiple agent harnesses | **Strong, with a boundary** | bb supports Claude Code, Codex, Pi, Cursor/ACP and other ACP-compatible agents, and documents native skill roots for OpenCode, Grok, Hermes and others ([bb-app package guide](https://github.com/get-bb/bb/blob/main/packages/bb-app/README.md)). A new non-ACP provider may still require core provider-adapter work. |
| Review and steer agents quickly | **Very strong** | Live thread timelines, child/manager threads, task delegation, workflow cards, pending interactions, CLI/API control, splits, and remote browser access are central rather than bolted on ([README](https://github.com/get-bb/bb#readme), [multi-device guide](https://github.com/get-bb/bb/blob/main/docs/multiple-devices.md)). |

## Platform, maturity, license, and trust

- **License:** MIT ([license](https://github.com/get-bb/bb/blob/main/LICENSE)). This permits internal use, modification, redistribution, and a ZD fork with minimal licensing friction.
- **Desktop platform:** the packaged desktop build is currently Apple Silicon macOS only. The `npx` web app runs on macOS and Linux; Windows is WSL2-only, with native PowerShell/CMD explicitly unsupported ([README](https://github.com/get-bb/bb#use-bb), [platform support](https://github.com/get-bb/bb/blob/main/docs/platform-support.md)). Joseph’s Apple Silicon Mac is the favored path.
- **Maturity:** the repository was created in February 2026, describes itself as “active development,” and says workflows/surfaces are still evolving. Stable desktop `0.36.0` shipped August 8, 2026 ([release](https://github.com/get-bb/bb/releases/tag/desktop-v0.36.0)). This is high velocity, not long-term stability.
- **Adoption signal:** roughly 1.6k GitHub stars and 160 forks at review time ([repository](https://github.com/get-bb/bb)). Useful evidence of interest, not proof of reliability.
- **Telemetry:** packaged production runs send anonymous counts for starts, thread creation, and user messages under a random install ID; content/project/workspace identifiers are excluded, and `BB_TELEMETRY=false` opts out ([README telemetry section](https://github.com/get-bb/bb#telemetry)).
- **Network/security:** local loopback is the default. The project warns that wildcard-bound public API access is unauthenticated and permits command execution/file reads; remote use should be account-gated bb connect or private Tailscale Serve, never a public Funnel ([multi-device guide](https://github.com/get-bb/bb/blob/main/docs/multiple-devices.md)).

## Pros for ZD

- Its core abstraction—projects containing steerable agent work—is almost exactly the hard substrate ZD needs.
- Desktop, web, CLI, HTTP, realtime, and agent-facing tools already share one state model.
- It solves or substantially advances terminal emulation, browser embedding, remote hosts, worktrees, thread persistence, provider adapters, file routing, and multi-device access.
- The plugin system is deep enough for full product areas, not merely buttons or commands.
- Official Docs, Tasks, and Workflows plugins are strikingly close to ZD’s Markdown, planning, and orchestration ambitions.
- MIT licensing makes experimentation and selective reuse uncomplicated.
- Apple Silicon macOS is the primary packaged desktop target.

## Cons and risks

- The single most important interaction—global hotkey summon/hide over the current Space—is absent and cannot be implemented as an ordinary bb plugin.
- bb is young, pre-1.0, and changing quickly. Experimental plugin slots may churn exactly where ZD needs customization.
- There is no complete native code editor. Building one inside bb could recreate a major part of ZD’s current work while accepting bb’s constraints.
- Adopting bb means adopting a distributed-ish local architecture and a large JS/Electron dependency surface. That is more cognitive and operational complexity than ZD’s current focused app.
- A fork would be expensive to keep current; relying on upstream would mean ZD’s roadmap depends on another young project.
- bb’s tasks/workflows may overlap ZD semantically but not match Joseph’s file-based objective system. Reusing them could force a model migration; replacing them duplicates surface area.
- Provider flexibility is broad but not unlimited. Hermes/Pi skill discovery does not necessarily mean every harness has the same rich thread runtime integration.
- Embedded browsers and local agent/file APIs enlarge the desktop trust boundary; plugin and remote exposure review is mandatory.

## Recommended direction and validation spike

Do **not** choose “fork bb” first. Run a two-track, time-boxed spike against an unmodified stable build:

1. Build a minimal `zd` plugin with a navigation panel and plugin SQLite store.
2. Port one real ZD Markdown document/editor path using the file-opener contract; compare it directly to bb Docs.
3. Import `todo.txt` read-only and render the actual todo/goal/objective hierarchy.
4. Add one graph panel and one action that spawns/steers an agent thread through the public SDK.
5. Verify project switching, split behavior, terminal survival, browser tabs, keyboard routing, and deep-link persistence with three real repositories.
6. Separately prototype an upstreamable Electron preference for a global shortcut that toggles a frameless/always-on-top window on the active macOS Space. Do not let this experiment leak into plugin architecture.
7. Record every core patch the prototype needs. **The decision threshold should be based on patch pressure:** if the ZD plugin works and the only core need is the summon window, bb is a compelling base; if editor, graph, navigation, and agent semantics repeatedly require internal imports or core changes, stay standalone and borrow ideas.

## Evidence gaps / unknowns

- No hands-on test was performed with bb `0.36.0`; this is source/documentation research.
- Whether terminal sessions survive closing/reopening the Electron app, server restart, daemon update, sleep, or crash exactly as Joseph expects is not clearly documented.
- Whether the current plugin SDK supports all file writes and rich editor behaviors ZD uses without private imports needs a prototype.
- The code-editor roadmap is unclear: no official statement found that bb plans a first-party LSP-capable editor.
- Exact macOS window semantics—active Space placement, focus restoration, hide-on-second-hotkey, display selection, animation, and full-screen-app behavior—are unknown because no global overlay exists today.
- The stable compatibility policy for experimental app slots is intentionally unsettled.
- It is unclear whether Hermes Agent is a fully supported runtime provider or primarily a discovered skill/config source in the current release.
- The long-term governance, funding, maintainer bus factor, and support guarantees are not documented.
- No performance measurements were gathered for large repositories, many simultaneous threads, long terminal sessions, large Markdown vaults, or graph-heavy plugin UIs.

## Primary sources

- [Repository and README](https://github.com/get-bb/bb)
- [Vision](https://github.com/get-bb/bb/blob/main/docs/VISION.md)
- [System overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)
- [Platform support](https://github.com/get-bb/bb/blob/main/docs/platform-support.md)
- [Plugin backend contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/backend-contract.ts)
- [Plugin app contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts)
- [Docs plugin](https://github.com/get-bb/bb/blob/main/plugins/docs/README.md)
- [Tasks plugin](https://github.com/get-bb/bb/blob/main/plugins/tasks/README.md)
- [Workflows plugin](https://github.com/get-bb/bb/blob/main/plugins/workflows/README.md)
- [Desktop 0.36.0 release](https://github.com/get-bb/bb/releases/tag/desktop-v0.36.0)
- [MIT license](https://github.com/get-bb/bb/blob/main/LICENSE)
