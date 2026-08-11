# Hermes Agent as a ZD harness

Research date: 2026-08-11

## Identity and confidence

The `thoughts.txt` reference says only “Hermes,” without a link. I believe it means
[Nous Research's Hermes Agent](https://github.com/NousResearch/hermes-agent), not one of the
several unrelated projects named Hermes.

Confidence is high because this Hermes is explicitly a model-agnostic terminal agent harness and a
Claude Code/Codex alternative—the exact category named in the note. This identity is still an
inference, not something the source note proves.

## Bottom line

Hermes is the strongest off-the-shelf match I found for the *agent-control* half of the ZD idea.
It already has persistent goals, deterministic quality gates, a durable multi-agent Kanban board
with dependency edges, session search, MCP in both directions, cron, worktrees, profiles, approvals,
ACP, and a detailed RPC surface for a custom host. Its August 2026 desktop release even adds global
quick entry into a selected session.

It is not a replacement for ZD's reading/editor experience. Its task model is also Hermes's task
model: SQLite Kanban rows and a fixed lifecycle, not ZD's plain-text todo/objective system or a
general state-graph runtime. Adopting Hermes wholesale would trade implementation work for a large,
fast-moving, opinionated platform. The prudent direction is to test Hermes as a replaceable agent
backend behind ZD, using a documented protocol, and keep ZD's project, document, todo, goal, and
graph data authoritative.

**Verdict:** serious integration candidate; poor foundation to fork; do not make its databases ZD's
system of record without a deliberate migration decision.

## Current snapshot and maturity

As observed on 2026-08-11:

- The public repository is MIT-licensed and was created in July 2025.
- The latest GitHub release is
  [`v2026.8.3`, branded Hermes Agent 0.20.0](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.3),
  published 2026-08-03. The main `pyproject.toml` also declares 0.20.0.
- PyPI still reported 0.19.0 when checked. That lag is small, but it is concrete evidence that the
  GitHub/installer and PyPI distribution paths are not always synchronized.
- The 0.20 release notes claim roughly 3,650 commits, 1,400 merged PRs, and 5,200 files changed since
  0.19. Whether or not those raw counts are useful, the direction is unmistakable: this project is
  evolving extremely quickly.
- The architecture guide reports roughly 25,000 tests across about 1,250 files. It also openly marks
  several central modules as “large,” including the agent loop and CLI.

This is real, active software with broad platform coverage and a large test surface. It is still
0.x software with intense change velocity. “Mature enough to trial” and “stable enough to couple
ZD internals to” are different judgments; only the first is supported today.

## Architecture

Hermes is a Python agent platform centered on one synchronous `AIAgent` loop. The same core is
driven by the CLI/TUI, messaging gateway, ACP adapter, batch runner, HTTP API, and direct Python
imports. The core resolves a provider, assembles the prompt, loops through tool calls, compresses
context, and writes session state.

The major boundaries are:

- **Agent core:** `AIAgent`, prompt builder, provider resolution, tool dispatch, retries, fallback,
  callbacks, compression, memory, and persistence.
- **State:** SQLite plus FTS5 for sessions and search. Kanban uses a separate SQLite database.
- **Tools:** a registry with more than 70 documented tools across about 28 toolsets. Terminal
  execution can target local, Docker, SSH, Singularity, Modal, Daytona, or Vercel Sandbox backends.
- **Gateway:** a long-running process for messaging adapters, authorization, session routing, cron,
  Kanban dispatch, and background maintenance.
- **Customization:** skills, general Python plugins, memory-provider plugins, context-engine plugins,
  MCP clients/servers, platform adapters, and dashboard/desktop plugins.
- **Hosts:** classic CLI, Ink-based TUI, desktop, dashboard, messaging services, ACP clients, RPC
  clients, and OpenAI-compatible HTTP clients.

This is a broad platform rather than a small harness library. Its useful deep interface is the
agent itself; the cost is a wide dependency and state surface below it.

## CLI, headless, and embedding surfaces

Hermes has more integration choices than Pi, but they are not interchangeable.

### Interactive and one-shot CLI

`hermes` and `hermes chat` provide the interactive terminal experience. `hermes chat -q` supplies a
one-shot query; `--quiet` suppresses interactive decoration for programmatic use. Useful isolation
flags include `--ignore-user-config`, `--ignore-rules`, and `--safe-mode`. A run may request a git
worktree and filesystem checkpoints. There is also a batch runner for trajectory generation.

### ACP

`hermes acp` serves the Agent Client Protocol over JSON-RPC/stdin-stdout. The documented feature set
includes session creation, prompts, streaming, tool events, permissions, cancellation,
authentication, and session forks. This is the most direct route into Zed, VS Code, or JetBrains.

ACP is relevant if ZD wants compatibility with an editor protocol. It is not the richest way for a
ZD-specific host to control Hermes.

### TUI gateway RPC

The TUI gateway is JSON-RPC over stdio, with a WebSocket variant. Its method surface includes:

- prompt submit/background/steer;
- create/list/activate/close/interrupt/history/compress/branch/title/status/usage for sessions;
- approval, clarification, sudo, and secret responses;
- command discovery and dispatch;
- MCP/env reload;
- delegation status and subagent steer/interrupt;
- terminal resize, clipboard, and image attachment.

It streams message, tool, approval, session, and error events. This is the best documented seam for
a custom ZD agent panel because it preserves Hermes behavior instead of reducing it to “send text,
receive final text.” It also means ZD must implement and version a Hermes-specific protocol client.

### HTTP API

The gateway can expose OpenAI-compatible Chat Completions and Responses endpoints plus an async run
API with lifecycle events, approvals, interruption, capabilities, and health. The basic Chat
Completions route is stateless; stateful behavior uses Responses/session headers or run endpoints.

HTTP is convenient for automation and language-neutral clients. It is a worse fit than gateway RPC
for a native ZD control surface because compatibility endpoints intentionally hide some Hermes
features.

### Python in-process use

The official guide says Python consumers can import `run_agent.AIAgent` directly. This avoids a
subprocess but couples the host to internal Python APIs and dependency state. ZD is currently a
TypeScript/Tauri application, so in-process Python is the least natural integration path and the
most likely to suffer from release churn.

### Desktop quick entry

Hermes 0.20 added a global-hotkey quick-entry window that can send a thought into any session, plus
multiple windows and a desktop plugin SDK. That addresses a narrow but important part of the
original wish: reach the agent from anywhere on macOS.

The evidence does **not** show that quick entry is a drop-down, always-on-top full workspace with
ZD's Markdown editor, per-project terminals, and Command-1/2/3 project switching. Treat it as proof
that Hermes understands the interaction, not proof that its desktop replaces ZD.

## Providers and models

Hermes separates the harness from model choice. The CLI reference currently lists direct or
gateway integrations for OpenRouter, Nous Portal, OpenAI/Codex, Anthropic, Gemini, GitHub Copilot,
Hugging Face, Bedrock, Azure Foundry, DeepSeek, xAI, several regional coding-plan providers, custom
OpenAI-compatible endpoints, LM Studio, and others. It supports OAuth, API keys, provider/model
switching during a session, fallback chains, credential pools, and provider-specific API modes.

Strengths for ZD:

- model choice does not need to shape the UI or workflow model;
- users can use subscription-backed Codex/Claude/Copilot as well as API keys;
- model switching is exposed across CLI, ACP, RPC, and HTTP;
- different Hermes profiles and cron jobs can pin different providers/models.

Risks:

- the provider matrix is a large compatibility surface;
- some catalog/auth features are provider-specific despite the uniform UI;
- unattended work needs explicit spend and credential policy;
- “supports a provider” does not prove parity for every model's reasoning, tool-call, cache, or
  subscription behavior.

## Sessions, state, and memory

Every conversation is persisted in `~/.hermes/state.db`. Session rows include source, user, title,
model configuration, system-prompt snapshot, full messages/tool calls/results, token usage,
timestamps, and parent lineage. FTS5 provides cross-session search. Compression changes active
context but is not data deletion.

Named profiles give separate `HERMES_HOME` roots, configuration, sessions, memory, skills, and
gateway processes. That maps reasonably well to “separate agent personas or environments,” but not
automatically to ZD projects. A ZD project might instead be a workdir, a profile, a Kanban board, or
some combination. ZD would need to choose and enforce one mapping.

Hermes also has persistent memory and swappable memory providers. This can be useful for long-lived
assistants, but it introduces state outside the project repo. ZD's current way of working values
plain files, inspectability, and source-controlled evidence. Importing implicit agent memory into
that system would weaken provenance unless the UI distinguishes “repo truth” from “agent recall.”

## Tools, MCP, skills, and plugins

### Native tools and toolsets

Hermes has an extensive native catalog, including file operations, terminal/process tools, browser
automation, web, code execution, delegation, Kanban, cron, media, and memory. Toolsets allow the
operator to limit which schemas are exposed in a context.

This saves a great deal of infrastructure work. It also means the default harness is much larger
than ZD's actual workflow needs.

### MCP

MCP is first-class and bidirectional:

- Hermes can connect to local stdio and remote HTTP/SSE servers, discover tools, filter them per
  server, and handle OAuth/header auth.
- `hermes mcp serve` exposes Hermes conversations to other MCP clients/agents.

This is attractive for ZD's planned “agents operate the apps” direction: ZD could expose its own
app controls as an MCP server while Hermes remains the harness. MCP should carry capabilities, not
be the canonical store for ZD tasks or documents.

### Skills

Hermes implements the Agent Skills pattern and can load repository instructions such as
`AGENTS.md`. This is a plausible route for porting ZD's existing `/session`, `/triage`, and
`/archive` procedures with little product coupling.

### Plugins

Python plugins can register tools, hooks, CLI commands, and integrations from user, project, or pip
locations. Specialized plugin interfaces exist for memory and context engines. Dashboard and
desktop surfaces have their own extension points.

Plugins are capable enough to build ZD-aware tools. They are also code running in the agent process,
so version compatibility, trust, and blast radius belong to ZD if it distributes one.

## Permission and security model

Hermes has a materially stronger built-in security story than Pi, but it is still an agent running
powerful tools under a user's authority.

Documented layers include:

- deny-by-default gateway user authorization, platform allowlists, and pairing codes;
- dangerous-command approval modes (`smart`, `manual`, or `off`);
- file-write deny rules and an optional write sandbox;
- Docker/Singularity/remote execution backends and resource controls;
- MCP environment/credential filtering;
- context-file prompt-injection scanning;
- cross-session isolation and path traversal protections;
- validation of working-directory input;
- checkpoints and rollback.

Important limits:

- “smart” approval is pattern/policy enforcement, not a complete operating-system sandbox;
- the Hermes docs themselves describe file-write safety as defense in depth, not a hard boundary;
- local terminal execution still inherits local access unless a sandbox backend is selected;
- plugins and MCP servers add third-party code and credential boundaries;
- headless cron uses a separate dangerous-command policy; the safe default is deny, while
  auto-approve deliberately accepts the risk;
- a ZD host must faithfully display and route approval/secret prompts. Dropping those events to use
  a simpler transport would silently degrade the security model.

For a ZD integration, safe defaults should be local-only RPC/stdio, explicit project roots, an
isolated terminal backend for autonomous work, no `--yolo`, and a visible per-session permission
state.

## Automation

Hermes includes several distinct automation layers:

- one-shot quiet CLI calls for scripts and CI;
- cron jobs managed by the long-running gateway, with fresh sessions, skill attachment, workdirs,
  delivery targets, model pins, run history, and script-only/no-LLM mode;
- persistent goals that continue a single session until a judge says done, a quality gate fails too
  often, the user pauses it, or the turn budget is exhausted;
- synchronous subagent delegation;
- durable Kanban workers dispatched as separate operating-system processes;
- API runs and outbound lifecycle webhooks.

This is unusually close to the automation layer described in `thoughts.txt`. It also duplicates a
substantial portion of the system ZD has begun designing.

## Fit with ZD todos, goals, objectives, and state graphs

### Persistent goals: close conceptual fit

`/goal` stores a standing objective in session metadata and resumes it with the session. It supports
completion contracts with outcome, verification, constraints, boundaries, and stop conditions;
deterministic shell quality gates; bounded turns; pause/resume; and wait barriers for background
processes.

This is very close to the accountability semantics ZD has been developing. The mismatch is scope:
Hermes goals belong to Hermes sessions and use an auxiliary LLM judge. ZD's objective records are
repo artifacts with human/agent ownership and explicit evidence rules. Hermes can execute a ZD goal,
but it should not silently become the only place the goal exists.

### Kanban: strong workflow engine, different task system

Hermes Kanban is a durable SQLite board shared across profiles. Tasks have fixed statuses
`triage | todo | ready | running | blocked | review | done | archived`, comments, assignees,
attachments, retries, heartbeats, workspaces, and dependency links. Dependency links form a DAG and
promote work when parents complete. CLI, model tools, dashboard, scripts, and cron share one database.

That solves many hard multi-agent problems: atomic claiming, crash recovery, review handoffs,
worktrees, audit rows, and human intervention. It does **not** preserve ZD's todo.txt format, source
tags, archive semantics, feedback provenance, “one session = one goal = one commit,” or its explicit
human/agent inbox separation.

An adapter could mirror selected ZD todo items to Hermes cards, but two-way synchronization would be
a conflict-prone dual-write system. Prefer one-way dispatch: ZD remains authoritative; it creates a
Hermes unit of work and imports completion evidence.

### Custom state graphs: partial, not general

Kanban dependencies are a task DAG and its status lifecycle is a state machine. The documented
statuses and transitions are fixed. Plugins can observe some transitions and the dashboard can add
views/card chrome, but I found no documented user-defined state schema, graph DSL, custom transition
guards, or general workflow engine.

Therefore:

- if ZD's graphs mean dependency-linked work moving through a conventional lifecycle, Hermes gets
  much of the way there;
- if they mean arbitrary node types, custom states/transitions, nested objectives, or visual graph
  execution, ZD would still need to own that engine and drive Hermes workers as effects.

## Plausible ZD integration shapes

### 1. External CLI harness

ZD opens a terminal running Hermes and leaves the current workflow file-based.

Pros: nearly zero coupling; fastest real-world trial; Hermes can already read `AGENTS.md` and use
skills.

Cons: ZD cannot reliably show structured agent state, approvals, tool progress, or steer sessions
outside the terminal.

### 2. Gateway RPC sidecar — recommended prototype

ZD launches Hermes as a child process and speaks TUI gateway JSON-RPC. It renders its own agent
panel, ties sessions to ZD project tabs, routes approvals, and keeps repo workflow files canonical.

Pros: richest supported control surface; process isolation; no Python embedded in Tauri; replacement
remains possible.

Cons: Hermes-specific client and version matrix; must supervise the process and map two session
models; broad RPC surface is more work than a terminal.

### 3. ACP backend

ZD implements or reuses an ACP client.

Pros: standard editor-agent protocol; potential backend interchangeability.

Cons: fewer Hermes-specific controls than its gateway RPC; ZD still needs project/todo/graph
coordination outside ACP.

### 4. Hermes plugin for ZD

A Python plugin exposes ZD todo/goal/objective commands as native agent tools or connects to a local
ZD service/MCP server.

Pros: excellent model ergonomics; Hermes can act on structured ZD state without scraping files.

Cons: plugin compatibility and full-process privilege become ZD's burden; it risks making Hermes
the outer application rather than a backend.

### 5. Fork or direct Python embed

Not recommended. The repository is broad, rapidly changing, and centered on a different runtime
stack. A fork would inherit provider, security, gateway, desktop, packaging, and migration work.
Direct imports are less expensive than a fork but still couple ZD to Python internals.

## Pros

- The closest native match to persistent goals and multi-agent task execution.
- Rich, documented RPC plus standard ACP and HTTP surfaces.
- Model/provider independence and mid-session switching.
- First-class MCP, skills, plugins, profiles, worktrees, cron, memory, and session search.
- Better built-in approvals and sandbox choices than minimal harnesses.
- Existing desktop quick entry validates the global-access interaction.
- MIT license permits internal integration, modification, and redistribution subject to notice.

## Cons

- Large and opinionated; substantial conceptual overlap with future ZD features.
- Multiple SQLite/config/plugin stores create a second state universe beside the repo.
- Fixed Kanban lifecycle does not equal arbitrary workflow graphs.
- No evidence of a ZD-quality Markdown editor or the requested multi-project document/terminal shell.
- Python/process integration is less natural for a TypeScript/Tauri application.
- Release velocity makes internal imports, forks, and deep plugin coupling expensive.
- Broad tool/provider/gateway scope enlarges attack surface and operational complexity.
- Goals use an LLM judge; quality gates help, but false positive/negative completion remains possible.

## Risks and evidence gaps

- I did not run Hermes against ZD. Startup time, terminal behavior, macOS signing, approval UX, and
  session reliability in a Tauri sidecar remain untested.
- I did not verify provider parity with the user's actual subscriptions and preferred models.
- I did not test whether its ACP implementation has every capability ZD would require.
- The project changed materially during a short research window; protocol compatibility guarantees
  and deprecation policy were not obvious in the primary docs.
- The global quick-entry release claim needs hands-on macOS verification, including configurable
  hotkeys, focus behavior, Spaces, full-screen apps, and selected-session routing.
- I found no supported custom Kanban status schema or general state-graph API. Absence from the docs
  is not proof that no internal hook exists; it is evidence that ZD should not depend on one.
- Repository popularity and release statistics show activity, not maintainability or correctness.
- PyPI/version skew should be rechecked before deciding on an installation channel.

## Recommended experiment

Run Hermes first as an external CLI on one real ZD session. If it is pleasant, build a narrow
gateway-RPC spike with exactly these acceptance criteria:

1. launch/stop one supervised Hermes process per ZD project;
2. create, resume, and list sessions;
3. stream text and tool events;
4. steer and interrupt an active turn;
5. render and answer every approval/clarify/secret request;
6. run with a project-root write boundary or container backend;
7. invoke the existing ZD `/session` skill/instructions without copying task state into Hermes;
8. export completion evidence back to ZD's repo files;
9. restart ZD and prove the mapping is recoverable;
10. replace Hermes with a fake RPC peer to prove the UI is not inseparable from the backend.

Do not begin with Kanban synchronization. First prove that Hermes is better to work with than the
current Claude Code/Codex harnesses while ZD remains itself.

## Primary sources

- [Repository and README](https://github.com/NousResearch/hermes-agent)
- [Architecture](https://hermes-agent.nousresearch.com/docs/developer-guide/architecture)
- [Programmatic integration](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration)
- [CLI command reference](https://hermes-agent.nousresearch.com/docs/reference/cli-commands)
- [Providers](https://hermes-agent.nousresearch.com/docs/integrations/providers)
- [Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions)
- [Persistent goals](https://hermes-agent.nousresearch.com/docs/user-guide/features/goals)
- [Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban)
- [Cron](https://hermes-agent.nousresearch.com/docs/user-guide/features/cron)
- [MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp)
- [Plugins](https://hermes-agent.nousresearch.com/docs/user-guide/features/plugins)
- [Security](https://hermes-agent.nousresearch.com/docs/user-guide/security/)
- [API server](https://hermes-agent.nousresearch.com/docs/user-guide/features/api-server)
- [0.20.0 release notes](https://github.com/NousResearch/hermes-agent/releases/tag/v2026.8.3)
- [MIT license](https://github.com/NousResearch/hermes-agent/blob/main/LICENSE)
- [PyPI project](https://pypi.org/project/hermes-agent/)
