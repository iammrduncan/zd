# Current ZD fit with the thinking-bigger directions

Research snapshot: 2026-08-12, repository commit 4a5fe03.

Status: implementation audit and migration design, not architecture authority. Accepted decisions
remain in [docs/adr](../../../../adr/README.md); product intent remains in
[vision.md](../../vision.md). This report evaluates the two proposals in
[thoughts.md](../thoughts.md) against the implementation that exists.

The earlier [current-architecture audit](../../thinking-differently/research/zd-current-architecture.md)
was taken at commit 21bc7dd. No tracked product, Tauri, ADR, or vision files changed between that
commit and this snapshot. I nevertheless re-read the current source and tests rather than treating
the prior report as evidence. Its main claims still hold.

## Executive answer

ZD has three assets worth retaining in either direction:

1. The product behavior embodied by the one-source, always-editable Markdown surface.
2. The security and lifecycle decisions at the native boundary: scoped files, atomic writes,
   external-change refusal, safe close, and constrained external navigation.
3. The separation between suite concerns, mini-app concerns, and shell capabilities.

Those assets are not equally portable.

- **Thought 1, native Rust plus GPUI, is a rendering-engine and shell replacement.** The Rust
  filesystem logic, behavioral contracts, design specification, fixtures, and state rules can be
  retained. The TypeScript/CodeMirror/DOM implementation cannot be reused in a pure GPUI surface.
  The least-destructive route is a parallel native fidelity spike behind extracted Rust core
  functions while the present Tauri app remains the working product. An in-place rewrite would
  remove the strongest asset before proving its hardest replacement.
- **Thought 2, WebGPU/Wasm plus local-or-cloud celld, can be an extension of the current
  architecture.** Tauri can remain the local window and supervisor, the DOM/CodeMirror document
  can remain the text surface, and measured GPU-heavy widgets can be isolated canvases. A service
  adapter can be added behind a semantic workspace boundary. Replacing the whole UI with a
  WebGPU canvas and moving all authority to a service is possible as a design, but it is the
  high-risk variant and has no evidence from current performance data.

Both thoughts require the same missing product primitive: a small, versioned, suite-owned model for
projects, layout, widgets, and command bindings. That model must not be confused with a universal
plugin SDK. Start with shipped widgets and one layout schema, and extract a public extension
contract only when a second independently built widget proves the cut point.

The recommendation consistent with [Good Engineering](../../../../GOOD_ENGINEERING_H.md) is:

- use the **parallel strangler** approach for Thought 1;
- use the **DOM-first hybrid** approach for Thought 2;
- never run the old and new stores as co-equal writers;
- profile before moving work to WebGPU/Wasm;
- make each proof independently useful and keep the current product working throughout.

## Verified implementation shape

~~~text
Tauri window and Rust authority
  CLI/open request + one launch scope
  scoped text files + Markdown listing + atomic writes + stamps
  close refusal + external HTTP(S) handoff
                    |
                    | typed invoke/listen boundary
                    v
packages/app/src/platform.ts
                    |
                    v
framework-free TypeScript suite
  boot + static mini-app registry + window-local command registry
  preferences + shortcut reference + presence
                    |
                    v
md workspace
  one Markdown tree + one mounted document + review ledger
                    |
                    v
CodeMirror state + Lezer + DOM/CSS
  source buffer + selection/history + decorations/widgets
  focus + raw mode + tables/code + dirty/save/reconcile
~~~

### What the repository actually owns today

- [platform.ts](../../../../../packages/app/src/platform.ts) is still the only frontend file that
  imports Tauri APIs. Its Platform interface covers launch/open requests, scoped text files,
  workspace listing, stamps, close handling, and external URLs. The browser implementation is
  deliberately limited rather than pretending to have a filesystem.
- That interface currently bundles shell identity and workspace capability: kind is only tauri or
  browser, and suite presence behavior branches on it. A service-backed browser can satisfy the
  existing file methods for a first proof, but after a second backend works, shell/window operations
  and WorkspaceBackend operations should become separate deep capabilities instead of growing one
  giant Platform interface.
- [cli.rs](../../../../../packages/tauri/src/cli.rs) owns one current launch request, one pending
  request, and one filesystem scope under a mutex. Its mini-app allow-list contains only md.
- [fs.rs](../../../../../packages/tauri/src/fs.rs) canonicalizes paths, blocks scope and symlink
  escapes, recursively lists ignored-aware Markdown files, performs sibling-temporary atomic
  replacement, returns file stamps, and admits only HTTP(S) external URLs.
- [lib.rs](../../../../../packages/tauri/src/lib.rs) is a small Tauri adapter. It registers nine
  commands, queues macOS open events, and refuses every first close so the buffer remains the
  authority on dirty state.
- [tauri.conf.json](../../../../../packages/tauri/tauri.conf.json) declares one main window. There
  is no GPUI, WebGPU product code, Wasm application target, celld integration, process supervisor,
  global-shortcut plugin, dynamic library loader, or plugin marketplace in the current manifests.
- [types.ts](../../../../../packages/app/src/suite/types.ts) gives a mini app one launch request,
  one Platform, a host element, and teardown. [registry.ts](../../../../../packages/app/src/suite/registry.ts)
  is an in-memory map; [main.ts](../../../../../packages/app/src/main.ts) statically registers only
  md. This is a useful composition seam, not a runtime plugin system.
- [shortcuts.ts](../../../../../packages/app/src/suite/shortcuts.ts) is a well-defined,
  window-local command registry. It provides stable command IDs, collision checks,
  availability, press/release behavior, and one dispatch path. It does not register OS-global
  keys, persist user bindings, or resolve commands across widgets.
- [preferences.ts](../../../../../packages/app/src/suite/preferences.ts) persists only word wrap
  and SSPS enablement in localStorage with an in-memory fallback.
  [presence.ts](../../../../../packages/app/src/suite/presence.ts) separately stores an anonymous
  visitor ID. These are browser-origin values, not a versioned suite database.
- [workspace/index.ts](../../../../../packages/app/src/miniapps/md/workspace/index.ts) mounts one document at a
  time and destroys it on a safe file switch. It has no retained tabs, dirty-buffer collection,
  stable project ID, multi-root catalog, or serializable layout.
- [editor.ts](../../../../../packages/app/src/miniapps/md/editor/editor.ts) deliberately keeps the
  path outside the editor. It owns source text, selection, history, dirty comparison, queued saves,
  and live CodeMirror configuration. Product behavior is distributed across cohesive editor
  modules for notation, focus, tables, lists, movement, review annotations, and language support.
- [review/index.ts](../../../../../packages/app/src/miniapps/md/review/index.ts) makes an in-memory/localStorage
  ledger the live owner and regenerates zd-feedback.txt as a handoff file. Its storage key is based
  on the raw root path, not a stable project identity.
- [workspace/resize.ts](../../../../../packages/app/src/miniapps/md/workspace/resize.ts) keeps panel
  width only in the element style for the mounted session. There is no general panel or layout
  model hiding behind the current sidebar.

### What should be retained

The following are product assets, even when their present code cannot move unchanged:

- The one source buffer as the authority for text, selection, focus, raw/rendered presentation,
  dirty state, and undo. This is the accepted decision in
  [md ADR 0002](../../../../adr/md/0002-use-one-always-editable-document-surface_H.md).
- The editor-facing API in [editor.ts](../../../../../packages/app/src/miniapps/md/editor/editor.ts):
  mount, text, selection, dirty, save, replace, toggle behavior, and teardown. It is a good
  behavioral boundary even though its implementation is CodeMirror-specific.
- The rule that bytes become clean only after the storage owner confirms the write, from
  [md ADR 0003](../../../../adr/md/0003-confirm-writes-before-marking-a-document-clean_H.md).
- The rule that untrusted documents never acquire script, network, file, or arbitrary external
  protocol capability, from
  [md ADR 0004](../../../../adr/md/0004-treat-rendered-markdown-as-untrusted_H.md).
- One suite command registry as the source of both dispatch and discoverability, from
  [suite ADR 0004](../../../../adr/suite/0004-dispatch-application-commands-from-suite-registry_H.md).
- Native ownership of file grants and path validation, from
  [suite ADR 0003](../../../../adr/suite/0003-scope-file-access-to-launch-workspace_H.md).
- The design system, fixtures, and observed interaction tests. A native rewrite may replace CSS,
  but it should not silently replace typography, focus semantics, save truthfulness, or the
  chrome-free product character in [vision.md](../../vision.md).

The current CodeMirror/DOM surface is intentional product lock-in, not incidental framework debt.
It uses browser layout for exactly the hard cases the earlier egui prototype failed to make cheap:
wrapping, baselines, editable source ranges, widgets, selection, IME, and viewport work. Thought 1
must earn the cost of replacing those capabilities. Thought 2 does not need to.

## Asset disposition by direction

| Current asset | Thought 1: Rust + GPUI | Thought 2: WebGPU/Wasm + celld | Safe bridge |
| --- | --- | --- | --- |
| Tauri window/config/package | Replaced by a GPUI application if the direction remains purely native | Retained as local shell and eventual service supervisor | Keep release pipeline and window behavior until the new shell passes native checks |
| TypeScript suite boot | Reimplemented in Rust | Retained initially | Preserve mini-app and suite-surface concepts, not every TypeScript type |
| CodeMirror document surface | Rewritten, or temporarily kept in a separate web surface; it is not portable native code | Retained as the primary text/IME/accessibility surface | Treat its Editor API and behavior tests as the contract |
| DOM/CSS design implementation | Rewritten against GPUI primitives | Retained for DOM panels; expose a narrow token snapshot to GPU widgets | Port semantic tokens, never duplicate arbitrary CSS state in a canvas |
| Markdown-it/Shiki pipeline | Replace or wrap in a native renderer | Retain unless profiling identifies a real parsing/highlighting bottleneck | Golden safe-rendering fixtures define allowed output and protocols |
| Platform interface | Replace TypeScript adapter with Rust traits/services | Retain for the first service adapter, then split by proven capability | Keep calls semantic; do not mirror GPUI, Tauri, HTTP, or celld APIs |
| Rust launch/scope/filesystem logic | Extract pure functions and reuse below GPUI | Reuse locally below Tauri or a local service | Move framework-free logic without changing behavior; leave Tauri wrappers thin |
| Static mini-app registry | Port the concept, replace implementation | Retain as bootstrapping code | Add a shipped widget catalog before inventing external dynamic loading |
| Suite command registry | Port its semantics to Rust | Retain for DOM commands; add a native global dispatcher above it | One command ID should map global, suite, and widget bindings to one action |
| localStorage preferences/reviews | Must be exported and imported or intentionally reset | Must move to explicit state for local/cloud parity | One-time versioned import; never dual-write indefinitely |
| Browser and Rust tests | Preserve as reference; port contract cases and add native interaction tests | Reuse directly for retained surfaces and add adapter conformance tests | Fixtures are more portable than implementation-coupled unit tests |

## Capability and gap matrix

| Larger-goal capability | Current capability | Missing primitive | Thought 1 fit | Thought 2 fit |
| --- | --- | --- | --- | --- |
| Opinionated default application | Strong: one deliberate md experience and suite design system | More shipped mini apps/widgets | Native catalog can express it, but all UI is a port | Existing app remains the default while widgets are added |
| Add mini apps | Static registration is cheap at build time | Runtime discovery, lifecycle/versioning, capability grants | New Rust catalog and eventually Wasm/plugin boundary | Existing mount contract can host compiled web modules first |
| Add widgets | No widget contract; review and reference are bespoke surfaces | Widget identity, inputs, state, permissions, mount/unmount | Natural GPUI view components, but native dynamic code is high trust | DOM or canvas widgets fit the current host; Wasm can become an isolation boundary later |
| Add/rearrange panels | One fixed sidebar/document split and ephemeral resize | Versioned layout tree, stable panel IDs, restore rules | GPUI becomes the layout engine | DOM/CSS remains layout engine; canvas should not own application layout |
| Add/rebind hotkeys | One strong in-window registry with hard-coded chords | Persisted bindings, scopes, conflict policy, OS-global adapter | Port registry semantics plus native shortcut registration | Extend current registry and dispatch semantic global events from Tauri |
| Completely redesign UI | Requires source/CSS changes | Declarative composition and replaceable views | Maximum native freedom after expensive rewrite | High flexibility in DOM; GPU islands can change visualization without replacing text |
| Retained projects/sessions | One launch scope and one mounted buffer | Stable project IDs, dirty-buffer collection, session serialization | New Rust suite store required | Shared service/store required for local/cloud parity |
| Local files | Strong one-root, least-privilege Rust authority | Multiple explicit grants and stable root handles | Reuse extracted Rust core | Reuse locally; cloud needs a different workspace implementation |
| Cloud workspaces | None; browser adapter has no filesystem | Authenticated resource API, revisions, remote storage | Outside the initial native direction | Central to the celld direction |
| Local/cloud same app | Only browser development parity, not data parity | One semantic workspace/state protocol and two implementations | Not a Thought 1 requirement | Good fit if local is a real service implementation, not a second code path |
| High-performance visualization | No canvas/GPU layer and no measured bottleneck report | Profile, workload, rendering island, fallback | GPUI may help, but must be measured | WebGPU is suitable for bounded visual widgets; it is not automatically a better text editor |
| Terminal/agent/process widgets | No process or PTY authority | Supervisor, session handles, approvals, cleanup | Native Rust can own runtime processes | Local service can own them; cloud service needs isolation and tenancy |
| Untrusted third-party customization | No third-party loader | Manifest, versioning, sandbox, permissions, recovery | Native dynamic libraries would enlarge trust sharply; prefer compiled shipped widgets or Wasm | Wasm may isolate compute, but DOM/network/storage capabilities still need explicit grants |

The current mini-app registry closes only the build-time composition gap. Calling it a plugin system
would hide the unsolved parts: discovery, API compatibility, durable state, permissions, recovery,
distribution, and trust.

## State authority for either future

Customization becomes unmanageable if UI components, localStorage, the filesystem, and a service can
all claim to own the same fact. The state model should distinguish durable product state, document
content, live edit state, runtime handles, and render caches.

~~~text
Versioned product-state store
  projects[id] ---- root reference, open resources, selected project
  layouts[id] ----- panel tree containing widget instance IDs
  widgets[id] ----- widget kind + small validated configuration
  profiles[id] ---- portable layout/theme/widget config + bindings
          |
          v
Suite command/reducer layer
          |
          +---- GPUI views, DOM views, and WebGPU canvases are projections
          |
          +---- capability adapters perform files/process/network/window work

Separate authorities
  workspace backend ---- committed document bytes + revision/stamp
  document surface ----- unsaved buffer + selection + undo + viewport
  specialist runtime --- PTY/agent/browser live session
  native security layer - root grants, tokens, sandbox/process permissions
~~~

| Fact | Canonical owner | What may be persisted | What must not become a second authority |
| --- | --- | --- | --- |
| Committed document bytes | Local scoped filesystem or cloud workspace backend | Content plus storage revision in that backend | Suite layout database |
| Unsaved text, selection, undo | Per-project `DocumentSession`, mounted or suspended | Optional crash-recovery journal later | Native shell, celld metadata record, or widget cache |
| Project identity and active project | Versioned SuiteState | Stable ID, display name, backend/root reference | Raw path as the only identity |
| Applied region/layout and widget-instance state | Versioned SuiteState | Device/project placement, selected widget, and instance overrides | DOM tree, GPUI view graph, GPU scene serialization, or portable defaults |
| Portable layout templates and default widget configuration | Versioned Profile | Validated template/default data owned by stable widget kind | Device paths/grants, live instance state, or arbitrary executable closures |
| Command bindings | Versioned portable Profile; suite command registry is its runtime projection | Command ID, chord, scope | Separate per-widget key listeners, device-local duplicate, or a second native list |
| File/process/network permission | Native or service capability authority | Grant references and auditable policy where appropriate | A widget-supplied boolean saying it is trusted |
| Terminal/agent/browser live data | Owning specialist runtime | Typed handle and attention summary in SuiteState | Copies of provider credentials, cookies, PTY byte streams, or private databases |
| Render caches/GPU buffers | View/widget instance | Nothing durable unless recomputable and versioned | Product state store |

For Thought 1, the SuiteState implementation can be an in-process Rust module with atomic,
versioned persistence. GPUI views send commands and render snapshots. For Thought 2, a local or cloud
service should own the same durable model only if a remote control plane earns adoption; direct local
state remains a valid implementation. Each client owns ephemeral view state. A service protocol must
expose product operations such as openProject and setLayout, not celld container details; document
bytes/revisions remain owned by their file/document provider.

Do not begin by implementing the full table. The first schema should contain only what one working
second widget or project switch needs. A credible initial shape is:

~~~text
SuiteStateV1
  projects: [{ id, name, workspaceRef }]
  activeProjectId
  supportRegion: { content: hidden | files | attention, side, size }
~~~

After two real surfaces prove the need, a later schema may add widget instances, bindings, or a small
split/tab `PanelNode`. Those are not part of the MVP merely because a future renderer can express
them. Even the narrow shape is a proposal, not an invitation to build a generic reducer/event
framework. Direct functions over these records are enough until concurrency or a second process
proves otherwise.

## Dependency and lock-in map

| Dependency or boundary | Current/proposed coupling | Exit cost | Containment |
| --- | --- | --- | --- |
| CodeMirror 6 | High and current; editor state, decorations, ranges, widgets, keymaps, and measurements implement product behavior | High if removed; low across web-capable shells | Treat as a product engine with a small Editor facade |
| Browser DOM/CSS | High and current; layout, typography, focus, accessibility, and tests depend on it | High for pure native; low for Tauri/browser/cloud clients | Keep application layout in DOM for Thought 2; port semantic design rules for Thought 1 |
| Tauri 2 | Narrow in frontend, moderate in Rust adapters and packaging | Low to moderate | Keep Tauri types at adapters; extract pure Rust file/scope functions before a second shell |
| Markdown-it and Shiki | Encapsulated by Markdown/language modules but used in visible behavior | Low to moderate | Preserve safe-rendering inputs/outputs and fixtures |
| localStorage/webview origin | Small data volume but implicit keys and path-derived identity | Moderate because another shell/origin cannot read it naturally | One explicit export/import and then one owner |
| OS path strings | Current launch and review identity | Moderate for renamed roots, cloud projects, or sandbox bookmarks | Stable project IDs plus backend-specific workspace references |
| GPUI | Proposed only; would own all Thought 1 layout and input rendering | Potentially high after a native rewrite | Keep suite state and filesystem core framework-free; demand a fidelity proof before porting all surfaces |
| Native Rust widget binaries | Proposed possibility; share process authority and ABI/release lifecycle | High security and compatibility lock-in | Begin with shipped compiled widgets; consider a constrained Wasm boundary only after a real third party |
| WebGPU/brometal | Proposed only; would couple scene, shaders, input hit-testing, and device recovery | High if it owns text and application layout; bounded if used per widget | Canvas islands with DOM lifecycle, fallbacks, and semantic data inputs |
| Wasm | Proposed only; boundary cost depends on data transfer and host capabilities | Moderate | Pass typed snapshots/commands, not DOM objects or huge per-frame serialized graphs |
| celld | Proposed only; could become deployment, process, protocol, and storage lock-in at once | High if clients speak its internals | Put a small ZD service API in front; local and cloud implementations pass the same contract tests |
| Remote service protocol | Proposed; becomes the local/cloud compatibility contract | Intentionally durable | Version it, use revisions/idempotent commands, and keep deployment vocabulary out |

The package and Cargo manifests currently contain none of GPUI, brometal, celld, or an application
WebGPU layer. Transitive wasm-bindgen entries in Cargo.lock are not evidence that ZD has a Wasm
product architecture.

## Thought 1: native Rust with GPUI

### What it replaces

A pure Thought 1 implementation replaces the Tauri window, browser runtime, TypeScript suite,
CodeMirror state and rendering, DOM layout, CSS styling, and most browser E2E implementation seams.
It can reuse Rust algorithms only after separating them from Tauri wrappers. It can also reuse
behavioral requirements, design tokens as semantic values, Markdown fixtures, and state schemas.

The decisive risk is not opening a window or drawing panels. It is reproducing the
always-editable rendered Markdown behavior without rebuilding a general text-layout/editor engine.
That includes source-position-preserving widgets, selection and undo, incomplete Markdown while
typing, IME, accessibility, wrapping, tables, fenced code, focus geometry, and clean/dirty/save
semantics.

### Approach 1A: replace in place

Create a GPUI application in the current desktop package, port the shell and widgets, port the
Markdown surface, then remove Tauri and the web frontend at parity.

Advantages:

- One runtime and one native rendering model at the destination.
- No permanent DOM/native split.
- The destination can be designed around the final widget and panel primitives.

Costs and failure modes:

- The working editor is unavailable as a reusable component; nearly all visible behavior is a
  rewrite.
- A long parity branch makes every current bug fix a merge or duplicate-port problem.
- Packaging, accessibility, keyboard behavior, file safety, and the editor all move at once.
- Success can be declared on visually plausible output while losing hard-won save, focus, or
  untrusted-content guarantees.
- It violates the repository's small-safe-refactor and working-demo guidance unless divided into
  independently shippable substitutions.

This approach is not recommended.

### Approach 1B: parallel native strangler

Keep the Tauri/CodeMirror app as the shipped product and build a sibling GPUI proof around shared,
framework-free Rust modules. Replace one bounded product slice only after it passes explicit fidelity
gates. Avoid a general two-way bridge; both shells may read the same committed files, but only one
shell opens a given dirty editing session.

Sequence:

1. Extract path scoping, workspace enumeration, stamps, and atomic write from
   [cli.rs](../../../../../packages/tauri/src/cli.rs) and
   [fs.rs](../../../../../packages/tauri/src/fs.rs) into a small Rust core crate. Keep the current
   Tauri commands as adapters and keep every existing Rust test passing. Do not extract window or
   command abstractions merely because GPUI may need them later.
2. Build one GPUI window with a hard-coded shipped widget catalog and a minimal in-memory PanelNode
   tree. Prove mount/unmount, split resize, focus transfer, command dispatch, and crash-safe teardown.
   No plugin loader is needed.
3. Implement one native document fidelity slice against an existing agent-document fixture:
   paragraph, heading, list, emphasis/link, fenced code, table, selection, edit, undo, dirty
   transition, successful save, refused save, and external-change handling. This is a decision
   experiment, not the beginning of an assumed full port.
4. Add one second shipped widget and persist only the layout/configuration facts it needs using
   SuiteStateV1. Restart and restore it. A second widget is the first evidence for a widget
   interface.
5. Compare real behavior, accessibility, cold/warm launch, typing latency, long-document scrolling,
   idle CPU, and implementation size. Choose among continuing the native port, keeping a hybrid
   web document surface, or stopping. Do not port the remaining editor modules before this gate.
6. If the gate passes, migrate mini-apps one independently useful surface at a time. Keep file format
   and SuiteState schema shell-neutral, and retire the Tauri surface only after the last material
   data export and dirty-buffer cutover.

This is the recommended Thought 1 approach. It follows Chesterton's Fence, Design It Twice, and
Refactor Small and Safe. Its main disadvantage is temporary duplicate UI work, but that duplication
is bounded evidence rather than a permanent abstraction.

### Thought 1 proof milestones and gates

| Milestone | Bounded deliverable | Pass condition | Stop/reconsider condition |
| --- | --- | --- | --- |
| T1.0 shared Rust core | Scope/list/stamp/write pure module; unchanged Tauri behavior | Existing Rust tests plus adapter tests pass; no frontend change | Extraction needs a large generic framework or changes file authority |
| T1.1 native shell | One window, one split, two built-in placeholder widgets, one command registry | Deterministic focus/layout/teardown; state remains in memory | GPUI lifecycle forces application state into view objects |
| T1.2 document fidelity slice | One representative file and the edit/save behaviors above | No lost source positions or dirty/save truth; keyboard/IME/accessibility checklist passes | Requires building a broad text engine before one file works |
| T1.3 retained customization | Add/rearrange one real second widget and restore after restart | One small versioned state record; corrupt config falls back safely | Schema serializes GPUI internals or widgets write storage directly |
| T1.4 migration decision | Profile and code-size comparison with current surface | Native direction has demonstrated product or operational value | Only aesthetic novelty or assumed speed remains |

### Thought 1 data migration

- Markdown and zd-feedback.txt stay ordinary workspace files. Do not import source documents into an
  opaque application database.
- GPUI cannot assume it can read the old webview origin's localStorage. Before retiring the web
  app, add an explicit export in the existing app for word wrap, SSPS enablement, and every
  zd.review.v1 ledger. Import that versioned file once in the Rust store.
- Review export matters more than the two preferences. zd-feedback.txt is a useful human-readable
  fallback, but it does not carry the existing ledger's stable comment IDs as stored.
- Do not migrate the anonymous SSPS visitor ID into a new runtime by default. Identity/privacy
  continuity should be an explicit product decision, not collateral state copying.
- Current panel width, open-document collection, and undo history are not durable today; there is
  nothing honest to migrate. A cutover must refuse while the current CodeMirror buffer is dirty.
- Raw roots used in review keys must map to stable project IDs. Preserve the original root as an
  import hint, not as permanent identity.
- Write SuiteState atomically, keep the pre-migration export until the new store opens
  successfully, and make import idempotent.

### Thought 1 test seams

Retain or port behavior at the coarsest useful cut points:

- Rust scope, symlink escape, Markdown walk, stamps, permissions, and atomic-write cases already
  colocated in [cli.rs](../../../../../packages/tauri/src/cli.rs) and
  [fs.rs](../../../../../packages/tauri/src/fs.rs).
- Pure save/reconciliation decisions in
  [reconcile.ts](../../../../../packages/app/src/miniapps/md/reconcile.ts) become language-neutral
  contract cases.
- [editor/index.test.ts](../../../../../packages/app/tests/unit/editor/index.test.ts) defines the editor facade
  and save queue behavior; [editor/save.spec.ts](../../../../../packages/app/tests/e2e/editor/save.spec.ts)
  covers real browser input. Port outcomes, not CodeMirror implementation calls.
- Markdown visual/interaction fixtures under
  [packages/app/tests/e2e](../../../../../packages/app/tests/e2e/) provide a parity corpus. Add
  native golden screenshots only for stable layout claims, plus direct interaction tests for
  selection, IME, accessibility, and focus.
- [workspace.test.ts](../../../../../packages/app/tests/unit/md/workspace.test.ts) pins safe switch and
  teardown. Reuse those lifecycle scenarios for the new suite reducer.
- Keep one end-to-end test that writes a real temporary file through the GPUI adapter. Unit tests
  of a view model do not prove native file authority or atomic save.

## Thought 2: WebGPU/Wasm with local-or-cloud celld

### What it replaces

Thought 2 does not inherently require replacing the current app. The least-destructive form retains
Tauri, TypeScript, DOM/CSS, CodeMirror, and the suite lifecycle. It adds:

- WebGPU/Wasm renderers for widgets with a measured need;
- a versioned suite/workspace service protocol;
- a cloud implementation of that protocol;
- a local service lifecycle owned by the Tauri shell;
- explicit authentication, revision, and capability boundaries.

A canvas-first interpretation would replace the DOM/CodeMirror surface and make the service the
application's center. That is a much larger decision than “use GPU acceleration” and should be
evaluated separately.

### Approach 2A: one canvas application and service everywhere

Rebuild the complete UI in Wasm/WebGPU, make a celld-hosted service authoritative for state and
workspaces, and make Tauri only start or connect to a local service and present the canvas.

Advantages:

- One client rendering architecture across local and cloud.
- A service boundary exists from the start.
- GPU-native visual composition can be consistent across widgets.

Costs and failure modes:

- It combines an editor rewrite, rendering rewrite, distributed-system boundary, local process
  supervisor, cloud auth/storage, and data migration.
- Canvas text, accessibility, selection, clipboard, IME, links, forms, and assistive semantics must
  be rebuilt or overlaid with DOM, often recreating a hybrid less explicitly.
- Every keystroke can become a client/service protocol concern if authority is drawn incorrectly.
- No current profile shows browser layout or CodeMirror to be the performance bottleneck.
- Local-only users inherit service startup, ports, tokens, crash recovery, upgrades, and logs even
  when direct native IPC already works.

This approach is not recommended as the initial migration.

### Approach 2B: DOM-first application with GPU and service islands

Keep the current document and shell. Add WebGPU only inside widgets whose workload is demonstrated,
and add a backend adapter only for data that must be available in both local and cloud modes. Keep
document editing local and responsive; commit through revision-aware storage operations.

Sequence:

1. Profile cold/warm launch, large agent documents, scrolling, typing, and the first intended
   visualization on representative hardware. Record frame time, scripting/layout/paint time,
   memory, and idle CPU. If there is no relevant bottleneck, do not move the document surface.
2. Mount one WebGPU/Wasm widget in an ordinary suite-owned DOM host. A state graph or high-density
   attention view is a better proof than Markdown text because it has an independently measurable
   scene. Its interface should be data snapshot in, semantic command out, resize, visibility, and
   teardown. Keep labels/actions in accessible DOM where needed.
3. Define the smallest service contract that a cloud-backed proof needs, for example:
   list projects, open a document with revision, and save if revision matches. Implement a service
   Platform/workspace adapter without changing the editor. Do not expose container, filesystem, or
   process primitives to widgets.
4. Run that contract in two configurations: a locally supervised instance reachable only through
   a narrowly authenticated loopback channel, and one isolated cloud instance. Use the same
   conformance suite. Do not add collaboration, offline merge, or multi-device sync to this proof.
5. Move SuiteStateV1 behind the service only after project/layout restoration works locally in
   memory. The browser client and Tauri client then render the same durable state, while selection,
   undo, viewports, and GPU buffers stay client-local.
6. Migrate another hot path only if profiling shows that the first WebGPU island produced a material
   benefit. Keep a DOM or simplified fallback when device initialization fails.

This is the recommended Thought 2 approach. It traps new complexity inside a deep rendering widget
and a deep workspace service instead of spreading WebGPU, Wasm, networking, and deployment concerns
through every mini app.

### Thought 2 proof milestones and gates

| Milestone | Bounded deliverable | Pass condition | Stop/reconsider condition |
| --- | --- | --- | --- |
| T2.0 performance baseline | Repeatable trace on current app and intended heavy workload | A named bottleneck and target are recorded | “GPU should be faster” is the only justification |
| T2.1 GPU island | One real widget mounted, resized, hidden, restored, and destroyed by suite lifecycle | Measurable win, no impact on editor input, accessible semantic fallback | Canvas owns layout/commands or loses the device without recovery |
| T2.2 service contract | Project list plus revisioned read/save | Current editor works through adapter; conflict leaves buffer dirty | Client receives generic filesystem/exec or celld-specific objects |
| T2.3 local/cloud conformance | Same API tests against isolated local and cloud instances | Equivalent product semantics and explicit auth/failure states | Local and cloud need divergent application branches |
| T2.4 durable customization | One project, layout, widget config, and binding round-trip | Versioned state restores in Tauri and browser | localStorage remains a co-authoritative store |
| T2.5 migration decision | Profile, reliability, startup, and operational comparison | Complexity buys measured visualization or deployment value | Service/GPU overhead exceeds the demonstrated benefit |

### Thought 2 data migration

- Do not turn “deployable to cloud” into automatic upload of existing local workspaces. A local
  filesystem workspace and a cloud workspace are different backend references until an explicit
  import/sync product is designed.
- Preserve source files in their owning backend. The suite store records project and workspace
  references, not a shadow copy of every file.
- Replace root-path localStorage keys with stable project IDs before cloud import. A browser origin
  cannot share the Tauri origin's preferences or review ledger.
- Choose one authority for review comments. A safe transition is export localStorage ledgers to a
  versioned record, import them into the project store, verify counts/hashes, and then make
  localStorage read-only for one release before removing it. Do not keep service and localStorage
  dual-write indefinitely.
- Service saves need opaque revisions or equivalent compare-and-swap behavior. The current
  modified-time/length FileStamp remains suitable for the local filesystem adapter, but it should
  not be fabricated as a cloud revision.
- Client crash recovery for dirty text is a separate feature. Do not send every edit to the durable
  project store merely to claim cloud parity; the editor remains the authority until a deliberate
  draft/journal protocol exists.
- Local service upgrades require a schema migration transaction and rollback/backup. The Tauri
  wrapper should not report the new service ready until it opens the migrated store and passes a
  health/version check.
- Never migrate SSPS visitor identity, provider credentials, browser cookies, or environment
  snapshots as SuiteState.

### Thought 2 test seams

- Reuse the entire current browser editor and workspace suite for retained DOM behavior. The
  repository already separates jsdom unit tests from real-browser geometry in
  [vitest.config.ts](../../../../../vitest.config.ts) and
  [playwright.config.ts](../../../../../playwright.config.ts).
- Turn the Platform-like workspace methods into a conformance suite run against the existing Tauri
  adapter, local service adapter, and cloud test adapter. Test semantics, not transport status
  codes.
- Test revision conflict at the editor/storage cut point: a refused save leaves the current buffer
  dirty and preserves both versions.
- Test GPU widgets for deterministic model-to-scene calculations separately, then use browser tests
  for resize, device loss/fallback, pointer/keyboard routing, accessibility labels, and teardown.
- Add service integration tests for schema migration, idempotent commands, unauthorized project
  access, local bind scope, restart recovery, and version mismatch.
- Keep a Tauri-native smoke test for child lifecycle: one local service starts, receives a health
  check, stops with the app, and does not leave an orphan. Browser mocks cannot prove that.
- Add benchmark thresholds only after a stable representative workload exists. A synthetic empty
  canvas is not evidence of product performance.

## The least-destructive shared path

The two thoughts do not require an immediate fork in the road. The following work preserves options
for both:

1. **Keep document bytes and dirty state where they are.** Do not begin by moving the editor or
   storing source in a suite database.
2. **Extract one proven Rust seam only when a second adapter uses it.** File scope/list/write is the
   strongest candidate because it already contains framework-light logic and has real tests.
3. **Introduce one real second widget before a widget SDK.** Give built-in widgets stable IDs,
   lifecycle, command contributions, and small configs. Keep registration compiled and explicit.
4. **Persist the smallest placement that widget needs.** Start with
   `supportRegion { hidden | files | attention, side, size }`. Add a split/tab `PanelNode` only after
   two simultaneous surfaces prove it necessary.
5. **Keep one command identity across layers.** A native global hotkey or GPU widget dispatches a
   suite command ID; it does not create a parallel shortcut system.
6. **Run the decisive spikes separately.** Thought 1 must prove native document fidelity. Thought 2
   must prove a measured GPU workload; local/cloud contract parity is a separate spike only after a
   demonstrated remote job. Passing one says nothing about the others.
7. **Write an ADR only after evidence chooses a direction.** This report belongs under objectives
   because it is deliberation. Accepted replacement of
   [suite ADR 0001](../../../../adr/suite/0001-use-tauri-with-portable-web-frontend_H.md) requires
   explicit new evidence and a superseding ADR.

## Non-negotiable migration invariants

- There is one writable authority for each fact during every migration step.
- A shell change never broadens file scope merely because a client can name another path.
- A view crash cannot mark unsaved bytes clean.
- Widget teardown removes commands, listeners, GPU resources, and runtime handles idempotently.
- Corrupt or newer layout/config state falls back to the opinionated shipped layout without
  deleting the unread record.
- Untrusted widget/document data never receives raw Tauri, process, filesystem, network, or celld
  control APIs.
- Local mode does not require public network access, an externally reachable port, or cloud
  identity.
- Cloud mode does not infer permission from a client-supplied local path.
- The old app remains able to open ordinary Markdown throughout the migration.

## Open questions

- Does the owner-approved product sequence remain the Quick Attention Loop, including the explicit
  `DESIGN.md` revision required before the first binding override, or does the product contract change
  first?
- Which exact record owns cross-project Attention once device-local suite catalog state is separated
  from project-local workspace restoration?
- Which second bundled widget is materially different enough from Document/Attention to prove a
  reusable composition seam?
- What representative workload, if any, demonstrates a GPU bottleneck after profiling the retained
  DOM/CodeMirror frontend?
- What recurring remote job cannot be solved locally or through a companion host and therefore earns
  a cloud/celld experiment?

## Decision summary

| Question | Answer from the current repository |
| --- | --- |
| Is the present architecture a dead end for complete customization? | No. It lacks a durable layout/widget model, but its mount, command, platform, and document seams are useful starting points. |
| Can Thought 1 reuse the existing frontend? | Not as a pure GPUI implementation. It can reuse behavior, fixtures, design rules, and extracted Rust capabilities. |
| Can Thought 2 reuse the existing frontend? | Yes. It is the lower-risk base for DOM text plus WebGPU widget islands and a service-backed workspace adapter. |
| Where should future state live? | In a versioned suite store or service, with views as projections; document bytes, dirty buffers, runtime sessions, and security grants retain separate owners. |
| Should ZD build a general plugin SDK now? | No. Ship a basic widget catalog, add one second real widget, and let the interface emerge from working code. |
| What is the first irreversible decision? | Replacing CodeMirror/DOM, or making celld-specific service state canonical. Both should wait for bounded proofs. |
| Which migration design is recommended for Thought 1? | Parallel native strangler with a hard fidelity gate. |
| Which migration design is recommended for Thought 2? | DOM-first hybrid with profiled GPU islands and a semantic local/cloud service contract. |

The important strategic distinction is still **engine versus shell**. ZD's current document engine is
where most product knowledge lives; Tauri is a relatively thin shell. Thought 1 deliberately replaces
both and therefore needs the strongest proof. Thought 2 can preserve the engine and shell while
testing the new ideas one deep module at a time. Neither direction should make customization mean
that every widget can mutate every subsystem. The path to a self-customizable ZD is a small durable
model, one command language, explicit capabilities, and replaceable views—not shared mutable
internals.
