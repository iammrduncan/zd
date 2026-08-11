# OpenAI Codex as a ZD agent harness

Research date: 2026-08-11

## Executive verdict

Codex is the strongest current candidate for a **deeply embedded first agent engine** inside ZD—not because the native app should replace ZD, but because Codex exposes unusually complete layers beneath it.

ZD can choose among an interactive CLI, `codex exec`, a TypeScript SDK, Codex-as-an-MCP-server, and the open-source `codex app-server` protocol used by rich clients. App Server exposes authentication, thread history, forks, goals, live plan/diff/tool events, approvals, user questions, dynamic tools, MCP, skills, hooks, terminals/processes, filesystem watches, configuration, model catalogs, and usage. Its thread goal API is strikingly close to ZD's objective model. This allows ZD to build its own Markdown editor, terminal, browser, project switcher, global overlay, and task graph without terminal scraping.

The caution is maturity. App Server's WebSocket transport is explicitly experimental and unsupported for production; several APIs ZD would want are marked experimental or under development. The Codex SDK is server-side TypeScript only and intentionally narrower. Codex's open-source CLI/App Server reduce implementation lock-in, and the CLI can address custom OpenAI-compatible providers, Amazon Bedrock, Ollama, LM Studio, and even a documented Mistral example, but many higher-level features and model assumptions remain OpenAI-shaped. Cloud integrations also disappear under API-key use.

**Recommendation:** prototype ZD against local stdio App Server behind a strict adapter and pin its schema/version. Keep `codex exec` as a simple batch fallback and the SDK as a CI/background option. Do not make experimental WebSocket transport or Codex's JSONL rollout store a required architectural boundary. Keep all ZD domain state canonical outside Codex.

## The surface area

Official OpenAI documentation presents Codex across the CLI, IDE extension, ChatGPT desktop app, Codex cloud, mobile/Remote, Slack/Linear/GitHub integrations, SDK, MCP server, and App Server ([CLI](https://learn.chatgpt.com/docs/codex/cli), [desktop app](https://learn.chatgpt.com/docs/app), [cloud](https://learn.chatgpt.com/docs/cloud)).

| Surface | Interface | Best ZD use |
| --- | --- | --- |
| Interactive CLI | TUI over local repository | Fallback and reference client |
| `codex exec` | Batch command with stdout/stderr and JSONL | CI, one-shot jobs, simplest prototype |
| Codex SDK | Server-side TypeScript thread API | Background coding tasks and internal services |
| `codex mcp-server` | Two MCP tools for start/reply | Compose Codex as a specialist under another orchestrator |
| `codex app-server` | Bidirectional JSON-RPC over stdio, Unix socket, or experimental WebSocket | Deep ZD client integration |
| ChatGPT desktop app | Project/chat workspace with files, browser/computer tools, terminals, schedules | UX benchmark and companion |
| Codex cloud/Remote | Persistent remote and connected-machine work | Optional off-device execution/steering |

## CLI and non-interactive operation

The CLI can inspect and edit a local repository, run installed tools, select model/reasoning/permissions, review changes, and operate interactively. It also supports profiles and per-run configuration overrides ([CLI](https://learn.chatgpt.com/docs/codex/cli), [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)).

`codex exec` is designed for scripts and CI. It streams progress to stderr, emits the final response to stdout, supports piped context, can avoid persistence with `--ephemeral`, and provides JSONL output for machine consumers. Sessions can be resumed. By default it runs read-only; callers can choose workspace-write or danger-full-access, with the latter intended only for an isolated runner ([non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)).

This makes `codex exec` an excellent first-week adapter, but it is not the best long-term interactive boundary. ZD would have to infer richer UI state from JSONL and bridge approvals, live steering, terminals, configuration, and session browsing piecemeal. App Server already defines those concepts explicitly.

## Codex SDK

The server-side TypeScript package `@openai/codex-sdk` starts, continues, and resumes local Codex threads. OpenAI recommends it for CI/CD, internal tools, complex coding agents, and application integration; for Codex as one specialist within a wider orchestrated workflow, the docs point instead to Codex's MCP server ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)).

Strengths:

- much smaller API than implementing App Server;
- start/continue/resume semantics;
- structured events and final responses;
- suitable for a Node service or Electron/Tauri sidecar;
- uses the same local Codex configuration and runtime.

Constraints:

- TypeScript and Node 18+ only;
- server-side only;
- coding-thread abstraction rather than full rich-client control;
- less direct ownership of approval, terminal, filesystem, configuration, and discovery UX than App Server;
- still launches/depends on the local Codex runtime.

For ZD, the SDK is a useful background-worker integration, but App Server better matches an interactive desktop shell.

## App Server: why it changes the answer

OpenAI describes `codex app-server` as the interface that powers rich clients such as the Codex VS Code extension. It is open source and intended for deep integrations that need authentication, conversation history, approvals, and streamed agent events ([App Server](https://learn.chatgpt.com/docs/app-server)).

### Transport and versioning

App Server uses a JSON-RPC-like bidirectional protocol. The default is newline-delimited JSON over stdio. Unix sockets use WebSocket framing; TCP WebSocket is experimental and explicitly unsupported for production. The CLI can generate version-specific TypeScript or JSON Schema definitions, which gives ZD a practical compatibility strategy: pin a Codex version, generate the schema, validate every message, and upgrade intentionally.

The safe initial architecture is therefore:

```text
ZD UI/process
    -> pinned local codex app-server child
    -> stdio JSON-RPC adapter
    -> Codex runtime/model provider
```

Do not expose App Server directly on a network. The documentation warns that non-loopback WebSocket listeners may be unauthenticated during rollout unless explicit capability-token or signed-bearer authentication is configured. If remote access is ever needed, put it behind ZD-owned TLS, authentication, authorization, rate limits, and session routing.

### Threads, turns, and items

The protocol's primitives map cleanly to UI:

- a **thread** is a conversation;
- a **turn** is one user request plus agent work;
- an **item** is a message, plan, command, file change, MCP/dynamic/collaboration tool call, web search, image view, review transition, or compaction event.

The client can start, resume, fork, list, read, pin, archive, unarchive, compact, and delete threads. It can steer an active turn without waiting for completion and interrupt a turn. Notifications provide live agent-message deltas, plan updates, aggregated diffs, token usage, tool progress, hook runs, model rerouting, and final status. The [thread lifecycle and event documentation](https://learn.chatgpt.com/docs/app-server#lifecycle-overview) is substantially richer than a normal CLI wrapper.

Forks retain an explicit session-tree relationship, and ephemeral forks support disposable branches of thought. Thread listings can filter by cwd, source kind, provider, archive state, search term, and—experimentally—parent or ancestor. These affordances could power ZD's project and task navigator, but ZD should still store its own project/task hierarchy because Codex thread trees describe conversation lineage, not product intent.

### Goals and plans

App Server exposes `thread/goal/set`, `get`, and `clear`, including objective, status, token budget, token use, and elapsed time. It also streams `turn/plan/updated` with pending/in-progress/completed steps. This is unusually aligned with ZD.

That alignment is useful but dangerous. ZD's goal/objective/todo system should remain canonical, with Codex goals treated as an execution lease or projection. Otherwise:

- only Codex-backed tasks could participate fully;
- restarting/replacing the harness could orphan user intent;
- a transcript's terminal goal status could be mistaken for project completion;
- custom state-machine edges would be forced into a linear conversation object.

The right relationship is `ZD objective -> one or more harness runs`, not `ZD objective == Codex thread goal`.

### Approvals and user input

App Server sends server-initiated requests for:

- command execution approval;
- file-change approval;
- requested filesystem or network permissions;
- structured user questions;
- MCP elicitation forms or URL flows;
- connector actions with side effects;
- experimental client-executed dynamic tools.

Requests include thread, turn, and item identifiers so ZD can route approval state to the correct project pane. Commands can be accepted once, accepted for the session, declined, cancelled, or accepted with a proposed execution-policy amendment. This is precisely the seam ZD needs for a unified approval inbox across projects.

One sharp edge: `thread/shellCommand` is documented as running outside the sandbox with full access and not inheriting thread policy. ZD should expose it only as a visibly user-initiated terminal action, never as a general agent tool.

### Terminals, files, and custom tools

The protocol includes process spawn/input/resize/kill and streaming PTY output APIs, plus filesystem read/write/directory/watch operations. Several process APIs remain experimental. ZD should prefer its own terminal emulator/process supervisor where possible and use App Server process items to display agent-launched commands. That avoids coupling ZD's general terminal tabs to an experimental agent protocol.

Dynamic tools allow a client to register functions that Codex invokes through a request/response flow, but the API is experimental. Stable MCP servers are a better first implementation for ZD's objective, task, notes, browser, and external-system tools.

## Codex as an MCP server

`codex mcp-server` exposes two tools: one starts a Codex conversation and one continues it. OpenAI documents this as the route for multi-agent workflows, including orchestration with the OpenAI Agents SDK ([MCP server](https://learn.chatgpt.com/docs/mcp-server)).

This is an important portability seam. ZD could orchestrate Codex as a bounded coding specialist without adopting App Server's entire UI protocol. The tradeoff is reduced visibility and control compared with native App Server events. Use it when Codex is a node in a larger state graph; use App Server when a human is watching and steering a Codex thread directly.

## Skills, MCP, hooks, plugins, and automations

Codex supports:

- **AGENTS.md:** project-scoped instructions.
- **Skills:** reusable instruction/resource packages that load when selected or invoked ([build skills](https://learn.chatgpt.com/docs/build-skills)).
- **MCP:** external tools and context available across local clients ([MCP](https://learn.chatgpt.com/docs/extend/mcp)).
- **Hooks:** deterministic lifecycle programs for prompt submission, tool use, permissions, compaction, session/subagent start, stops, and session end ([hooks](https://learn.chatgpt.com/docs/hooks)).
- **Subagents:** separate roles and parallel work.
- **Plugins:** bundles of skills, hooks, apps, and MCP integrations.
- **Scheduled tasks:** recurring work in ChatGPT, in addition to CI and `codex exec` schedules ([automations](https://learn.chatgpt.com/docs/automations)).

App Server can list skills/hooks, watch skill changes, manage MCP OAuth/status/resources/tools, and is adding plugin marketplace management. Some plugin endpoints are explicitly under development and should not be called by production clients yet.

For ZD, use MCP for capabilities and ZD's own scheduler/state machine for orchestration. Generate Codex hooks or skills only where they improve a Codex run; do not make them the source of truth for ZD workflows.

## Native app, projects, terminal, and browser

The ChatGPT desktop app is now a broad command center: projects and chats, local folders, Codex work, files/artifacts, browser and computer use, plugins, scheduled tasks, integrated terminal, and local/cloud environments ([desktop app](https://learn.chatgpt.com/docs/app), [integrated terminal](https://learn.chatgpt.com/docs/integrated-terminal), [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)). Remote can start, steer, approve, and review work on a connected computer from a phone ([Remote](https://learn.chatgpt.com/docs/remote)).

This makes the app a meaningful benchmark for the desired ZD workflow. It does not eliminate ZD's reason to exist:

- ZD's Markdown editor and custom code/editor exploration are not replaceable app panels.
- ZD's todo, goals, objectives, and state-machine graphs remain unique domain features.
- Project switching exists, but the official app documentation does not establish the exact global always-on-top summon/dismiss overlay described in the source notes.
- The app is not the same thing as App Server; building a ZD client on App Server means ZD owns editor, terminal, browser, and global-window behavior.

The native app should be tested as a “buy” alternative, while App Server enables the “build the differentiated shell, reuse the hard agent loop” option.

## Security and permission model

Codex separates approval policy from OS sandbox policy. Local execution can be read-only, workspace-write, or danger-full-access; outbound network is off by default in workspace-write unless configured. Approval modes govern when the agent can ask to cross boundaries or run commands. Rules and managed requirements can further restrict commands and configuration ([agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security), [sandbox](https://learn.chatgpt.com/docs/sandboxing), [permissions](https://learn.chatgpt.com/docs/permission-modes)).

Important ZD implications:

- Prefer a workspace-write sandbox with explicit writable roots and no network.
- Keep approval decisions scoped to thread/turn unless the user deliberately promotes a rule.
- Use containers or VMs before danger-full-access.
- Treat MCP servers, hook scripts, skills with executable code, and plugins as supply-chain code.
- Keep terminal tabs separate from agent privileges; a user's terminal can legitimately be more powerful than an agent turn.
- Never assume model instructions enforce security. Host policy, sandbox, process identity, filesystem, and network controls must do that.
- If ZD ever uses App Server remotely, the protocol listener becomes a privileged control plane and must not inherit the experimental defaults.

## Provider and model lock-in

Codex is materially more provider-flexible than its product branding suggests. Advanced configuration supports custom model providers with base URL, authentication, headers, retries, and wire API. Official examples include an OpenAI proxy, Ollama, Mistral, Azure OpenAI, Amazon Bedrock, and local OSS mode through Ollama or LM Studio ([advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced#custom-model-providers)).

This reduces infrastructure lock-in, but does not make every provider equivalent:

- providers need compatible Responses or Chat Completions behavior;
- capabilities such as reasoning summaries, personalities, web search, image inputs, and tool behavior vary;
- ChatGPT subscription/cloud features and integrations are not available with API-key mode;
- the recommended model catalog and high-level UX are OpenAI-first;
- App Server event semantics and agent prompts can evolve with Codex models;
- local/open models may be materially weaker at long-horizon coding and tool use.

The correct label is **pluggable model transport with OpenAI-shaped semantics**, not a fully neutral agent harness.

## Pricing and licensing

As of the research date, official pricing lists Free at $0, Go at $8/month, Plus at $20/month, Pro from $100/month, and Business at $20/user/month annual ($25 monthly), with Enterprise/Edu by quote. API-key use is token-priced and supports CLI, SDK, and IDE use, but not cloud integrations such as GitHub review or Slack ([pricing](https://learn.chatgpt.com/docs/pricing)). Limits vary with model, local/cloud mode, context, reasoning, retrieval, and tool use; fixed message-count estimates are not reliable.

OpenAI documents the Codex CLI, Codex SDK, and App Server as open-source components, while the IDE extension and Codex cloud are not open source ([open-source inventory](https://learn.chatgpt.com/docs/open-source)). This is a significant advantage for ZD: the core protocol implementation can be inspected, pinned, debugged, and—subject to its exact repository license—modified.

The official inventory page does not state the license text for each component. Before distributing a bundled Codex runtime, ZD should record the exact version, repository license, dependency notices, trademark constraints, and whether the distribution model permits bundling rather than requiring a user-installed CLI.

Authentication is also an evidence gap for a third-party client: official App Server documentation exposes account/login methods, but the product documentation reviewed here does not clearly establish whether ZD may broker ChatGPT OAuth as a distributed product. The conservative production path is user-owned local CLI authentication for personal use or API credentials for embedded/service use until terms are confirmed.

## ZD fit matrix

Scores are qualitative: 1 = poor, 5 = strong.

| ZD need | Score | Assessment |
| --- | ---: | --- |
| Fast local CLI integration | 5 | `codex exec` gives clean batch/JSONL automation |
| Deep programmatic embedding | 5 | App Server is unusually comprehensive; SDK provides a simpler route |
| Session resume and branching | 5 | Start/resume/fork/list/archive/pin/tree relationships |
| Approval UX integration | 5 | First-class server requests scoped to thread, turn, and item |
| Tools and ecosystem | 5 | MCP, skills, hooks, plugins, subagents, connectors |
| ZD goal/state-machine ownership | 5 | Native goals/plans project cleanly, provided ZD stays canonical |
| Terminal/editor/browser shell | 4 | App has these; App Server helps integrate agent events, but ZD still builds the shell |
| Global summon/project switcher | 3 | Project/Remote UX exists; exact overlay behavior remains ZD work |
| Provider/model neutrality | 4 | Custom, local, and Bedrock providers; semantics and feature parity remain OpenAI-shaped |
| Open-source/forkability | 4 | CLI, SDK, and App Server open; exact component license/bundling still needs verification |
| Enterprise security controls | 5 | Layered sandbox, approvals, rules, managed configuration, audit/admin surfaces |
| Protocol stability | 2 | Stdio core is usable, but important rich-client APIs and WebSocket remain experimental |

## Pros

- App Server is a real rich-client protocol, not terminal scraping.
- Thread/turn/item events align naturally with a multi-project steering UI.
- First-class live plans, diffs, approvals, token usage, steering, goals, forks, and status.
- Multiple integration depths: batch CLI, SDK, MCP specialist, or full App Server.
- Core CLI/SDK/App Server implementation is open source.
- Custom provider, local OSS, Azure, and Bedrock paths reduce model-host lock-in.
- Skills, hooks, MCP, plugins, and AGENTS.md support reusable ZD workflows.
- Native app provides a strong comparator for projects, artifacts, terminal, browser, and remote steering.

## Cons

- App Server is large, rapidly moving, and partially experimental.
- WebSocket transport is explicitly unsupported for production today.
- Deep client integration requires tracking schemas and version compatibility.
- SDK is TypeScript/server-side only and narrower than the protocol.
- API-key mode loses cloud integrations.
- Provider compatibility does not guarantee feature or agent-quality parity.
- ZD still must build and secure its terminal, editor, browser, process supervisor, and global-window shell.
- App Server's local rollout files are implementation state, not a durable product database.

## Principal risks

1. **Protocol churn:** an update can add, remove, or rename event variants and experimental methods.
2. **Security boundary confusion:** App Server, agent shell calls, and user terminal commands have different privilege models.
3. **Accidental Codex-shaped domain:** native goals and thread trees are tempting substitutes for ZD's more general objective graph.
4. **Remote exposure:** experimental listeners are too privileged to expose without a ZD-owned gateway.
5. **Feature-parity assumptions:** custom or local providers may accept the protocol but fail at model-specific behavior.
6. **Commercial/auth uncertainty:** open-source client code does not automatically grant the right to broker subscription authentication or bundle every service surface.
7. **Native-app convergence:** OpenAI may keep adding generic workspace features, so ZD must stay focused on its differentiated editor, objectives, graphs, and global-access UX.

## Evidence gaps to close with a spike

- Exact license and redistribution obligations for the pinned CLI, SDK, and App Server artifacts.
- Terms for ChatGPT account authentication from a third-party local client.
- Backward compatibility policy for App Server's non-experimental methods.
- Crash recovery when App Server dies during a command, file edit, or approval.
- Event ordering and idempotency across reconnect/resume.
- Cancellation guarantees for child processes and nested subagents.
- Performance and memory with many loaded threads/projects.
- App Server behavior with Mistral, Ollama, LM Studio, and Bedrock on representative ZD tasks.
- Whether experimental PTY/process APIs are good enough or should be excluded entirely.
- Real usage cost for long-running goals and multi-agent work.

## Recommended ZD experiment

Implement a version-pinned `CodexHarness` adapter over local stdio App Server:

1. Spawn one App Server per user or security boundary, not per UI pane.
2. Generate and check in the exact TypeScript/JSON schema for the pinned Codex version.
3. Normalize thread, plan, item, diff, approval, usage, and terminal events into a ZD-owned event model.
4. Store Codex thread/session IDs as opaque foreign keys under ZD runs.
5. Project a ZD goal into `thread/goal`, but reconcile completion back through ZD's own verifier.
6. Implement start, steer, approve, decline, cancel, resume-after-restart, fork, archive, and error recovery.
7. Use MCP for ZD tools; defer experimental dynamic tools and network WebSockets.
8. Keep ZD terminal tabs on ZD's own PTY layer and render agent command items alongside them.
9. Repeat the same normalized workflow with `codex exec` and one non-Codex harness.

The spike succeeds if upgrading or replacing Codex requires changing the adapter, not the editor, project model, objective graph, or approval inbox.

## Primary sources

- [Codex CLI](https://learn.chatgpt.com/docs/codex/cli)
- [Non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode)
- [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)
- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Codex as an MCP server](https://learn.chatgpt.com/docs/mcp-server)
- [Advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced)
- [Hooks](https://learn.chatgpt.com/docs/hooks)
- [MCP](https://learn.chatgpt.com/docs/extend/mcp)
- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Sandbox](https://learn.chatgpt.com/docs/sandboxing)
- [Desktop app](https://learn.chatgpt.com/docs/app)
- [Pricing](https://learn.chatgpt.com/docs/pricing)
- [Open-source components](https://learn.chatgpt.com/docs/open-source)
