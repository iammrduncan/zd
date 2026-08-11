# Pi as a ZD harness

Research date: 2026-08-11

## Identity and confidence

The `thoughts.txt` reference says only “Pi.” I believe it means the coding-agent harness originally
published at `badlogic/pi-mono`. The legacy
[`github.com/badlogic/pi-mono`](https://github.com/badlogic/pi-mono) URL now redirects to
[`earendil-works/pi`](https://github.com/earendil-works/pi), and the current package is
`@earendil-works/pi-coding-agent`.

Confidence is high: the project calls itself “Pi Agent Harness,” describes Pi as a minimal terminal
coding harness, and explicitly positions its CLI as adaptable through extensions. It is the obvious
Pi in the Claude Code/Codex alternative category. The unlinked source note still leaves a small
identity ambiguity.

## Bottom line

Pi is the cleaner *construction material* for ZD; Hermes is the more complete *agent platform*.
Pi provides a small agent core, a capable terminal UI, a multi-provider model layer, JSONL sessions,
an excellent TypeScript SDK, a process-isolated RPC mode, and extremely broad extension hooks. It
deliberately does not ship MCP, permission popups, todos, plan mode, subagents, or background bash.
Those omissions are philosophy, not a backlog accident.

That makes Pi unusually aligned with ZD's desire for custom todos, goals, objectives, and state
graphs: ZD can define the semantics instead of fighting a baked-in workflow. It also means ZD must
build and secure every one of those semantics. Out of the box, Pi gives the model `read`, `write`,
`edit`, and `bash` with the full permissions of the launching user.

**Verdict:** the best candidate here for a replaceable embedded/sidecar agent runtime, especially if
ZD wants to own the workflow. Use RPC for the first integration and consider the SDK only after the
runtime/deployment cost is understood. Do not treat “minimal” as “safe.”

## Current snapshot and maturity

As observed on 2026-08-11:

- The current public repository and packages are MIT-licensed.
- The latest release and npm package were both 0.84.1, published 2026-08-07.
- `@earendil-works/pi-coding-agent` requires Node.js 22.19 or newer.
- The repository was created in August 2025 and remains very active.
- The top-level repository separates `pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, and a
  telemetry contract into distinct packages.
- The project automatically closes issues and pull requests from new contributors pending maintainer
  review. That may keep signal high, but it also means normal ecosystem contribution expectations do
  not apply.

Pi has a narrower product surface and a much smaller open-issue count than Hermes. It is nevertheless
pre-1.0, changes quickly, and recently moved organization/package namespaces. The current docs are
substantially better and more complete than older Pi commentary on the web, which makes dated
third-party comparisons particularly unreliable.

## Architecture

Pi is a TypeScript monorepo with useful, deep cut points:

- **`pi-ai`:** unified provider/model/auth/streaming/token-cost layer. It handles tool-call-capable
  models, provider-specific APIs, OAuth, context serialization, and cross-provider handoff.
- **`pi-agent-core`:** stateful agent loop with messages, tools, streaming events, steering,
  follow-ups, abort, context transformation, and pre/post tool hooks. It does not assume a coding UI.
- **`pi-coding-agent`:** CLI/TUI, file and shell tools, session persistence, compaction, project
  context, skills, prompt templates, packages, extensions, JSON/RPC modes, and the higher-level SDK.
- **`pi-tui`:** terminal UI primitives and differential rendering.

The basic data flow is:

`AgentMessage[] -> transform context -> convert to provider messages -> model -> tool calls -> tool
results -> next turn`, with ordered events for agent/turn/message/tool lifecycle.

The separation matters for ZD. It can adopt:

- only `pi-ai` for provider normalization;
- `pi-agent-core` and define all tools/state/UI itself;
- the coding-agent SDK for Pi's sessions, compaction, resources, and tools;
- or the complete `pi` process via RPC.

That is a more graduated adoption path than a platform whose agent, state, gateway, and workflow are
designed as one product.

## CLI, headless, and SDK surfaces

### Interactive terminal

The default `pi` mode is a terminal coding agent with a multiline editor, images, file mentions,
model/thinking selection, streaming tools, steering and follow-up queues, session branching,
compaction, and extension-defined UI. The UI can be extended with commands, keybindings, widgets,
overlays, replacement editors, custom renderers, headers, footers, and status lines.

Pi is still a terminal application, not the global multi-project desktop shell from `thoughts.txt`.
It could run inside ZD's terminal panes, but it does not supply ZD's Markdown reader/editor, project
tabs, browser, or global macOS window behavior.

### Print and JSON modes

`pi -p` accepts a prompt, can merge piped stdin, prints the final result, and exits. `--mode json`
emits the event stream as JSON Lines. These are suitable for simple scripts and CI where no
mid-run control or durable host connection is needed.

### RPC mode

`pi --mode rpc` is a long-lived JSONL protocol over stdin/stdout. It supports:

- prompt, steer, follow-up, abort, and new sessions;
- session switch/fork and session state/messages;
- model and thinking selection;
- queue modes and compaction;
- extension commands and UI request/response traffic;
- streaming agent/message/tool events.

The protocol has strict LF framing; generic line readers that also split Unicode line separators are
explicitly unsafe. RPC is the most sensible first ZD seam: it keeps Pi in a supervised process and
does not require Node APIs inside Tauri's webview.

Pi RPC is Pi-specific. Native ACP was still a proposal/discussion in the primary repository during
this research, not a documented shipping mode. Community adapters should not be mistaken for a
first-party compatibility guarantee.

### Coding-agent SDK

The SDK exposes `createAgentSession`, session managers, model runtime/registry, resource loaders,
event buses, tool factories, custom tools, extensions, skills, prompt templates, context files,
interactive/print/RPC runners, and advanced session-runtime replacement.

It supports in-memory, new, continued, resumed, and forked sessions; direct event subscriptions;
steering; follow-up; compaction; and direct state access. The SDK is the most expressive integration
choice when the host is a Node/TypeScript process.

ZD's Tauri frontend is TypeScript in a browser-style webview, not a Node application. Direct SDK use
there is not automatic. ZD would need a Node sidecar/service, a supported JS runtime packaged with
the app, or a Rust-to-Node bridge. That deployment cost should be measured before the SDK's type
safety is treated as free.

### Low-level agent core

`pi-agent-core` exposes the `Agent` class and raw `agentLoop` functions. ZD could provide its own
message types, tools, persistence, context transformation, stop-after-turn logic, and event handling.
This gives maximum control and minimum inherited product behavior.

It also turns ZD into the harness maintainer. Provider/auth, tool safety, compaction, session
migrations, errors, and UI settlement semantics would become application concerns. Start higher in
the stack unless a concrete Pi behavior blocks the product.

## Providers and models

Pi's model layer supports a wide set of tool-capable providers, including OpenAI and Codex
subscription auth, Anthropic and Claude subscription auth, GitHub Copilot, Google/Gemini/Vertex,
Azure OpenAI, Bedrock, DeepSeek, Mistral, Groq, Cerebras, Cloudflare, xAI, OpenRouter, Vercel AI
Gateway, Hugging Face, Together, Fireworks, and several coding-plan/regional services.

Custom OpenAI-, Anthropic-, or Google-compatible endpoints can be described in
`~/.pi/agent/models.json`; custom API shapes and OAuth flows can be registered by extensions. Pi
also has a first-party llama.cpp router integration in the current docs.

Useful properties for ZD:

- one session can switch providers/models;
- reasoning levels and provider transport preferences are normalized;
- subscriptions and API keys can coexist;
- the SDK can supply a custom model runtime;
- only tool-capable models are placed in the normal model catalog.

Risks:

- model/provider parity still depends on compatibility flags and upstream behavior;
- auth storage belongs to the Pi runtime and must be coordinated with ZD's secret story;
- local-provider onboarding has changed rapidly, so older setup advice is stale;
- a broad provider layer is valuable infrastructure but also a continuous maintenance surface.

## Sessions and state

The coding agent auto-saves sessions under `~/.pi/agent/sessions/`, grouped by working directory.
Each session is a human-inspectable JSONL file. Entries form a tree through `id`/`parentId`, allowing
in-place branching. The format is versioned and older sessions are migrated when loaded.

Users can continue the most recent session, browse/resume, name, fork, clone, navigate the tree,
compact, export, import, share, or run ephemerally. The SDK can use memory-only storage or custom
session paths. `pi-agent-core` also now offers optional SQLite session-backend packages, while the
coding-agent's documented default remains JSONL.

This is an unusually good fit with ZD's inspectability preferences. However:

- the tree is a **conversation history graph**, not a task/workflow graph;
- working-directory grouping is not the same as ZD's future project/tab model;
- session files contain prompts, tool results, and potentially sensitive data;
- ZD must map project IDs to cwd/session locations without relying on display names;
- if extensions store custom entries, ZD needs to preserve them during import/export/migration.

Pi does not provide Hermes-style cross-session full-text search or a built-in long-term memory system
in the core product. Those can be extensions or application features.

## Tools, MCP, skills, and extensions

### Built-in tools

The normal coding agent starts with `read`, `write`, `edit`, and `bash`; additional built-ins include
`grep`, `find`, and `ls`. CLI flags can allowlist, exclude, or disable tools. SDK consumers can
instantiate the standard tools for a chosen cwd or provide custom tools.

The allowlist limits what the model can call. It does not sandbox extension code or the Pi process.

### No native MCP

Pi's official philosophy is explicit: **no MCP in core**. The recommended options are ordinary CLI
tools documented through skills or an extension that implements MCP. Its extension guide lists MCP
integration as possible, but that is user/extension territory rather than a maintained native
client/server.

For ZD this is both good and bad:

- good: no mandatory MCP dependency or extra tool-discovery state;
- bad: ZD's planned app-control MCP does not work with stock Pi;
- practical: ZD could register its controls as direct SDK tools, ship a pinned MCP extension, or
  expose equivalent CLI commands plus a skill.

Direct tools are simpler when ZD controls both sides. MCP is more portable if multiple harnesses must
operate the same apps.

### Skills and context

Pi supports the Agent Skills standard and loads `AGENTS.md`, `AGENTS.override.md`, or `CLAUDE.md`
context along the directory hierarchy. That makes ZD's existing project instructions and procedural
commands portable with little work.

### Extensions and packages

Extensions are TypeScript modules loaded without a compile step. They can:

- register/replace tools and providers;
- add commands, shortcuts, flags, renderers, and complete UI components;
- intercept or modify input, prompts, provider requests/responses, context, tool calls/results, and
  compaction;
- observe session, model, message, turn, and tool lifecycle events;
- block tool calls and ask the user through the UI;
- store custom session entries and communicate through an event bus;
- implement checkpointing, permissions, subagents, plan mode, sandbox routing, MCP, or custom
  editors.

Pi packages bundle extensions, skills, prompts, and themes from npm or git. Project-local resources
are gated by project trust.

This is the clearest route to a ZD-specific workflow, but the power is almost unlimited. Packages
and extensions execute arbitrary code with the Pi process's permissions. A ZD-distributed extension
needs pinned versions, an explicit compatibility range, source review, update policy, and tests
against supported Pi versions.

## Permission and security model

Pi intentionally has no built-in permission popup or general resource policy. Its official security
documentation says:

- Pi runs with the permissions of the account that launches it;
- writable files are considered inside the same local trust boundary;
- project trust controls whether project-local settings, packages, and extensions load;
- project trust is **not** a sandbox and does not restrict tool actions;
- stock Pi has no filesystem, process, network, or credential isolation.

Project trust is still valuable. It prevents an untrusted checkout from silently loading executable
project extensions/packages. In non-interactive modes, the default “ask” behavior does not prompt;
without an existing decision, project resources are ignored unless the run explicitly approves
them.

Pi documents three stronger deployment patterns:

- run the whole process in Docker;
- run it in a policy-controlled OpenShell sandbox;
- keep auth/Pi on the host while a Gondolin extension routes the built-in tools and `!` commands to
  a local micro-VM.

The last pattern has an important hole: other custom extension tools still run on the host unless
they deliberately delegate. A permission extension can block tool calls, but it remains userland
policy inside a fully privileged process.

For ZD, minimum safe defaults should be:

- start read-only (`read,grep,find,ls`) until the user grants a working capability;
- make the project root explicit and never imply that cwd is a security boundary;
- display every extension and tool source in session UI;
- run autonomous workflows in a container/micro-VM or a tightly scoped OS sandbox;
- never auto-install project packages before project trust;
- separate provider credentials from tool-execution environments where practical;
- treat a Pi/extension compromise as compromise of every credential and file visible to that
  process.

## Automation

Pi supports automation as a composable runtime rather than a built-in scheduler:

- print mode for one-shot shell workflows;
- JSON event mode for log-oriented consumers;
- RPC for long-lived controlling processes;
- SDK sessions for application pipelines and tests;
- extensions that may enqueue messages, spawn agents, or implement workflow logic;
- ordinary external process managers, tmux, cron, launchd, or CI for scheduling.

Stock Pi has no cron daemon, no persistent goal loop, no plan mode, no subagents, no background bash,
and no built-in todo system. The README specifically recommends files or extensions for these needs.

That is highly compatible with ZD owning automation, but Pi will not solve scheduling, crash
recovery, leases, idempotency, review handoffs, or durable workflow transitions for ZD.

## Fit with ZD todos, goals, objectives, and state graphs

### Todos and objectives: build, do not adapt

Pi intentionally has no built-in todos. ZD can expose `zd td` operations as direct tools, CLI-backed
tools, or an extension. This avoids dual-writing a second task store and lets the existing todo.txt
format, provenance tags, archive rules, and human/agent ownership remain authoritative.

The cost is that Pi provides no atomic claim/review/change-request protocol. ZD must implement the
race prevention and lifecycle it wants.

### Goals: implement at the host boundary

Pi has steering, follow-up queues, session state, tool hooks, stop-after-turn hooks, and extension
events—all the ingredients for a bounded goal loop. It does not ship the loop, completion contract,
judge, quality gates, or persistence semantics.

The cleanest implementation is probably in ZD's controller, not a deep Pi extension:

1. ZD stores the goal and acceptance evidence in its own files/database.
2. It prompts a Pi RPC session.
3. At agent completion, ZD checks deterministic gates first.
4. A configured evaluator decides complete/continue/needs-user only when necessary.
5. ZD sends a follow-up or stops, with explicit budgets.

That preserves backend replaceability and makes the goal visible even if Pi is removed.

### State graphs: good engine boundary, no native graph runtime

Pi's session tree and event graph are useful internals but not a user-defined workflow engine. I
found no native graph schema, node scheduler, durable transition store, retries, leases, or visual
graph API.

Pi is nevertheless a good *effect runner* for a ZD-owned graph. Each agent node can be a Pi session
or turn; tools/events become graph inputs and outputs; ZD stores transitions and evidence. The SDK's
custom messages and tools would make a tight implementation possible, while RPC keeps the graph
engine independent of Pi.

### Alignment with ZD's engineering principles

Pi's minimal core and layered packages align well with “build deep modules,” “don't abstract too
early,” and “custom workflow outside the harness.” The security philosophy does not satisfy ZD's
default-deny guidance without added sandboxing. Its extension power can also recreate exactly the
complexity the minimal core avoids—only downstream in ZD.

## Plausible ZD integration shapes

### 1. Terminal-only trial

Run stock Pi in a ZD terminal pane and port ZD commands as skills/prompts.

Pros: fastest evaluation; no code coupling; validates model quality and daily interaction.

Cons: no structured ZD steering/status/approval surface; unsafe defaults need careful launch flags
or sandboxing.

### 2. RPC sidecar — recommended prototype

ZD supervises `pi --mode rpc`, associates one or more sessions with each project, and translates
Pi events into a native agent panel.

Pros: strong control; process isolation; language-neutral boundary; backend remains replaceable;
Pi already implements models, auth, tools, sessions, and compaction.

Cons: must package or require Node 22.19+/Pi; strict protocol/version handling; ZD owns permissions,
process recovery, and project/session mapping.

### 3. Node service using the coding-agent SDK

A bundled Node sidecar imports the SDK and exposes a small ZD-owned protocol.

Pros: type safety, custom tools, in-memory or custom sessions, full event/state access, exact resource
loading, and a narrower public protocol for the Tauri app.

Cons: ZD now owns a Node service and adapter API; SDK changes must be absorbed; duplicating Pi RPC
without a concrete need would be a shallow module.

### 4. Embed `pi-agent-core`

Build a bespoke ZD harness from the low-level agent package.

Pros: total control over workflow, tools, messages, and state; no unwanted coding-agent product
semantics.

Cons: maximum maintenance and security burden; easy to underestimate provider, auth, compaction,
tool, session, and cancellation edge cases.

### 5. Pi extension that talks to ZD

Ship ZD tools/UI inside Pi, perhaps through a local ZD API or direct CLI commands.

Pros: useful even outside the ZD desktop; model gets structured task/document operations.

Cons: makes Pi an outer host, duplicates UI, grants extension code full privileges, and increases
compatibility coupling. Better as a small interoperability package after RPC proves valuable.

## Pros

- Clean package layering from provider API to agent core to coding UI.
- First-class TypeScript SDK and detailed process RPC.
- Human-readable, branchable JSONL sessions.
- Extremely powerful extensions without forking core.
- Broad provider/model choice, subscription auth, and custom providers.
- Explicitly leaves todos/goals/graphs to ZD instead of imposing a competing system.
- Excellent fit for existing `AGENTS.md` and Agent Skills procedures.
- MIT license permits embedding, modification, and redistribution subject to notice.
- Smaller conceptual surface than an all-in-one agent platform.

## Cons

- No native permission system; stock writable/bashed sessions are high-trust.
- No native MCP, goals, todos, plans, subagents, scheduler, or general workflow graph.
- Extension packages execute arbitrary code and can turn minimal core into an opaque dependency pile.
- Direct SDK use requires a recent Node runtime that Tauri does not inherently provide.
- RPC and session formats are Pi-specific and pre-1.0.
- No native ACP documented as shipping at research time.
- No desktop/global-hotkey/project workspace or Markdown editor solution.
- Workflow durability, crash recovery, claims, reviews, and idempotency remain ZD work.

## Risks and evidence gaps

- I did not run Pi against ZD or package it in the macOS application. Binary size, signing,
  quarantine, updates, and Node distribution remain unknown.
- I did not test the RPC protocol under aborts, process crashes, large tool streams, extension UI
  prompts, session switches across cwd, or Pi version upgrades.
- I did not verify exact provider behavior with the user's subscriptions/models.
- I found a proposal for native ACP, not release documentation proving it ships. This must be
  rechecked if ACP becomes an architectural requirement.
- “No native MCP” is current official philosophy, but an ecosystem extension may be excellent. No
  third-party extension was audited here.
- The package/org transition is complete in current docs, but legacy links and package names remain
  widespread. ZD should pin the current namespace and detect accidental mixed installations.
- Project trust is easy to misread as execution safety. UI copy must make the distinction explicit.
- The session JSONL format is documented and versioned, but no long-term compatibility guarantee was
  found. ZD should use Pi APIs, not mutate files directly.
- Repository activity and popularity do not establish bus factor, governance quality, or release
  stability.

## Recommended experiment

Start with two deliberately small trials.

### Trial A: daily CLI use

Use Pi for three normal ZD `/session` runs with existing `AGENTS.md`, a read/write tool set, and no
workflow extension. Record model quality, steering, context behavior, compaction, session recovery,
and whether the minimal UI feels better or worse than Claude Code/Codex.

### Trial B: RPC sidecar spike

Build only enough ZD integration to prove:

1. supervised start/stop and version detection;
2. one named Pi session per ZD project;
3. streaming messages and tool events;
4. steer, follow-up, and abort;
5. resume after ZD restart;
6. a read-only default with an explicit transition to write/bash capability;
7. one ZD-native tool—for example, listing authoritative todos—without direct session-file edits;
8. one deterministic goal gate controlled by ZD, not Pi;
9. a sandboxed autonomous run;
10. a fake RPC peer proving the ZD UI/controller is not coupled to Pi internals.

Only move to the SDK if RPC cannot support a demonstrated interaction. Only build MCP after a second
harness needs the same ZD tools. Only build a full graph runtime after one real workflow proves that
a file plus a bounded controller is insufficient.

## Primary sources

- [Current repository](https://github.com/earendil-works/pi)
- [Legacy repository URL, now redirected](https://github.com/badlogic/pi-mono)
- [Coding-agent README and philosophy](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/README.md)
- [`pi-agent-core`](https://github.com/earendil-works/pi/blob/main/packages/agent/README.md)
- [`pi-ai` provider layer](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)
- [Coding-agent SDK](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
- [RPC protocol](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/rpc.md)
- [Sessions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sessions.md)
- [Session file format](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/session-format.md)
- [Extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)
- [Security](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/security.md)
- [Containerization](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/containerization.md)
- [0.84.1 release](https://github.com/earendil-works/pi/releases/tag/v0.84.1)
- [MIT license](https://github.com/earendil-works/pi/blob/main/LICENSE)
