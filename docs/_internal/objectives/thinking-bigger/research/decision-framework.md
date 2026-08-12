# Decision framework: native GPUI or portable WebGPU/celld

Research snapshot: 2026-08-12

Status: research record and experiment plan, not an accepted architecture decision. Any change to an
accepted decision belongs in a later ADR after the relevant experiment passes.

## Decision in one page

Neither thought should be accepted as a complete technology bundle today.

- **Thought 1** offers the cleaner operational shape: a local Rust application, one primary UI
  runtime, strong offline behavior, and a credible path to excellent native performance. Its price is
  an economic one-way door: it rewrites ZD's most developed asset, then still needs an extension
  sandbox before users or agents can safely customize it.
- **Thought 2** fits the new customization and cloud ambition better. It can preserve the current
  DOM/CodeMirror work and web code is a natural medium for user-made widgets. Its proposed stack,
  however, combines four independent bets—web UI, WebGPU, Wasm extensions, and a distributed Durable
  Object runtime. BroMetal is a shader tool rather than a UI framework, and celld is an alpha daemon
  rather than an embeddable local database. Shipping all four at once would make infrastructure the
  product.

The recommended technology sequence is **capability-first, shell-last**, but it begins only after the
shared Quick Attention Loop in [`product-shape-and-delivery.md`](product-shape-and-delivery.md) passes
its product gate. That product report owns immediate stage order; the experiments below are
post-Scope-S or parallel disposable proofs.

1. Use the shipped Files and new read-only Attention surfaces to derive the smallest internal
   lifecycle in the current Tauri/DOM control; do not publish it.
2. After the MVP, build the Objective-card and state-graph jobs as materially different bundled
   consumers. Extract only repeated host capabilities, then prove one independently developed
   outside prototype can use the constrained boundary without private imports.
3. Benchmark a WebGPU renderer only for a graph/canvas workload that fails a measured budget.
4. Run one GPUI fidelity slice and one celld lifecycle slice against the same domain
   behavior.
5. Re-score with measurements. Choose Thought 1 only if native rendering creates a material product
   advantage and a safe extension model is credible. Choose Thought 2 only if remote use is a
   demonstrated core job and local/cloud parity does not create two state systems.

If forced to choose a *direction of travel* before those experiments, choose the portable,
capability-based product direction behind Thought 2, but do **not** yet choose canvas-everything,
BroMetal as the UI layer, or celld as ZD's local kernel. Thought 2 wins the nominal score by only
0.15/5, well inside the present uncertainty.

## What is actually being decided

The thoughts bundle several orthogonal decisions. They should be tested separately so one attractive
property does not smuggle in three unrelated costs.

| Decision | Thought 1 default | Thought 2 default | Why it must stay separable |
| --- | --- | --- | --- |
| Product model | Customizable native suite | Customizable local/cloud workspace | Both can use projects, panels, widgets, hotkeys, and capability grants |
| Main UI and text layout | GPUI-native | Existing DOM/CodeMirror, unless "WebGPU" is interpreted too broadly | ZD's reader/editor fidelity is independent of its backend deployment |
| Expensive visual rendering | GPUI renderer | Targeted WebGPU through BroMetal | Graph acceleration does not require canvas-rendering buttons, text, or editors |
| Extension execution | Unspecified; likely Wasm/process/declarative host | Browser sandbox, Worker/Wasm, or remote cell | A plugin security model is not supplied by either renderer |
| Canonical domain state | Neutral ZD IDs/schemas plus workspace-owned content; embedded local adapter | The same neutral model; service/DO adapter only after a demonstrated remote job | SQLite, Durable Objects, object storage, celld IDs, and transport revisions are adapter details |
| Distribution | Installed desktop | Desktop plus web/cloud | Cloud reach matters only if it serves an observed user job |

The shared product hypothesis is the important part: ZD begins opinionated but becomes a workspace
whose panels, hotkeys, layout, and mini-apps can be changed over time. The architecture question is
how to make that freedom safe and habitable, not which GPU logo appears in the dependency graph.

## Baseline that a new path must beat

The current stack is not a blank prototype.

- The accepted vision makes the calm, always-editable Markdown surface the core experience; the
  suite owns design, shortcuts, settings, and overlays.
- Accepted ADRs deliberately choose Tauri, browser text layout, CodeMirror, and one editable document
  surface. Native authority already sits behind one `Platform` boundary.
- A rough snapshot count finds about 11,400 lines across app/native source and 97 app/Tauri test files.
  Line count is not value, but the test corpus records subtle caret, typography, focus, table,
  notation, save, and security behavior that a replacement must preserve.
- The prior thinking-differently research found that Tauri is the comparatively cheap shell
  dependency; CodeMirror/DOM is the high-coupling product asset. It also recommends ZD own canonical
  project/attention state while terminal, browser, and agent runtimes stay replaceable.

Thought 1 would supersede the accepted shell, browser-layout, and CodeMirror decisions. Thought 2 can
honor them only under the interpretation used in this document: DOM/CodeMirror continues to own text
and ordinary UI; WebGPU is a leaf renderer for workloads that justify it.

## Evidence that changes the intuitive reading

### GPUI is promising, but adopting it is a product rewrite

GPUI is a hybrid retained/immediate Rust UI framework with native GPU rendering and platform text
systems. It now documents macOS, Windows, Linux, and FreeBSD setup. Its own README also says it is
pre-1.0, will often have breaking changes, remains tied to Zed, and that the best way to learn much of
the API is still Zed's source.

That is a reasonable foundation for a native product with a team willing to live close to GPUI. It
does not carry over CodeMirror state fields, decorations, browser layout, CSS typography, Playwright
geometry tests, IME behavior, or DOM accessibility. The rewrite must be justified by a product result,
not by the fact that both renderers eventually use a GPU.

### BroMetal is not a GPUI equivalent

BroMetal compiles a typed TypeScript shader subset ahead of time to WGSL and supplies a thin WebGPU
runtime. Its documentation explicitly contrasts it with a scene graph: callers own the draw loop. It
is pre-1.0, WebGPU-only, and documents device-unavailable, device-loss, validation, and real-Safari
test gaps.

That makes it a credible experiment for a state graph, effects, a canvas visualization, or other
shader-shaped widget. It does not provide text shaping, layout, focus traversal, selection, IME,
screen-reader semantics, form controls, or an application widget hierarchy. Using it for the whole UI
would require ZD to build those systems or duplicate them in an overlaid DOM.

### celld is a sidecar/fleet runtime, not an in-process persistence crate

celld is a Rust daemon that embeds V8, executes Wrangler bundles, stores each cell as SQLite, and uses
an S3-compatible bucket as the fleet's durable authority. Its current limitations say a fleet runs one
application; there is no multi-tenant scheduler, managed ingress, account service, global placement,
or peer TLS. The security guide calls it alpha and not safe for hostile multi-tenant use. Windows has
no current build, and the first release is `v0.1.0`.

Tauri can package and supervise external binaries, so a celld experiment is possible. "Tauri spins up
celld in itself" should be specified as a **sidecar process** with per-target binaries, a private
authenticated loopback channel, health checks, logs, crash recovery, updates, shutdown, bucket
credentials, and data export. That is a small local service architecture, not an embedded library call.

Cloudflare OS itself reinforces the caution. Its August 2026 v2 README calls the project early access;
the quick local path uses Wrangler/workerd and is explicitly not for production, while smooth
self-hosted `workerd` deployment is still being documented. Its durable insight is the gadget plus
capability/Gatekeeper model—not proof that ZD needs a distributed runtime before its first widget.

## Criteria and weights

Scores use 1 (poor) through 5 (strong). `H`, `M`, and `L` are confidence in the score, not probability
of success. Weights reflect current ZD authority plus the new goal: product fidelity, complexity, and
customization dominate; cloud matters, but it is not yet an accepted core job in the desktop vision.

| Criterion | Weight | What success means |
| --- | ---: | --- |
| Product fidelity and current leverage | 20% | Keep the calm Markdown surface, suite-owned state, scoped authority, and tested interaction quality |
| Complexity hiding and maintenance | 20% | Deep modules reduce change amplification; one feature does not require renderer, runtime, storage, and ops edits |
| Safe self-customization | 20% | A mini-app can add panels, commands, hotkeys, and state without core patches or ambient machine authority |
| Local-first authority and security | 15% | Useful offline, explicit project scope, default-deny capabilities, predictable deletion and export |
| Measured interaction performance | 10% | Roughly 300 ms meaningful frame, imperceptible typing, smooth long documents/graphs, near-zero idle work |
| Cloud and multi-device reach | 5% | A real remote job works without turning cloud topology into every feature's concern |
| Reversibility and time to evidence | 10% | A bounded slice can disprove the path before state formats, plugin APIs, or a full rewrite harden |

## Weighted comparison

Thought 2 is scored in its strongest coherent interpretation: DOM/CodeMirror for text and normal UI,
WebGPU only for justified canvases, and celld behind a service boundary. A canvas-everything reading
scores materially worse on fidelity, accessibility risk, maintenance, and reversibility.

| Criterion | Thought 1: GPUI | Confidence | Thought 2: web/Wasm/celld | Confidence |
| --- | ---: | :---: | ---: | :---: |
| Product fidelity and current leverage | 2 | H | 4 | M |
| Complexity hiding and maintenance | 3 | M | 1 | H |
| Safe self-customization | 2 | M | 4 | M |
| Local-first authority and security | 5 | H | 2 | H |
| Measured interaction performance | 4 | M | 3 | L |
| Cloud and multi-device reach | 1 | H | 5 | M |
| Reversibility and time to evidence | 1 | H | 2 | M |
| **Weighted score / 5** | **2.70** | **M overall** | **2.85** | **L–M overall** |

These are hypotheses, not precision. Reasonable uncertainty bands overlap: approximately 2.4–3.1 for
Thought 1 and 2.1–3.6 for Thought 2. The decision is sensitive to three answers:

- If cloud/multi-device is not a top-three recurring job, Thought 2 loses its clearest advantage.
- If preserving the existing Markdown behavior is mandatory, Thought 1 must earn a very large native
  advantage to repay the rewrite.
- If "complete customization" means loading user/agent-authored code at runtime, Thought 1 needs an
  additional sandbox and UI protocol, while Thought 2 starts closer to the medium but still needs the
  same capability discipline.

No red kill criterion below can be averaged away by a high score elsewhere.

## Tradeoffs by concern

| Concern | Thought 1 | Thought 2 |
| --- | --- | --- |
| Performance | Best raw native ceiling and one compositor; still unmeasured for ZD's editor and likely requires recreating mature text behavior | DOM remains excellent for text; WebGPU can accelerate graph-shaped work, but Wasm/RPC/cloud do not automatically make UI faster |
| Offline/local | Natural default: files and app state stay local and the app can start without a service | Tauri UI can be local, but celld's bucket, V8 sidecar, ports, credentials, and lifecycle must work without the cloud or offline is only a cache mode |
| Cloud | A separate later service/sync design is required | Natural Worker/Durable Object deployment model, but celld does not supply ingress, user auth, TLS, hostile tenancy, or global placement |
| Extensibility | Built-in Rust widgets are straightforward; runtime plugins are not. Rust dynamic ABI or arbitrary native libraries are unacceptable trust boundaries | Web widgets, iframe/Worker isolation, and typed messages are natural. Wasm can deepen isolation, but browser and native capabilities must never be ambient |
| Existing ZD asset | Reimplements the central document surface and much of its verification | Reuses the surface if ordinary UI stays DOM-based |
| Accessibility/input | Must be re-proven across GPUI text, IME, VoiceOver/Narrator, clipboard, selection, and custom controls | DOM/CodeMirror retain known semantics; canvas widgets still need a DOM accessibility representation |
| Dependency risk | GPUI is pre-1.0 and coupled to Zed's evolution | BroMetal is pre-1.0; celld is alpha; browser, Wasm, sidecar, object storage, and cloud APIs all form compatibility surfaces |
| Operational burden | Desktop build/release and plugin safety | Desktop build plus sidecar supervision, object storage, ingress/auth/TLS, fleet diagnosis, backups, migrations, and incident response |

## Expected cost and maintenance surface

These are order-of-magnitude planning bands for one engineer already familiar with ZD, not delivery
promises: `S` is at most a week, `M` is 2–4 weeks, `L` is 1–2 months, `XL` is 3–6 months, and `XXL`
is longer than six months or requires an ongoing operational function. Confidence is low because no
vertical slice has been built.

| Milestone | Thought 1 | Thought 2 |
| --- | --- | --- |
| Decisive feasibility slice | `L`: faithful long-document read/edit/focus plus one native widget | `M`: one isolated DOM widget plus a measured WebGPU graph; `L` if celld lifecycle is included |
| Current `zd md` behavioral parity | `XL`: native editor/layout port and cross-platform verification | `M–L` if DOM/CodeMirror remains; `XL` if the whole UI moves to canvas |
| Safe installable customization | `XL` after two real widgets: sandbox/runtime, host UI protocol, capabilities, persistence, packaging | `L–XL`: iframe/Worker/Wasm host, capability broker, state migrations, packaging and compatibility policy |
| Credible local/cloud parity | Separate `XXL` program | `XXL`: canonical data choice, offline behavior, auth/TLS/ingress, upgrades, backup/export, fleet operations, Windows plan |
| Ongoing burden | High: GPUI churn, three desktop platforms, editor correctness, plugin runtime | Very high: all desktop/browser concerns plus runtime/cloud/security/operations and more failure modes |

Thought 1's dominant maintenance surface is the native document/control toolkit plus a safe extension
runtime. Thought 2's is not WebGPU; it is the distributed lifecycle: two execution locations, process
supervision, identity, authorization, migrations, consistency, and operations.

## Reversible moves and one-way doors

| Move | Reversibility | Rule |
| --- | --- | --- |
| Build one GPUI reference window outside production routing | High | Throw it away unless it beats a predeclared product metric |
| Use BroMetal inside one graph widget behind `GraphRenderer` | High | Keep a Canvas2D/DOM fallback until data proves it unnecessary |
| Run celld as a disposable sidecar/cloud spike with disposable data | High | No production identity or user data in the spike |
| Add two built-in surfaces after introducing the smallest internal widget/slot lifecycle beside today's `MiniApp` registry | High | Do not call that new internal host a public plugin SDK |
| Rewrite the Markdown surface in GPUI and stop advancing the current one | Low, economically | Requires a parity gate and an ADR that explicitly supersedes the browser-layout decisions |
| Publish widget manifests, capability names, URL schemes, or host message schemas | Low | Version from day one; assume third parties will depend on mistakes |
| Make GPUI entities or celld object IDs the canonical domain model | Low | Domain IDs and state must remain renderer/runtime-neutral |
| Put durable user state into celld/DO semantics | Low | Export, migration, backup, deletion, downgrade, and provider-exit stories must exist first |
| Promise offline writes to a cloud-canonical workspace | Very low | Conflict and reconciliation semantics become product behavior, not an adapter detail |

## The only hybrid worth considering

A hybrid is acceptable only where one module traps complexity behind a smaller interface than the
code it adds.

The useful composition is:

```text
Tauri privileged shell
        |
suite-owned project/state services ---- scoped native capabilities
        |
DOM/CodeMirror product surfaces ------- isolated widget host
        |                                      |
optional GraphRenderer leaf             iframe/Worker/Wasm guest
        |
BroMetal/WebGPU only when benchmarked
```

This keeps one text/layout/input system and one canonical data owner. The rest of the application sees
a graph renderer, not GPU devices and shader pipelines. A widget sees semantic capabilities such as
`readObjective(projectId)` or `registerCommand()`, not Tauri IPC, arbitrary files, or shell execution.
A later cloud deployment may implement the same domain service contract, but one deployment has one
canonical owner; local and cloud databases are not silently synchronized by a generic repository.

Reject these hybrids because they accumulate rather than hide complexity:

- a GPUI application embedding the complete existing web app indefinitely;
- GPUI controls plus DOM controls that implement the same panel system;
- a canvas-rendered editor with hidden DOM overlays for text, focus, and accessibility;
- local SQLite/files and celld as simultaneous writable sources of truth;
- native Rust widgets and web/Wasm widgets with two unrelated command, layout, and state APIs;
- celld in every local launch merely so a future cloud deployment might reuse it.

## Initial implementation boundaries for each path

### If Thought 1 wins

1. Keep domain records—project IDs, objectives, documents, commands, panel layout, and capability
   grants—independent of GPUI entity types.
2. Port one narrow reference surface before designing an application framework: long Markdown,
   editing, focus dimming, save/dirty state, one command, and one adjacent widget.
3. Build the first two widgets into the binary. Extract a widget contract only from their actual
   common needs.
4. Do not expose a Rust dynamic-library ABI. Untrusted or third-party code runs out of process or in a
   Wasm component runtime. It returns declarative host UI or uses a small host-owned component set; it
   never receives GPUI/native handles.
5. Preserve the existing scoped-file and untrusted-Markdown rules in a deep native capability layer.
6. Keep the current app as the behavioral oracle until the native slice passes the parity corpus.
   A temporary embedded webview may help compare behavior, but it must not become the permanent dual
   renderer.

### If Thought 2 wins

1. Keep DOM/CodeMirror for text and normal controls. Expose a canvas only through a leaf interface for
   graphs or genuinely GPU-shaped widgets.
2. Run untrusted widgets in a separate iframe/Worker/Wasm context. The privileged Tauri document owns
   the capability broker, validates schemas, caps payloads, and can revoke every grant.
3. Make widgets request semantic operations, not storage/runtime primitives. Domain state has stable
   ZD IDs; Durable Object and celld IDs remain adapter data.
4. Treat celld as a supervised sidecar. Bind a random loopback port, authenticate every request,
   package and sign a target-specific binary, monitor readiness, kill descendants, redact logs, and
   provide deterministic data export/removal. Do not expose the celld peer listener to the webview.
5. Choose one canonical mode explicitly: local-only owner, or cloud owner with a specified offline
   cache. Do not claim local/cloud parity until crash, migration, offline, and conflict tests pass.
6. Put public TLS, application authentication, tenancy, rate limits, and audit/incident controls in
   front of a cloud fleet; celld does not own those responsibilities.

## Smallest experiment sequence that can decide

This is the smallest sequence that can decide technology **after** the Quick Attention Loop has
validated the product. It is not authorization to add writable Objectives, a graph, an installable
runtime, or cloud state to Scope S. GPUI/WebGPU measurements may run beside product work only with
disposable fixtures and no canonical user data.

### Experiment 0: define two extension jobs and budgets

Use real ZD data:

- **Objective card:** reads one project objective, changes one status, registers one command/hotkey,
  persists its panel position, and appears in the Shortcut Reference.
- **State graph:** renders and navigates a representative objective/task graph, supports selection and
  keyboard access, and stays idle when unchanged.

Record current cold frame, warm summon, input-to-paint, long-document scroll, graph frame time, idle
CPU/power, memory, and package size. Record whether remote access is actually needed in ten real work
sessions. No architecture receives credit for an unobserved job.

**Gate:** budgets and representative fixtures are written before a renderer/runtime comparison.

### Experiment 1: learn the widget boundary in the current app

After the Quick Attention Loop passes, implement both as built-in suite surfaces with no public SDK.
Use Files and Attention as the earlier lifecycle evidence; note every new host operation and which
layer owns it. Then extract only repeated capabilities and load one independently developed tiny
outside prototype from a separate package/context. Require a second outside prototype before
broadening that constrained API.

Include an adversarial fixture that attempts undeclared file, network, shell, clipboard, and cross-
project access.

**Success:** the third widget installs/uninstalls without editing suite boot code; commands and the
reference cannot drift; state migrations are versioned; denied actions are impossible at the host
boundary; one broken widget cannot blank or block the suite.

**Kill/adjust:** if the two widgets share little, retain built-ins. A shallow forwarding SDK is worse
than a small amount of duplication.

### Experiment 2: compare renderers only where behavior is identical

Build the State graph once against a small `GraphRenderer` contract, then compare the simplest
DOM/Canvas implementation with BroMetal/WebGPU. Separately build the smallest GPUI Markdown fidelity
slice using the same document and command behavior.

**WebGPU success:** it turns a measured failing workload into a passing one, stays within idle/power
budgets, survives GPU unavailability/device loss, and has a keyboard/screen-reader representation.
Predeclare a material improvement threshold; a suggested starting point is at least 25% on an
actually failing metric, not a synthetic shader benchmark.

**GPUI success:** the slice passes the reference behavior for typography, caret/IME, accessibility,
focus, save/dirty state, and long-document interaction, meets the 300 ms launch target, and produces a
material user-visible advantage that the current shell cannot obtain more cheaply.

**Kill/adjust:** never retain WebGPU for ordinary controls or GPUI merely for benchmark parity.

### Experiment 3: test customization as a security property

Package the third widget as if an agent generated it. Upgrade and downgrade its state schema, revoke a
grant while running, crash it, feed oversized/malformed messages, and install two versions with
conflicting commands.

Run two presentation shapes through the same semantic capability broker: one bounded support widget
and one renderer-specific primary/full-canvas mini-app. The primary surface must contribute a command,
restore after restart, preserve a missing-version placeholder, expose an accessible semantic path,
and return to the shipped default without executing its code. Do not require GPUI and DOM to share a
pixel/widget ABI; only lifecycle, commands, capabilities, recovery, and state errors are common.

**Success:** authority is visible, narrow, revocable, and auditable; failure is contained; uninstall
predictably removes code and optionally data; no guest knows whether the host is Tauri or a future
shell.

**Path signal:** a declarative host UI/Wasm guest that remains deep makes Thought 1 plausible. A DOM
sandbox that preserves full product fidelity with a smaller interface strengthens Thought 2.

### Experiment 4: test celld without product migration

Deploy only the Objective card's backend. Run it first as a packaged Tauri sidecar with disposable
data, then as one cloud node, then two nodes. Exercise no-network startup, bucket outage, process crash,
app restart, machine sleep, schema migration, rollback, export/import, credential rotation, duplicate
launch, port collision, WebSocket reconnect, and node loss.

Put real authentication/TLS in front of the cloud test. Measure local RPC and remote interaction
latency. Document the Windows alternative before treating celld as a suite foundation.

**Success:** the same semantic API and migration fixtures pass locally and remotely; the desktop shows
a meaningful frame without waiting on the daemon; local-only mode makes no network request; one
canonical data owner is always obvious; recovery requires no manual object-store surgery.

**Kill/adjust:** stop if local mode requires another bundled storage service, cloud and local need
different domain semantics, the sidecar broadens the privileged webview, or operations work exceeds
the widget/domain work it removes.

### Experiment 5: re-score and commit deliberately

Replace every low-confidence score with measurements and an explicit source. Write an ADR only if one
decision removes more complexity than it adds. Record the axes independently before asking whether a
named thought won:

| Axis | Valid outcomes |
| --- | --- |
| Product shell | current Tauri/DOM; GPUI native after fidelity; another future shell |
| Ordinary UI/text | DOM/CodeMirror; GPUI only after accepted replacement |
| Heavy visualization | simplest DOM/SVG/Canvas; BroMetal/WebGPU leaf after benchmark |
| Local durable state | direct files plus small embedded store; celld sidecar only after lifecycle proof |
| Remote control state | none; one explicit service/runtime after a demonstrated remote job |
| Installed execution | data-only profile; isolated web/Worker/Wasm/process guest |

Current DOM + safe built-in/sandboxed widgets + an embedded local store is a first-class successful
architecture. So are DOM + one GPU leaf without cloud, and GPUI + a local store without celld. A
failed accelerator or deployment proof removes that component; it does not erase a passing product or
extension boundary.

- Choose **Thought 1** when native interaction is a demonstrated differentiator, desktop/offline is
  the dominant job, the GPUI parity slice passes, and the extension runtime is a deep boundary rather
  than a second UI framework.
- Choose **Thought 2** when remote/multi-device use is a demonstrated core job, the DOM widget host is
  safe, targeted WebGPU earns its place, and celld/local-cloud lifecycle passes without a second state
  model.
- Otherwise select the passing per-axis outcomes, keep the current Tauri/DOM owning app where it wins,
  and ship customization incrementally. That is a valid result, not a failed experiment.

## Kill criteria

### Stop Thought 1 when any remains true after the bounded spike

- The native slice cannot match the Markdown corpus's IME, selection, typography, accessibility, and
  save behavior without rebuilding a general text/layout engine.
- The only route to product parity is a permanent full webview inside GPUI.
- Every new widget requires recompiling/changing suite core, or third-party code needs a Rust ABI or
  ambient user authority.
- macOS success cannot be reproduced on the vision's Windows target without a divergent product.
- GPUI churn forces product code to track Zed internals faster than ZD can ship user value.
- No measured native advantage exceeds a cheaper improvement to the current shell.

### Stop Thought 2 when any remains true after the bounded spike

- WebGPU does not fix a representative failed performance budget, or it requires DOM duplication for
  ordinary UI, text, input, or accessibility.
- BroMetal must become a scene graph, layout engine, retained widget tree, or editor renderer.
- A local celld launch needs external object storage, public networking, shared administrator
  credentials, or manual recovery.
- Cloud and offline behavior require two writable canonical databases or unspecified conflict
  resolution.
- A remote/guest widget shares Tauri filesystem, process, terminal, agent, or secret-bearing context.
- The lack of Windows support or alpha protocol stability creates a permanent second implementation.
- Auth, TLS, ingress, fleet operation, backup, and migration backlog grows faster than product work.

## Sequencing strategies

### Strategy A: capability-first, shell-last — recommended

First pass the Quick Attention Loop in the current app. Then derive the smallest internal lifecycle
from Files and Attention, add the post-MVP Objective/state-graph consumers, measure the graph, and run
GPUI and celld as disposable adapters. This maximizes information per irreversible line, preserves
the product oracle, and allows either path to win. Its discipline is to refuse a universal core: only
a real second consumer pays for extraction.

### Strategy B: native wedge first

Freeze a reference corpus, build the GPUI vertical slice, and decide whether to supersede the
browser-layout ADR before building any plugin SDK. If it wins, add two built-in native widgets, then
select an out-of-process/Wasm extension boundary from their needs. Treat cloud as a later semantic
service, not part of the UI rewrite.

This strategy is appropriate only if the primary hypothesis is that native interaction itself is the
product. It gives fast evidence on the hardest Thought 1 risk, but delays the new customization goal
and can spend months rediscovering existing behavior.

### Strategy C: remote workspace first

Keep the current DOM UI, prove a capability-scoped widget host, then deploy one domain service through
celld locally and remotely. Add WebGPU only after the state graph misses its budget. Do not touch GPUI.

This strategy is appropriate only if observed sessions show that multi-device access, sharing, or
remote agent supervision is already a core job. Otherwise it front-loads the broadest security and
operational surface to solve a hypothetical future.

## Recommendation

Use Strategy A.

It adopts the strongest common insight from bb and Cloudflare OS—a programmable workspace with deep,
capability-scoped extensions—without prematurely adopting either inspiration's whole runtime. It also
follows ZD's engineering rules: design it twice, preserve the working system, extract natural cut
points from real code, optimize with data, and keep authority narrow.

The post-MVP architecture experiment is therefore small:

> After the Quick Attention Loop passes, ZD will derive a suite-owned widget and capability model
> inside the existing Tauri/DOM product. Renderers and deployment runtimes remain replaceable
> experiments until they demonstrate product value and reduce total complexity.

That statement is intentionally not an ADR. The experiments can still produce a real Thought 1 or
Thought 2 decision; they simply prevent a renderer or distributed daemon from deciding ZD's product
model by accident.

## Sources

### ZD authority and prior research

- [`thoughts.md`](../thoughts.md)
- [`vision.md`](../../vision.md)
- [`Good Engineering`](../../../../GOOD_ENGINEERING_H.md)
- [ADR 0001: Tauri with a portable web frontend](../../../../adr/suite/0001-use-tauri-with-portable-web-frontend_H.md)
- [ADR 0002: native authority behind one platform boundary](../../../../adr/suite/0002-put-native-authority-behind-platform-boundary_H.md)
- [ADR 0001: browser layout for Markdown](../../../../adr/md/0001-use-browser-layout-for-markdown_H.md)
- [ADR 0002: one always-editable document surface](../../../../adr/md/0002-use-one-always-editable-document-surface_H.md)
- [Prior synthesis](../../thinking-differently/gpt-sol-thoughts.md)
- [Current architecture audit](../../thinking-differently/research/zd-current-architecture.md)
- [Prior architecture options](../../thinking-differently/research/architecture-options.md)
- [bb substrate research](../../thinking-differently/research/bb.md)

### Upstream primary sources

- [GPUI README and status](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md)
- [GPUI API site](https://www.gpui.rs/)
- [bb repository and product model](https://github.com/get-bb/bb)
- [bb system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)
- [Cloudflare OS README, gadget model, security model, and maturity](https://github.com/cloudflare/cloudflare-os/blob/main/README.md)
- [BroMetal README and scope](https://github.com/ericdrowell/brometal/blob/main/README.md)
- [celld README](https://github.com/denoland/celld/blob/v0.1.0/README.md)
- [celld limitations](https://github.com/denoland/celld/blob/v0.1.0/docs/limitations.md)
- [celld security boundary](https://github.com/denoland/celld/blob/v0.1.0/docs/security.md)
- [Tauri external-binary/sidecar documentation](https://v2.tauri.app/develop/sidecar/)
