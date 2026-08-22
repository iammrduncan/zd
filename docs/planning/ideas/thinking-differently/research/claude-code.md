# Claude Code as a ZD agent harness

Research date: 2026-08-11

## Executive verdict

Claude Code is a strong **agent engine** for ZD, but a weak **foundation** for ZD.

The terminal client, non-interactive mode, and Python/TypeScript Agent SDK expose a mature loop: repository inspection, file edits, shell execution, structured/streaming output, resumable sessions, explicit approvals, MCP, skills, plugins, hooks, subagents, checkpointing, cost telemetry, and cloud-provider deployment. ZD could get to a capable Claude-backed agent quickly without scraping a terminal UI.

The trade is structural lock-in. Claude Code is a proprietary Anthropic product whose supported inference routes all serve Claude models, even when billing and infrastructure move to Amazon Bedrock, Google Cloud, Microsoft Foundry, or an LLM gateway. Anthropic also explicitly says developers embedding Claude capabilities in another product should use API-key or supported-cloud-provider authentication rather than routing consumer subscription credentials through their product. That makes Claude Code suitable as one optional provider behind a ZD-owned abstraction, but risky as the abstraction itself.

Claude Desktop now overlaps heavily with the desired ZD workspace—parallel sessions, automatic Git worktrees, an integrated terminal and file editor, visual diffs, previews, computer use, scheduled tasks, connectors, and local/SSH/cloud environments. It is useful as a benchmark and perhaps a companion. The official documentation does not expose a stable protocol for replacing or deeply extending its project, editor, objective, or state-machine UI, and does not document the exact global drop-down overlay workflow ZD wants.

**Recommendation:** support Claude Code through the Agent SDK or `claude -p` adapter, keep ZD's projects, goals, tasks, approvals, terminal/editor/browser UI, and canonical session metadata outside Claude, and do not make Claude-specific session or configuration formats ZD's domain model.

## What the product is now

Claude Code is no longer only a terminal application. Anthropic documents it across the CLI, VS Code, JetBrains, Desktop, web, mobile, CI integrations, and a Python/TypeScript Agent SDK ([overview](https://code.claude.com/docs/en/overview), [platforms](https://code.claude.com/docs/en/platforms)).

| Surface | What it provides | Relevance to ZD |
| --- | --- | --- |
| Interactive CLI | Full agent loop, commands, permissions, sessions, tools | Excellent reference UI and immediate fallback |
| `claude -p` | Non-interactive text, JSON, or streaming JSON with exit codes and session IDs | Lowest-cost prototype adapter |
| Agent SDK | Python and TypeScript APIs, streaming messages, callbacks, sessions, approvals, custom tools, hooks, subagents | Best supported embedding route |
| Desktop Code tab | Parallel worktrees, terminal, editor, diffs, preview, local/SSH/cloud sessions | Strong product benchmark; not a ZD extension host |
| Web/cloud | Persistent remote tasks and multi-repository cloud sessions | Optional delegation surface, not ZD-owned runtime |
| Remote Control/mobile | Steer a local CLI session from web/mobile while execution remains local | Useful model for remote steering and notifications |

## CLI and headless operation

The interactive CLI is the richest native surface. Its command line supports project directories, model selection, permission modes, session continuation/resumption, worktrees, MCP configuration, custom agents, plugin directories, system prompt changes, structured output, and non-interactive use ([CLI reference](https://code.claude.com/docs/en/cli-reference)).

For automation, `claude -p` is a real machine interface rather than merely captured TUI output:

- `text`, `json`, and newline-delimited `stream-json` output;
- stable process success/failure behavior;
- JSON Schema-constrained results;
- incremental assistant, tool, and nested-subagent messages;
- an initialization event containing the model, tools, MCP servers, plugins, errors, capabilities, and session ID;
- `--continue` and `--resume <session-id>`;
- per-run allowed tools, permission mode, settings, MCP configuration, plugins, agents, and system prompt controls.

The official [programmatic-use guide](https://code.claude.com/docs/en/headless) recommends `--bare` for reproducible scripts and SDK calls. Bare mode skips ambient hooks, skills, plugins, MCP servers, auto-memory, `CLAUDE.md`, OAuth credentials, and the keychain; the caller must pass intended context explicitly and use an API key or provider credentials. This is particularly attractive for a ZD subprocess adapter because it prevents a user's unrelated global configuration from silently changing orchestration behavior.

Limitations of the subprocess route:

- ZD must parse and version-tolerate the event stream.
- Interactive approvals and clarifying questions require more plumbing than a one-shot command.
- The child process remains the owner of the agent loop and transcript format.
- Long-lived, concurrent sessions need process supervision, cancellation, backpressure, and cleanup.
- A local subscriber's successful `claude` login is not automatically valid for an embedded product's authentication model.

## Agent SDK and embedding architecture

Anthropic describes the Agent SDK as the same tools, agent loop, and context management that power Claude Code ([SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)). It ships for Python and TypeScript and runs a Claude Code subprocess under the host. The host can:

- stream native message objects and partial output;
- set system prompts and Claude Code presets;
- select built-in and custom tools;
- provide in-process custom tools through an MCP server;
- intercept tool use with hooks;
- surface and answer approval or user-input requests;
- constrain permissions declaratively;
- create subagents and load skills/plugins;
- enable file checkpointing;
- receive token/cost data and OpenTelemetry;
- resume, continue, or fork sessions;
- mirror session transcripts to external storage.

The deployment guide is unusually candid: the SDK is a subprocess architecture, and production hosts must solve isolation, lifecycle, session persistence, scaling, and multi-tenancy ([hosting](https://code.claude.com/docs/en/agent-sdk/hosting), [secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment)). That is work ZD would own regardless of SDK ergonomics.

### What ZD should own

ZD should persist its own stable record around each Claude session:

- ZD project/workspace ID;
- objective, task, and state-machine node IDs;
- provider and harness adapter version;
- Claude session ID as an opaque foreign key;
- working directory/worktree and branch;
- effective model and permission policy;
- normalized event log and artifacts;
- approval requests and decisions;
- cost/usage observations;
- terminal/process lifecycle.

That lets a ZD task survive loss of a Claude transcript, migrate to a different harness, or hand work from Claude to another agent without pretending the underlying histories are portable.

## Sessions and state

Interactive sessions can be named, listed, resumed, continued, forked, exported, and associated with pull requests. Transcripts are stored locally, but the Desktop app, web app, and VS Code extension maintain separate histories ([session management](https://code.claude.com/docs/en/sessions)). This fragmentation matters: “Claude session” is not one globally consistent object across every surface.

The SDK supports `resume`, `continue`, and `fork`, and its session-storage hooks can mirror transcripts into S3, Redis, or another backend so a different host can restore a run ([SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions), [external session storage](https://code.claude.com/docs/en/agent-sdk/session-storage)). Checkpointing records a checkpoint at every user prompt and can rewind conversation state and Claude-made file edits ([checkpointing](https://code.claude.com/docs/en/checkpointing)).

These are useful capabilities, but they are not a replacement for ZD's objective/task graph. A model transcript is an execution trace; an objective system is durable product state. ZD should link them rather than merge them.

## Tools and extensibility

Claude Code has a broad, coherent extension stack:

- **`CLAUDE.md` and memory:** persistent repository or user guidance.
- **Skills:** on-demand instructions and bundled resources; less context overhead than loading every workflow at startup ([skills](https://code.claude.com/docs/en/skills)).
- **Subagents and teams:** separate contexts, parallel work, worktree isolation, and higher-order orchestration ([agents](https://code.claude.com/docs/en/agents), [agent teams](https://code.claude.com/docs/en/agent-teams)).
- **MCP:** local stdio and remote servers, OAuth, tool search, resources, prompts, and organization controls ([MCP](https://code.claude.com/docs/en/mcp)).
- **Plugins:** packages of skills, agents, hooks, and MCP servers, distributable through marketplaces ([plugins](https://code.claude.com/docs/en/plugins)).
- **Hooks:** deterministic command, HTTP, prompt, agent, and MCP-tool hooks around session, prompt, tool, compaction, notification, subagent, task, and stop events ([hooks guide](https://code.claude.com/docs/en/hooks-guide), [reference](https://code.claude.com/docs/en/hooks)).
- **Channels and schedules:** external events can enter a running session through MCP channels, while `/loop`, cron tools, Desktop schedules, cloud routines, and goals cover recurring or persistent work ([channels](https://code.claude.com/docs/en/channels), [scheduled tasks](https://code.claude.com/docs/en/scheduled-tasks), [goals](https://code.claude.com/docs/en/goal)).

For ZD, MCP and skills are the most portable investments. Hooks and plugin packaging are valuable but harness-specific; ZD should normalize its own lifecycle events and generate Claude hook/plugin configuration at the edge.

## Desktop and browser fit

Claude Desktop's Code tab now provides much of the generic workstation shell the source notes describe: a project/session sidebar, automatic Git worktrees, drag-and-drop panes, integrated terminal, file editor, preview, visual diff review, side chats, local/SSH/cloud execution, computer use, connectors, scheduled tasks, and PR monitoring ([Desktop](https://code.claude.com/docs/en/desktop)). Chrome integration can test and inspect web apps from a coding session ([Chrome](https://code.claude.com/docs/en/chrome)). Remote Control keeps the agent local while web or mobile clients steer the live session over outbound TLS ([Remote Control](https://code.claude.com/docs/en/remote-control)).

This is close to ZD's desired *generic* shell but not its core differentiation:

- no documented extension point for replacing the editor with ZD's Markdown editor;
- no documented way to install ZD's goal/objective/state-machine UI as a first-class Desktop pane;
- no official embedded-client protocol comparable to a general app server;
- no documented always-on-top global project switcher with the exact summon/dismiss behavior in the source notes;
- Desktop scripting/automation is explicitly less capable than the CLI/SDK.

Building ZD “on top of Desktop” would therefore mean loose interoperation, not owning the experience.

## Security and permissions

Claude Code defaults to read-only access within the working directory and asks before file modifications or non-read-only shell commands. It supports manual/default, accept-edits, plan, auto, `dontAsk`, and bypass modes; allow/ask/deny rules can scope Bash, files, web domains, MCP tools, and subagents. Rules are enforced by the client, not by model instructions ([permissions](https://code.claude.com/docs/en/permissions)).

The Bash sandbox adds OS-level filesystem and network isolation. The security documentation calls out important boundaries:

- write access is constrained to the working directory unless extended;
- network commands do not auto-approve by default;
- first-use workspace and MCP trust prompts exist, but workspace trust is disabled in `-p` mode;
- cloud sessions use isolated VMs, restricted egress, scoped Git credentials, branch restrictions, logging, and cleanup;
- Remote Control is not cloud isolation—execution and file access remain on the local machine;
- third-party MCP servers are not security-audited or managed by Anthropic merely because they use MCP;
- bypass mode belongs only inside a container or VM.

ZD must not treat Claude permissions as its only security layer. The host should also enforce process isolation, filesystem mounts, network egress, secret injection, tenancy, and explicit approval policy. In particular, a denied model tool can sometimes be reached indirectly through an allowed shell command unless the OS sandbox closes the path.

## Model and provider lock-in

Claude Code can send requests through Anthropic, Amazon Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, Microsoft Foundry, or gateways/proxies ([enterprise deployment](https://code.claude.com/docs/en/third-party-integrations)). That provides billing, identity, residency, and infrastructure choice.

It does **not** provide model-family neutrality. Model configuration accepts Anthropic model names or provider-specific deployment identifiers for Claude models, and the aliases resolve to Claude Fable, Opus, Sonnet, and Haiku variants ([model configuration](https://code.claude.com/docs/en/model-config)). A base URL changes routing, not the model contract. There is no official path for running the Claude Code harness against GPT, Gemini, Mistral, or a local open-weight model.

This is the central reason not to let the Agent SDK become ZD's public agent interface. ZD should define its own concepts—turns, tool events, diffs, approvals, plans, usage, checkpoints—and translate Claude messages into them.

## Pricing, authentication, and licensing

As of the research date, Claude Code is included with Claude Pro ($20 monthly, or $17/month with annual billing), Max (from $100/month), Team ($20/seat/month annual for Standard or $100 annual for Premium), and Enterprise; API use is token-priced. Prices and limits change, so [Anthropic's pricing page](https://claude.com/pricing) remains authoritative.

Anthropic reports that enterprise API deployments average roughly $13 per active developer-day and $150–250 per developer-month, while emphasizing that model, codebase size, context, concurrency, and automation make actual spend highly variable ([cost management](https://code.claude.com/docs/en/costs)). Treat those as vendor observations, not a ZD budget forecast.

The authentication boundary is more important than the sticker price. Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance) says:

- consumer OAuth is for native Claude subscription use;
- developers building products or services with Claude capabilities should use Claude Console API keys or supported cloud-provider authentication;
- a third-party developer may not offer Claude.ai login or route Free/Pro/Max credentials on behalf of users;
- usage is governed by Consumer Terms for Free/Pro/Max and Commercial Terms for Team, Enterprise, and API users.

Claude Code itself is proprietary: its [official repository license](https://github.com/anthropics/claude-code/blob/main/LICENSE.md) states that all rights are reserved and use is subject to Anthropic's Commercial Terms. Embedding ZD with the Agent SDK therefore needs a licensing/terms review before distribution, especially because the [official SDK package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) bundles a native Claude Code binary. “The package is publicly downloadable” should not be interpreted as “the harness is open source.”

## ZD fit matrix

Scores are qualitative: 1 = poor, 5 = strong.

| ZD need | Score | Assessment |
| --- | ---: | --- |
| Fast local CLI integration | 5 | `claude -p` provides structured and streaming automation immediately |
| Deep programmatic embedding | 4 | SDK is broad and production-oriented, but subprocess/proprietary and no public rich-client protocol |
| Session resume and branching | 5 | Resume, continue, fork, checkpoints, external transcript storage |
| Approval UX integration | 4 | SDK callbacks and permission rules are capable; ZD still owns host isolation |
| Tools and ecosystem | 5 | MCP, skills, plugins, hooks, subagents, channels, Git integrations |
| ZD goal/state-machine ownership | 3 | Hooks and goals help, but ZD must keep its own canonical graph |
| Terminal/editor/browser shell | 4 | Desktop is broad, but its panes are not a documented extension surface for ZD |
| Global summon/project switcher | 2 | Remote/mobile are strong; exact overlay behavior is not documented |
| Provider/model neutrality | 1 | Multiple inference hosts, one model family |
| Open-source/forkability | 1 | Proprietary harness and commercial terms |
| Enterprise security controls | 5 | Managed permissions, sandbox, cloud isolation, gateways, telemetry, provider choice |
| Cost predictability for embedded use | 3 | Good telemetry, but API agent loops and concurrency vary substantially |

## Pros

- Mature agent behavior and broad tool surface without ZD implementing an agent loop.
- Excellent structured headless mode for a quick adapter.
- Python and TypeScript SDKs with streaming, approvals, custom tools, checkpointing, and observability.
- Strong session continuation, branching, worktree, and remote-work stories.
- Deep MCP, skills, plugin, hook, and subagent ecosystem.
- Strong permission configuration and multiple isolation options.
- Desktop is a valuable reference for parallel-agent workspace UX.

## Cons

- Claude-only model family despite multiple cloud deployment routes.
- Proprietary binary and terms-governed SDK distribution.
- Consumer subscription authentication cannot simply be brokered through ZD.
- No documented stable rich-client/app-server protocol; SDK is the supported integration boundary.
- Desktop is not a documented host for ZD-specific editor, goal, or graph panels.
- Session histories differ across native surfaces.
- Product surface and defaults evolve quickly, increasing adapter maintenance.

## Principal risks

1. **Terms risk:** a prototype that reuses personal OAuth may work technically but be unsuitable to ship.
2. **Architecture capture:** mapping ZD's domain directly to Claude sessions, hooks, or tasks would make another harness expensive to support.
3. **Security composition:** Claude permissions do not replace OS/container/network controls owned by ZD.
4. **Protocol churn:** SDK event types, subprocess behavior, and native features change frequently.
5. **Cost amplification:** parallel subagents, long contexts, MCP results, and always-on automations can multiply token spend.
6. **Desktop mirage:** the native app resembles the desired workspace but lacks documented extension points for ZD's differentiators.

## Evidence gaps to close with a spike

- Exact redistribution terms for each Python/TypeScript SDK artifact and its bundled binary.
- Whether ZD's intended personal-only distribution model changes the authentication analysis.
- Real cancellation, crash recovery, and backpressure behavior under several simultaneous SDK sessions.
- Fidelity of SDK checkpoints when users or other agents edit the same files concurrently.
- Stable identifiers and event ordering across SDK upgrades.
- Actual token/cost profile on representative ZD tasks, including subagents and MCP.
- Whether Desktop exposes any supported URL scheme or automation beyond documented “continue in Desktop” behavior that helps global summon/switch flows.

## Recommended ZD experiment

Build one narrow `ClaudeHarness` adapter, not a Claude-based architecture:

1. Spawn the Agent SDK in a per-task process or container with explicit cwd, environment, tools, model, and policy.
2. Normalize SDK events into ZD-owned `message`, `plan`, `tool_call`, `tool_result`, `diff`, `approval`, `usage`, and `terminal` events.
3. Persist the Claude session ID only as an opaque resume token.
4. Route all custom ZD actions through MCP or in-process SDK tools with ZD-owned authorization.
5. Test start, stream, steer, approve, cancel, resume after host restart, fork, and budget exhaustion.
6. Run the same task through at least one non-Claude harness to prove the ZD event model is not Claude-shaped.

Pass the experiment only if the adapter stays thin and the objective/task graph remains fully meaningful without a Claude transcript.

## Primary sources

- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [Programmatic/headless use](https://code.claude.com/docs/en/headless)
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK sessions](https://code.claude.com/docs/en/agent-sdk/sessions)
- [Agent SDK hosting](https://code.claude.com/docs/en/agent-sdk/hosting)
- [Desktop](https://code.claude.com/docs/en/desktop)
- [Session management](https://code.claude.com/docs/en/sessions)
- [Permissions](https://code.claude.com/docs/en/permissions)
- [Security](https://code.claude.com/docs/en/security)
- [Model configuration](https://code.claude.com/docs/en/model-config)
- [Enterprise deployment](https://code.claude.com/docs/en/third-party-integrations)
- [Pricing](https://claude.com/pricing)
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [Claude Code license](https://github.com/anthropics/claude-code/blob/main/LICENSE.md)
- [Claude Agent SDK package](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
