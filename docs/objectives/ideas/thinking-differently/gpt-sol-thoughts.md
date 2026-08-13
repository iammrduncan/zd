# Thinking differently about ZD

Research snapshot: 2026-08-11

Status: recommendation and experiment plan, not an accepted architecture decision

The supporting evidence is indexed in [`research/README.md`](research/README.md). The fastest
cross-candidate view is [`research/comparison-matrix.md`](research/comparison-matrix.md), and the
full options analysis is [`research/architecture-options.md`](research/architecture-options.md).

## My answer

Keep building ZD as a standalone application.

But change what we believe the application is.

ZD should not try to become a better Zed, a new Warp, a new browser, and a new Claude Code all at
once. ZD should become the **globally summonable project attention layer** that sits across those
tools. It should own the parts that are personal, durable, and differentiating:

- the calm Markdown reading/editing surface;
- project identity and retained work context;
- todos, goals, objectives, and state graphs;
- review and steering of agents;
- the interaction for summoning, switching, seeing what needs attention, acting, and disappearing.

It should buy or compose the parts where correctness is deep and differentiation is low:

- terminal emulation and PTYs;
- full code intelligence and language tooling;
- agent inference loops and provider authentication;
- authenticated general web browsing;
- Git hosting and review infrastructure.

The one-sentence version is:

> ZD should be the place you inspect, steer, and remember—not the place that must render every
> terminal cell, understand every programming language, or become every agent harness.

This is neither “build it all ourselves” nor “turn ZD into a plugin.” It is a hybrid with a clear
owner. The ZD app owns the product and canonical state. Other applications remain replaceable deep
modules connected through narrow, semantic seams.

## Why I do not recommend moving into an existing host now

The attractive idea is that an editor or terminal already solved windows, tabs, PTYs, projects,
updates, and plugins, so ZD could add only its special pieces. That logic is sound only if the host's
supported public extension boundary can carry those special pieces.

Today, none of the obvious hosts does.

- [Zed](research/zed.md) is much closer to the desired multi-project/agent cockpit than the initial
  note assumes. It now retains multiple projects, layouts, agent threads, terminals, worktrees, and
  external ACP agents. That corrects an important premise. But Zed extensions still cannot add an
  arbitrary custom editor, DOM webview, or workbench panel that carries the existing CodeMirror ZD
  experience. A fork would replace a small Tauri-shell problem with a permanent fast-moving editor
  merge problem.
- [Warp](research/warp.md) already has the global hotkey, numbered tabs, strong terminal UX, reusable
  layouts, remote control, agent awareness, and explicit support for Pi and Hermes. But its supported
  seams are configurations, deep links, MCP, and agent integrations—not arbitrary ZD UI. Its Project
  primitive and broader client control are still roadmap items.
- [Ghostty](research/ghostty.md) has exemplary quick-terminal behavior and a strategically excellent
  `libghostty` architecture. But the macOS quick terminal currently lacks tabs, the full library API
  is not yet stable, and Ghostty has no general GUI plugin system.
- [iTerm2](research/iterm2.md) gets surprisingly close to the literal interaction. It has dedicated
  hotkey windows, normal tabs, `Command-number` switching, arrangements, Python automation, and new
  browser/WebView surfaces. It is the best quick host for an **experience prototype**, but not an
  embeddable terminal platform, and a deep fork brings GPL and maintenance consequences.
- [Herdr](research/herdr.md) is excellent at persistent terminal workspaces and agent awareness. Its
  CLI/socket surface is unusually useful. It is deliberately terminal-only and therefore a strong
  runtime below or beside ZD, not ZD's visual home.
- [T3 Code](research/t3-codes.md) is an excellent benchmark and implementation reference for agent
  projects, terminals, browser previews, approvals, checkpoints, diffs, and remote steering. It has
  no stable third-party UI plugin contract for the ZD surface.
- [Superlogical](research/superlogical.md) is directionally fascinating but too early and too
  undocumented to become a dependency decision.

There is one serious exception worth testing: [bb](research/bb.md). bb is the closest existing
system to the whole product idea. It already combines multiple projects, agent threads, worktrees,
PTYs, embedded browser tabs, file previews, Markdown/editor plugins, tasks, workflows, and desktop,
web, CLI, and HTTP control. Its product model is closer to “programmable agent workbench” than
“editor with an AI sidebar.”

That does **not** justify a migration. It justifies the most important external experiment in this
research: try to mount a faithful slice of ZD as a bb plugin. If bb's real public plugin contracts
can carry the Markdown surface, one objective view, and one agent-steering interaction without
forking core, then bb may remove enough infrastructure to reopen the architecture decision. If the
spike needs experimental internals or product-specific forks, stop.

## The existing architecture is leverage, not sunk cost

The current repository audit in [`research/zd-current-architecture.md`](research/zd-current-architecture.md)
matters here. ZD is not a monolithic custom desktop program:

- the product surface is TypeScript, DOM, CSS, and CodeMirror;
- Tauri is a thin native shell;
- all frontend-native access crosses one `Platform` interface;
- the suite already distinguishes product mini apps from suite-owned overlays;
- file authority and external navigation are already narrow and reviewable.

That means the expensive dependency is the CodeMirror/DOM experience—which is intentional product
value. The cheap dependency is Tauri—which is already behind a seam. Moving to a host that cannot
run the DOM surface would throw away the expensive asset to escape the cheap one.

The actual current gaps are more prosaic:

- one active root rather than retained project sessions;
- no global shortcut or overlay window mode;
- no PTY/process owner;
- no agent protocol adapters;
- no embedded or companion browser context;
- no durable suite-level project store.

Those are real gaps, but none requires a wholesale host migration before the user interaction has
been proved.

## The architecture I would aim toward

Not all of this should be abstracted now. This is the shape to grow toward as real consumers appear.

```text
                           macOS global shortcut
                                  │
                                  ▼
                  ┌──────────────────────────────┐
                  │ ZD desktop / quick-access UI │
                  │ show · switch · steer · hide │
                  └──────────────┬───────────────┘
                                 │
                  ┌──────────────▼───────────────┐
                  │ suite project/session owner  │
                  │ project ids · attention      │
                  │ documents · goals · todos    │
                  │ agent refs · terminal refs   │
                  └───┬──────────┬──────────┬────┘
                      │          │          │
          ┌───────────▼──┐ ┌────▼─────┐ ┌──▼─────────────┐
          │ ZD surfaces  │ │ adapters │ │ narrow bridges │
          │ Markdown     │ │ Codex    │ │ Zed / bb       │
          │ objectives   │ │ Pi       │ │ terminal host  │
          │ review/graph │ │ Hermes   │ │ browser helper │
          └──────────────┘ └──────────┘ └────────────────┘
```

The key distinction is between **canonical state** and **live runtime state**.

ZD should canonically own:

- stable project identity;
- project roots and explicit scoped authority;
- which project is active;
- open ZD documents and their reading/editing position;
- todos, goals, objectives, graphs, and review artifacts;
- references to agent/terminal/browser sessions;
- a small attention summary: working, waiting, failed, needs review, or quiet.

Specialist runtimes should own:

- PTY byte streams, shell process trees, scrollback, and terminal rendering;
- agent provider credentials, inference messages, tool execution, and provider-native session data;
- browser cookies, passwords, extensions, downloads, and general navigation;
- language servers, debuggers, refactors, and full IDE state.

ZD stores a typed handle or association, not a copy of every subsystem's private database. That
keeps the system useful when Warp becomes Ghostty, Pi becomes Hermes, or Codex is replaced by another
harness.

## The first feature should be the global interaction

The research on [`research/macos-global-overlay.md`](research/macos-global-overlay.md) changes the
risk assessment. “I cannot summon ZD over whatever I am doing” is not evidence for a different app
architecture. Tauri 2 already provides supported global-shortcut and window primitives. A small
AppKit `NSPanel` customization is the likely last mile for current-Space/full-screen behavior and
focus restoration. [`research/tauri-nspanel.md`](research/tauri-nspanel.md) identifies an existing
plugin suitable for a spike.

Build this before adding terminals, browsers, or harnesses:

1. A configurable global chord summons the warm ZD window on the current display/Space.
2. The editor or last active ZD control receives focus immediately.
3. Pressing the same chord hides ZD without closing documents or processes.
4. Focus returns naturally to the previous app.
5. `Command-1` through `Command-9` select retained ZD project contexts only while ZD is active.

I would not ship `Command-T` as the immutable default. It is semantically attractive and globally
collision-prone because almost every browser/editor/terminal uses it for New Tab. Make the chord
configurable, detect registration failure, and test a safer default first.

The quick-access panel should probably be a presentation mode, not the only ZD window. Normal
Dock/Spotlight launch can keep an ordinary resizable window. A quick panel can present the same
session state with different show/hide behavior. That avoids forcing every long-lived editor and
terminal lifecycle into launcher-window semantics.

The success test is experiential, not “the API call returned.” One hundred warm toggles across two
displays, native full-screen apps, Stage Manager, sleep/wake, and unsaved documents should produce no
Space jump, focus flicker, state loss, or shortcut leak.

## Project sessions are the real product model

The global shortcut without retained project state is merely a launcher. The second feature is a
suite-owned project/session model.

A first project record can stay small:

```text
Project
  id                 stable, not derived only from path
  displayName
  root               scoped platform reference
  openDocuments[]    path + cursor/scroll/dirty lifecycle
  activeDocument
  terminalTarget?    external session handle or launch recipe
  agentSessions[]    adapter kind + external session id + attention state
  browserContext?    URL/title association, not cookies or browser storage
  objectiveRefs[]    ZD-owned durable work
```

Do not begin with a universal layout graph, plugin SDK, distributed database, or generic event bus.
Start with three in-memory projects and prove `Command-1`, `Command-2`, and `Command-3` can switch
without losing dirty buffers. Add a versioned durable catalog only after the lifecycle is right.

This model is the part no external host should own. A Zed workspace, Warp Tab Config, Herdr
workspace, bb project, or agent thread can be associated with a ZD project, but none should become
the only identity. Otherwise each experiment becomes a migration.

## Terminal: compose first, embed second

The terminal is the strongest argument for using somebody else's platform because terminal
correctness is deceptively deep. But “do not build a terminal emulator” does not imply “move ZD into
a terminal.”

The sequence I recommend is:

### 1. External composition

Give a ZD project a terminal target. “Terminal for project” should open or focus:

- a Ghostty quick terminal or normal project window;
- a Warp Tab Config;
- an iTerm2 arrangement/tab;
- or, especially interesting, a persistent [Herdr](research/herdr.md) workspace inside any of those.

The inverse command, `zd md .` or a narrow URL/deep link, returns to ZD. Measure whether this two-app
loop is already fast enough once ZD itself is globally summonable. It may be.

### 2. iTerm2 experience prototype

Before owning a PTY, use iTerm2 to prototype the whole interaction: hotkey window, numbered project
tabs, terminal panes, agent sessions, and a constrained ZD WebView/toolbelt. This is not the final
architecture. It is cheap evidence about whether project tabs plus an adjacent ZD surface actually
feel better than separate apps.

### 3. Embedded terminal only if co-location proves valuable

If daily use shows that seeing the ZD document/objective and terminal simultaneously is materially
better, embed a terminal behind a suite-owned PTY capability.

For the first implementation, [xterm.js](research/xtermjs.md) is the pragmatic browser renderer. It
fits the existing frontend and is mature. The Rust side should own one explicit PTY session at a
time, lifecycle, resize, signals, and cleanup. The terminal should live in its own local scripting
context with minimum capabilities.

Do not use [`@coder/libghostty-vt-node`](research/libghostty-vt-node.md) for this. It exposes Ghostty
VT state but explicitly does not render a terminal, does not own a PTY, is early/unstable, and adds a
Node-native runtime boundary that fits Tauri poorly. Revisit a stable embeddable `libghostty`
renderer later if measured xterm.js deficiencies justify it.

The terminal security rule is absolute: arbitrary web content must never share the JavaScript/IPC
context that can read terminal output, capture keystrokes, or control a PTY.

## Browser: build a preview, not a browser

“Browser integration” hides several different needs. The research in
[`research/browser-integration.md`](research/browser-integration.md) separates them:

- open a link;
- keep localhost/docs beside the project;
- associate the current real-browser page with a project;
- automate/inspect a page;
- replace a general browser.

The last one is a trap. As soon as ZD promises arbitrary authenticated browsing, it owns profiles,
cookies, password managers, popups, permissions, certificates, downloads, media, WebAuthn,
extensions, and cross-platform webview differences.

The reasonable embedded surface is a **project preview**:

- one local or explicitly trusted URL;
- back, forward, reload, URL display, and Open in Browser;
- zero Tauri filesystem, shell, terminal, or agent capabilities;
- separate webview identity from the privileged ZD UI;
- no promise of extensions, password management, or general browsing.

If the recurring pain is attaching a page to the right project rather than seeing it inside ZD, a
browser extension is the better seam. It can send a user-approved `{url, title, selectedText?}` to a
specific project without moving cookies or granting the page local execution. Do not begin with the
Chrome DevTools Protocol or broad all-tabs/history permissions.

## Agent harnesses: adapters, not one harness to rule them all

The harness research exposed a useful spectrum.

### Hermes: buy the workflow

[Hermes](research/hermes-agent.md) is the strongest off-the-shelf match for persistent agent goals,
deterministic gates, Kanban/DAG workers, MCP, cron, worktrees, approvals, ACP, and rich RPC. It can
remove enormous work if its workflow matches. The cost is a second opinionated state universe and a
fast-moving platform.

Trial it as a replaceable backend through Gateway RPC. Do not make its SQLite/task model ZD's source
of truth until the product deliberately chooses Hermes's semantics.

### Pi: own the workflow

[Pi](research/pi-agent.md) is the cleaner construction material: multi-provider core, JSONL sessions,
RPC, TypeScript SDK, and powerful extensions, while intentionally omitting MCP, permissions, todos,
plans, subagents, and background bash. That leaves space for ZD's semantics. It also leaves ZD
responsible for security and orchestration; Pi's basic tools run with the launching user's authority.

Use RPC first. Do not mistake minimality for sandboxing.

### Codex: deepest first client seam

[Codex](research/codex.md) currently exposes the richest deep-client protocol. Its local App Server
has threads, goals, plans, typed events, approvals, user questions, tools, terminals, diffs, skills,
MCP, and usage. A pinned stdio adapter would let ZD build a first-class steering UI without scraping a
TUI. The transport and some APIs are still evolving, so the adapter must own version/schema churn and
ZD state must remain canonical.

Use `codex exec` as a shallow fallback. Do not make the experimental WebSocket path or Codex rollout
store foundational.

### Claude Code: supported optional engine

[Claude Code](research/claude-code.md) has a mature SDK and structured headless stream with sessions,
approvals, MCP, skills, hooks, subagents, checkpointing, and telemetry. It is an excellent optional
engine. It is a poor universal abstraction because the supported inference and authentication model
remains Claude-shaped and proprietary.

### The interface to build—later

Do not prematurely reduce all four products to `prompt(): string`. That would throw away exactly the
events needed for a useful control surface.

After two real adapters exist, extract only their demonstrated common host contract:

```text
start(project, options) -> session handle + capabilities
attach(session)
events(session) -> typed stream
send(session, user input)
answerApproval(session, decision)
answerQuestion(session, answer)
interrupt(session)
detach(session)
stop(session)
```

Provider-specific items remain typed extension events behind declared capabilities. Credentials,
provider configuration, and inference history stay with the harness unless a concrete ZD feature
requires otherwise.

The most informative first pair is Codex App Server and Pi RPC. They test a rich product protocol
against a deliberately minimal multi-provider engine. Hermes should be the next experiment when the
question becomes whether ZD can buy the workflow layer rather than build it. Claude Code can use its
supported SDK/headless interface as another optional adapter.

## Thin ecosystem integrations are still valuable

Keeping ZD standalone does not mean ignoring ecosystems.

- A [Raycast](research/raycast.md) extension can list/reopen projects, capture a todo, show attention,
  or summon ZD. It should be a stateless remote control over stable ZD commands, not another database.
- A small Zed task/MCP/ACP integration can open the current project in ZD, expose read-only objective
  context, or launch an agent associated with a ZD project.
- Warp Tab Configs and deep links can launch project-specific layouts without owning project identity.
- Ghostty/iTerm2 automation can focus the terminal paired with the active ZD project.
- Herdr's socket can report which agent pane is blocked or finished without screen scraping.
- A browser companion can send explicit page context to a project.

These integrations should call semantic actions such as `openProject(id)`, `captureTodo(project,
text)`, `showAttention()`, or `terminalTarget(id)`. Never expose a generic unauthenticated local
`runShell(string)` API just because several integrations need commands.

## A commitment ladder

The order matters because each step should answer a question before the next layer becomes
necessary.

### Experiment 0: observe the real switches

For several work sessions, record why context switches happen: inspect agent status, answer a
question, read a document, edit code, run a command, open localhost, inspect a browser error, or
something else. Duration and gesture count matter more than window count.

**Gate:** most painful switches should cluster into a small set of repeated jobs. Otherwise build
only the quick-access shell and keep observing.

### Experiment 1: current-app overlay

Add the global shortcut and retained show/hide behavior to the existing Tauri app, with the smallest
macOS panel adapter necessary.

**Success:** immediate warm summon, current display/Space, reliable focus, second-press hide, prior
context restored, state intact across the native test matrix.

### Experiment 2: three retained projects

Implement stable project IDs and three in-memory contexts, then add versioned persistence after the
switch lifecycle is correct.

**Success:** `Command-1/2/3` is instant and never discards dirty work or silently widens filesystem
authority.

### Experiment 3: specialist composition

Associate each project with one real terminal target and one CLI agent. Try Ghostty/Warp/iTerm2 plus
Herdr. Make both directions—ZD to terminal and terminal to ZD—one action.

**Success:** daily work no longer feels fragmented even though specialist apps remain separate. If it
works, do not embed a terminal yet.

### Experiment 4: bb plugin fidelity spike

Mount the existing Markdown surface, open one project, display one objective, and steer one agent
through public bb plugin contracts. Make no bb core fork.

**Success:** product fidelity is high, state ownership is explicit, plugin APIs are supported, and
the removed infrastructure outweighs adapter complexity. Otherwise retain bb as a reference/companion.

### Experiment 5: two harness adapters

Build one narrow Codex App Server adapter and one Pi RPC adapter. Use a single project, typed events,
one approval round trip, interrupt, resume/attach, and clean shutdown.

**Success:** ZD can render common attention/steering behavior without parsing terminal text, while
each engine retains useful unique capabilities.

### Experiment 6: preview or browser bridge only from observed pain

Choose either a zero-capability localhost preview or an explicit browser-context companion. Do not
build both speculatively.

**Success:** it removes a measured recurring context-transfer step without collapsing the browser
and local-system trust boundaries.

### Experiment 7: prove a second shell before extracting a core

A Raycast command, CLI session controller, bb plugin, or host webview can become the second consumer.
Extract only the session/capability boundary it actually shares.

**Success:** behavior changes once and both consumers benefit; the shared module is deeper than the
adapter code it creates. If the abstraction mainly forwards calls, delete it.

## Decisions I would make now

1. **Primary shell:** keep Tauri and the standalone ZD app.
2. **Product identity:** describe ZD as an attention/control layer for active projects, not a new IDE.
3. **Immediate priority:** global summon/hide, then retained project switching.
4. **Code editing:** keep ZD's code surface convenient and calm, but let Zed or another IDE own deep
   code intelligence.
5. **Terminal:** external composition first; xterm.js plus a deep Rust PTY service only if co-location
   proves valuable; watch stable embeddable `libghostty`.
6. **Browser:** system browser by default; restricted project preview or narrow companion later; no
   general browser product.
7. **Agents:** canonical ZD project/objective state plus replaceable protocol adapters; Codex App
   Server and Pi RPC are the best first contrast; Hermes is the strongest buy-versus-build trial.
8. **Existing ecosystems:** build small commands/bridges where independently valuable; do not let an
   integration own ZD state.
9. **bb:** run a serious bounded plugin spike because it is the only surveyed substrate close enough
   to change the answer.
10. **Abstraction:** no universal plugin SDK or host-neutral core extraction until a real second
    consumer exists.

## Things I would explicitly avoid

- Forking Zed, Warp, iTerm2, T3 Code, or Hermes as the first move.
- Rewriting the Markdown experience in a native editor toolkit just to gain a terminal.
- Building terminal emulation or a PTY protocol from scratch.
- Sharing a webview between arbitrary web pages and terminal/native capabilities.
- Treating host project IDs or agent session files as ZD's only durable identity.
- Scraping terminal pixels/text to infer agent state when structured APIs exist.
- Designing a lowest-common-denominator agent interface before two adapters work.
- Building a general browser, IDE, plugin marketplace, distributed state system, or universal layout
  graph in anticipation of later needs.
- Counting a roadmap issue as an integration contract.
- Assuming fewer windows automatically means less context switching.

## What could change my recommendation

I would reopen the primary-host decision if one of these becomes true:

- the bb plugin spike carries the ZD surface with supported APIs and removes substantially more
  complexity than it adds;
- Zed ships a stable arbitrary custom editor/panel/webview API and a faithful ZD spike works without
  a fork;
- Warp ships a stable general client/plugin surface and locally controlled Project model capable of
  hosting ZD's domain UI;
- `libghostty` releases a stable embeddable renderer whose integration is materially better than the
  external/xterm.js routes;
- daily measurements show that terminal/browser composition—not ZD's reading and state model—is the
  actual dominant product value;
- the Tauri/AppKit overlay spike fails the target Mac behavior after the smallest native customization
  has been tried.

Until one of those is evidenced, moving hosts optimizes for infrastructure before proving the core
interaction.

## Final thought

The note is right to question the path. The danger in the current direction is not that ZD is
standalone. The danger is letting “standalone” quietly expand into “we must reproduce the entire
development environment.”

The opposite danger is turning ZD into a plugin and discovering that the host owns the window,
shortcuts, layout, project identity, state lifecycle, and permitted UI—everything except the small
panel where ZD's real product is allowed to live.

There is a better middle:

> Keep ZD sovereign over attention and durable work. Make everything else replaceable.

If the quick-access loop and retained project state feel as good as imagined, the application already
has a reason to exist. Then terminals, browsers, editors, and harnesses can be invited in one at a
time, each behind a boundary strong enough that it can also be asked to leave.
