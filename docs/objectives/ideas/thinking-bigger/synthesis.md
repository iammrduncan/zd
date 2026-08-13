# Thinking bigger: synthesis and first implementation direction

Research snapshot: 2026-08-12

Status: research synthesis and experiment plan, not an accepted product or architecture decision

The evidence behind this synthesis is indexed in [`README.md`](README.md). The two complete initial
architecture drafts are [`thought-1-native-gpui.md`](research/thought-1-native-gpui.md) and
[`thought-2-webgpu-wasm-celld.md`](research/thought-2-webgpu-wasm-celld.md).

## The answer

The inspiration is good. The stack sketches are not yet architectures.

ZD should grow into a **globally summonable, deeply personal project-attention workspace**. It should
start with a strong opinion—the calm `zd md` experience—and gradually let a person change project
slots, commands, hotkeys, supporting tools, layouts, themes, widgets, and eventually almost every
ordinary workspace surface. The host must continue to own permissions, save truth, accessibility,
updates, and recovery.

Do not adopt either thought as a complete technology bundle yet.

- **Thought 1 is coherent as a native destination.** A Rust/GPUI application can plausibly deliver a
  fast, cohesive native workbench. It is also a rewrite of the most developed part of ZD: the
  DOM/CodeMirror document engine. Validate it in a sibling vertical slice and keep the current app as
  the product and behavioral oracle until native editor fidelity earns a replacement.
- **Thought 2 is coherent only after separating its bets.** Keep DOM/CodeMirror for text and normal
  UI. Use WebGPU and Wasm only for measured hotspots. Treat celld as an optional Worker control-plane
  target and supervised sidecar, not an embedded database, machine-execution host, Cloudflare OS
  compatibility layer, or hostile multi-tenant sandbox.
- **The useful common path does not require choosing either shell.** Prove the product loop, add one
  small durable project/context model, turn a second built-in surface into a real composition seam,
  and derive extension contracts from working consumers.

The next product slice should therefore be the **Quick Attention Loop**:

> existing `zd md` + global summon/hide + three retained projects + read-only Attention + one
> reversible support-region choice; one binding experiment follows an explicit design revision

That slice tests whether ZD deserves to become the larger workspace before renderer, cloud, and
plugin infrastructure can obscure the answer.

## Where the thought is coming from

The two thoughts combine four durable product instincts:

1. **bb:** projects, live agent threads, execution hosts, substantial plugin-owned tools, and
   equivalent human/agent control surfaces.
2. **Cloudflare OS:** small app instances derived from reusable definitions, explicit resource
   capabilities, and strong mediation between untrusted tools and authority.
3. **GPUI:** explicit application state, semantic actions, focused invalidation, native performance,
   and one coherent UI/runtime model.
4. **ZD:** a quiet, local-first document experience whose state, commands, typography, and safety
   rules are more important than any host framework.

The resulting product idea is not “clone bb in Rust” or “run Cloudflare OS on a laptop.” It is:

> Give the person and their agents a small, inspectable language for composing the place where work
> is resumed, understood, and steered.

That language can eventually include mini-apps, widgets, panels, commands, bindings, profiles, and
capabilities. It should begin as ordinary typed application data and built-in code, not a public
universal SDK.

## Corrections that change the architecture

The source audit in [`source-projects.md`](research/source-projects.md) found several boundaries that
the original sketches understandably blur.

| Initial intuition | What current evidence says | Architectural consequence |
| --- | --- | --- |
| bb is a Rust-like substrate | bb is a TypeScript/Node, React, Electron, server, and host-daemon system | Borrow its product/state boundaries; do not plan code reuse in a GPUI app |
| `awesome-gpui` supplies the widget layer | It is a curated catalog; GPUI is the framework, and listed projects have independent versions/licenses | Audit and pin every selected component; do not infer a coherent ecosystem API |
| Cloudflare OS can deploy to celld | Cloudflare OS uses KV, R2, Browser, and Dynamic Workers/Facets; celld omits several and marks dynamic loading experimental | Borrow gadget/capability patterns; build a deliberately small ZD Worker if celld is tested |
| BroMetal is a WebGPU UI engine | BroMetal 0.17.2 is a TypeScript-to-WGSL shader compiler and thin runtime | Use it only behind a graph/visualization renderer after a benchmark |
| Wasm makes the app or plugins fast and safe | Wasm is a compute/module boundary whose authority comes entirely from host imports | Use it for a proven CPU hotspot or constrained guest; still design capabilities and UI composition |
| Tauri can run celld “inside itself” | Tauri can supervise a target-specific celld sidecar; celld has no stable in-process embedding contract | Specify startup, auth, readiness, crash, upgrade, data, and shutdown behavior explicitly |
| celld makes a cloud deployment safe | celld calls its alpha unsafe for hostile multi-tenancy and supplies neither end-user auth nor public TLS | Limit early use to trusted code/single principal; treat public tenancy as a separate security program |
| GPUI web plus BroMetal is one renderer | GPUI web uses Rust/Wasm and its own `wgpu` renderer; BroMetal is an alternative TypeScript/WebGPU path | Pick one renderer per bounded surface; do not accumulate both by default |

These are not reasons to make the vision smaller. They are reasons to give every technology one job
and one proof rather than letting novelty leak through the whole system.

## The product contract

ZD's opinionated default remains document-first:

1. Summon the warm app above the current Mac context.
2. Resume the last meaningful ZD surface without recreating its state.
3. Switch among explicitly pinned projects with stable number commands.
4. Open Attention when orientation is needed; never force a dashboard as the resting state.
5. Inspect a document, objective, review, or typed agent state.
6. Act through a semantic command or hand off to the owning specialist tool.
7. Hide ZD and return naturally to the prior application.

The staged customization promise is:

| Level | What changes | Execution trust |
| --- | --- | --- |
| Opinionated | Shipped mini-app, tools, layout, commands, and theme work immediately | ZD core |
| Personal | Project slots, bindings, support side/size, appearance, and reset | Validated data |
| Composed | Built-in widget instances, regions, layouts, named profiles, import/export | Validated data plus bundled code |
| Packaged | Shareable profiles containing themes, bindings, presets, and semantic commands | Data calling already-authorized actions |
| Extended | Independently installed widgets/mini-apps with declared capabilities and isolated failure | Sandboxed guest or separate process |
| Redesigned | Every ordinary workspace region may be replaced by chosen tools | Safety shell remains host-owned |

“Complete” customization does not include replacing permission prompts, dirty/save/conflict truth,
safe mode, accessibility recovery, update recovery, or the ability to reset without executing a
broken extension.

### Product decision that must be explicit

The current binding [`DESIGN.md`](../../../DESIGN.md) says ZD is not a dashboard, IDE, cockpit, or
panel collection; it permits one primary surface plus one quiet support/navigation surface and its
closed Settings inventory excludes a keybinding editor. The new direction asks for panels, hotkeys,
and eventual UI redesign.

The least disruptive interpretation is:

- keep the present restraint as the shipped default and reset target;
- use only one primary region and one optional support region in the first slice;
- introduce composition through an explicit later Customize Workspace experience; and
- revise the design contract deliberately before shipping arbitrary persistent layouts or keymap
  editing.

This is an owner-level product decision. It cannot be smuggled in as layout implementation. An
owner-approved ZSIP/design revision is a precondition to the first user binding override, including
deciding whether `DESIGN.md` governs only the shipped/reset profile or every contributed surface. If
custom surfaces are allowed to differ, the revision should state the smaller universal host contract:
trusted permission/recovery chrome, deterministic focus and accessibility, save truth, safe mode,
and reset.

## Shared architecture that preserves both directions

The durable model should describe ZD, not a renderer or deployment runtime.

```text
global/native command
        |
        v
suite command dispatcher -----------------------------+
        |                                             |
        v                                             v
versioned project/context owner               native capability broker
projects · active context · attention         files · windows · processes
bindings · small composition state            agents · external handoff
        |
        v
host-owned surfaces
Document · Files · Attention · later Objectives/Agent
        |
        +---- current DOM/CodeMirror host
        +---- sibling GPUI fidelity candidate
        +---- optional GPU visualization leaf
        +---- later sandboxed extension surface
```

For the first product slice, the durable state can remain smaller than the general `SuiteStateV1`
sketched in [`current-zd-fit.md`](research/current-zd-fit.md):

```text
Project
  id                 stable opaque ID
  name
  workspaceRef       explicit platform-owned grant/reference
  slot?              1..3 initially
  lastContext        active resource + restore hints

SuiteState
  schemaVersion
  projects[]
  activeProjectId
  activeProfileId
  supportRegion      hidden | files | attention; side + size

Profile
  schemaVersion
  bindingOverrides[] one command only after the design revision
```

Do not serialize DOM nodes, GPUI entities, GPU scenes, Tauri handles, celld object IDs, provider
credentials, PTY streams, or dirty editor buffers into this store. Each fact keeps one authority:

- workspace backend: committed file bytes and revisions;
- document model: unsaved text, selection, undo, and viewport;
- suite store: project identity, active profile, applied support-region placement, and device/project
  widget-instance state;
- profile store: portable bindings, theme, layout templates, and default widget configuration;
- specialist runtime: agent, terminal, and browser live state;
- security broker: capability grants and revocation;
- view: recomputable render/GPU caches.

Keep portable customization separate from device authority:

- **device-local `SuiteState`:** project catalog, slots, workspace references, last contexts, applied
  support-region placement, and device/project widget-instance state;
- **portable `Profile`:** layout templates, theme, bindings, and default widget configuration, with
  unresolved symbolic project roles rather than paths or grants; and
- **non-exportable `GrantLedger`:** platform capability handles, scopes, and approvals.

Importing a profile never imports a local root, project path, credential, or permission. It may leave
a project role unresolved until the user explicitly binds and grants a local workspace.

### Minimal document-session lifecycle

Retained projects cannot be implemented by persisting only cursor hints. Today the current workspace
destroys its sole editor after a safe switch, while the native layer owns one launch-derived scope.
Before multi-project switching, introduce a `DocumentSession` keyed by `(projectId, documentRef)`:

```text
loading -> active-clean -> suspended-clean -> active-clean
                 |               |
                 v               v
             active-dirty <-> suspended-dirty
                 |
                 v
              conflicted
```

- A suspended clean session may discard its view and restore from the confirmed file revision plus
  selection/viewport hints. Clean sessions have a bounded eviction policy.
- A suspended dirty or conflicted session retains its source buffer, undo state, base revision, and
  dirty truth. It is never evicted or silently serialized into the suite metadata store.
- A project switch is transactional: ask the active session to suspend, activate the target's
  native-owned root grant, mount/resume the target, then commit `activeProjectId`. Any failure leaves
  the previous project active and its grant unchanged.
- Quit, update, destructive reset, project removal, and window close enumerate **all** dirty sessions,
  not only the visible editor. Hiding the quick window does none of these.
- CLI/Finder open requests resolve or create a project/session and queue behind the same safe-switch
  protocol; a frontend-supplied path alone never widens native authority.

The first candidate should use one warm switching window. The current vision's multiple-window
promise and each window's ownership of sessions/grants need an explicit product decision before both
models are implemented. A second window must not become an accidental second writer for one dirty
session.

The current code's strongest reusable semantics are one command registry, scoped native authority,
atomic confirmed saves, safe close/switch, untrusted Markdown, and idempotent mini-app teardown. They
should survive even when their implementation language changes.

## Initial implementation sequence

### 0. Validate the problem before widening the app

Observe at least 30 real context switches across five work sessions. Record locally what the user was
trying to resume or inspect, how long it took, and whether the destination was ZD, terminal, browser,
editor, or agent. Compare “resume last” with “open Attention” as the summon behavior.

Continue only if the painful switches cluster around resume, project selection, attention, or review.
If terminal/browser work dominates, improve companion handoff rather than making ZD own those tools.

Before implementation, choose one switching window for the candidate and write the
`DocumentSession`/project-grant transition tests. Those are prerequisites to claiming that retained
projects preserve dirty work. Stages 1–2 may validate summon/switch and read-only Attention under the
current contract; resolve the owner-approved design revision before the first Stage-3 binding
override.

### 1. Ship the Quick Attention Loop in the current product

Implement, in this order:

1. a configurable macOS global show/hide command with reliable focus/Space behavior;
2. the document-session and native project-grant transaction, then three in-memory retained contexts
   with stable `Command-1…3` activation;
3. a versioned durable project catalog after switching preserves dirty context correctly;
4. one read-only Attention surface from one structured source plus local dirty/review state;
5. one support-region choice with reset/export/corrupt-state recovery, followed by one binding
   override only after the design revision permits it.

Keep `zd md`, CodeMirror, ordinary files, and the existing native boundary. Do not add arbitrary
splits, executable packages, an embedded terminal/browser, or a cloud control plane to this MVP.

The stack-independent acceptance gates are detailed in
[`product-shape-and-delivery.md`](research/product-shape-and-delivery.md). The hardest invariants are:

- 100 warm toggles without Space jumps, focus leaks, stuck shortcuts, or state loss;
- 100 project switches without wrong roots, lost dirty state, or widened authority;
- Attention never guesses “quiet” or “complete” when its source is stale;
- invalid customization falls back without losing the unread record or project files; and
- the loop measurably reduces time/gestures versus the observed baseline.

### 2. Derive composition from a second real surface

Treat `md`, Files, and Attention as trusted linked feature code. Add the smallest transactional
registration/lifecycle boundary they actually share. Separate semantic command definitions from
bindings while preserving one dispatch and Shortcut Reference source.

Do not publish this shape. Add Objectives or a provisional `td` surface next; use that second domain
to decide whether a mini-app is a behavior type, a named composition, or both. Only introduce a split
or tab algebra when two useful simultaneous surfaces require it.

This is v0 extensibility: compiled with ZD, reviewed with ZD, and explicitly full-trust.

### 3. Run technology proofs independently

The following experiments may run beside product work because none needs to own canonical user data.

| Proof | Deliverable | Continue when | Kill/narrow when |
| --- | --- | --- | --- |
| GPUI native fidelity | Sibling native window with retained projects, one adjacent widget, and a representative edit/save Markdown slice | Text/IME/accessibility/save path is credible and native behavior produces a material product or operational benefit | A broad text engine is required before one faithful document works, or the benefit is aesthetic/assumed speed |
| WebGPU/BroMetal | Same real graph in simplest DOM/SVG/Canvas fallback and BroMetal | Product-sized workload is CPU-render limited and GPU meets the predeclared latency/memory/accessibility/device-loss gates | No real bottleneck, no meaningful win, Safari/WKWebView fork, or inaccessible fallback |
| Wasm compute | TypeScript and Wasm implementations of one measured kernel | End-to-end workflow and main-thread time improve after copy/startup/cancellation costs | No kernel consumes enough time or differential behavior appears |
| celld local | Disposable pinned sidecar running one ZD-authored Worker offline through repeated hard-kill/restart/upgrade tests | Acknowledged state survives, loopback auth/lifecycle are sound, and it is simpler than the fallback | External bucket/account/daemon is required, data is lost, endpoint/auth is weak, or embedded SQLite is deeper/simpler |
| Worker portability | Identical narrow ZD Worker artifact against pinned celld and workerd/Workers | Contract/state traces agree without runtime branches | Cloudflare compatibility work leaks into product code; choose one runtime explicitly |

Passing one proof does not endorse the other technologies. Failing a proof removes a component, not
the product direction.

### 4. Re-score the shell only after product and fidelity evidence

Thought 1's native direction becomes credible when:

- the GPUI candidate passes the document parity/fidelity gate;
- its quick-window, input, accessibility, layout restore, and stream behavior pass on the target Mac;
- compiled widgets demonstrate a cleaner, faster product—not merely different implementation; and
- future untrusted extensions have a credible non-native sandbox boundary.

Thought 2's broader portable direction becomes credible when:

- cloud or multi-device work is a repeated user job rather than deployment elegance;
- the current DOM product remains the accessible text/layout owner;
- local and remote adapters satisfy the same product contract without dual writable authorities;
- celld's lifecycle and security limitations are trapped behind an optional service boundary; and
- WebGPU/Wasm remain bounded accelerators rather than application-wide obligations.

The weighted framework currently scores the coherent hybrid Thought 2 at 2.85/5 and Thought 1 at
2.70/5, with overlapping uncertainty. That is evidence to experiment, not a decision. See
[`decision-framework.md`](research/decision-framework.md).

### 5. Add installable extensions only after the host boundary is real

The staged model in [`extensibility-model.md`](research/extensibility-model.md) is:

1. **v0:** trusted linked feature packs and validated layout/profile data;
2. **v1:** one constrained package format with isolated execution, one widget/panel surface,
   namespaced storage, read-only project handles, commands, quotas, and revocation;
3. **later:** richer layouts and full-canvas isolated surfaces after compatibility, recovery,
   accessibility, installation, updating, signing, and conformance are proven.

Do not expose Rust dynamic libraries, GPUI objects, DOM access to the privileged Tauri page, raw
Tauri IPC, arbitrary shell strings, raw secrets, arbitrary WGSL, or celld runtime objects. A public
contract should carry semantic contributions and opaque capabilities, independent of GPUI, DOM,
WebGPU, Tauri, Workers, and celld.

## Security gates are part of the implementation spec

The full threat model is in [`security-and-trust.md`](research/security-and-trust.md). The decisions
that should be made now are:

- bundled native/web features are trusted ZD code, not “sandboxed plugins”;
- downloaded native libraries never run in the ZD process as the ordinary extension path;
- executable web extensions never share the privileged Tauri document or native IPC;
- untrusted guests begin with no filesystem, process, network, clipboard, secret, or GPU authority;
- host-issued capabilities name product operations and resources, not raw paths or `exec(string)`;
- security prompts, safe mode, reset, permissions, update recovery, and unsaved-work UI remain
  unreplaceable core surfaces;
- celld runs trusted first-party code only until an independently reviewed tenant/code isolation
  system exists; and
- cloud single-principal, shared tenancy, and arbitrary publisher code are three separate release
  milestones.

Before adding an untrusted Tauri child view, narrow the current window-wide capability target to the
exact privileged webview and protect custom application commands. The current plugin allowlist alone
does not isolate another webview in the same window.

## What not to build yet

- A universal plugin SDK or marketplace.
- A generic event bus, service locator, or cross-renderer widget ABI.
- A canvas-rendered Markdown editor or full WebGPU shell.
- A permanent GPUI shell embedding the complete web app.
- Two independent layout, command, state, or widget systems for native and web code.
- Automatic local/cloud synchronization or two writable canonical stores.
- A Cloudflare OS or bb fork.
- A local celld dependency merely to reserve a future cloud option.
- Hostile public multi-tenancy on celld alpha.
- A new terminal emulator, general browser, IDE/LSP platform, or agent inference engine.

These may become reasonable after measured product needs appear. Building them now would make the
infrastructure broader than the experience it is meant to support.

## Decisions needed from the owner

The research can narrow the choices, but it cannot make these product decisions silently:

1. Does “thinking bigger” revise the current anti-dashboard/closed-Settings design contract, while
   preserving it as the default?
2. Should the global chord resume the last context or open Attention by default? The recommendation
   is to test both and ship one predictable behavior.
3. Is cloud/multi-device access an observed core job or a future option?
4. Does “complete customization” promise safe runtime composition, or also reviewed source-level
   rebuilding? The recommendation is to name both and not confuse them.
5. Which structured agent source should make the first Attention claims, and how does it signal
   freshness?
6. Which five external design partners resemble the primary solo, keyboard-oriented, multi-project
   user closely enough to test the product hypothesis?

## Recommendation in one sentence

Build the product that can earn extensibility before building the extension platform: make the
existing ZD globally available, project-aware, attentive, and slightly personal; use real second
surfaces to discover the durable seams; and let GPUI, WebGPU, Wasm, and celld survive independent
experiments before any of them becomes the architecture.
