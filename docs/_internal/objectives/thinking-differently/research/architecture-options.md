# Architecture options for “ZD everywhere”

Research snapshot: 2026-08-11. This decision analysis answers the product questions in
[`thoughts.txt`](../thoughts.txt) using the implementation audit in
[`zd-current-architecture.md`](zd-current-architecture.md). It is a research record, not an accepted ADR.

## Recommendation

Keep ZD as the owning application, implement the global macOS summon/dismiss interaction in the
existing Tauri shell, and evolve toward a **reusable product core with multiple thin shells only when a
second shell is proven useful**.

Concretely:

1. Make the current app behave like the desired overlay before changing hosts.
2. Add a suite-owned project/session model so `Cmd+1…9` changes complete retained work contexts.
3. Integrate an existing terminal externally first; embed terminal emulation only after the workflow
   proves that one-window composition matters more than the maintenance/security cost.
4. Keep the system browser as the default. Prototype a companion browser extension only for a narrow,
   repeatedly observed context-transfer problem.
5. Treat Zed, Ghostty, and Warp as companions and competitive benchmarks. Do not make any of them the
   owner of ZD's document, goal, todo, state-graph, or session data without a successful fidelity spike.

This is not a “build everything ourselves” recommendation. It deliberately buys terminal, agent, and
browser capabilities from ecosystems while retaining the state and reading experience that make ZD
distinct. The current `Platform` boundary makes this path more reversible than a host migration.

## Decision criteria

The following weights reflect the stated goal: rapid, global access to a personalized development
environment, not a general-purpose IDE product.

| Criterion | Weight | What success means |
| --- | ---: | --- |
| ZD product/state fidelity | 20% | The Markdown surface, todo/goal system, custom agent workflow, and state graphs remain first-class |
| Time to global-overlay value | 20% | The hotkey/show/switch/hide loop can be tested quickly in real daily use |
| Terminal maturity leverage | 15% | PTY, resize, scrollback, tabs/splits, shell integration, and process cleanup are not reinvented casually |
| Browser/context integration | 10% | Pages can be opened, identified, or steered without destroying the current trust boundary |
| Agent-harness flexibility | 10% | CLI/TUI and protocol-based agents can be swapped without one vendor owning project state |
| Security and privacy control | 10% | File/process/network authority is narrow, observable, and locally controlled |
| Reversibility / low host lock-in | 10% | Another shell or tool can be tried without rewriting the core |
| Ongoing maintenance leverage | 5% | The chosen ecosystem actually removes hard maintenance rather than adding an adapter tax |

### Directional score

Scores are 1 (poor) to 5 (strong). They are hypotheses to test, not false precision.

| Option | Fidelity | Overlay speed | Terminal | Browser | Agents | Security | Reversible | Maintenance | Weighted / 5 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Continue standalone app | 5 | 5 | 2 | 3 | 5 | 4 | 4 | 2 | **4.00** |
| Extend a host editor | 2 | 2 | 5 | 3 | 4 | 3 | 1 | 4 | **2.85** |
| Terminal-first host/plugin | 2 | 4 | 5 | 2 | 5 | 3 | 2 | 4 | **3.35** |
| Thin macOS overlay controlling ZD | 4 | 5 | 2 | 2 | 3 | 4 | 4 | 3 | **3.55** |
| Reusable core + multiple shells | 5 | 4 | 4 | 4 | 5 | 4 | 5 | 2 | **4.30** |

The hybrid score does not justify an up-front extraction project. Its score depends on shipping the
standalone overlay first and extracting only demonstrated seams. A speculative universal core would
score much lower on time and maintenance.

## Option 1: continue the standalone Tauri app

### What it means

ZD remains one installed desktop application. The suite adds project sessions, a global-hotkey window
mode, terminal and agent process capabilities, and browser bridges behind its current native boundary.

### Pros

- Maximum fidelity: the existing CodeMirror surface runs unchanged.
- Fastest route to the primary interaction because Tauri already owns the window.
- ZD owns project identity, session restoration, goals, todos, review, and future state graphs.
- Agent harnesses can remain ordinary child processes or protocol adapters; no agent vendor becomes the
  state model.
- Current scoped filesystem, CSP, renderer, and capability policies remain useful.
- The frontend continues to run in a normal browser for fast development and tests.

### Cons

- ZD must own window lifecycle, project/session persistence, process supervision, and integration UX.
- Embedding a terminal adds a large new correctness surface: PTY semantics, binary output, resize,
  Unicode width, scrollback, shell integration, and child cleanup.
- Embedded browsing would add another comparably difficult surface and weaken the local CSP model.
- Cross-platform behavior for global hotkeys, Spaces, full-screen windows, and multiple monitors must be
  tested rather than assumed.

### Lock-in and risk

Tauri lock-in is modest because frontend calls are already isolated in
[`platform.ts`](../../../../../packages/app/src/platform.ts). CodeMirror/browser lock-in is high, but
that is the product implementation ZD is trying to preserve. The largest risk is expanding one app
into an IDE-shaped collection of shallow features. Keep terminal and browser integrations as deep,
optional facilities and refuse generic native pass-through APIs.

### Best use

This is the right near-term vehicle for the overlay and project-switching experiments. It need not be
the only shell forever.

## Option 2: extend a host editor

### Zed specifically

Zed has moved materially toward the requested workflow. Its current documentation says one window can
hold multiple projects, preserve each project's tabs/splits, file tree, Git state, and agent threads;
projects can be switched from the threads sidebar. It also supports terminal-backed threads and
external ACP agents including Codex and Pi. See Zed's official
[Windows & Projects](https://zed.dev/docs/windows-and-projects),
[Parallel Agents](https://zed.dev/docs/ai/parallel-agents), and
[External Agents](https://zed.dev/docs/ai/external-agents) documentation.

Those are strong reasons to use Zed beside ZD and to copy its successful interaction ideas. They do not
yet make a ZD extension viable. Zed's documented extension implementations are Rust compiled to
WebAssembly; its published extension surface covers languages, language servers, debuggers, themes,
snippets, MCP, and agent distribution. Its capability list currently exposes process execution,
downloads, and npm installation. It does **not document arbitrary custom editors, webviews, or custom
workbench panels** that could host the present CodeMirror UI. See the official
[extension development](https://zed.dev/docs/extensions/developing-extensions) and
[capabilities](https://zed.dev/docs/extensions/capabilities) pages. Custom document rendering remains a
[feature discussion](https://github.com/zed-industries/zed/discussions/37270), not an API contract.

Therefore a normal Zed extension can integrate a language, agent, or command, but not presently replace
the Markdown editor with ZD's full experience. A Zed fork could do that, at the cost of maintaining a
fast-moving editor fork and rewriting the DOM/CodeMirror product in Zed's native UI framework.

### A host with webviews, such as VS Code

VS Code officially lets extensions add workbench containers, tree views, webviews, and custom editors;
webviews are arbitrary HTML/CSS/JavaScript displayed in editor groups. That can technically host ZD's
frontend. See the official [Extending the Workbench](https://code.visualstudio.com/api/extension-capabilities/extending-workbench)
documentation.

The price is a nested editor inside an editor: shortcut routing, focus, undo/save integration, dirty
state, file watchers, theming, accessibility, remote workspaces, and webview lifecycle all need adapters.
The host's chrome also conflicts with ZD's intentional “content is the interface” character. A VS Code
spike is useful as proof of portability, not an obvious primary product direction.

### Pros

- Mature code editor, project tree, terminal, Git, remote development, extension discovery, and updates.
- Zed already supplies a rich multi-project/agent workflow and supports CLI-oriented terminal threads.
- A webview-capable host can reuse much of the current frontend.
- Host trust/workspace models may reduce the number of security mechanisms ZD must invent.

### Cons

- Zed cannot currently host the differentiating document UI through its supported extension surface.
- Host keyboard, layout, state, lifecycle, and API constraints become product constraints.
- ZD's custom project/goal/state-graph UX risks becoming a panel squeezed into somebody else's mental
  model.
- Global summon/dismiss still needs the host to expose or accept that window behavior; an extension may
  not control application activation, Spaces, or topmost state.
- A fork exchanges terminal/browser leverage for a severe long-term merge burden.

### Security, privacy, and lock-in

The host process usually has broad workspace and process authority. Zed extensions run as Wasm and use
declared capabilities, which is good isolation, but those same constraints prevent arbitrary UI and
environment access. External agents remain separate processes with their own authentication, billing,
retention, and tool policies, as Zed's docs explicitly note. The project/session model would be stored
in host-specific APIs, making exit expensive.

### Verdict

Use Zed today as the code/agent companion and benchmark. Revisit a ZD extension only when Zed ships a
supported custom editor/panel API or when a tiny command/agent integration is independently valuable.
Do not fork Zed for this goal.

## Option 3: terminal-first host or plugin

### What it means

Ghostty, Warp, or another terminal owns global summon, windows, tabs, panes, and project launch. ZD is a
CLI/TUI, a launched sidecar window, or a protocol-driven pane inside that environment.

Ghostty already implements the precise “Quake-style” behavior: a global keybinding can toggle a
state-preserving quick terminal, choose the current/mouse screen, follow macOS Spaces, autohide, and
float on top. Its official [keybinding action reference](https://ghostty.org/docs/config/keybind/reference)
documents `global:cmd+backquote=toggle_quick_terminal`; its
[configuration reference](https://ghostty.org/docs/config/reference) documents screen, size, animation,
autohide, and Space behavior. On macOS, quick-terminal tabs are currently not supported because native
tabs require a titlebar, although splits remain available.

Warp's official [Launch Configurations](https://docs.warp.dev/terminal/sessions/launch-configurations)
save and restore project-specific windows, tabs, panes, working directories, and commands. Its core
terminal works after initial setup when offline, but Warp says cloud features including Warp Drive,
Agent Mode, MCP, teams, and sharing require connectivity; even logged-out initial setup creates an
anonymous user ID. See [Using Warp Offline](https://docs.warp.dev/support-and-community/troubleshooting-and-support/using-warp-offline).

Neither product's public documentation describes a general arbitrary-HTML custom application panel
API comparable to VS Code webviews. The reliable integration level is therefore shell command,
configuration, AppleScript/Shortcuts, OSC/terminal protocols, or a separately launched ZD window—not a
pixel-faithful embedded ZD editor.

### Pros

- The global summon interaction, terminal emulation, PTY behavior, tabs/splits, shell integration, and
  performance are already solved by terminal specialists.
- CLI-first harnesses keep their native auth/config and work with no new agent protocol.
- Project launch can be expressed as transparent files and commands, especially with Warp launch
  configurations or Ghostty automation.
- A failure in ZD does not destabilize the user's terminal.

### Cons

- A terminal cell grid cannot reproduce ZD's proportional typography, DOM layout, always-editable
  rendered Markdown, images/tables, precise pointer behavior, or browser embedding.
- A sidecar ZD window reintroduces the cross-window switching this direction is meant to solve.
- Terminal-host plugins and automation are host-specific and generally weaker than an application UI
  SDK.
- Monitoring agent status by scraping terminal output is fragile; structured protocols or explicit
  process ownership are safer.
- Warp's most relevant agent/project knowledge features introduce an account/cloud dependency.

### Security, privacy, and lock-in

Terminal panes run commands with the user's full shell authority. Configuration that auto-runs project
commands should be explicit and reviewable. OSC sequences and terminal output are untrusted input to
the terminal renderer; ZD should not invent hidden control sequences for privileged actions. Ghostty's
open configuration/automation lowers data lock-in, while Warp launch files are portable YAML but cloud
objects and AI features add vendor/service dependence.

### Verdict

Excellent companion and cheapest terminal experiment; poor owner of the ZD product surface. Start by
opening a project-specific Ghostty quick-terminal or Warp launch configuration from ZD, and opening ZD
from the terminal. Measure whether this two-app composition is already enough before embedding a PTY.

## Option 4: a thin macOS global overlay controlling ZD

### What it means

A small native controller registers the global chord, identifies the active display/Space, and
shows/focuses or hides a ZD window. The full ZD application continues to own content and project state.
The controller could be a second process, a menu-bar helper, or a second/native window mode inside the
same Tauri app.

### Feasibility

This is technically feasible without changing stacks:

- Tauri's official [global-shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/) supports
  macOS and exposes press/release events. Like other Tauri plugins, potentially dangerous commands are
  denied until explicitly permitted.
- Tauri's window API provides
  [`setAlwaysOnTop`](https://v2.tauri.app/reference/javascript/api/namespacewindow/#setalwaysontop),
  [`setVisibleOnAllWorkspaces`](https://v2.tauri.app/reference/javascript/api/namespacewindow/#setvisibleonallworkspaces),
  `show`, `hide`, `setFocus`, monitor queries, size, and position. Visibility on all workspaces is
  supported on macOS/Linux but not Windows/mobile.
- Apple AppKit provides explicit panel and Space/full-screen behavior. `NSPanel` can control when it
  becomes key, and window collection behavior can mark a window auxiliary for Stage Manager/full-screen.
  See Apple's [`NSPanel`](https://developer.apple.com/documentation/appkit/nspanel),
  [`becomesKeyOnlyIfNeeded`](https://developer.apple.com/documentation/appkit/nspanel/becomeskeyonlyifneeded),
  and [`auxiliary`](https://developer.apple.com/documentation/appkit/nswindow/collectionbehavior-swift.struct/auxiliary)
  documentation.
- Ghostty's production quick terminal is independent evidence that a global, state-preserving,
  current-Space overlay can behave well on modern macOS, including native full-screen Spaces.

The likely smallest implementation is **not a separate helper**. Add native global shortcut and overlay
window behavior to the existing Tauri app. A helper adds IPC authentication, two-process startup/update,
crash recovery, focus arbitration, and duplicate lifecycle state before any user value appears. Split it
out only if macOS window behavior demonstrably cannot coexist with the normal Windows build or main
window.

### Interaction details that need a native spike

- First press: show on the display containing keyboard focus or pointer, order above the current app,
  activate ZD, focus the last ZD control, and preserve the prior project/buffers.
- Second press: hide—do not destroy, minimize into another Space, or lose PTY/agent processes—and return
  naturally to the prior application.
- `Cmd+1…9`: switch stable project sessions without reloading or widening authority accidentally.
- Multiple displays, “Displays have separate Spaces” on/off, Stage Manager, a native full-screen app,
  app switching while visible, screen disconnect, sleep/wake, and shortcut collision all need manual
  tests. Apple's
  [`screensHaveSeparateSpaces`](https://developer.apple.com/documentation/appkit/nsscreen/screenshaveseparatespaces)
  documentation confirms this is a user-configurable presentation variable.
- `Cmd+T` is a poor shipped default despite the desired mnemonic: it is the standard New Tab command in
  browsers, editors, and terminals. Make the chord user-configurable and begin the spike with a less
  destructive default. Test collision handling rather than silently stealing a registration.
- Decide whether ZD should activate. An editing/terminal overlay needs keyboard focus, so a
  non-activating panel is usually the wrong default even though it is appropriate for click-only HUDs.

### Pros

- Directly tests the highest-value experience while preserving all current work.
- Small and reversible; no terminal/browser decision is required first.
- Can coexist with Zed, Warp, Ghostty, browsers, Slack, and Discord rather than replace them.
- Keeps filesystem and state authority in ZD.

### Cons

- By itself it does not add terminals, browser context, project persistence, or agent orchestration.
- Focus/Space behavior has macOS edge cases and may require a small native AppKit customization beyond
  portable Tauri window flags.
- A separate helper process would add disproportionate lifecycle and security complexity.

### Security and privacy

Register only the configured chord, unregister it cleanly, do not use Accessibility/screen-recording
permissions merely to learn the front app, and avoid a general local control socket. If a helper ever
becomes necessary, authenticate and version its IPC and restrict it to semantic actions such as
`toggle`, `showProject(id)`, and `status`; never expose `runShell(string)`.

### Verdict

Do this first, inside the current app. It is an interaction mode, not an alternative product
architecture.

## Option 5: reusable core with multiple shells

### What it means

ZD owns a host-neutral session/product core and ships the Tauri app as the primary shell. Later shells
could include a browser/dev shell, a VS Code webview, a CLI/TUI controller, a macOS overlay mode, or
small extensions/commands for Zed and browsers.

```text
                    ┌─ Tauri desktop / overlay
ZD session + product├─ browser development shell
core                ├─ CLI / terminal bridge
                    ├─ browser-extension bridge
                    └─ host-editor adapter (only where UI API permits)
```

The core should not pretend all shells are equivalent. The CodeMirror document surface remains a DOM
product module. A terminal adapter may expose project/session/agent commands without rendering that
surface. A Zed integration may expose an agent or “open in ZD” command without pretending to be the
Markdown editor.

### Credible boundaries

- **Session core:** stable project IDs, roots, active project, open-document identities, terminal/agent
  handles, commands, and a versioned serialization format.
- **Document surface:** the current mountable DOM/CodeMirror editor and its lifecycle.
- **Capability adapters:** scoped files; project store; window activation; PTY/process; external URL;
  browser context. Each should be a deep module, not a giant bag of native calls.
- **Bridges:** small, versioned semantic protocols for a browser extension, CLI, or editor command.

### Pros

- Preserves ZD's differentiating experience and state while buying hard capabilities from specialized
  tools.
- Supports heterogeneous integrations honestly: full UI where webviews exist, command/agent bridges
  where they do not.
- Reduces vendor lock-in and allows experiments to be removed.
- Fits the existing frontend/native seam and browser test workflow.

### Cons

- Highest temptation to abstract before evidence. A “universal host SDK” would become the new product.
- Multiple shells multiply release, compatibility, state-migration, and support work.
- Process and event protocols can create distributed-state bugs where a direct in-process call was
  sufficient.
- A shared core does not remove terminal/browser security responsibilities.

### Security and lock-in

Make capabilities shell-granted and default-deny. The core should request semantic operations, never
assume ambient filesystem/process/network access. Bridges should authenticate endpoints, validate
origins and message schemas, cap payloads, and avoid sending document contents unless the action needs
them. Keep canonical project/session data in a documented ZD format; host-specific IDs are cached
references, not primary keys.

### Verdict

Best destination, but only as an incremental extraction from the working Tauri product. The second
real shell must pay for each extracted boundary.

## Browser integration patterns

The phrase “browser integration” hides four very different products. Choose the least powerful one
that solves an observed workflow.

### 1. Open the system browser with explicit context

Open HTTP(S) URLs, optionally adding an application-owned local deep link back to project/document
state. This preserves the user's real profiles, cookies, extensions, password manager, and devtools.
ZD already has the safe native URL boundary in
[`fs.rs`](../../../../../packages/tauri/src/fs.rs).

**Best default.** It is simple and least privileged, but does not report the current tab or DOM to ZD.

### 2. Companion browser extension + native messaging

A Chrome/Chromium extension can identify the active tab, capture explicitly requested metadata, add an
“Open in ZD” action, or relay narrow dev commands. Chrome's official
[Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
design launches a registered native host in a separate process and exchanges length-prefixed JSON over
stdin/stdout. The host manifest uses an exact `allowed_origins` list; wildcards are forbidden. Content
scripts cannot call native messaging directly and must pass through the extension service worker/page.

This is the best next pattern if real use proves that URL/title/selection transfer is valuable. Treat
page/content-script messages as hostile, enumerate commands, prompt before content capture, and never
let a page choose a local path or shell command.

### 3. Chrome DevTools Protocol (CDP)

CDP can inspect/control DOM, network, runtime, screenshots, and debugging in Chromium. The official
[protocol documentation](https://chromedevtools.github.io/devtools-protocol/) says the tip-of-tree
protocol changes frequently and has no backward-compatibility guarantee; its stable 1.3 subset is much
smaller. Chrome extensions can use the `chrome.debugger` transport.

Use CDP for an explicit developer automation/debug feature, not background ambient context. Attaching
debugger authority is broad, visible, Chromium-specific, and version-sensitive.

### 4. Embedded remote webview

This gives one-window composition but a separate browser profile unless substantial profile management
is built. Remote pages must live in a webview with **no Tauri IPC capability** and a separate CSP/origin
boundary. Downloads, popups, permissions, credentials, navigation, devtools, crashes, and storage all
become ZD responsibilities.

Avoid until external-browser context transfer has been tried and found inadequate. A screenshot or
read-only preview is not automatically safer if it requires broad automation authority to produce.

## Phased experiments and gates

These are deliberately ordered by information gained per unit of irreversible work.

### Experiment 0: baseline the loop

For one week, record ten real context switches: source app, project, desired action, whether the need was
read/review, agent steering, terminal input, or browser inspection, and seconds/gestures lost. This
prevents “integrated browser” or “embedded terminal” from standing in for several different pains.

**Gate:** at least 70% of painful switches should map to a small number of repeated jobs. If they do
not, build the overlay only and keep observing.

### Experiment 1: overlay mode in existing Tauri

Add one configurable native global chord, show/focus/hide the retained window, place it on the active
screen, and test all relevant Space/display cases. Do not add a helper, terminal, or new core package.

**Success evidence:** reliable operation across 100 manual toggles, two displays, Stage Manager,
full-screen browser/terminal, sleep/wake, and app restart; warm press-to-focused-editor feels immediate
and is measured; second press restores the prior work context; unsaved state survives.

**Kill/adjust:** if Tauri flags cannot produce correct full-screen/Space behavior, add the smallest
macOS AppKit window customization. A separate controller is justified only after that spike fails.

### Experiment 2: three retained project sessions

Model three stable projects and bind `Cmd+1`, `Cmd+2`, `Cmd+3`. Preserve open document, cursor/scroll,
dirty state, and later process handles. Start in memory; add a versioned persisted catalog only after
the lifecycle is right.

**Success evidence:** switching is immediate, never discards unsaved work, and file authority moves or
partitions deliberately rather than widening to every known root.

**Kill/adjust:** if project switching mostly means “tell Zed/Ghostty to foreground this folder,” keep
ZD's model thinner and store only external launch targets.

### Experiment 3: external terminal composition

Prototype both directions: “Terminal for current ZD project” opens/focuses a Ghostty quick terminal or
Warp launch configuration at the root; `zd md .` returns to ZD. Test one real CLI agent per project.

**Success evidence:** the two-app loop is fast enough for daily use and process state survives ZD being
hidden. If it satisfies the need, do not embed a terminal.

**Embed gate:** only evaluate a PTY/emulator library after repeated evidence that seeing/editing ZD and
the terminal simultaneously in one retained session is worth owning emulator integration. Evaluate
license, upstream activity, macOS/Windows support, Unicode correctness, binary size, API stability,
process cleanup, and independent conformance tests before choosing a library.

### Experiment 4: browser context bridge

First finish explicit external-link handoff. Then build a throwaway Chrome extension/native host that
sends only `{url, title, selectedText?}` to `openInProject(projectId)` after a user gesture.

**Success evidence:** it removes a repeated copy/search/which-project step without requesting debugger,
all-tabs, history, or arbitrary native execution permission.

**Kill/adjust:** if URL handoff is enough, stop. CDP or embedding requires a separately approved,
specific use case.

### Experiment 5: prove one second shell

Choose the smallest real consumer: a CLI session controller, a VS Code webview prototype, or a browser
extension bridge. Extract only the session/capability contract it actually shares.

**Success evidence:** one product behavior changes once and both consumers receive it; the adapter is
smaller than the duplicated behavior; tests cover the contract at the boundary.

**Kill/adjust:** if the shared layer mostly forwards calls or forces host-specific concepts into the
primary app, delete the abstraction and keep a narrow bridge.

## Evidence-based decision rules

- Prefer a companion integration when it removes a hard subsystem but does not own ZD state.
- Prefer the current shell when a host cannot render the existing document surface.
- Prefer a semantic protocol over screen scraping, terminal-output parsing, or browser DOM polling.
- Keep credentials and provider configuration with the agent harness unless ZD has a concrete reason
  to own them.
- Do not embed a remote browser or PTY merely to reduce window count; validate the actual context-switch
  improvement first.
- Do not make a host ecosystem strategic until its supported public API—not a fork or roadmap issue—can
  carry the required product behavior.

## Bottom line

The immediate product is not “a new IDE.” It is a globally summonable, stateful lens onto a few active
projects, with excellent reading/review and quick steering. ZD can become that by extending the shell it
already has. Zed can own code editing and ACP agent threads; Ghostty or Warp can own terminals; the
system browser can own authenticated browsing. ZD should own the cross-tool project identity, the calm
document experience, and the custom goal/todo/agent workflow. That division captures ecosystem leverage
without surrendering the parts no host currently provides.
