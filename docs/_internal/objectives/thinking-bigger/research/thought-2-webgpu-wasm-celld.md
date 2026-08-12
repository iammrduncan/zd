# Thought 2: WebGPU/Wasm workbench on celld

> **Status:** initial research and architecture proposal, not an accepted product architecture
>
> **Evidence snapshot:** 2026-08-12
>
> **Source thought:** [Thought 2 in `thoughts.md`](../thoughts.md)
> **Related fit analysis:** [`current-zd-fit.md`](current-zd-fit.md)

## Executive decision: concepts, not a composable stack

The named projects do not compose into a product by wiring them together.

- **bb** contributes a useful separation between a durable control plane and a
  privileged execution host. Its server, daemon, React application, plugin API,
  and data model are not a celld deployment artifact.
- **Cloudflare OS** contributes a useful instance/capability model: a workspace
  contains isolated app instances, and privileged operations pass through
  explicit gatekeepers. Its current implementation depends on Cloudflare
  bindings that celld either does not implement or only partially implements.
- **GPUI** contributes a useful state/action/invalidation mental model. Its web
  implementation uses Rust, Wasm, and `wgpu`; it does not use BroMetal, and a
  full-canvas UI would discard ZD's strongest existing assets: DOM semantics and
  CodeMirror's text, selection, IME, and accessibility behavior.
- **BroMetal** is a small TypeScript-to-WGSL compiler and thin WebGPU runtime. It
  is not a UI framework, scene graph, layout engine, text stack, Wasm runtime,
  or server accelerator.
- **celld** is an early self-hosted Durable Objects runtime. It can plausibly
  host a deliberately small ZD control plane, but it cannot replace bb's
  machine daemon and its published compatibility surface cannot run
  Cloudflare OS unchanged.
- **Tauri** can supervise a celld executable as a sidecar. That proves process
  packaging, not local durability, startup behavior, authenticated loopback,
  cross-platform availability, or atomic upgrades; those must be spiked.

The recommended architecture is therefore a **new ZD workbench** that borrows
those ideas while preserving the current DOM/CodeMirror product. A small,
portable Worker control plane runs on celld. A separately privileged native
host owns files, PTYs, processes, and agents. Tauri launches both for local
mode. In cloud mode, celld still needs TLS/auth ingress and, for real repository
work, a connected execution host. WebGPU and Wasm are bounded accelerators
behind replaceable interfaces and are adopted only if their measured spikes
pass explicit kill gates.

This is the recommended direction, subject to three mandatory feasibility
gates: BroMetal value, celld local durability, and Worker portability. A failed
gate removes that component; it does not force the rest of the architecture to
fail.

## What the product is

The product should be described as an opinionated, programmable workbench for
ZD work, not as a browser operating system.

The first complete workflow is:

1. Open a project and objective.
2. Edit Markdown in CodeMirror.
3. Inspect objective state, dependencies, agent activity, and artifacts in
   adjacent panels.
4. Invoke semantic commands by palette, button, or hotkey.
5. Save through the workspace's authoritative document provider.
6. Resume the same layout and control-plane state after restart.

Customization means that a user can install or enable a bounded widget, place
it in a panel, bind its commands, and persist its state. It does **not** mean
that arbitrary code receives filesystem, process, Tauri IPC, GPU, or network
access.

The destination may eventually include the following built-in surfaces. They are not the first
product slice: the shared Quick Attention Loop and a second real composition consumer come first, and
a keybinding editor requires the explicit product/design revision identified in the synthesis.

- project/objective navigator;
- Markdown editor and preview;
- dependency or activity graph;
- agent/session status;
- command palette and keybinding editor;
- resizable tabs, splits, and panels;
- settings and diagnostic console.

## Evidence and feasibility

### Primary-source register

| Project or platform | Primary evidence | Consequence for ZD |
| --- | --- | --- |
| bb | [System overview](https://github.com/get-bb/bb/blob/fe432e3b1475406bc0e6f21decefc29ef978e639/docs/system-overview.md) | Its web app talks to a central server, while a host daemon owns workspaces, processes, agents, and PTYs. Copy the boundary, not the implementation. |
| Cloudflare OS | [Repository README](https://github.com/cloudflare/cloudflare-os/blob/main/README.md), [backend Wrangler configuration](https://github.com/cloudflare/cloudflare-os/blob/main/packages/workshop-backend/wrangler.jsonc) | Gadgets, Facets, Gatekeepers, sandboxed frames, a Workspace Durable Object, and Yjs are useful reference concepts. The actual backend declares Browser, KV, R2, and Worker Loader bindings. |
| celld | [README](https://github.com/denoland/celld/blob/v0.1.0/README.md), [v0.1.0 release](https://github.com/denoland/celld/releases/tag/v0.1.0), [compatibility](https://github.com/denoland/celld/blob/v0.1.0/docs/cloudflare-compat.md), [limitations](https://github.com/denoland/celld/blob/v0.1.0/docs/limitations.md), [security](https://github.com/denoland/celld/blob/v0.1.0/docs/security.md) | A credible target for a narrow Worker + Durable Object API, but alpha, single-application-per-fleet, without end-user auth or TLS, and not safe as a hostile multi-tenant boundary. |
| BroMetal | [README](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/README.md), [package metadata](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/packages/brometal/package.json) | A pre-1.0 AOT shader DSL/runtime with WebGPU-only output. It may help a graph or timeline renderer; it does not provide UI infrastructure. |
| GPUI | [GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md), [`gpui_web` crate](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui_web/Cargo.toml), [web platform source](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui_web/src/gpui_web.rs), [`gpui_wgpu` crate](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui_wgpu/Cargo.toml) | Its entity/action/frame model is instructive. The current web backend is an early one-document-canvas/one-top-level-window path with WebGPU preferred and WebGL2 fallback, using GPUI's own `wgpu` renderer. |
| Tauri | [Sidecars](https://v2.tauri.app/develop/sidecar/), [process model](https://v2.tauri.app/concept/process-model/), [webview versions](https://v2.tauri.app/reference/webview-versions/), [capabilities](https://v2.tauri.app/security/capabilities/), [CSP](https://v2.tauri.app/security/csp/), [HTTP headers](https://v2.tauri.app/security/http-headers/) | A per-target celld binary can be bundled and supervised. The UI runs in the operating system WebView, so WebGPU support must be detected on the actual target. Remote content must not inherit native capabilities. |
| WebGPU | [W3C WebGPU](https://www.w3.org/TR/webgpu/), [MDN WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) | WebGPU is a secure-context, client-side GPU API with asynchronous initialization, validation, and device-loss behavior. It is not celld-side acceleration and is not universally available. |
| WebAssembly | [WebAssembly JavaScript API](https://developer.mozilla.org/en-US/docs/WebAssembly/Guides/Using_the_JavaScript_API), [SharedArrayBuffer security requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements) | Wasm is a separate CPU execution tool. Threads/shared memory require cross-origin isolation; calls and memory copies have costs. Start single-threaded and prove a hotspot first. |

Version anchors for this snapshot are bb commit `fe432e3b` (`desktop-v0.37.0`), BroMetal commit
`ea87c08e` (`0.17.2`), celld commit `553ae73f` (`v0.1.0`, released 2026-08-05), GPUI commit
`fdf5de99`, and Tauri v2 documentation. Cloudflare OS had no tagged GitHub release at the research
date, so its two readable `main` links above remain explicitly moving evidence for the early-access
v2 line; pin an immutable revision before any spike or implementation. Every adopted dependency and
spike artifact must use an immutable commit, tag, or digest.

The local background research in [`bb.md`](../../thinking-differently/research/bb.md),
[`architecture-options.md`](../../thinking-differently/research/architecture-options.md),
[`zd-current-architecture.md`](../../thinking-differently/research/zd-current-architecture.md),
and [`tauri-nspanel.md`](../../thinking-differently/research/tauri-nspanel.md)
provides additional context. This proposal follows the repository's
[`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md) guidance: keep deep
interfaces, make invalid states difficult, profile before optimizing, and make
security restrictive by default.

### Relationship validation

#### bb and celld solve different halves

bb's host daemon has the machine authority needed to clone repositories, read
files, spawn commands, own PTYs, and run agents. celld executes Workers and
Durable Objects. Its compatibility document explicitly excludes real
`child_process`, `net`, and filesystem access from its Node compatibility
surface. Therefore:

- celld can host the durable control plane;
- celld cannot host local workspace execution;
- a native execution host remains necessary in both local and cloud workflows
  that touch a repository;
- porting bb's server to celld would be a rewrite around a different runtime
  and storage contract.

#### Cloudflare OS does not currently deploy unchanged to celld

Cloudflare OS's checked-in backend configuration declares Browser Rendering,
KV, R2, and Worker Loader bindings. celld's compatibility document says KV,
R2, Cache, Workers AI, Vectorize, Hyperdrive, Browser Rendering, and several
other products are not planned. Worker Loader is experimental and omits parts
of Cloudflare's capability environment. celld also rejects unknown Wrangler
configuration rather than silently emulating it.

That makes “Cloudflare OS on celld” false for the current upstream source. The
valid relationship is conceptual: instance-scoped state, sandboxed client
surfaces, and explicit capability gateways can inform a new, much smaller ZD
protocol.

#### Cloudflare OS local development is not a production celld path

Cloudflare OS's local command uses Wrangler/workerd state under `.wrangler`.
That is a development environment, not proof that its application can be
embedded in Tauri or operated on celld. Its repository also labels the current
system early access. It is a research input, not a stable dependency boundary.

#### GPUI and BroMetal are alternative rendering implementations

GPUI's browser work uses Rust/Wasm and `wgpu`. BroMetal compiles TypeScript
shader definitions to WGSL and provides its own thin TypeScript runtime. A full
GPUI-web frontend would not be “GPUI plus BroMetal”; it would replace BroMetal.
Conversely, using BroMetal for a canvas does not supply GPUI's entity system,
layout, text rendering, input dispatch, or accessibility model.

ZD can be **GPUI-inspired** at the application architecture level:

- model durable entities explicitly;
- express input as semantic actions;
- derive views from immutable snapshots;
- invalidate only affected projections;
- coalesce visual work into one frame scheduler.

That inspiration does not require a GPU-rendered shell.

#### BroMetal is neither Wasm nor cloud acceleration

BroMetal is TypeScript tooling and browser runtime code that produces and
executes WGSL. It can reduce shader boilerplate. It does not turn an
application into Wasm, run on the celld server, or make DOM and CodeMirror
render through the GPU. WebGPU already runs in the browser's GPU process; Wasm
would be a separate client-side CPU kernel used only where measurement
justifies it.

#### Tauri sidecar feasibility is necessary but insufficient

Tauri documents how to bundle per-target external binaries and grant an app
permission to spawn them. celld currently publishes prebuilt binaries for
Apple Silicon macOS and Linux x86-64/ARM64, but not Windows or Intel macOS.
celld's public docs describe S3-compatible bucket-backed durability and alpha
operational limits; they do not promise the exact durable, bucketless,
offline-local contract this product needs. Source contains local/memory paths,
but source shape is not a supported embedding contract.

The [`celld` executable entrypoint](https://github.com/denoland/celld/blob/v0.1.0/crates/celld/main.rs)
and [public library surface](https://github.com/denoland/celld/blob/v0.1.0/crates/celld/lib.rs)
also do not establish a stable same-process embedding API for Tauri. The
integration should therefore use a supervised executable sidecar rather than
linking celld into Tauri's process. It remains conditional on the local
durability spike below.

## Architecture options

### Option A: port or fork Cloudflare OS

Fork Cloudflare OS, replace its unsupported bindings, adapt its React/Monaco
frontend, add bb-like local execution, package a different local runtime, and
eventually deploy the result to celld.

Advantages:

- begins with a concrete gadget/capability implementation;
- inherits a multi-surface workspace and collaborative-state experiment;
- could track upstream ideas if the fork stayed shallow.

Costs and blockers:

- the currently declared bindings do not fit celld;
- Browser Rendering and R2/KV usage require product redesign, not shims;
- Worker Loader semantics are incomplete on celld;
- ZD would replace CodeMirror with a different editor stack and inherit a
  broad agent-browser product;
- adding a native execution host remains separate work;
- upstream is early access and celld is alpha, multiplying moving boundaries.

**Decision:** reject. The fork would dominate the product and still not satisfy
the local repository boundary. Revisit individual ideas, not the codebase.

### Option B: portable hybrid ZD workbench

Keep the current web application shell, DOM, CSS, and CodeMirror. Add explicit
state/action/render boundaries. Implement a small Worker control plane targeted
at celld and a privileged native host protocol. Use BroMetal canvas islands and
pure Wasm kernels only after their benchmarks pass. Tauri supervises celld and
the native host locally; cloud deployment supplies ingress and an optional
remote execution host.

Advantages:

- preserves working editor behavior and the current Tauri/web split;
- keeps the server protocol narrow enough to test on more than one runtime;
- isolates the least mature components behind replaceable adapters;
- supports local and cloud topology without pretending that their trust and
  execution environments are identical;
- allows useful product increments before GPU or third-party extensions.

Costs:

- requires a new session, persistence, and host protocol;
- local mode may need a SQLite fallback if celld durability fails;
- rich untrusted extensions remain later work;
- a cloud workspace with real files still needs a deployable execution host.

**Decision:** recommend, conditional on the gates in this document.

### Option C: full GPUI-web/Wasm canvas

Build the workbench in Rust using GPUI's web backend and render essentially the
entire application to a canvas.

Advantages:

- most faithful implementation of GPUI's rendering architecture;
- one Rust state and rendering system could eventually span native and web;
- WebGPU/WebGL2 renderer selection already exists in GPUI's web work.

Costs and blockers:

- BroMetal becomes redundant;
- GPUI web is currently an early single-document-canvas,
  single-top-level-window implementation;
- text editing, browser IME, semantic HTML, accessibility, clipboard,
  selection, and testing become application responsibilities;
- the existing DOM/CodeMirror implementation is effectively discarded;
- the migration delays control-plane and workspace value behind a rendering
  rewrite.

**Decision:** reject for the initial product. A self-contained visualization
could compare GPUI-web with the recommended BroMetal island later, but it must
not become a prerequisite.

### Comparison

| Criterion | A: Cloudflare OS fork | B: hybrid ZD | C: GPUI-web canvas |
| --- | --- | --- | --- |
| Preserves current editor | No | **Yes** | No |
| Runs on celld unchanged | No | Designed and tested for a narrow subset | Control plane still separate |
| Uses BroMetal coherently | Incidental | **Optional GPU islands** | No; uses `wgpu` |
| Native repo/process boundary | Must be added | **Explicit NativeHost** | Must be added |
| Accessibility/IME risk | Moderate | **Lowest** | Highest |
| Dependency maturity risk | Very high | **Contained by adapters** | High |
| Earliest vertical slice | Late | **Early** | Late |

## Recommended architecture

### Principles

1. **One product model, topology-specific adapters.** Actions, workspace state,
   and widget contracts are shared. Storage, execution, and transport are not
   forced into a false common implementation.
2. **The DOM owns application UI.** CodeMirror owns editing. A GPU canvas is an
   island with a semantic DOM peer, not the root of the application.
3. **The control plane never owns machine authority.** Files, PTYs, processes,
   credentials, and agent subprocesses live behind NativeHost.
4. **The server is the authority for acknowledged control state.** Client
   caches and GPU buffers are projections, never sources of truth.
5. **Extensions receive capabilities, not ambient APIs.** A Wasm sandbox, an
   iframe, and a Durable Object are not automatically sufficient trust
   boundaries.
6. **Every experimental dependency is replaceable.** BroMetal, celld local
   mode, and cross-runtime portability each have a kill gate and fallback.

### Logical topology

```text
                         semantic actions / snapshots
┌──────────────────────────────── Workbench Web UI ─────────────────────────────┐
│ DOM shell + CodeMirror     command router      layout + widget projections    │
│              │                    │                         │                  │
│              └──────────── frame/invalidation scheduler ────┤                  │
│                                                            ▼                  │
│                                               optional GPU canvas adapter     │
│                                               (BroMetal, fallback renderer)   │
│ optional pure Wasm kernels: parse / diff / layout, never authoritative state │
└───────────────────────┬──────────────────────────┬─────────────────────────────┘
                        │                          │
             WorkspaceControl API          NativeCapability API
                        │                          │
              HTTP + WebSocket                  local IPC or
                        │                   authenticated WebSocket
                        ▼                          ▼
          ┌────────────────────────┐   ┌────────────────────────────┐
          │ celld Worker + suite/  │   │ NativeHost / ExecutionHost │
          │ project Durable Objs.  │   │ files, PTY, process, agent │
          └────────────┬───────────┘   └────────────────────────────┘
                       │
               durable cell storage
```

The browser bundle may be served by celld static assets or a separate CDN, but
the bundle is not trusted with native authority merely because it shares a
deployment. The UI calls two typed clients:

```ts
interface WorkspaceControlClient {
  openWorkspace(id: WorkspaceId): Promise<WorkspaceSnapshot>;
  apply(command: ControlCommand): Promise<CommitReceipt>;
  subscribe(afterSequence: bigint): AsyncIterable<WorkspaceEvent>;
}

interface NativeCapabilityClient {
  readDocument(ref: DocumentRef, handle: CapabilityHandle): Promise<Document>;
  writeDocument(change: DocumentWrite, handle: CapabilityHandle): Promise<WriteReceipt>;
  startSession(spec: SessionSpec, handle: CapabilityHandle): Promise<SessionHandle>;
  resizePty(id: SessionId, size: PtySize): Promise<void>;
  stopSession(id: SessionId): Promise<void>;
}
```

These are illustrative contracts, not permission to expose generic RPC or a shell command string.
Each request carries a protocol version, request ID, workspace ID, host-minted opaque capability
handle, and bounded payload. The authenticated transport and broker derive caller/widget identity and
resolve the handle against the core-owned grant ledger; a caller cannot assert its own grant, root, or
identity.

### Authoritative state

If the control-plane proof is reached, state cardinality follows the product vocabulary. One personal
`SuiteCatalog` owns cross-project facts; one `ProjectState` owns the state associated with one granted
workspace. A local embedded adapter may store both transactionally without Durable Objects. Do not
start with one Dynamic Worker, Durable Object, or process per widget.

```text
SuiteCatalogV1
├── account/install identity + schema version
├── project references + pinned slots + active project
├── cross-project Attention references
├── profile references
└── monotonically increasing event sequence

ProjectStateV1
├── project identity + schema version
├── objective references
├── support region: hidden | files | attention; side + size
├── bounded built-in widget settings
├── rebuildable document index + last observed provider write receipts
└── monotonically increasing event sequence
```

Only after two real surfaces prove composition should a later project schema add split/tab layout
nodes or general widget instances. Keymap overrides live only in the portable Profile referenced by
the suite catalog; a command registry is the runtime projection. A mini-app remains a domain workflow
rather than a synonym for a saved layout.

Every mutation is a command with `operationId`, `clientId`, `baseRevision`, and
a typed payload. The Durable Object validates the command, commits state and an
event atomically, and returns the new revision/sequence. Retrying the same
`operationId` is idempotent. A stale `baseRevision` produces a typed conflict,
not last-writer-wins data loss.

Document writes do not use that generic control-state transaction. For a local workspace, NativeHost
is the sole authority for bytes and file revisions. The editor sends its base revision to
`writeDocument`; NativeHost validates the project grant, performs the atomic write, and returns the
only receipt that may mark the buffer clean. Recording that receipt in ProjectState is a separate,
idempotent projection update. A crash between the file write and projection update leaves a stale
index, not a false save claim; startup reconciliation rebuilds it from NativeHost receipts/stamps. For
a cloud workspace, the configured document provider owns the analogous write and revision. If a
future Durable Object becomes that provider, one operation must own both bytes and revision rather
than coordinating two writable services. Do not add a distributed prepare/finalize protocol merely
for layout metadata.

The first protocol should be ordinary versioned JSON over HTTP and WebSocket.
Cap'n Web or Cloudflare JS RPC can be evaluated later; adopting either now
would enlarge the portability surface for little product value.

### Rendering boundary

The shell remains semantic HTML and CSS. CodeMirror remains responsible for
document text, selection, cursor, clipboard, composition, screen-reader
semantics, and editor key handling. Panels use ordinary DOM unless profiling
shows that the number of visual primitives is the bottleneck.

The GPUI-inspired layer has four small concepts:

- **Entity:** typed state with stable identity;
- **Action:** semantic user intent independent of input source;
- **Projection:** immutable render snapshot derived from entities;
- **Invalidation:** an entity/version signal consumed by one frame scheduler.

A GPU panel implements a narrow `VisualSurface` interface:

```ts
interface VisualSurface<S> {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  update(snapshot: Readonly<S>): void;
  resize(pixelSize: PixelSize, scale: number): void;
  hitTest(point: Point): SurfaceHit | null;
  loseDeviceForTest(): Promise<void>;
  dispose(): void;
}
```

The adapter owns WebGPU initialization and a BroMetal implementation. Its peer
fallback uses DOM, SVG, or Canvas2D. It must:

- feature-detect `navigator.gpu` rather than infer support from browser name;
- treat adapter/device acquisition as asynchronous and fallible;
- observe uncaptured errors and `device.lost`;
- rebuild disposable GPU resources from the last immutable CPU snapshot;
- stop rendering while hidden and coalesce multiple invalidations per frame;
- expose the same selection/action events as its fallback;
- maintain an accessible DOM summary and keyboard path;
- cap buffers, texture dimensions, and work per frame.

BroMetal shaders are compiled and validated at build time. The initial product
does not accept arbitrary user WGSL or shader-building TypeScript. If the
adapter must fork BroMetal or reach through undocumented runtime internals, the
dependency has failed its maintainability gate.

### Wasm boundary

Wasm is allowed only for deterministic, CPU-bound functions with flat bounded
inputs, for example a profiled graph layout, large diff, parser, or search
kernel. The calling TypeScript owns cancellation and validates sizes. A kernel
returns data; it cannot mutate application state or call NativeHost.

Initial constraints:

- single-threaded Wasm;
- no WASI or ambient filesystem/network access;
- explicit memory ceiling and input ceiling;
- transfer/layout cost included in benchmarks;
- JS reference implementation used as an oracle and fallback;
- trap, allocation failure, or load failure falls back without corrupting
  state;
- no SharedArrayBuffer requirement in the first release.

This avoids forcing COOP/COEP headers and Tauri WebView compatibility before a
threaded workload is proven. Browser Wasm and any future server Wasm are
different deployment targets and should not share an assumed host ABI.

### Local topology

Local mode is three boundaries, even if distributed in one application bundle:

```text
Tauri core (trusted supervisor and NativeHost)
├── bundled WebView UI (unprivileged except explicit Tauri commands)
└── celld sidecar (loopback Worker control plane and durable state)
```

The Tauri Rust core should expose domain commands, not a general sidecar shell:

- resolve a user-approved workspace root and canonicalize every path;
- read/write documents with revision stamps and atomic replacement;
- spawn only validated executable profiles in an approved working directory;
- own PTY/session lifecycle and bounded output buffers;
- mint scoped, short-lived grants for widgets;
- supervise the exact pinned celld binary and scrub its diagnostics.

The frontend is always the bundled Tauri application origin. Do not navigate a
native-capable WebView to the sidecar or a cloud URL. The local control plane is just an API reached
over loopback. Tauri capabilities target the exact privileged webview label. Child or remote
webviews receive no IPC capability, and custom application commands authenticate or validate their
caller rather than trusting a shared window/origin.

Local document authority is split intentionally:

- the filesystem is authoritative for repository file contents;
- SuiteCatalog/ProjectState is authoritative for suite/support/widget state; its document index is a
  rebuildable projection of provider receipts;
- an unsaved CodeMirror buffer is authoritative only until save or discard;
- the save request includes the file revision observed at read time;
- an external file change produces a compare/reload/overwrite decision rather
  than an implicit overwrite.

If celld fails the local durability gate, Tauri uses an embedded SQLite control
plane implementation behind the same `WorkspaceControlClient` semantics. It
must not ship an object-store service merely to preserve the celld brand.

### Cloud topology

```text
browser
  │ HTTPS / authenticated WebSocket
  ▼
TLS + identity ingress  ───────────────┐
  │                                   │ outbound authenticated connection
  ▼                                   ▼
private celld fleet              ExecutionHost on a user's or
Worker + SuiteCatalog/ProjectState managed workspace machine
  │                                   │
S3-compatible durable bucket          repositories / PTYs / agents
```

celld does not terminate TLS or authenticate end users. Cloud operation must
provide both outside the celld fleet. celld's security documentation warns
that the alpha is not a hostile multi-tenant sandbox, its peer traffic lacks
built-in TLS, and bucket credentials are administrative. Therefore the first
cloud deployment is personal or trusted-team, one application per fleet, on a
private network with scoped bucket credentials. Do not expose cell nodes
directly to the Internet.

The optional ExecutionHost follows bb's boundary, not its implementation. It
initiates an outbound authenticated connection, advertises explicit
capabilities, and receives leases for requested sessions. It never hands the
Worker a raw filesystem or shell interface. Loss of its connection marks
sessions unavailable; the control plane must not blindly start duplicates.

A cloud-only workspace with no ExecutionHost may still edit content stored by
a cloud document provider and use non-native widgets. It cannot claim local
repository, PTY, or agent functionality.

### Persistence and sync

Initial scope has **one authority per workspace**:

- local workspace: its local control plane and filesystem;
- cloud workspace: its cloud control plane and configured document provider.

There is no transparent active-active local/cloud synchronization in the first
release. Export/import transfers a versioned checkpoint and reports conflicts.
Switching authority is an explicit migration with a source checkpoint, target
receipt, and user-visible completion state.

WebSocket events are resumable by sequence number. On reconnect the client
requests events after its last applied sequence; if the history window is no
longer available it receives a complete snapshot. A receipt is successful only
after the authoritative store has committed it. UI optimism is allowed, but an
optimistic projection must remain distinguishable and reversible.

“Authoritative store” is operation-specific: NativeHost or the cloud document provider commits
document bytes, while the control plane commits suite/layout commands. A control-plane receipt never
marks an editor buffer clean. Its document index is explicitly rebuildable and reconciles after any
missing or out-of-order projection update.

Do not add Yjs merely because Cloudflare OS uses it. For the initial single-user
editor, file revisions and server command sequencing are simpler. If live
multi-user editing becomes a funded requirement, first specify document
identity, awareness, retention, merge semantics, and encryption, then evaluate
Yjs as its own design.

GPU buffers, Wasm heaps, render caches, browser caches, and terminal scrollback
beyond the configured durable transcript policy are never canonical state.

### App and widget extension model

An extension manifest is declarative and versioned:

```json
{
  "id": "dev.zd.objective-graph",
  "version": "1.0.0",
  "apiVersion": 1,
  "ui": { "kind": "builtin", "entry": "objective-graph" },
  "panels": ["objectiveGraph"],
  "commands": ["objectiveGraph.focus"],
  "capabilities": ["workspace.files.read@1", "objectives.read@1"],
  "stateSchema": 1
}
```

Extension levels should ship in order:

1. **Built-in widgets.** Compiled with the application, reviewed, registered in
   a static manifest, and limited to domain service interfaces. They share ZD's
   full process trust even when the interfaces remain narrow.
2. **Independently installed client widgets.** A signature establishes
   provenance, not safety. Every installed executable uses the same isolated
   iframe, Worker, Wasm, or process boundary regardless of publisher. An iframe
   runs on a distinct origin with no Tauri IPC; a narrow `postMessage` RPC
   validates origin, source window, schema, request size, rate, and a
   short-lived capability token.
3. **Untrusted server apps.** Deferred until celld's Worker Loader and
   capability-stub story are stable enough for an adversarial review. A
   separate process/runtime may prove safer than dynamic Workers.

Representative interfaces are `workspace.files.read@1(projectHandle, patterns)`,
`workspace.files.write@1`, `objectives.read@1`, `ui.panel@1`, `commands@1`,
`network.fetch@1(originPolicy)`, and `process.spawn@1(profileId)`. The core-owned ledger binds an
opaque handle to extension ID, workspace, resource, operations, expiry, and user approval. Extensions
cannot name an approved root or mint/delegate a handle. Deny is the default. There is no `native.all`,
raw Tauri invoke, arbitrary command execution, or ambient fetch.

Wasm is not a trust decision. An untrusted Wasm module receives only imported
functions, bounded memory, execution budgets, and validated messages, and it
still requires a surrounding isolation design. WebGPU is also not a sandbox
for arbitrary shaders; user-provided WGSL is out of scope initially.

Widget state is namespaced by instance and schema version. A failed migration
quarantines that instance, preserves its previous bytes for export/rollback,
and loads the rest of the workspace. One widget cannot prevent shell startup.

### Trust boundaries

| Boundary | Trusted for | Not trusted for | Required controls |
| --- | --- | --- | --- |
| Tauri Rust core / NativeHost | Approved local files, process and PTY lifecycle, sidecar supervision | Extension policy decisions without an authenticated caller/grant | Narrow commands, canonical paths, scoped capabilities, audit IDs, output and process limits |
| Bundled UI | Rendering user data and issuing typed actions | Direct filesystem/process access; HTML from documents/extensions | Tauri capability allowlist, CSP, output encoding, no remote navigation, no ambient secrets |
| celld control plane | Validated control state and event sequencing in a trusted deployment | TLS, end-user identity, hostile multi-tenancy, native execution | Authenticated ingress, private network, authorization on every command, quotas, pinned version |
| ExecutionHost | Operations on explicitly opened workspace roots | Global machine access on behalf of server/widgets | Outbound authenticated channel, lease IDs, process profiles, root confinement, revocation |
| Bundled widget | ZD product behavior; it shares the application's process trust | It is not sandboxed merely because it uses narrow interfaces | Static manifest, code review, release tests, least privilege by convention, state/schema limits |
| Installed widget | Rendering its own frame and requesting granted operations | DOM parent, Tauri IPC, credentials, arbitrary network/native access | Separate origin/process/Wasm boundary, message validation, capability token, quotas |
| GPU/Wasm accelerator | Computing a disposable projection | Durable state, authorization, trusted validation | Bounds checks, resource ceilings, deterministic fallback, rebuild after failure |

The local loopback port is not a trust boundary. Other local processes can
connect to it. Each app boot must mint a high-entropy session credential,
deliver it without command-line leakage if possible, bind only to loopback,
validate `Origin` where meaningful, and require authentication on HTTP and
WebSocket upgrade. Long-lived workspace secrets live in the OS credential
store, not localStorage, URL parameters, logs, or celld command arguments.

## Lifecycle and deployment

### Tauri/celld lifecycle

The intended local sequence is:

1. Tauri acquires its single-instance/workspace lock and selects an explicit
   application state directory.
2. It verifies the bundled celld binary digest and exact supported
   binary/protocol version.
3. It creates a per-boot credential and requests a loopback-only endpoint.
   Whether celld can safely request an ephemeral port and receive secrets
   without argv exposure is a spike result, not an assumption.
4. It supplies a prebuilt, pinned Worker deployment artifact. End users do not
   run npm, Wrangler, or a compiler on first launch.
5. It starts celld, captures bounded structured logs, and waits for a readiness
   response containing build, protocol, schema, and deployment identifiers.
6. Only after readiness does the bundled UI connect and open a workspace.
7. Unexpected exit triggers bounded exponential restart. The UI enters a
   read-only/reconnecting state and retains dirty editor buffers.
8. Graceful app quit stops new mutations, persists/exports dirty UI state,
   waits for acknowledged control-plane commits, terminates owned sessions per
   policy, requests celld shutdown, then performs a bounded forced stop.
9. Application, Worker bundle, celld binary, and schema upgrade as one versioned
   unit: backup/checkpoint, forward migration, health validation, then cleanup.
   A failed validation restores the previous compatible unit.

Hiding or closing a window is not automatically full process quit. The session
lifecycle policy must be explicit: the initial version terminates app-owned
agents and PTYs on full application quit and makes that state visible before
exit. Durable detached sessions are a later feature requiring a separate
supervisor contract.

### Cloud deployment

The build emits immutable, independently identified artifacts:

- web bundle and static assets;
- Worker bundle and state schema version;
- AOT WGSL generated from pinned BroMetal sources;
- optional Wasm modules plus JS reference/fallback;
- Tauri and ExecutionHost binaries for supported target triples.

Cloud release steps are:

1. run protocol, schema, shader, Wasm, and runtime conformance tests;
2. upload artifacts by digest;
3. checkpoint the current celld application/bucket state;
4. deploy to a canary celld fleet on the private network;
5. run create/edit/restart/reconnect and ExecutionHost smoke workflows;
6. route authenticated ingress to the release;
7. monitor readiness, command error rate, cell ownership/lease churn,
   WebSocket reconnects, and bucket errors;
8. promote or route back to the previous compatible release.

celld is currently one application per fleet and has no managed ingress,
global scheduler, account system, or automatic updater. Capacity planning,
private networking, TLS, identity, backups, bucket lifecycle, fleet update, and
rollback are ZD operational responsibilities. Manual pinned upgrades are safer
than an unattended “latest” channel during alpha.

## Mandatory spikes and kill gates

These gates are decisions, not aspirational benchmarks. Record raw traces,
hardware/browser/runtime versions, and artifacts under a reproducible benchmark
command. Select the lowest supported device before running a gate; do not choose
hardware after seeing results.

### Gate 1: BroMetal earns a GPU island

Build one real candidate twice from the same immutable data and interactions:
the objective/dependency graph using the simplest credible DOM/SVG/Canvas2D
implementation, and a BroMetal implementation. The fixed stress corpus is
20,000 visible nodes and 50,000 visible edges, plus a product-sized corpus
captured from real ZD data. Replay ten minutes of pan, zoom, selection, filter,
resize, background/foreground, and live updates on the lowest supported Mac
and the supported Safari/WKWebView and Chromium versions.

BroMetal ships for this surface only if all are true:

- p95 input-to-present latency is at most 33 ms and p99 at most 50 ms during
  the fixed replay;
- it either lowers p95 input-to-present by at least 30% against the simplest
  viable fallback **or** renders at least twice the primitives at the fallback's
  p95 latency;
- peak renderer memory is no more than 1.5 times the fallback and no forced
  device-loss cycle leaks resources across 100 loss/recreate repetitions;
- the same semantic selection, keyboard path, reduced-motion mode, and
  accessible DOM summary work with GPU disabled;
- Safari/WKWebView requires no shader fork, BroMetal source fork, or
  undocumented runtime access;
- the compressed incremental application payload for runtime plus this
  surface's shaders is at most 150 KiB.

Kill BroMetal for the initial product if any condition fails, if the benchmark
cannot identify a real surface, or if a missing primitive requires maintaining
a private fork. Keep the `VisualSurface` fallback. A later direct WebGPU or
GPUI-web experiment is a new proposal, not an automatic substitution.

### Gate 2: celld proves offline local durability

Pin one celld release and one Worker bundle. Run without network, cloud account,
S3 service, or an additional database daemon. The harness commits a known
sequence of workspace operations and document metadata, records every returned
receipt externally, and sends randomized hard termination after commit calls.

celld local mode ships only if all are true:

- across 100 randomized hard-kill/restart cycles, every acknowledged revision
  is present after recovery and no unacknowledged revision is reported as
  committed;
- integrity verification reports no corruption, duplicate operation IDs, or
  sequence regression;
- backup, forward schema migration, failed-migration rollback, and restoration
  succeed on the same on-disk state;
- over 50 cold launches on the lowest supported Mac, p95 authenticated
  readiness is at most 2.0 seconds and no launch requires a free fixed port;
- the process binds loopback only, rejects missing/wrong boot credentials on
  HTTP and WebSocket, and does not expose the credential in process arguments
  or logs;
- the packaged binary and Worker run completely offline after installation and
  shutdown leaves no orphan process or locked state preventing restart.

Kill celld **for local mode** on any acknowledged data loss/corruption, required
external object-store service/account, inability to authenticate/bind safely,
inability to use a collision-free endpoint, or inability to upgrade atomically.
Use an embedded SQLite control-plane adapter with the same protocol semantics.
celld may remain the cloud target if its separate cloud tests pass.

### Gate 3: state exactly what is portable

Run two separate proofs.

First, test the literal claim “Cloudflare OS runs on celld”: pin upstream
Cloudflare OS, replace deployment configuration only, make zero application
source patches, and try to create, persist, restart, and reopen one Gadget while
a denied capability and an allowed no-egress capability are exercised. Any
source patch, unsupported binding, missing isolation behavior, or semantic
difference fails the claim. Current evidence predicts failure; record it once
and stop describing Cloudflare OS as the base stack.

Second, test ZD's deliberately narrow control plane. Deploy the identical
Worker JavaScript artifact to pinned Cloudflare workerd/Workers and pinned
celld using only binding/deployment configuration changes. Run the same
contract suite plus 1,000 seeded randomized command/restart/reconnect sequences
against each, and compare canonical receipts, snapshots, conflict errors, and
event sequences.

ZD may claim a portable control plane only if:

- 100% of protocol and state-machine assertions agree;
- application source contains no runtime-name checks or compatibility branches;
- the Worker uses only APIs documented as supported by both pinned runtimes;
- deployment and recovery instructions are reproducible from clean state.

If this fails, choose one primary runtime and implement an explicit storage or
transport adapter only where it has product value. Do not build a generalized
Cloudflare compatibility layer and do not advertise source portability.

### Gate 4: Wasm proves a CPU hotspot

Profile the production workflow first. For one kernel consuming at least 10% of
interaction CPU time, implement a clear TypeScript reference and a Wasm version.
Benchmark end-to-end, including input validation, allocation, copy, result
conversion, startup, and cancellation.

Ship the Wasm kernel only if p95 end-to-end kernel time improves at least 25%,
the associated workflow reduces main-thread long-task time at least 20%, peak
memory stays within 1.25 times the reference, and randomized differential tests
produce identical results. Otherwise retain TypeScript. Threaded Wasm needs a
separate proposal and browser/Tauri COOP/COEP compatibility matrix.

## Delivery phases

This is a destination-specific proof sequence, not the repository's immediate execution order. The
shared Quick Attention Loop and its document-session/project-grant lifecycle come first. celld and
cloud remain disposable experiments until remote access is an observed product job.

### Phase 0: contracts and measurement

- Freeze the first complete user workflow and product-sized fixture.
- Define workspace IDs, document refs, action names, command envelopes,
  receipts, event sequences, and typed errors.
- Wrap current platform access behind `NativeCapabilityClient` without changing
  editor behavior.
- Add performance marks and interaction replay before adding accelerators.

Exit: the current local app completes the vertical workflow through the new
interfaces, and a trace identifies real bottlenecks.

### Phase 1: built-in composition before runtime commitment

- Register Files and Attention through one transactional, trusted built-in lifecycle.
- Persist only the fixed support region, bounded settings, and failure placeholder.
- Keep commands on the one suite dispatch/reference path.
- Add a second real domain surface before general splits, tabs, keymaps, or a public package format.
- No dynamic server code or arbitrary install yet.

Exit: a new built-in surface can be added without editing shell control flow or receiving undeclared
native access, and the host boundary hides more complexity than it exposes.

### Phase 2: disposable runtime proof, before dependency commitment

- Run the Cloudflare OS incompatibility smoke and publish the result.
- Implement the smallest SuiteCatalog plus one ProjectState: open, apply an idempotent support-state
  command, snapshot, subscribe, restart.
- Run the ZD celld/workerd portability gate.
- Package celld as an Apple Silicon Tauri sidecar and run the local durability
  gate.
- Decide celld-local versus SQLite-local; do not leave both as accidental
  production paths.

Exit: durable restart and protocol behavior are proven, or the documented
fallback is selected.

### Phase 3: optional local control-plane slice

- Tauri supervision, health/version handshake, boot credential, bounded restart,
  logs, upgrade/rollback, and quit policy.
- Support-region and built-in widget-state persistence.
- CodeMirror read/edit/conflict-aware save through NativeHost, with control-plane document metadata
  treated only as the rebuildable receipt projection described above.
- diagnostics that identify UI, control-plane, and native-host build versions.

Exit: install offline, edit, kill the optional control plane at randomized points, restart, and
recover all acknowledged suite state without changing file save truth. Do not add a terminal or agent
merely to validate celld.

### Phase 4: trusted cloud slice, only after a product gate

Enter this phase only after repeated remote/multi-device work demonstrates value that the local app
and companion handoff cannot provide.

- Private celld fleet, S3-compatible durable bucket, TLS/auth ingress, backups,
  and canary/rollback runbook.
- Cloud document provider or one authenticated ExecutionHost.
- resumable events and full-snapshot recovery.
- personal/trusted-team tenancy only.

Exit: the same user workflow succeeds through the cloud topology, loss of an
ExecutionHost is safe, and no celld node is publicly exposed.

### Phase 5: measured acceleration

- Run the BroMetal gate on the real graph surface.
- Run the Wasm gate on the largest measured CPU hotspot.
- Ship only passing implementations, with forced fallback/device-loss/trap
  tests kept in CI or scheduled hardware runs.

Exit: the accelerated build is measurably better on the declared low-end target
and behaviorally equivalent when every accelerator is disabled.

### Phase 6: third-party isolation

- Threat model packages, publisher identity, update/revocation, capability
  prompts, state export, quotas, and incident recovery.
- Prototype distinct-origin iframe widgets.
- Conduct an adversarial review before any native or server-side extension API.
- Re-evaluate celld Worker Loader only against its then-current guarantees.

Exit: an intentionally malicious test widget cannot reach parent DOM, Tauri
IPC, other widget state, undeclared network origins, or native capabilities.

## Verification strategy

### Contract and state tests

- run one black-box `WorkspaceControlClient` suite against the reference
  in-memory model, local selected backend, celld, and the optional second Worker
  runtime;
- property-test layout trees, command idempotency, monotonic event sequence,
  migration round trips, and stale revision conflicts;
- fuzz malformed/version-skewed HTTP, WebSocket, manifest, and event payloads;
- compare randomized state-machine traces to a deterministic reference model;
- test replay after dropped, duplicated, delayed, and reordered client messages.

### Durability and lifecycle tests

- hard-kill celld/Tauri/ExecutionHost before, during, and after acknowledged
  mutations;
- restart with partial/corrupt migration artifacts and verify rollback;
- exhaust ports, deny directory permissions, fill the configured quota, and
  simulate a read-only disk;
- verify sidecar hash/version mismatch blocks safely and produces an actionable
  diagnostic;
- assert no orphan celld, PTY, or agent process after the configured quit path;
- test bucket timeout, lease movement, cell restart, and restore from backup.

### UI and rendering tests

- preserve existing editor selection, undo, external-change-conflict, and keyboard-routing coverage;
  add explicit real-browser clipboard and IME/composition tests before claiming those behaviors;
- run browser integration tests with WebGPU available, unavailable, denied,
  and force-lost;
- compare semantic actions and selected objects between GPU and fallback
  renderers;
- use real Chrome plus real Safari/WKWebView hardware runs; a software adapter
  is useful for correctness but not the performance gate;
- test resize, device scale change, sleep/wake, hidden tab, reduced motion,
  high contrast, keyboard-only use, and screen-reader summary;
- differential-test TypeScript and Wasm kernels with generated boundary inputs.

### Security tests

- attempt path traversal, symlink escape, unauthorized workspace IDs, stale and
  cross-widget grants, replayed operation IDs, oversized payloads, and terminal
  output floods;
- verify wrong/missing loopback tokens fail for HTTP and WebSocket and secrets
  never appear in argv, URLs, logs, crash reports, or browser storage;
- load hostile document HTML and hostile sandboxed widgets; assert no script,
  parent-DOM, Tauri, credential, clipboard, or undeclared-network access;
- verify CSP is minimal. Add `wasm-unsafe-eval` only on origins that actually
  load Wasm, and add COOP/COEP only after testing every embedded resource;
- exercise GPU resource limits and invalid shader/build artifacts without
  accepting runtime user WGSL.

### Performance budgets

In addition to component kill gates, the vertical workflow should track:

- warm command acknowledgement p95 and p99 by topology;
- event-to-projection and input-to-present latency;
- cold/warm Tauri readiness and sidecar restart time;
- editor typing long-task rate with representative documents;
- terminal output throughput and memory under a bounded flood;
- snapshot/reconnect bytes and time as workspace/widget count grows;
- browser, Wasm, GPU, celld, and NativeHost memory independently.

Budgets become release gates only after the lowest supported hardware, fixture,
and network profile are fixed. Never replace a trace with a framework claim.

## Failure modes and required behavior

| Failure | Required behavior |
| --- | --- |
| WebGPU absent or adapter request rejected | Load fallback surface before the workspace becomes unusable; report one diagnostic, not repeated prompts. |
| GPU device lost or out of memory | Dispose resources, retain CPU snapshot/selection, attempt one bounded rebuild, then remain on fallback. |
| BroMetal/WGSL rejected by Safari/WKWebView | Fail the build-time/browser compatibility test; production still selects fallback without losing state. |
| Wasm download, compile, trap, or allocation failure | Cancel that result, run the deterministic TypeScript path, record a redacted reason. |
| Missing COOP/COEP | Single-threaded baseline remains functional; never silently enable a broken shared-memory path. |
| celld fails to start or version handshake | Keep dirty buffers, expose retry/diagnostics, never create a fresh empty store over the old path. |
| celld crashes after an acknowledgement | Recovery returns the same or later committed revision; otherwise the durability gate has failed. |
| Loopback port occupied or credential rejected | Choose a fresh endpoint/credential through the supervisor; do not weaken authentication. |
| Cloud bucket or celld cell unavailable | Reject/queue visibly before acknowledgement, reconnect with sequence, and prevent split-brain authority. |
| WebSocket drops or server moves ownership | Resume from last applied sequence or replace with a full snapshot; duplicate events remain idempotent. |
| ExecutionHost disconnects | Mark native resources unavailable, retain control state, revoke leases, and avoid duplicate process/agent starts. |
| External file changes while editing | Detect the revision mismatch and present compare/reload/explicit overwrite; preserve the unsaved buffer. |
| Widget crashes or fails migration | Quarantine only that instance, preserve/export old state, and load shell plus other widgets. |
| Widget floods RPC/render work | Enforce message, rate, storage, CPU/time, and frame-work budgets; revoke or suspend the instance. |
| Partial application upgrade | Restore the prior compatible app/Worker/sidecar/schema unit from checkpoint. |
| Browser cache serves version-skewed UI | Protocol handshake rejects incompatible major versions and refreshes immutable assets safely. |

## Non-goals for the initial architecture

- A complete Cloudflare OS or bb fork.
- A claim that Cloudflare OS presently runs on celld.
- A full GPU-rendered shell, editor, terminal, text engine, or accessibility
  implementation.
- BroMetal as a UI framework, Wasm as a security boundary, or WebGPU as server
  acceleration.
- General Cloudflare Workers product compatibility.
- Hostile public multi-tenancy on celld alpha.
- Arbitrary marketplace code, arbitrary WGSL, raw Tauri IPC, or server-side
  dynamic Workers.
- Active-active local/cloud synchronization or offline collaborative editing.
- A general remote-browser/desktop operating system.
- Durable detached agent sessions, fleet-wide scheduling, or billing.
- Windows or Intel macOS local celld support until binaries, packaging,
  durability, and WebView behavior are explicitly proven.
- Replacing CodeMirror, the DOM, or the current web-first product surface merely
  to satisfy a rendering technology choice.

## Open decisions and unknowns

The following are decision inputs, not implementation details to guess around:

1. What real visualization or computation exceeds the existing DOM/TypeScript
   performance envelope? Without one, BroMetal and Wasm should not ship.
2. Does pinned celld expose a supported persistent offline-local mode with the
   acknowledgement semantics, endpoint selection, and lifecycle hooks required
   by the durability gate?
3. Can the Worker deployment be embedded as a prebuilt artifact without a user
   toolchain, and what is the stable CLI/readiness contract?
4. Will ZD support Apple Silicon only initially, build celld itself for more
   targets, or select SQLite local mode everywhere for consistency?
5. What minimum macOS/Safari/WKWebView, Linux/WebKitGTK, Windows/WebView2, and
   browser versions form the support matrix? BroMetal's browser claims cannot
   answer the system-WebView question.
6. Does BroMetal expose the buffer lifecycle, device-loss handling, timestamp
   measurement, batching, and renderer coexistence needed without private
   internals? How many canvas/device instances remain efficient?
7. Is cloud document content stored in a ProjectState Durable Object, a separate document
   provider, or always behind an ExecutionHost? celld's internal S3 durability
   is not an R2 API for application code.
8. Is live multi-user collaboration a real near-term requirement? If so,
   identity, authorization, CRDT retention, encryption, and awareness need a
   separate design before choosing Yjs.
9. Where does a cloud ExecutionHost run, how is it updated, and who owns its
   credentials, workspace roots, and process cost?
10. Are extensions personal and reviewed, organization-signed, or publicly
    distributed? The answer changes publisher trust, revocation, review, and
    isolation requirements.
11. What is the celld security/update roadmap and what operational evidence is
    required before moving beyond a trusted single-tenant deployment?
12. Which state is important enough to sync or back up, what is its retention
    policy, and what is the user-visible recovery point objective?

## Recommended next decision

Approve Option B only as a sequence of reversible proofs:

1. ship the shared Quick Attention/document-session loop in the current DOM/CodeMirror product;
2. use its second real surface to prove the built-in composition and semantic native boundaries;
3. measure a real bottleneck and let BroMetal and Wasm pass or fail independently;
4. only after a demonstrated remote job, prove or kill celld local durability and the narrow Worker
   control plane's exact portability claim with disposable data;
5. add trusted cloud operation before untrusted extension execution; and
6. keep direct files plus an embedded local store as the valid result when celld/cloud do not earn
   their cost.

This preserves the ambitious part of Thought 2—a workbench that can reshape
itself through apps, widgets, panels, commands, and hotkeys—without making the
product hostage to four young, mismatched runtimes at once.
