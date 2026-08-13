# T3 Code: research and fit for ZD

**Research date:** 2026-08-11

**Exact product:** [T3 Code](https://t3.codes/), the MIT-licensed `pingdotgg/t3code` agent-harness control plane from T3 Tools Inc.

## Identity check

The `t3.codes` link in `thoughts.txt` refers to **T3 Code**, not T3 Chat, the T3 Stack, or `create-t3-app`. Its official repository calls it an "agent harness control surface" for agents running on the user's machines, with web, Electron desktop, iOS, and Android clients ([official repository](https://github.com/pingdotgg/t3code)). The product site calls it an open-source control plane for Claude Code, Codex, OpenCode, Cursor, and Grok ([product site](https://t3.codes/)).

This is the reference in the list that most directly overlaps ZD's agent-workspace ambitions. It already combines projects, agent threads, branches/worktrees, diffs, approvals, terminal access, browser/preview surfaces, remote machines, mobile steering, and source-control flows. It is both a useful product to trial and the clearest open-source implementation to study.

## What it does

### Agent control

T3 Code drives already installed and authenticated agent CLIs. It currently ships drivers for Codex, Claude Code, Cursor, Grok, and OpenCode. Users retain their existing provider subscriptions rather than buying resold tokens, and the UI can switch models mid-thread ([product site](https://t3.codes/)).

Threads expose four interaction modes:

- **Supervised:** request approval for commands and file changes.
- **Auto-accept edits:** approve edits automatically but stop for other actions.
- **Auto:** allow routine work and ask on riskier actions, where the provider supports that distinction.
- **Full access:** run commands and edits without prompts.

The exact enforcement maps onto each provider's native policy; providers without an equivalent safely fall back toward more prompting. Approvals appear inline in the conversation ([permission-mode documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md)). This is an important design lesson for ZD: expose one comprehensible interaction model while admitting that provider semantics differ beneath it.

### Project and Git workflow

T3 Code is project-aware. It supports creating agent threads in the current checkout or Git worktrees, checkpointing each turn, displaying diffs, reverting work, committing and pushing, and creating pull/merge requests. Its source-control integrations currently cover GitHub, GitLab, Bitbucket, and Azure DevOps; repositories can be cloned or published from inside the app, and open reviews can appear as right-panel tabs beside a thread ([source-control documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/source-control.md)).

The product site says each agent thread can write to its own branch and advertises generated PR titles/bodies/changelogs, inline diff review, draft and stacked PRs, and amend flows ([product site](https://t3.codes/)). The implementation's checkpoint model uses hidden Git refs around turns so turn and whole-thread diffs/reverts can be exact ([architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).

### Navigation and attention

The sidebar groups ongoing agent work and supports pinned threads whose order is synchronized across connected devices ([thread organization](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md)). The configurable command palette searches thread titles, projects, branches, user messages, and final agent responses across connected environments. File search and project-wide search have default shortcuts, and new-thread commands inherit the active project and model/mode selections ([keybinding documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md)).

This is close to ZD's desired rapid project switching and agent steering, although the public docs do not describe a macOS-wide summon/hide shortcut or quake-style overlay window.

### Terminal, browser, and review surfaces

T3 Code has a terminal panel addressable through `terminal.toggle` and `terminal.new` commands, project scripts that can be bound as commands, and preview/browser commands in its customizable keybinding system ([keybinding documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md)). The v0.0.33 release specifically added remembered recent sites in the Browser panel and fixed shortcuts when the preview browser has focus, confirming that this is an embedded working surface rather than only an external-browser link ([v0.0.33 release](https://github.com/pingdotgg/t3code/releases/tag/v0.0.33)). Source-control reviews can likewise open in compact tabs in the right panel.

No official documentation reviewed here establishes a full code editor or a purpose-built rich Markdown editor comparable to ZD's. File search, project search, diffs, agent conversation, browser/preview, and terminal are not substitutes for ZD's editing requirement.

### Remote and mobile operation

The server can be used through the desktop app, run headlessly with `npx t3 serve`, or launched/reused over SSH by a desktop client. Projects, files, Git state, terminals, and provider processes stay on the server machine; clients connect to them. Direct LAN, Tailscale, custom HTTPS, SSH port forwarding, the hosted web client, and native mobile apps all share the same environment model ([remote-access documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)).

Pairing uses a one-time owner token exchanged for a device session. T3 Code recommends trusted private networks and can publish through Tailscale Serve. The hosted web app connects directly to a reachable backend and does not proxy the coding traffic through T3 Code's site. An optional T3 Connect system can instead link an environment through a managed Cloudflare tunnel and T3 relay; fresh source clones have T3 Connect disabled unless configured ([T3 Connect internals](https://github.com/pingdotgg/t3code/blob/main/docs/internals/t3-connect.md)).

This is strong alignment with the desire to review and steer agents from another screen or device without moving the actual development environment.

## Architecture

T3 Code is a TypeScript monorepo with an unusually well-documented execution boundary.

### Server-owned execution

The server owns agent sessions, workspaces, version control, terminal processes, and filesystem access. Web, desktop, and mobile clients communicate over a single authenticated Effect RPC WebSocket. Provider processes, terminal operations, Git actions, and file reads run at the server, never in a client ([architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).

That separation produces several useful properties for ZD:

- the same project and agents can be controlled from multiple client types;
- remote execution is the same model as local execution, not a separate product;
- UI lifecycle is independent from agent/process lifecycle;
- the trust boundary is concrete enough to secure and test.

### Typed RPC and shared client runtime

Clients subscribe only to the server streams they need through typed Effect RPC methods. Authentication happens during WebSocket upgrade, and authorization is checked per method rather than treating possession of a socket as blanket access. A shared client-runtime package holds connection supervision, auth, RPC, cached environment data, and domain state; web and mobile supply platform layers and their own UI ([architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).

This is a deeper and more reusable design than an Electron renderer directly spawning CLIs.

### Event-sourced orchestration

Agent workflow is event-sourced. Clients dispatch typed commands; a single serialized worker decides events from command plus current state; events, projections, and command receipts commit together in SQL; subscribers see events only after commit. Durable receipts make retries idempotent. Provider calls, provider-stream ingestion, and checkpointing run in drainable asynchronous workers ([architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)).

The model is highly relevant to ZD's custom state-machine graphs: commands, durable events, projections, and reactors form a concrete state-machine substrate. The tradeoff is complexity. ZD should not copy event sourcing merely because it is impressive; it should adopt it only where durable multi-client orchestration and recovery justify the cost.

### Provider adapters

The orchestration layer is provider-independent. A driver declares its kind, configuration schema, and adapter factory. Instance and adapter registries route thread/session operations without higher layers knowing whether Codex, Claude, Cursor, Grok, or OpenCode is behind them. The maintainers say adding a provider requires a driver and adapter plus registry entry, with no common-case orchestration, contract, or client change ([provider architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/providers.md)).

That is a strong pattern for bringing Hermes, Pi, or another harness into a consistent UI. It is an **internal extension seam**, however—not a documented runtime plugin marketplace. Adding Hermes today means maintaining code in a fork and following T3 Code's internal interfaces.

### Local persistence and checkpointing

The server uses SQLite-backed orchestration state and Git-backed workspace checkpoints. Turn boundaries capture baselines and completed state, support thread/turn diffs, and coordinate reverting both workspace state and provider conversation ([architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)). This provides better recovery and review semantics than treating an agent as an opaque terminal process.

## Extensibility

T3 Code is maximally forkable but only selectively extensible without a fork.

### What is easy

- Configure keybindings, including contextual `when` expressions.
- Bind project scripts into the command system.
- Configure multiple providers/accounts and remote environments.
- Add themes and change UI behavior in a private fork.
- Add a new agent driver in source without changing the orchestration/client contracts for the common case.
- Self-host the server and web UI.
- Reuse the documented RPC/contracts if willing to depend on internal source APIs and version movement.

### What is not publicly available as a stable extension platform

- No documented third-party panel/plugin API.
- No runtime marketplace for editors, goal systems, graph views, or task workflows.
- No declared stable public SDK or compatibility policy for custom clients/providers.
- No evidence that a private extension can be shipped independently of a custom T3 Code build.

The official site explicitly invites users to fork, change every surface, wire in agents/flows, and ship their own build ([product site](https://t3.codes/)). That makes a fork legally and technically possible, but it does not eliminate upstream merge cost.

## Distribution, licensing, and maturity

T3 Code is [MIT licensed](https://github.com/pingdotgg/t3code/blob/main/LICENSE). It can be tried without a permanent install via `npx t3@latest`; the Electron desktop app is distributed for macOS, Windows, and Linux, including Homebrew, Winget, and AUR paths. Native iOS and Android clients and a hosted web client are also available ([repository installation](https://github.com/pingdotgg/t3code#installation), [download page](https://t3.codes/download)).

As of this research date, the repository reports roughly 18,200 stars, 4,100 forks, and 2,451 commits. The latest stable release shown is v0.0.33 from August 10, 2026, with multiple nightly builds already following it ([repository](https://github.com/pingdotgg/t3code), [releases](https://github.com/pingdotgg/t3code/releases)). Those are strong signals of activity and adoption, but the version remains `0.0.x`, and the README still says the project is "very very early" and to expect bugs. It also says large outside feature contributions are generally not being accepted yet.

Maturity is therefore mixed:

- **High activity, broad platform distribution, and meaningful real-world scope.**
- **Pre-1.0 interfaces, rapid change, explicit early-stage warnings, and a maintainer-controlled product direction.**

The MIT code license applies to the repository. Optional T3 Tools-operated services such as T3 Connect, hosted web infrastructure, and app distribution also have service/security terms; using the source does not require assuming those services are part of the open-source license.

## Security and control model

T3 Code's public security policy says coding-session content can remain among the clients, the user's environment, and selected harness/provider; T3-operated infrastructure processes it only for enabled features. T3-operated transports use encryption, and supported platforms use protected credential storage where available ([security policy](https://t3.codes/security-policy)).

The local/remote server is powerful: it owns terminal, filesystem, Git, and agent execution. Pairing links and tokens are therefore credentials to a development machine and must be handled like passwords. The remote-access guide recommends private networks, supports session inspection/revocation, and warns that URL-fragment tokens can still leak through history, screenshots, logs, or copy/paste ([remote-access documentation](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)).

For ZD, the lesson is to preserve server-side authority and per-operation permissions, but to make the local-only path work without a vendor relay.

## Fit against the ZD requirements

| ZD need | T3 Code fit | Gap or concern | Assessment |
|---|---|---|---|
| Multiple projects and fast switching | First-class projects, searchable command palette, sidebar threads, pins, project inheritance | No documented numbered project shortcuts or global overlay | **Strong** |
| Multiple agent sessions | Core product; threads, turns, statuses, plans, approvals, subagent visibility | UI model may constrain custom ZD workflow | **Excellent** |
| Multiple harnesses | Codex, Claude, Cursor, Grok, OpenCode; clean adapter seam | Hermes and Pi are not built in; adding them requires source work | **Strong and extensible by fork** |
| Terminal interface | Integrated terminal commands/panel, server-owned PTYs | Not positioned as a full multiplexer replacement; terminal docs are light | **Good** |
| Markdown editor | No documented rich Markdown editor | Major ZD differentiator would need to be built | **Weak** |
| Code editing | Diffs/search/review exist | No documented general-purpose code editor equivalent to Zed/VS Code | **Partial** |
| Browser integration | Embedded Browser/preview panel and remembered sites | Browser automation, devtools depth, and permission model are not established here | **Strong inspiration; test in practice** |
| Worktrees, diffs, PRs | First-class checkpoint, worktree, branch, multi-host source-control flows | Git-centric design may not fit non-code objectives | **Excellent for code work** |
| Global summon/hide | Electron desktop exists | No official evidence of a system-wide hotkey overlay across macOS Spaces | **Missing/unknown** |
| Mobile/remote steering | Web, mobile, Tailscale, SSH, LAN, optional relay | Raises access-control and version-sync concerns | **Excellent** |
| Todo/goal/objective management | Could be built in source; event model could support it | No plugin/panel API or native domain support | **Missing** |
| Custom state-machine graphs | Event-sourced command/event/projection core is conceptually aligned | Custom graph authoring/visualization is not a product feature | **Architectural inspiration, not a feature** |
| Local-first/offline | Local server/web/desktop, direct pairing, self-hostable | Optional cloud auth/tunnel systems increase complexity if enabled | **Strong if kept on local/direct path** |
| Ecosystem independence | MIT and forkable; provider subscriptions remain direct | A long-lived fork would couple ZD to a fast-moving monorepo | **Good legal freedom, real maintenance cost** |

## Ways ZD could use T3 Code

### 1. Use it alongside ZD now

This is the lowest-risk experiment. Run T3 Code as the agent control plane and keep ZD focused on Markdown, objectives, todos, goal/state-machine workflows, and the global overlay. Link projects conceptually or through commands rather than merging codebases.

Benefits:

- immediate access to remote/mobile steering and multi-harness sessions;
- validates whether its project/thread/browser/terminal interaction model is good enough;
- exposes what ZD uniquely needs before committing to an architecture.

Cost:

- two applications and duplicated project navigation;
- no seamless shared state unless an integration is built;
- does not solve global summon/hide by itself.

### 2. Fork T3 Code as the ZD host

This is technically viable because of MIT licensing and the server/client architecture. ZD could add its Markdown editor, objectives, task/goal views, custom graph UI, Hermes/Pi drivers, and macOS global overlay to the existing project/agent/terminal/browser foundation.

It is also the highest-risk option. T3 Code is changing extremely quickly, has a large monorepo and sophisticated Effect/event-sourced core, and does not currently welcome large upstream features. A branded ZD fork would own platform releases, provider breakage, remote security, mobile compatibility, merge conflicts, and migration of durable user state. The fork would likely turn ZD from a focused product into a distribution of T3 Code.

Use this route only after a time-boxed prototype proves that reusing the foundation removes materially more work than carrying the fork creates.

### 3. Build a ZD client against the T3 Code server

The typed RPC boundary and shared server execution model make a custom client plausible. ZD could use T3 Code for providers, terminals, Git, checkpoints, and remote environments while presenting its own macOS overlay and project/editor/objective UI.

This is architecturally cleaner than a full fork but not currently a supported public integration contract. The RPC schemas and server semantics are internal and pre-1.0. ZD would still need version pinning, compatibility tests, and a migration strategy. It may also need to ship or supervise the T3 server.

This is the most promising integration experiment if the maintainers are open to treating contracts as an API.

### 4. Extract patterns, not code

This is the recommended near-term use:

- separate durable execution from disposable clients;
- model project/thread/turn explicitly;
- normalize provider differences behind adapters;
- make permissions per thread and visible inline;
- checkpoint before/after turns and make revert a first-class operation;
- unify local and remote environments;
- make browser, diff, terminal, and review secondary panels around the agent thread;
- provide cross-project attention/search rather than forcing users to visit every workspace;
- let shortcuts be commands with contextual predicates.

ZD can adopt the parts that reinforce its own product without importing T3 Code's full complexity.

### 5. Treat it as a competitor

T3 Code competes directly for agent orchestration, project/session navigation, terminal/browser side surfaces, diffs, worktrees, PRs, remote access, and mobile steering. It does not currently compete on rich Markdown editing, personal goals/objectives/todos, custom workflow graphs, or the desired system-wide macOS overlay. Those missing pieces are likely ZD's defensible center.

ZD should avoid rebuilding T3 Code feature-for-feature. Its opportunity is a more personal, summonable **whole-work system** where editing, thinking, goals, and agents coexist, while T3 Code is primarily an excellent coding-agent control plane.

## Pros

- Closest existing match to ZD's multi-project, multi-agent control requirements.
- Works with provider subscriptions and authenticated CLIs users already have.
- Provider adapters isolate harness-specific behavior cleanly.
- Durable event-sourced orchestration supports recovery, multi-client state, and auditability.
- Turn checkpoints, diffs, and reverts make agent work safer and more reviewable.
- Strong Git/worktree/PR workflows across multiple hosting providers.
- Web, desktop, iOS, Android, LAN, Tailscale, SSH, and optional relay cover local and remote use.
- Integrated terminal, browser/preview, diffs, and review tabs reduce application switching.
- Keybindings and command palette offer a good basis for keyboard-first control.
- MIT license permits inspection, self-hosting, forking, and commercial modification.
- Active project with substantial adoption and rapid release cadence.

## Cons

- Explicitly early, pre-1.0, and fast moving.
- No official rich Markdown or full code editor matching ZD's requirements.
- No documented global summon/hide overlay on macOS.
- No stable plugin system for ZD's todos, goals, objectives, graphs, or custom panels.
- Adding unsupported harnesses requires source-level driver work and likely a fork.
- Effect RPC, event sourcing, projections, reactors, Electron, mobile, relay, Git, and provider drivers create a large complexity surface.
- Large outside features are generally not accepted, weakening the upstream path for ZD-specific work.
- A fork would inherit release engineering, security, provider churn, mobile, and upstream merge obligations.
- Remote control of a machine with full agent/terminal access has a large blast radius if auth is misconfigured.
- Git-centric assumptions and PR workflows do not naturally model personal knowledge, objectives, and non-code work.

## Risks and unknowns

1. **API stability:** Internal RPC/provider contracts may change without compatibility guarantees.
2. **Fork sustainability:** Rapid development means recurring, conflict-heavy upstream merges.
3. **Product-direction mismatch:** T3 Code may optimize for coding-agent throughput while ZD needs thinking, editing, and personal workflow.
4. **Complexity transfer:** Reusing the codebase can import more concepts and dependencies than it removes.
5. **Security blast radius:** A paired remote client may control agents, terminals, Git, and files on the server environment.
6. **Service coupling:** Optional Clerk/relay/Cloudflare features must remain clearly separable from the local-first path.
7. **Provider parity:** A common UI cannot guarantee identical semantics across Codex, Claude, Cursor, Grok, OpenCode, Hermes, and Pi.
8. **Editor gap:** Adding a serious Markdown/code editor may collide with the existing thread-centric layout.
9. **Global-overlay behavior:** The key ZD summon/hide interaction remains unproven.
10. **Migration:** A private fork needs a safe plan for database, checkpoint, credentials, and remote-client version evolution.

## Verdict

**T3 Code is the best current product to trial and the strongest architectural reference, but ZD should not immediately become a T3 Code fork.**

Use it now as a benchmark and possible companion. Prototype one narrow integration: either launch/open the relevant T3 project/thread from ZD, or build a read-only experiment against its server boundary. Separately prototype the ZD-defining macOS global overlay with Markdown/objectives and fast numbered project switching.

After practical use, revisit three options with evidence:

1. keep T3 Code adjacent and let ZD own the personal work layer;
2. pin and integrate its server as a replaceable agent/terminal backend;
3. fork only if a short prototype demonstrates that its remote, provider, checkpoint, and browser foundations outweigh the permanent upstream-maintenance burden.

The high-confidence design takeaway is to copy its **seams**, not automatically its stack: durable server-owned sessions, provider adapters, explicit thread/turn state, per-thread permissions, checkpoints, multi-client control, and integrated secondary surfaces. ZD's differentiation should remain the summonable, project-wide workspace for Markdown, code, terminals, agents, goals, objectives, and custom workflow graphs.

## Primary sources

- [T3 Code product site](https://t3.codes/)
- [Official repository and README](https://github.com/pingdotgg/t3code)
- [Architecture overview](https://github.com/pingdotgg/t3code/blob/main/docs/internals/overview.md)
- [Provider architecture](https://github.com/pingdotgg/t3code/blob/main/docs/internals/providers.md)
- [Permission modes](https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md)
- [Keybindings and command palette](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md)
- [Remote access and pairing](https://github.com/pingdotgg/t3code/blob/main/docs/user/remote-access.md)
- [Source-control integrations](https://github.com/pingdotgg/t3code/blob/main/docs/user/source-control.md)
- [T3 Connect internals](https://github.com/pingdotgg/t3code/blob/main/docs/internals/t3-connect.md)
- [Release history](https://github.com/pingdotgg/t3code/releases)
- [Security policy](https://t3.codes/security-policy)
- [MIT license](https://github.com/pingdotgg/t3code/blob/main/LICENSE)
