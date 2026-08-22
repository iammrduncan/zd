# Warp as a substrate for ZD

Research date: 2026-08-11. Sources are Warp's current documentation, public roadmap, source repository, and product announcements. Product claims are identified as such; anything not established by those sources is called out as an evidence gap.

## Bottom line

Warp is the strongest **workbench** candidate in this set of ideas, but it is not yet an extension host capable of absorbing ZD.

It already solves much of the interaction loop described in `thoughts.txt`: a real global Quake-style hotkey window on macOS; `Cmd-1` through `Cmd-8` tab switching; terminal, lightweight code editing, Markdown editing/rendering, panes, worktrees, reusable project startup layouts, agent status, code review, and remote steering. Most importantly, Warp's current third-party-agent support explicitly recognizes both **Pi and Hermes**, as well as Codex, Claude Code, OpenCode, Gemini CLI, and others. Pi and Hermes get rich input, code-review comments, context attachment, vertical-tab metadata, Tab Configs, and Remote Control; they do not yet get agent notifications. ([Global Hotkey](https://docs.warp.dev/terminal/windows/global-hotkey/), [keyboard shortcuts](https://docs.warp.dev/getting-started/keyboard-shortcuts/), [third-party CLI agents](https://docs.warp.dev/agents/cli-agents/overview/))

The limiting fact is architectural: current Tab Config panes can be `terminal`, `agent`, or `cloud`, while the public roadmap still describes a first-class **Project primitive**, a general client-control CLI, and Agent Client Protocol support as future work. Warp documents MCP as a way to add tools and data to its agent, not arbitrary native UI panels. There is no documented stable plugin SDK for embedding ZD's custom Markdown editor, goal/task views, state-machine graphs, or a general interactive browser. The client is now open source, so all of that is technically forkable, but a fork is a product-maintenance commitment rather than an extension. ([Tab Configs](https://docs.warp.dev/terminal/windows/tab-configs/), [May–June 2026 roadmap](https://github.com/warpdotdev/warp/issues/9233), [MCP](https://docs.warp.dev/agents/capabilities/mcp/), [source and licensing](https://github.com/warpdotdev/warp))

**Verdict:** use Warp as an optional ZD shell and integration target now; do not make Warp the owner of ZD's product model or custom UI. The lowest-risk direction is a two-layer design: keep ZD's state and workflows filesystem-/CLI-owned and portable, then add a small Warp adapter made of Tab Configs, deep links, repo skills/rules, and possibly an MCP server. Continue the standalone ZD UI for the parts Warp cannot host. Revisit deeper embedding only after Warp ships an upgrade-stable UI extension boundary or the project/CLI/ACP primitives mature.

## What Warp is now

Warp has moved well beyond “terminal emulator.” Its current product has four overlapping layers:

1. **Local workbench:** terminal blocks, tabs/panes, a file tree, lightweight editor, Markdown viewer, code review, Git/worktree awareness, local agent conversations, and third-party agent TUIs.
2. **Reusable setup:** Tab Config TOML, settings/keybinding files, themes, shell workflows, repository rules, and agent skills.
3. **Cloud collaboration:** Warp Drive, conversation sync, session sharing, third-party-agent Remote Control, and browser/mobile viewing.
4. **Oz agent platform:** local and cloud agent execution, schedules/integrations, environments, profiles, MCP, CLI, REST API, and Python/TypeScript SDKs.

These layers have different portability, privacy, and licensing properties. The terminal/editor client can be used offline after first launch. Warp Drive, Warp Agent, MCP, teams, sharing, and other cloud features require a connection. Oz's API and SDK program cloud-agent runs; they are not a general desktop-automation API. ([offline behavior](https://docs.warp.dev/support-and-community/troubleshooting-and-support/using-warp-offline/), [Oz API/SDK quickstart](https://docs.warp.dev/reference/api-and-sdk/quickstart/))

## Fit against the desired interaction

| Need from `thoughts.txt` | Fit | What Warp provides | Important limitation |
|---|---:|---|---|
| Global summon/dismiss from any Mac screen | **High** | Dedicated global-hotkey window with position, display, relative size, auto-hide, and stay-on-top behavior | `Cmd-tilde` and several other macOS shortcuts must first be unbound from the OS; multi-Space/display behavior still deserves a real-machine test |
| `Cmd-1`, `Cmd-2`, `Cmd-3` switching | **High for tabs** | Native shortcuts select tabs 1–8; `Cmd-9` selects the last tab | These are tabs, not durable project workspaces; “one project = one tab” is a convention, not a first-class project model |
| Project holds editor(s), terminal(s), and agents | **Medium** | Tab Configs open a directory, shell, startup commands, split layout, theme, parameters, worktree, and terminal/agent/cloud panes | Config schema cannot declare a native editor or browser pane; first-class Project is still on the public roadmap |
| Rapid overview of multiple active agents | **High** | Vertical tabs show directory, branch/worktree, diff/PR information, agent state, and unread activity; tabs/panes are searchable and draggable | Status quality varies by harness; Pi and Hermes lack notifications today |
| Markdown editor | **Medium–High** | Local Markdown opens in the built-in editor or rendered viewer; split edit/view, Mermaid rendering, and runnable fenced shell commands are supported | This is Warp's editor, not ZD's custom Markdown experience; remote Markdown files are not supported in the viewer |
| General code editor | **Medium** | File tree, tabs, syntax highlighting, find/replace, shared buffers, Vim mode, and LSP features | Warp itself describes the editor as suited to quick, in-context edits, not a complete IDE replacement; LSP/language coverage and Vim customization are narrower than Zed/Neovim |
| Terminal | **High** | Mature terminal, panes, tabs, blocks, full-screen apps, mouse reporting, and Kitty keyboard protocol | Warp's shell integration/block model can differ from traditional terminals; validate the exact TUIs and shell setup used by ZD |
| Pi and Hermes harnesses | **High locally** | Both are explicitly auto-detected and receive rich input, code review, context attachment, metadata, Tab Configs, and Remote Control | Neither receives Warp agent notifications; Oz cloud multi-harness documentation clearly names Warp Agent, Codex, and Claude Code, not Pi/Hermes |
| Browser beside editor/terminal | **Low** | Warp agents can use web search; cloud Computer Use environments include Chromium and Playwright; shared sessions can be viewed in a web browser | No documented user-facing general browser pane in the desktop workspace. Cloud-agent Chromium is inside the agent's sandbox, not the developer's embedded browser |
| ZD to-do, goal, objective, and graph UI | **Low** | Files can be edited; Warp has plans/task lists, skills, rules, Workflows, notebooks, MCP, and the Oz API | No documented arbitrary panel/UI extension API or custom graph renderer. Warp's plan/task objects are not a replacement for ZD's domain model |
| Keep the system ecosystem-neutral | **Medium** | Client is AGPL; UI framework is MIT; AGENTS.md, skills, MCP, shell commands, and local files are portable seams | Tab Configs, Warp Drive objects, Remote Control, and Oz APIs are Warp-specific; cloud orchestration/server components are not part of the open client repo |
| Work offline/local-first | **Medium** | Core terminal and local files work offline after one online initialization; login is optional | Warp Agent, MCP, Drive, sharing, and other cloud features stop offline; even logged-out initialization creates an anonymous unique ID |

## Global hotkey and project switching

Warp is unusually aligned with the desired summon/steer/dismiss loop. Its dedicated hotkey window is explicitly a Quake-style window; on macOS it can be sized relative to the active screen, pinned to a configured position/display, auto-hidden when focus is lost, or kept above other windows. Warp also supports a separate global action to show/hide all Warp windows. macOS Accessibility permission may be required. ([Global Hotkey](https://docs.warp.dev/terminal/windows/global-hotkey/))

Inside that window, the desired numeric switching already exists for tabs. Vertical tabs materially improve the agent use case: each pane can expose the working directory, Git branch/worktree, diff stats, PR badge, conversation/command, agent status, and unread activity. Search can filter by title, directory, branch, PR, or diff. ([Vertical Tabs](https://docs.warp.dev/terminal/windows/vertical-tabs/), [Tabs](https://docs.warp.dev/terminal/windows/tabs/))

The distinction to preserve is **tab versus project**:

- A Tab Config is a reusable *single-tab* TOML layout. It can create splits and launch commands in a chosen repo or newly generated worktree.
- Legacy Launch Configurations can restore multiple windows, tabs, and panes, but Warp now labels them legacy and recommends Tab Configs for new setups.
- Warp's public roadmap still says it intends to introduce a Project primitive. That is strong primary evidence that today's tabs/directories/worktrees are not the complete multi-project abstraction ZD wants.

A reasonable adapter can enforce “one project per Warp tab,” title/color it, and launch the ZD CLI plus Pi or Hermes. It should not pretend that Warp already preserves a nested project workspace containing an arbitrary set of native editor and browser views.

One keybinding collision needs a hands-on spike: `Cmd-T` is Warp's default “new tab” action. If it is also chosen as the global show/hide key, behavior while Warp is focused may not match the desired “same chord closes the overlay.” The docs prove both actions are configurable, but not their precedence in this exact collision.

## Editor, terminal, and browser surfaces

### Markdown and code

Warp's Markdown story is better than a terminal-only integration: local `.md`/`.markdown` files can be edited or rendered in a split pane, the viewer renders Mermaid diagrams, and fenced shell commands can be inserted into the active terminal. ([Markdown Viewer](https://docs.warp.dev/terminal/more-features/markdown-viewer/))

The code editor includes a file tree, grouped file tabs, syntax highlighting, find/replace, shared buffers, Vim bindings, and selected LSP functions. Warp's own documentation frames it as a tool for “quick, in-flow edits” such as a rename or short rewrite. That framing matters: it is a credible review/steering editor but not evidence that it can replace the richer editor ZD is building. ([Built-in Code Editor](https://docs.warp.dev/code/code-editor/))

Full-screen terminal applications remain a viable escape hatch. Warp documents Vim, Neovim, Emacs, tmux, Helix, mouse reporting, and the Kitty keyboard protocol. That means a ZD TUI, Neovim, Pi, or Hermes can occupy a pane without needing a native plugin. ([Full-screen apps](https://docs.warp.dev/terminal/more-features/full-screen-apps/))

### Browser

There are three browser-adjacent capabilities, none of which is the requested in-workspace browser:

- Warp Agent can perform web search.
- Cloud Computer Use environments ship with Chromium and Playwright for an **agent** to test or browse inside its sandbox.
- Remote Control publishes an agent terminal session to a web/mobile viewer for monitoring and steering.

The current desktop documentation does not expose a general browser pane alongside terminals and editors. The bundled Chromium documentation explicitly places the browser in the cloud Computer Use environment. Therefore browser integration remains an unsolved part of the ZD cockpit, not a reason by itself to adopt Warp. ([Browser use](https://docs.warp.dev/agents/capabilities/computer-use/browser-use/), [Remote Control](https://docs.warp.dev/agents/cli-agents/remote-control/))

## Extension, API, CLI, and MCP surface

### Useful stable-ish seams today

- **Tab Config TOML:** directory, shell, startup commands, splits, themes, repo/branch/text parameters, generated worktrees, and `warp://tab_config/...` deep links. This is the best place for a small ZD adapter. ([Tab Configs](https://docs.warp.dev/terminal/windows/tab-configs/))
- **Repo files:** `AGENTS.md`, portable skill directories such as `.agents/skills/`, project MCP config, YAML workflows, and ordinary executable scripts. Warp deliberately reads several cross-harness conventions. ([Rules](https://docs.warp.dev/agents/capabilities/rules/), [Skills](https://docs.warp.dev/agents/capabilities/skills/), [MCP](https://docs.warp.dev/agents/capabilities/mcp/))
- **MCP:** local command servers or HTTP/SSE servers can expose ZD data and actions to Warp Agent. Project-scoped servers require explicit approval and do not auto-start, which is a sensible trust boundary.
- **Oz CLI/API/SDK:** create and monitor local/cloud agent runs; connect schedules, integrations, environments, skills, profiles, and MCP. The REST API returns run IDs and session links; official Python and TypeScript SDKs wrap it.
- **Open client source:** most of the client is AGPLv3; the `warpui_core` and `warpui` crates are MIT. A feature can be contributed upstream or carried in a fork. ([Warp repository](https://github.com/warpdotdev/warp))

### What is not a stable extension boundary

No current official documentation describes a VS Code-like plugin host, arbitrary custom panes, embedded webviews, or a supported UI component SDK for third parties. The “Terminal Integrations” page documents integrations with Docker, Raycast, VS Code, and JetBrains, not a general plugin authoring API. MCP extends *agent tools and data*, not the desktop's view hierarchy. ([Terminal Integrations](https://docs.warp.dev/terminal/integrations-and-plugins/))

The public roadmap is revealing: “control all aspects of the Warp client app via CLI” remains a community-driver item, and ACP plus the Project primitive were still roadmap work. The client being open source reduces existential and audit lock-in, but it does not make internal Rust APIs stable. A ZD-native pane implemented by patching Warp would track a fast-moving upstream and take on AGPL/distribution review if shipped. That is a fork strategy, not a lightweight ecosystem extension.

## Agent harness integration

### Local interactive harnesses

This is Warp's strongest differentiator for ZD. The official page updated on the research date lists Pi and Hermes as supported agents. Both receive:

- the rich input editor;
- comments sent from Warp's code-review surface;
- selected code/files attached as context;
- vertical-tab identity and metadata;
- Tab Config startup integration; and
- Remote Control for browser/mobile monitoring and steering.

They do **not** currently receive native agent notifications. Claude Code, Codex, and OpenCode do. The prudent assumption is therefore that Pi/Hermes need visual status polling or their own notification hooks until Warp documents parity. ([Third-party CLI agents](https://docs.warp.dev/agents/cli-agents/overview/))

Remote Control is powerful but cloud-coupled: publishing uploads session state, terminal activity, tool use, and subsequent output; a link can grant view or edit/approval access. It should be opt-in and treated as sensitive. ([Remote Control](https://docs.warp.dev/agents/cli-agents/remote-control/))

### Oz cloud harnesses

Oz is a credible orchestration API, not just a bundled model chooser. Warp documents CLI, REST, Python/TypeScript SDKs, environments, API keys, schedules, integrations, auditability, and both Warp-hosted and Enterprise self-hosted execution. In May 2026 Warp announced cloud multi-harness support for Warp Agent, Claude Code, and Codex, with automatic multi-agent orchestration in beta and cross-harness memory in research preview. ([multi-harness announcement](https://www.warp.dev/blog/multi-harness-cloud-agent-orchestration), [Oz overview](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents), [architecture/deployment](https://docs.warp.dev/enterprise/enterprise-features/architecture-and-deployment/))

Do not collapse desktop recognition and Oz harness support into one claim. The sources prove Pi/Hermes are first-class *inside the Warp terminal*. They do not yet prove Pi/Hermes can be selected as managed Oz cloud harnesses. Warp's pricing page says “use any harness in the cloud (beta),” but the detailed multi-harness announcement names only three. This needs product testing or written confirmation before ZD depends on it.

ZD's own goals/tasks/state machines can be exposed to any harness through files, skills, CLI commands, or MCP without surrendering ownership to Oz. That seam is far safer than rebuilding ZD's state model as Warp Drive objects.

## Data, privacy, and cloud dependency

The practical privacy model is mixed, not simply “local” or “cloud”:

- Core terminal and local-file features work offline after the first online initialization. Login is optional, but first launch creates a unique ID, including for logged-out anonymous use.
- Warp Agent, MCP, Warp Drive, teams, session/block sharing, and other cloud features are unavailable offline.
- Warp says users can inspect the open client, view a live Network Log, and control telemetry. Its current privacy page also says **Free-plan AI requires telemetry to remain enabled**, while paid plans can disable it and continue using AI.
- Business and Enterprise receive Warp's ZDR treatment for AI interaction/console data. Separately, Warp states that contracted LLM providers operate under ZDR. Cloud conversation storage and Oz run transcripts may still be stored by Warp as product data; provider ZDR does not mean every Warp cloud artifact is ephemeral.
- Local conversation history is stored on-device by default; optional cloud sync enables cross-device access/sharing. Cloud-agent conversations are always cloud-stored. ([Privacy and data control](https://docs.warp.dev/support-and-community/privacy-and-security/privacy/), [conversation storage](https://docs.warp.dev/agent-platform/local-agents/interacting-with-agents), [offline behavior](https://docs.warp.dev/support-and-community/troubleshooting-and-support/using-warp-offline/))

Self-hosted Oz execution is Enterprise-only. Even there, Warp documents a split architecture: execution and source checkout can stay in customer infrastructure, but orchestration, observability, LLM routing, prompt context, and transcripts still transit Warp's control plane under its ZDR agreements. That is not a fully disconnected/self-hosted stack. ([Architecture and deployment](https://docs.warp.dev/enterprise/enterprise-features/architecture-and-deployment/))

For ZD, the clean boundary is: keep objectives, task state, graph definitions, and durable agent memory in local/versioned ZD storage; make cloud publishing and Oz orchestration optional adapters. Also account for each third-party harness's own provider/data behavior—running Hermes or Pi in Warp does not cause Warp's privacy terms to replace the harness/model provider's terms.

## Pricing, licensing, and maturity

### Pricing as of 2026-08-11

- **Free:** $0; core terminal, Warp Agent CLI, bring-your-own inference, limited cloud agents, limited Warp Drive/collaboration/storage, and beta multi-harness cloud use.
- **Build:** $20 monthly or $18/month billed annually; 1,500 included credits, fuller Warp Agent/cloud access, highest indexing limits, unlimited Drive/collaboration and cloud conversation storage.
- **Max:** $200 monthly or $180/month billed annually; 18,000 credits.
- **Business:** $50/user monthly or $45/user/month annually; team controls, SSO, and 1,500 credits per seat.
- **Enterprise:** custom pricing; includes self-hosted cloud-agent execution, enterprise governance, and routing inference through the customer's cloud.

Agent credit consumption is variable and non-deterministic with model, context size, tool calls, and task complexity. Therefore monthly plan price is not a dependable ceiling for heavy Oz use. ([Pricing](https://www.warp.dev/pricing), [Credits](https://docs.warp.dev/support-and-community/plans-and-billing/credits/))

### Licensing and maturity

Warp was launched as a terminal years ago and is a mature daily-use product by startup-tool standards. Warp says the app is used by nearly a million active developers, its organization says it targets weekly releases, and the product spans macOS, Linux, and Windows. Those are vendor claims, not independent reliability measurements. ([open-source announcement](https://www.warp.dev/blog/warp-is-now-open-source), [Warp GitHub organization](https://github.com/warpdotdev))

The licensing position improved substantially in April 2026: the client source is public, most code is AGPLv3, and the UI framework crates are MIT. This improves auditability, survivability, and the possibility of upstream contributions. It does **not** open-source the whole Warp/Oz cloud service. ([Warp repository](https://github.com/warpdotdev/warp))

Maturity is uneven across layers:

- **Terminal/hotkey/tabs:** mature and directly usable.
- **Editor/Markdown/code review:** shipping, but deliberately lighter than a full editor.
- **Universal agent support:** broad and shipping, with uneven features per harness.
- **Tab Configs/vertical tabs/settings files:** current and promising, but very new.
- **Oz multi-harness orchestration:** beta; cross-harness memory is research preview.
- **Native Project, ACP, full client CLI:** public roadmap rather than a safe dependency.

Rapid naming/schema churn is visible: `warp-cli` became `oz`; Launch Configurations became legacy in favor of Tab Configs; Warp's client only recently became open source. This is a healthy sign of investment and a warning against coupling ZD to undocumented internals.

## Pros

- Best match to the requested macOS global summon/dismiss interaction.
- Removes the need for ZD to own terminal emulation, PTYs, alternate-screen behavior, tab/pane management, rendering performance, and much keyboard plumbing.
- Pi and Hermes are explicitly supported today, including remote steering and review-oriented UX.
- Vertical tabs expose agent/worktree state unusually well for multi-agent development.
- Markdown edit/render and lightweight code editing are already integrated with terminal output and agent diffs.
- Tab Configs are local, inspectable TOML and can launch a ZD CLI/TUI with reproducible per-project layouts.
- Repo-level `AGENTS.md`, skills, MCP, and scripts align with a portable, harness-neutral ZD core.
- Open-source client reduces audit and abandonment risk; an upstream contribution path exists.
- Oz offers a serious optional route to background automation, APIs, schedules, remote steering, and self-hosted execution for enterprises.

## Cons

- No documented stable plugin/UI extension system for ZD's custom editor, dashboards, graph views, or embedded browser.
- The durable project/workspace model ZD wants is not first-class yet; Tab Configs are single-tab launch recipes.
- Built-in editor is intentionally lightweight and cannot simply adopt ZD's current Markdown editor behavior.
- No general desktop browser pane; agent-side Chromium does not solve developer-side context consolidation.
- Pi and Hermes lack agent notifications, and their Oz cloud-harness status is not established.
- Many differentiating features require Warp cloud services; the Free plan's AI requires telemetry enabled.
- Remote Control and cloud runs deliberately upload sensitive session/transcript data.
- Self-hosted execution is Enterprise-only and still depends on Warp's hosted control plane.
- Credit pricing is variable; cloud-heavy orchestration makes costs less predictable than local CLI harnesses.
- Open source invites a fork, but a fork would inherit a large Rust desktop product, upstream merge work, release/signing burden, and AGPL compliance considerations.

## Lock-in analysis

### Low-lock-in seams

- ZD data in ordinary Markdown/JSON/SQLite files.
- ZD CLI/TUI invoked in a normal terminal pane.
- `AGENTS.md` and `.agents/skills/` kept repository-owned.
- MCP exposed by ZD using the open protocol, with Warp as one client.
- Project launch intent generated from a ZD-owned manifest into Warp Tab Config TOML.

### Medium-lock-in seams

- Depending on Warp's recognition/toolbelt metadata for Pi/Hermes.
- Using `warp://` deep links and Tab Config schema as the only project launcher.
- Treating Warp's built-in editor or code-review surface as required for core workflows.
- Storing notebooks, plans, prompts, or workflows primarily in Warp Drive, even though some export formats exist.

### High-lock-in seams

- Making Oz run IDs, credits, environments, or cloud transcripts the canonical ZD task model.
- Depending on Warp cloud Remote Control as the only way to steer agents.
- Patching internal client code for custom ZD panes without an upstream/stable extension contract.
- Building product behavior around roadmap features before they ship and stabilize.

The adapter should be disposable: ZD generates Warp config, but Warp config never becomes ZD's source of truth.

## Evidence gaps and tests worth running

1. **Hotkey on the actual Mac setup:** verify the dedicated window follows the intended active display/Space, preserves its selected tab, stays above the current app, and toggles closed with the same chord.
2. **`Cmd-T` collision:** test whether using the same chord globally and for Warp's default new-tab action can produce the exact desired open/close semantics while Warp is focused.
3. **Project durability:** confirm what survives app restart, update, crash, branch change, and laptop sleep for a multi-pane tab containing ZD, Pi/Hermes, and a dev server.
4. **Pi/Hermes integration:** validate detection, rich input, context injection, code-review feedback, metadata accuracy, Remote Control, and behavior after harness upgrades. Confirm the documented lack of notifications is tolerable.
5. **Markdown fidelity:** compare ZD's editor requirements—selection, links, task manipulation, previews, custom actions, very large files—against Warp's actual editor/viewer.
6. **Cloud boundary:** capture Warp's Network Log for local terminal/editor-only use, local Pi/Hermes use, MCP, codebase indexing, and Remote Control separately.
7. **Oz harness scope:** obtain written confirmation or test whether Pi and Hermes can be managed cloud harnesses under “any harness in the cloud (beta),” including pricing and self-hosted availability.
8. **Extension roadmap:** ask whether Warp intends a supported custom-pane/webview/plugin API, not merely ACP, MCP, a client CLI, or source contributions.
9. **Source-build cost:** build the open client once and estimate the practical burden of carrying one small ZD panel through two upstream releases. This would turn “forkable” into measured evidence.
10. **Accessibility/performance:** measure summon latency, RAM/GPU use, VoiceOver behavior, and responsiveness with the expected number of long-running agent panes.

## Recommended experiment

Run a one-week **thin-integration spike**, deliberately avoiding a Warp fork and avoiding Oz as a dependency:

1. Configure a dedicated Warp hotkey window on macOS with vertical tabs.
2. Create one generated Tab Config per ZD project. Each tab should open the repo, a ZD CLI/TUI or Markdown file, the preferred harness (Pi or Hermes), and an optional dev-server pane.
3. Keep project/task/goal/state-machine data in ZD-owned files. Add a portable `.agents/skills/zd-*` layer and, only where it adds real value, a local ZD MCP server.
4. Use Warp's built-in Markdown viewer and code-review panel for review, but record every place the custom ZD editor is still necessary.
5. Test Remote Control once with non-sensitive data, then decide whether its cloud tradeoff is worth making an optional feature.
6. Score the spike on summon latency, context-switch count, agent steering time, missing custom UI, browser switching, and recovery after restart.

Success would justify treating Warp as a supported **host workflow** alongside the standalone app. Failure would still produce portable CLI, skill, and MCP seams useful in Ghostty, Zed, or ZD itself. What it should not justify yet is replacing ZD with a Warp fork.
