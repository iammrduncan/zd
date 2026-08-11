# Zed as a host or foundation for ZD

Research date: 2026-08-11. This assessment uses current first-party Zed documentation, the Zed
source repository, the ACP project, and a read-only inspection of the Zed 1.14.2 app installed on
this Mac. Zed is moving quickly, so conclusions about extension and workspace capabilities should
be rechecked before committing to an integration.

## Bottom line

Zed has become a much better *place to run a ZD-shaped workflow* than the original note assumes. It
now handles multiple projects in one window, preserves each project's tabs and splits, groups
parallel agent and terminal threads by project, manages linked Git worktrees, and can run virtually
any CLI agent. This is not a marginal improvement: it directly addresses much of the project and
agent switching problem described in `thoughts.txt`.

Zed is still a poor *extension host for the ZD product*. Its supported extensions can add languages,
debuggers, themes, icons, snippets, and MCP servers. They cannot add an arbitrary panel, custom
document editor, webview, dashboard, state-machine graph, or project-management surface. ZD's
one-surface CodeMirror Markdown editor therefore cannot be placed inside stock Zed. General webview
support for extensions remains an open feature request.

The best direction is **not “move ZD into Zed.”** It is a reversible companion experiment:

1. Keep ZD's standalone Tauri app and its custom Markdown experience.
2. Treat stock Zed as an optional code/terminal/agent cockpit.
3. Make ZD's todo, goal, and objective operations available through a small MCP server and/or CLI.
4. Consider an ACP adapter only if a distinct ZD agent harness emerges.
5. Build the global summon/hide interaction in ZD itself; do not depend on Zed for it.

That uses Zed where it is deep and mature without making ZD dependent on Zed's narrow extension
surface or fast-changing internals.

## A respectful correction to the starting assumptions

The statement that Zed cannot hold multiple projects and quickly switch between them is no longer
true in current Zed. Zed's [Windows & Projects](https://zed.dev/docs/windows-and-projects)
documentation says multiple projects can live in one window; each has its own file tree, Git state,
search scope, agent threads, and preserved workspace layout. A project can also contain multiple
folder roots. Current [Parallel Agents documentation](https://zed.dev/docs/ai/parallel-agents)
adds a threads sidebar grouped by project, plus managed Git worktrees.

The desired exact gesture is only partially present. Projects can be selected from the sidebar and
recent-project picker, while `Ctrl-Tab` switches recent agent threads. In Zed's current macOS
[default keymap](https://github.com/zed-industries/zed/blob/main/assets/keymaps/default-macos.json),
`Cmd-1` through `Cmd-9` activate panes, not projects. I found no documented action for a stable
“project number N” binding. Zed now solves project coexistence and contextual switching; it does not
provide the proposed `Cmd-1`/`Cmd-2`/`Cmd-3` project contract as written.

The other important assumptions remain valid. Stock Zed does not contain ZD's rendered-and-editable
Markdown surface, and it does not document a system-wide hotkey that summons an overlay above the
current application and hides it on the second press.

## Capability review

### Projects, workspaces, and fast switching

Current Zed has two useful forms of composition:

- **Multiple projects in one app window.** The workspace sidebar groups projects and preserves each
  project's tabs, splits, and layout. Opening a folder normally adds it to the existing window;
  `zed -n` still creates a separate window.
- **Multiple roots in one project.** “Add Folder to Project” creates a multi-root project whose
  project-wide tools and agents can operate across all roots.

The [Git worktree integration](https://zed.dev/docs/git#git-worktrees) is especially relevant to
agent work. Zed can create, switch, open, and remove linked worktrees; multi-root projects create one
linked worktree per Git repository. Parallel-agent threads can be isolated in these worktrees, and
archived threads can restore associated worktree state.

This is a strong match for reviewing and steering several agents without opening a separate app per
repository. The remaining mismatch is the interaction model: sidebar/picker/thread switching is
not the global dropdown plus fixed numeric project selection envisioned for ZD.

### Code editing

Zed is a mature, high-performance code editor with Tree-sitter parsing, LSP support, panes,
multi-buffers, project search, Git UI, debugging, remote projects, and a large language/theme
extension catalog. It is first-class on macOS and uses Metal rendering according to the official
[macOS guide](https://zed.dev/docs/macos). Rebuilding these capabilities inside ZD would be a large,
mostly undifferentiated investment.

This makes Zed an excellent *code editor adjacent to ZD*. It does not make Zed's editor an embeddable
component. Zed exposes an application and extension system, not a supported SDK for mounting its
editor or terminal in another desktop shell.

### Markdown editing

Markdown is native. Zed provides Tree-sitter highlighting for Markdown and fenced languages,
Prettier formatting, and rendered preview actions. The current default keymap exposes
`markdown::OpenPreview` and `markdown::OpenPreviewToTheSide`; preview width is configurable in the
source [default settings](https://github.com/zed-industries/zed/blob/main/assets/settings/default.json).
See the first-party [Markdown documentation](https://zed.dev/docs/languages/markdown).

That is a conventional source editor plus a preview. It is not ZD's core product idea: a single
always-editable CodeMirror document in which notation is selectively transformed into a calm
reading surface. Zed's public extension system also cannot replace the Markdown editor with that
surface. A Zed discussion about
[custom document rendering](https://github.com/zed-industries/zed/discussions/37270) describes the
same missing primitive: extensions do not have access to GPUI views or an API for custom editable
renderers.

Consequently:

- Zed is sufficient for ordinary README and source-Markdown work.
- Zed does not replace `zd md` for long agent output, rendered tables and links in the editable
  surface, reading focus, raw-mode transitions, or ZD's typography.
- Reimplementing ZD's editor inside a Zed fork would be a port from TypeScript/CodeMirror/DOM to
  Rust/GPUI, not a reuse of the existing frontend.

### Terminal and tasks

Zed has a capable integrated terminal with multiple tabs, splits, configurable shells and working
directories, clickable file paths, search, task integration, and terminals in the center pane. The
official [Terminal documentation](https://zed.dev/docs/terminal) covers these features.

Its [task system](https://zed.dev/docs/tasks) supports global and repository-local task definitions,
editor-derived variables, arbitrary one-shot commands, reruns, concurrent execution, and a
`create_worktree` hook. This is enough to add commands such as “open current file in `zd md`,” run a
ZD todo command, start a dev server, or launch a harness. Tasks execute commands; they do not create
new Zed UI surfaces.

The most important recent feature is
[Terminal Threads](https://zed.dev/docs/ai/terminal-threads). Any CLI/TUI—Codex, Claude Code, Pi,
Hermes, or a future ZD harness—can run in a terminal-backed thread grouped under its project. Zed
tracks and switches those terminals, reflects terminal titles, and can show bell notifications.
The CLI continues to own its auth, model, tools, skills, instructions, and MCP configuration. This
preserves the “CLI versions of agent harnesses by default” preference with very little coupling.

Terminal Threads are therefore the lowest-risk and highest-value Zed integration for ZD today.

### Browser and web preview

Zed has purpose-built native previewers for Markdown, SVG, and images. It does not currently expose
a general embedded browser/web-app surface to extensions. The first-party
[webview extension issue](https://github.com/zed-industries/zed/issues/21208) remains open and notes
substantial cross-platform rendering, safety, and API work.

A Zed task can start a local web server and Zed can open URLs in the system browser. An MCP server
can also drive a browser tool for an agent. Neither is the requested experience of keeping the
running application or arbitrary web context beside the editor inside one window.

This is a decisive constraint for ZD. Its current product surface is a portable web frontend inside
Tauri. Stock Zed has no supported place to load it.

### Global hotkey and dropdown-window feasibility on macOS

Zed keybindings are customizable, but the documented system dispatches Zed actions while the app
has keyboard focus; see [Key Bindings](https://zed.dev/docs/key-bindings). The installed Zed 1.14.2
CLI can open paths in a new or existing workspace and add paths to a workspace. Its `--help` output
contains no summon, toggle visibility, dropdown, always-on-top, or current-Space option.

I found no first-party setting or action that implements a Warp/iTerm-style global dropdown. There
are three implementation levels:

1. **External automation:** Hammerspoon, Raycast, Keyboard Maestro, or a small macOS helper can
   register a global hotkey and activate/hide Zed. This may be a useful prototype, but activating a
   normal app window is not the same as a borderless, always-on-top panel on whichever Space is
   current. Focus, fullscreen apps, multiple Zed windows, and Space assignment need hands-on tests.
2. **Zed fork:** GPUI's macOS window layer could be extended with a global hotkey and special window
   behavior. This can achieve the intended interaction, but creates a permanent fork and release
   burden for a feature peripheral to Zed's editor mission.
3. **ZD-owned native shell:** Tauri/macOS code can own the hotkey and overlay semantics around the
   product that actually needs them. This is the cleanest ownership boundary.

The global dropdown should therefore remain a ZD feature. An external automation proof of concept
could validate the gesture quickly, but it should not become a foundational dependency.

### Extensions and the limit that matters

Zed extensions are Rust compiled to WebAssembly against a predefined host API. The official
[Developing Extensions](https://zed.dev/docs/extensions/developing-extensions) page lists the
supported features: languages, debuggers, themes, icon themes, snippets, and MCP servers. The
[capability model](https://zed.dev/docs/extensions/capabilities) governs process execution,
downloads, and npm installation.

This model is intentionally much narrower than VS Code's. It gives ZD useful integration seams but
not a product UI seam:

- **Possible:** a language/tool integration, an MCP server package, or installing an external
  executable used by one of those supported features.
- **Not supported:** custom panels, arbitrary commands backed by extension UI, a custom project
  manager, a CodeMirror document surface, a todo dashboard, a graph renderer, or an embedded
  browser/webview.

The extension catalog is healthy—Zed currently advertises hundreds of extensions—but its breadth
is mostly languages, servers, debuggers, snippets, and appearance. Catalog size must not be confused
with the UI programmability ZD requires.

### Agent integrations and protocols

Zed now offers three genuinely different paths, documented in
[AI Agents in Zed](https://zed.dev/docs/ai/agents):

| Path | Host surface | Configuration owner | ZD relevance |
| --- | --- | --- | --- |
| Zed Agent | Agent panel and threads sidebar | Zed | Could call future ZD MCP tools |
| External Agent | Native agent thread over ACP | Agent process | Potential home for a future ZD orchestration harness |
| Terminal Thread | Native CLI/TUI in a terminal | CLI/TUI | Best immediate fit for existing harnesses |

[ACP](https://zed.dev/acp) is the strongest ecosystem argument for Zed. The protocol is open,
Apache-licensed, uses JSON-RPC over stdio, and standardizes editor/agent integration. The
[ACP registry](https://zed.dev/blog/acp-registry) includes Codex, Claude, OpenCode, Gemini CLI,
Copilot, and many others. [Pi has a registry adapter](https://zed.dev/acp/agent/pi), so it can run as
a native external-agent thread as well as a Terminal Thread. Custom ACP agents can be registered by
command without publishing a Zed extension; see
[External Agents](https://zed.dev/docs/ai/external-agents).

MCP serves a different role. Zed currently supports MCP tools and prompts and can forward configured
servers to external agents over ACP; see [MCP in Zed](https://zed.dev/docs/ai/mcp). A `zd` MCP server
could expose operations such as listing eligible tasks, reading goal/objective context, recording a
checkpoint, or validating a transition. This integrates ZD's system *semantics* without trying to
embed its UI.

Important boundaries remain:

- Zed Agent, external ACP agents, and Terminal Threads do not automatically share auth,
  instructions, skills, permissions, or MCP configuration.
- Terminal Threads are organized terminal processes, not structured agent integrations.
- ACP provides an agent conversation and editor bridge, not arbitrary application panels.
- MCP tools can manipulate ZD state, but a tool result is not a replacement for ZD's human-facing
  todo, goal, graph, and review surfaces.

### Licensing and architecture

Zed is predominantly Rust and renders through GPUI, its GPU-accelerated UI framework. GPUI uses
Metal on macOS and is still explicitly pre-1.0 with breaking changes expected; see the
[GPUI README](https://github.com/zed-industries/zed/blob/main/crates/gpui/README.md). Zed's editor,
workspace, project, terminal, Git, agent, and UI functionality live across many internal crates.
They are source-available but are not presented as a stable embedding SDK.

Licensing creates a meaningful fork distinction. Zed explains that the editor is
GPL-3.0-or-later, server-side collaboration components are AGPL-3.0-or-later, and GPUI is
Apache-2.0; see [Zed is now open source](https://zed.dev/blog/zed-is-now-open-source) and the
[repository licensing summary](https://github.com/zed-industries/zed#licensing).

- A distributed Zed-derived ZD application would need a deliberate GPL compliance and product
  licensing decision. This is not legal advice.
- GPUI alone is permissively licensed, but adopting it means building/porting the product in Rust.
  It does not grant a ready-made permissive Zed editor or terminal component.
- A private fork avoids extension limits technically, but absorbs upstream merge work across a
  fast-moving, large codebase and couples ZD's roadmap to Zed internals.

“Fork Zed” is therefore possible, but it is the highest-cost route. “Use GPUI” is effectively a new
native implementation choice, not an incremental integration with today's ZD.

## Fit matrix

Scores: **3 strong**, **2 usable with compromise**, **1 adapter/fork required**, **0 unavailable in
stock Zed**.

| ZD requirement | Stock Zed | With supported adapter | With Zed fork | Notes |
| --- | ---: | ---: | ---: | --- |
| High-quality code editing | 3 | 3 | 3 | A primary Zed strength |
| Ordinary Markdown source + preview | 3 | 3 | 3 | Native editor and rendered preview |
| ZD's one-surface Markdown editor | 0 | 0 | 2 | Requires a GPUI port; existing CodeMirror UI cannot be mounted |
| Multiple projects in one window | 3 | 3 | 3 | Current Zed directly supports this |
| Preserve per-project tabs/splits | 3 | 3 | 3 | Documented current behavior |
| Fixed `Cmd-number` project switching | 1 | 1 | 3 | Current numeric bindings address panes, not projects |
| Multiple terminals and task runners | 3 | 3 | 3 | Native terminal, center tabs, tasks, Terminal Threads |
| Run arbitrary CLI agent harnesses | 3 | 3 | 3 | Terminal Threads are an excellent fit |
| Structured third-party agent UI | 3 | 3 | 3 | ACP registry and custom ACP commands |
| ZD goal/todo/objective operations | 1 | 2 | 3 | MCP/CLI can expose operations, not a bespoke UI |
| ZD dashboard/state-machine graph | 0 | 0 | 3 | No custom view or webview extension API |
| Embedded general browser/web app | 0 | 0 | 2 | General webview work remains open and technically difficult |
| Global summon/hide dropdown | 0 | 1 | 3 | External automation is only a prototype-quality approximation |
| Embed Zed's editor/terminal in ZD | 0 | 0 | 1 | No stable embedding API; fork/internal-crate work required |
| Preserve ZD's current TS/Tauri frontend | 0 | 1 | 0 | Best preserved as a separate app or system-browser surface |

## Pros

- Zed now solves the basic multiple-project and multiple-agent cockpit problem unusually well.
- Its terminal and task systems avoid rebuilding terminal emulation, PTY behavior, shell setup,
  searchable scrollback, links, and task execution in ZD.
- Terminal Threads support any current or future CLI harness without waiting for a protocol adapter.
- ACP gives agents such as Codex, Claude, OpenCode, Gemini, and Pi a consistent native surface.
- MCP is a credible narrow bridge for ZD's structured todo, goal, and objective operations.
- Worktree-aware parallel threads align strongly with safe agent orchestration.
- Zed is fast, open source, macOS-first, and backed by an active company and community.
- The integration can begin as configuration and small adapters rather than a product rewrite.

## Cons

- The public extension API cannot express the product features that most distinguish ZD.
- There is no supported way to mount ZD's CodeMirror/Tauri web frontend inside Zed.
- There is no general embedded browser or extension webview.
- There is no documented Warp-style global dropdown behavior.
- The desired fixed numeric project switching does not match Zed's current keymap semantics.
- Zed's native Markdown preview is a separate preview, not ZD's rendered editable surface.
- A fork implies Rust/GPUI work, GPL implications, upstream merge labor, and ownership of platform
  behavior Zed itself is still changing rapidly.
- Zed's agent paths have configuration boundaries that can surprise users: Zed settings, ACP-agent
  settings, and terminal-CLI settings are separate systems.
- Building ZD around current Zed workspace details risks chasing a fast-moving product rather than
  preserving a small, explicit ZD domain model.

## Practical options

### Option A: stock Zed plus ZD CLI/tasks

Add optional `.zed/tasks.json` examples and document a layout with ZD commands and CLI agents in
Terminal Threads. ZD remains standalone for reading/editing and is launched from tasks or terminal
links.

**Cost:** low. **Reversibility:** excellent. **Value:** immediate. **Product integration:** shallow.

This is the right first experiment.

### Option B: a `zd` MCP server

Expose a conservative set of domain operations and read-only resources. Both Zed Agent and, where
supported, ACP agents could use them. Keep file authority and transition validation inside `zd`
rather than teaching every agent the todo file format.

**Cost:** moderate. **Reversibility:** high. **Value:** high if the goal/todo system becomes stable.
**Product integration:** semantic, not visual.

This is the strongest medium-term integration seam, but it should follow a stable CLI/domain API.

### Option C: a ZD ACP agent

Wrap a genuinely distinct ZD orchestrator in ACP so it receives Zed's native thread, permissions,
terminal output, editor context, and review flow. Do this only if ZD becomes an agent harness with
behavior that cannot be represented as MCP tools called by existing agents.

**Cost:** moderate to high. **Reversibility:** high. **Value:** conditional. **Product integration:**
deep for agent conversations, still shallow for bespoke UI.

ACP should not be adopted merely to rename an existing CLI session.

### Option D: maintain a Zed fork

Port the ZD editor and management views to GPUI, add the global hotkey/dropdown window behavior, and
carry the fork.

**Cost:** very high and recurring. **Reversibility:** poor. **Value:** potentially complete.
**Product integration:** deepest.

This only makes sense if user testing proves the integrated Zed cockpit is the product and Zed's
upstream extension API is unlikely to grow the required custom-view support. Neither is proven.

### Option E: use GPUI, not Zed

Build a new Rust application on Apache-licensed GPUI and selectively recreate the product.

**Cost:** very high. **Reversibility:** poor. **Value:** control and performance. **Reuse:** much
lower than it sounds.

This abandons the current portable CodeMirror frontend and still requires solving editor, terminal,
browser, project, and agent-product integration. It is not justified by the current evidence.

## Constraints and risks

1. **Moving target:** multi-project workspaces, Terminal Threads, ACP distribution, and agent layout
   all changed materially in 2026. An adapter must depend on documented protocols and CLI commands,
   not internal workspace database schemas or private crates.
2. **Extension ceiling:** waiting for future custom views/webviews is not a plan. The open issue has
   substantial platform and compositing concerns, and no committed delivery date is evidence.
3. **Fork drag:** every global-window, custom-panel, or browser patch increases conflicts with
   upstream window, workspace, and UI evolution.
4. **Configuration fragmentation:** instructions, skills, auth, permissions, and MCP servers do not
   automatically cross Zed Agent, ACP, and Terminal Thread boundaries.
5. **Domain integrity:** direct MCP writes to todo/goal files could bypass ZD invariants. The server
   must call the same domain layer/CLI as human actions and default to read-only tools first.
6. **Licensing:** distributing modified Zed requires legal review and a clear source-distribution
   strategy. GPUI's Apache license does not make the rest of Zed Apache-licensed.
7. **Interaction ownership:** an external hotkey script controlling a normal Zed window will have
   edge cases across multiple monitors, Spaces, fullscreen apps, and multiple windows. ZD should
   own the exact overlay promise it makes.

## Evidence gaps and proposed spikes

The following need hands-on validation rather than more reading:

- On this Mac, test project switching and layout restoration with three real repositories, several
  terminals, an ACP thread, and a Terminal Thread per project.
- Measure whether a sidebar/picker binding can get close enough to fixed-number project switching
  without using private Zed actions.
- Prototype an external global hotkey that activates/hides a single Zed window and test it across
  Spaces, fullscreen apps, two monitors, app relaunch, and multiple Zed windows. Treat failure to
  match Warp semantics as expected, not as an implementation bug in ZD.
- Run Pi both through its ACP adapter and as a Terminal Thread; compare subscription/auth behavior,
  instruction discovery, diff review, permissions, notifications, and session recovery.
- Define a read-only `zd` MCP proof of concept with `list_tasks`, `get_task`, `get_goal`, and
  `get_objective` before permitting mutations.
- Test Zed Markdown preview on ZD's actual long agent documents, tables, images, code fences, and
  huge files. This will quantify the value gap rather than infer it from feature lists.
- Recheck the webview/custom-view issue and extension feature list immediately before any fork
  decision.

## Verdict

**Use Zed as an optional cockpit and integration target, not as ZD's application foundation.**

The new multi-project sidebar, worktree-aware parallel agents, ACP ecosystem, Terminal Threads, and
task system are too relevant to ignore. A small ZD-to-Zed bridge can deliver real leverage quickly.
But the capabilities that define ZD—its Markdown editor, global summon interaction, goal/todo
surfaces, and state-machine visualizations—sit exactly outside Zed's supported extension boundary.

The strategically clean architecture is complementary:

- **Zed owns** code editing, terminals, project workspaces, worktrees, and generic agent threads.
- **ZD owns** the calm Markdown surface, personal workflow model, todo/goal/objective semantics,
  global overlay, and future custom visualizations.
- **CLI, MCP, and possibly ACP own the seam** between them.

That division lets either ecosystem improve without forcing the other to become its plugin system.
