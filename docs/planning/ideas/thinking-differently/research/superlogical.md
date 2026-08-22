# Superlogical: research and fit for ZD

**Research date:** 2026-08-11

**Exact product:** [Superlogical](https://www.superlogical.com/), the newly announced company co-founded by Mitchell Hashimoto, building a durable terminal multiplexer and eventually a broader "multiplexer for all work."

## Identity check

The URL in `thoughts.txt` is **not** evidence for the older `superlogical` GitHub/npm identity, nor for any product with a similar generic name. It points to the company Mitchell Hashimoto announced on July 29, 2026. Hashimoto's own announcement says plainly that Superlogical will begin with a terminal multiplexer and build it on `libghostty` ([announcement](https://mitchellh.com/writing/superlogical)). The company site describes a larger ambition: a durable session layer joining local development, remote access, agents, background jobs, production operations, live debugging, sandboxes, incident response, history, and multiplayer work ([product statement](https://www.superlogical.com/)).

This distinction matters because the product is currently **pre-release**. Superlogical is an unusually relevant direction for ZD, but it is not yet software ZD can install, extend, or depend on.

## What is actually announced

Superlogical frames today's developer work as fragmented across local machines, remote hosts, sandboxes, services, production, interactive interfaces, CI jobs, and agents. Its proposed missing abstraction is a **durable session around the work itself**. The session is intended to:

- span applications and environments;
- supply relevant context by default;
- expose structured data and actions;
- retain operational history;
- be software-drivable while still visible and controllable by people.

The public plan has three stages: build an excellent multiplexer, make its contents composable, and make the system safe and operable in production. The first release is a terminal multiplexer with multiple terminal blocks inside a long-lived session. Sessions are meant to survive closing the client, reconnect from another device, and be available through web, native macOS, and native iOS clients. Live sharing is planned from the beginning. The team also explicitly calls out native-quality scrollback, selection, and scrolling as papercuts it intends to fix ([Superlogical product statement](https://www.superlogical.com/)).

Terminals are the entry point, not the stated endpoint. Superlogical argues that terminals already join humans, agents, tools, and infrastructure, making them the right foundation for a broader shared work layer. Hashimoto confirms that the initial terminal multiplexer is only the beginning, while declining to reveal the later product surface ([founder announcement](https://mitchellh.com/writing/superlogical)).

## Public architecture and extensibility

Only a small amount is public, and the boundary between declared direction and implemented architecture must remain explicit.

### Known

- The initial product is a terminal multiplexer.
- Terminal rendering/emulation will use [`libghostty`](https://libghostty.tip.ghostty.org/), Ghostty's reusable terminal library.
- Superlogical intends to consume the same MIT-licensed Ghostty components available to everyone and upstream generally useful terminal work so other `libghostty` consumers benefit ([founder announcement](https://mitchellh.com/writing/superlogical)).
- Sessions are intended to be durable, reconnectable, cross-environment, web/native accessible, and live-shareable.
- "Make everything in it composable" and structured data/actions are explicit goals, not reverse-engineered assumptions.
- Production safety and operability are explicit later-stage requirements.

### Unknown

No public source currently specifies:

- the client/server protocol or whether it will be public;
- where session state lives and what can be self-hosted;
- a plugin, extension, embedding, or automation API;
- whether composability means third-party UI panels, typed session objects, terminal protocols, command hooks, or something else;
- the storage model, synchronization model, permissions model, or threat model;
- whether sessions map to projects, repositories, machines, tasks, or arbitrary user groupings;
- editor, Markdown, browser, source-control, project-management, or agent-harness features;
- a global summon/hide hotkey or scratchpad-style macOS window behavior;
- pricing, hosted-service terms, product license, source availability, release date, or platform scope beyond the named web/macOS/iOS clients.

The company signup says it will announce its terminal-multiplexer beta and "any OSS releases along the way." That wording does **not** promise the full product will be open source ([Superlogical homepage](https://www.superlogical.com/)). Ghostty and `libghostty` being MIT-licensed likewise does not determine the license of Superlogical's own code.

## Distribution, licensing, and maturity

Superlogical was publicly announced less than two weeks before this research date. There is no product download, public repository, release channel, package, published API, or beta availability yet. It is therefore best classified as a **credible pre-product company**, not an early usable product.

Execution credibility is unusually strong. The founding team includes:

- Mitchell Hashimoto, creator of Ghostty and co-founder of HashiCorp;
- Jack Pearkes, HashiCorp's first employee and later VP of Engineering/R&D;
- Alasdair Monk, a developer-tool design leader from Poolside, Vercel, HashiCorp, and Heroku;
- Hector Simpson, a designer/builder of agentic and developer experiences from Poolside, Heroku, HashiCorp, Clearbit, and Vercel.

The company lists institutional funding from Notable Capital and Amplify Partners plus a group of developer-tool founders and operators ([team and funding](https://www.superlogical.com/)). This does not reduce current product uncertainty, but it makes the direction more likely to ship than a typical landing-page-only project.

Ghostty itself remains separate: Hashimoto says it is held by a nonprofit, will not be commercialized, and retains its existing governance, license, technical goals, and roadmap. ZD should not treat Superlogical as "the commercial Ghostty" or assume Ghostty will become coupled to it ([founder announcement](https://mitchellh.com/writing/superlogical)).

## Fit against the ZD requirements

| ZD need | Evidence of fit | Current gap | Assessment |
|---|---|---|---|
| High-quality terminal | Initial product; built on `libghostty`; native scroll/selection explicitly targeted | Not released or benchmarkable | **Potentially excellent, unavailable now** |
| Multiple projects/work contexts | Durable sessions with multiple terminal blocks; sessions span environments | No public project/repository/tab model | **Conceptual fit only** |
| Persistent agent work | Agents are explicitly part of the fragmented work Superlogical wants to unify; sessions are software-drivable and human-visible | No supported harness list, approvals UI, agent state model, or SDK | **Promising future substrate** |
| Markdown editor | None announced | ZD would need to supply it, if embedding is possible | **No demonstrated fit** |
| Code editor | None announced | Same | **No demonstrated fit** |
| Browser integration | Web access to sessions is planned | A web client is not an embedded browser panel | **No demonstrated fit** |
| Global summon/hide on macOS | Native macOS client planned | No global hotkey, floating/overlay window, or Spaces behavior announced | **Unknown** |
| Fast project switching | Long-lived sessions could support fast context recovery | No `Command-1/2/3`-style switching or project UI announced | **Unknown** |
| Goals, todos, objectives | Structured data/actions and composability might eventually host them | No public extension surface or domain model | **Unknown; cannot plan against it** |
| Custom state-machine graphs | Software-driven structured sessions are philosophically compatible | No graph API or custom panel model | **Unknown** |
| Remote/mobile steering | Web, macOS, iOS, reconnect, and live sharing are announced | No product to test | **Strong stated fit** |
| Avoid building terminal infrastructure | Exactly the layer Superlogical wants to own | Integration/embedding terms are unknown | **Potentially high leverage later** |

The deepest alignment is not a checklist feature. Both ZD's direction and Superlogical's thesis treat the **ongoing unit of work**—with terminals, agents, state, and history—as more important than a particular window or process. That is a valuable architectural signal for ZD even if the products never integrate.

## Ways ZD could relate to Superlogical

### 1. Inspiration

This is the best current role. ZD should study and adopt the durable-session framing:

- A project workspace should be durable state, not a UI window.
- Closing or hiding the client should not terminate terminals or agents.
- Interactive and automatic work should share history and context.
- A user should be able to reconnect from another surface and see the same state.
- Human steering should be a view over software-addressable operations, not a separate workflow.

That model fits the desired summon/hide workflow: the global overlay is only one client onto durable project sessions.

### 2. Future terminal/session substrate

If Superlogical publishes a stable local protocol or embeddable/session API, ZD could keep its own Markdown editor, project model, goals, todos, graphs, and agent orchestration while delegating terminal lifetime, rendering, remote reconnection, and perhaps sharing.

This would be the highest-leverage integration because terminal correctness and persistent PTY/session handling are deep infrastructure. It would also keep the ZD-specific value in ZD rather than forcing it into an unrelated product's extension model.

This option cannot be designed responsibly until Superlogical reveals the session boundary, deployment model, and extension terms.

### 3. Extension hosted inside Superlogical

An in-product ZD extension might eventually be attractive if "composable" includes third-party panels or applications. It could provide Markdown, objectives, state graphs, project controls, and agent dashboards beside terminal blocks.

Today this is speculation. There is no announced plugin API, editor surface, SDK, or distribution channel. Betting on this route now would reverse the dependency: ZD's roadmap would depend on a private, unreleased host's future product decisions.

### 4. Adjacent companion

ZD could remain a standalone native overlay and later attach to Superlogical sessions externally. That preserves ZD's UI and state-machine freedom while gaining durable terminals if a command/API integration appears. This is more robust than assuming ZD can live inside Superlogical.

### 5. Competitor

Superlogical may become a competitor for the terminal/session/remote-control portion of ZD, but not yet for ZD's editing, objective-management, or custom-agent workflow. Its larger "all work" ambition could eventually expand into those areas. The risk is strategic rather than immediate: building a generic session multiplexer inside ZD could duplicate a better-funded, deeply experienced team's core work.

## Pros

- The announced durable-session abstraction matches the real problem behind ZD's desired instant context switching.
- A terminal-first foundation is compatible with CLI-based Codex, Claude Code, Hermes, Pi, and other harnesses without requiring every harness to expose a custom GUI protocol.
- `libghostty` provides a credible technical foundation for terminal quality.
- Web, macOS, iOS, reconnection, and built-in sharing directly address remote observation and steering.
- "Structured data and actions" plus software control point toward richer agent-aware behavior than a traditional byte-stream multiplexer.
- Production operability and history are first-class goals, which could eventually join local agents with CI, background work, and live systems.
- The team's developer-tool, infrastructure, agent-interface, and design experience is unusually well matched to the problem.
- Upstreaming shared terminal work benefits the ecosystem even if ZD never adopts the commercial product.

## Cons

- There is no usable product today.
- Nearly every integration-critical detail—protocol, API, extension model, hosting, licensing, and pricing—is unknown.
- The announced native platforms omit Windows and Linux clients, though web access may cover some use cases.
- The product begins below ZD's application layer; no editor, project manager, browser, goals, todos, or graphs are announced.
- Its production-oriented long-term scope may pull the product away from the lightweight personal overlay workflow.
- Depending on it early would introduce roadmap and commercial-platform risk without eliminating current implementation work.
- "Composable" is an intent, not proof of a practical third-party extension surface.

## Risks and questions to monitor

1. **API risk:** Will local clients and third parties receive a documented, stable session API?
2. **Deployment risk:** Can users run the session service entirely locally or self-host it, including remote access?
3. **License risk:** Which parts beyond `libghostty` will be open source, source-available, or proprietary?
4. **Data/control risk:** Where do terminal output, commands, agent logs, credentials, and history live?
5. **Security risk:** How are human sharing, software control, production access, and agent permissions separated?
6. **Embedding risk:** Can ZD render or control a session without using Superlogical's full client?
7. **Extensibility risk:** Can ZD add custom work objects and UI, or only launch terminal commands?
8. **Workflow risk:** Does a session contain projects/worktrees and multiple agents, or only terminal blocks?
9. **Interaction risk:** Will the macOS app support a global summon/hide overlay across Spaces?
10. **Business risk:** What requires a hosted account or paid service, and what continues working offline?

## Verdict

**Watch closely and borrow the architecture; do not make Superlogical a ZD dependency yet.**

Superlogical is the strongest validation among the referenced tools for treating durable work sessions—not editor windows—as the system core. ZD should reflect that now: persist project/agent/terminal state independently of the summoned UI and keep infrastructure behind narrow replaceable boundaries.

For implementation, Superlogical is presently neither a host nor an integration target because nothing public can be installed or integrated. The best near-term choice is to continue ZD while avoiding unnecessary investment in a general-purpose multiplexer. When the beta and technical surface arrive, run a focused evaluation of local-first operation, the session API, embedding, global-hotkey behavior, and licensing. If those align, prefer Superlogical as a replaceable terminal/session backend while retaining ZD's editor, project, objective, and state-machine product layers.

## Primary sources

- [Superlogical product statement, roadmap, team, funding, and beta signup](https://www.superlogical.com/)
- [Mitchell Hashimoto's July 29, 2026 founder announcement](https://mitchellh.com/writing/superlogical)
- [`libghostty` documentation](https://libghostty.tip.ghostty.org/)
