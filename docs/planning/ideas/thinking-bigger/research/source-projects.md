# Source-project fact sheet for the “thinking bigger” ideas

Research checked: 2026-08-12

This is the upstream-evidence companion to the Thought 1 and Thought 2 design work. It deliberately
does not repeat the deeper product comparisons in the existing
[bb report](../../thinking-differently/research/bb.md),
[Zed report](../../thinking-differently/research/zed.md), or
[current ZD architecture report](../../thinking-differently/research/zd-current-architecture.md).
Its narrower purpose is to establish what each named source actually provides, what can be reused,
and which proposed combinations remain assumptions.

“Repository fact” below means a statement supported by a current first-party repository, manifest,
release, specification, or official documentation. “ZD assessment” is an inference or recommendation
for this project. Repository descriptions are not treated as independent proof of security,
performance, or production readiness.

## Corrections that materially change the two thoughts

1. **bb is not a Rust/GPUI application.** It is a TypeScript/Node system with React web UI, an
   Electron desktop shell, a server, and a host daemon. “Think bb, written in Rust” therefore means
   reproducing its product and data-model ideas, not reusing its implementation.
2. **`awesome-gpui` is a catalog, not a UI toolkit.** GPUI is the Rust UI framework; every project
   listed in the catalog has its own API, maturity, and license.
3. **BroMetal is not a WebGPU implementation.** It compiles a constrained TypeScript shader DSL to
   WGSL and supplies a small rendering runtime. It does not accelerate DOM, layout, editors, or the
   whole application automatically.
4. **Cloudflare OS cannot currently be assumed to deploy on celld.** Cloudflare OS v2 uses Workers
   KV and R2 in its storage path and Dynamic Workers/Facets for gadget isolation. celld documents KV
   and R2 as unavailable and dynamic code loading as experimental. The combination needs architectural
   replacement work, not just deployment configuration.
5. **WebGPU and Wasm are opt-in execution tools, not an application architecture.** They help only
   where a measured workload fits their boundary and the host platform exposes the required features.

## Compact compatibility matrix

The ratings describe *direct implementation fit*, not aesthetic inspiration.

| Source | Actual reusable layer | Thought 1: native Rust/GPUI | Thought 2: web + cloud/local runtime | License / standards status | Decisive gate |
| --- | --- | --- | --- | --- | --- |
| `get-bb/bb` | Product/data model, typed service boundaries, plugin patterns | **Pattern fit: strong; code fit: weak** | **Pattern fit: strong; code reuse: conditional** | MIT | TypeScript/Electron/server/daemon implementation; public plugin APIs still use `experimental_` names |
| Zed GPUI | Native Rust rendering, state, actions, async work, testing | **Direct fit: strong** | **Inspiration first; experimental source-only web path exists** | Apache-2.0 for GPUI/platform crates | Pre-1.0, frequent breaking changes, published/current docs diverge, and the web backend is unpublished and constrained |
| `awesome-gpui` | Discovery list and examples | **Reference only** | **Reference only** | CC0 for the list; each linked project differs | A freshness badge is not API, quality, or license compatibility |
| `cloudflare-os` | Gadget/blueprint/capability/gatekeeper patterns | **Concept fit: conditional** | **Concept fit: strong; deployment fit: blocked on current celld gaps** | Apache-2.0 | Cloudflare-specific Durable Objects, Dynamic Workers/Facets, KV, and R2; v2 is early-access and changing |
| BroMetal | Ahead-of-time TypeScript-shader-to-WGSL compiler and thin runtime | **No foundational role** | **Conditional hotspot tool** | MIT; pre-1.0 | WebGPU only, constrained DSL, no WebGL fallback, no general UI acceleration |
| WebGPU | Browser/system-webview GPU rendering and compute API | **No need if GPUI owns rendering** | **Conditional hotspot tool** | W3C specification; implementation availability varies | Secure context, feature/limit variation, device loss, and system-webview support require runtime detection |
| WebAssembly | Portable low-level compute/module format with host imports/exports | **Optional plugin/compute boundary** | **Optional plugin/compute boundary** | W3C specification; toolchains/runtimes have separate licenses | No UI, filesystem, network, or GPU API by itself; boundary and capability design remain ZD’s responsibility |
| `denoland/celld` | Rust daemon for Workers bundles and Durable Objects with S3-backed persistence | **No primary role** | **Promising experiment; blocked for Cloudflare OS as-is** | Apache-2.0; v0.1 alpha | Not an embedded library, hostile multitenancy is out of scope, KV/R2 absent, loader experimental, S3 dependency remains |
| Tauri | Rust process/native shell around a system webview | **Alternative shell, not a GPUI renderer** | **Direct local-shell fit: strong** | MIT/Apache-2.0 components; stable v2 line | WebGPU follows OS webview support; celld would be a supervised sidecar rather than “inside” Tauri |

## `get-bb/bb`

### Repository facts

- **What it is and stack:** bb describes itself as an agentic IDE exposed through desktop, web,
  CLI, and HTTP surfaces. Its [system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)
  defines a SQLite-backed server, HTTP and WebSocket APIs, a host daemon that provisions workspaces
  and runs provider processes, and a web app. The
  [repository overview](https://github.com/get-bb/bb/blob/main/docs/repository-overview.md) adds an
  Electron desktop shell, CLI, SDK, runtime adapters, and typed contract packages. The
  [root manifest](https://github.com/get-bb/bb/blob/main/package.json) is a private TypeScript/Node
  workspace requiring Node `>=22.19.0`. It is not a Rust or GPUI application.
- **Reusable API or pattern:** projects, threads, environments, and hosts are explicit concepts;
  manager threads may own child threads. Typed app/server and server/daemon contracts separate
  product policy from machine execution. Backend plugins can own storage, routes, services,
  commands, tools, and skills; app plugins can add panels and file openers through the
  [backend](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/backend-contract.ts) and
  [app](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts) contracts.
  The official [Docs](https://github.com/get-bb/bb/tree/main/plugins/docs),
  [Tasks](https://github.com/get-bb/bb/tree/main/plugins/tasks), and
  [Workflows](https://github.com/get-bb/bb/tree/main/plugins/workflows) plugins demonstrate that a
  plugin can own a substantial product area rather than only a command.
- **Maturity and API stability:** the [README](https://github.com/get-bb/bb#readme) calls the project
  active development and says surfaces and workflows are evolving. The project is releasing quickly;
  [desktop 0.37.0](https://github.com/get-bb/bb/releases/tag/desktop-v0.37.0) was the latest release on
  the research date. More importantly, the
  [public-API audit](https://github.com/get-bb/bb/blob/main/docs/api_to_audit.md)
  requires unproven plugin members to retain an `experimental_` prefix. Shipping functionality is
  not the same as a compatibility guarantee.
- **License and platforms:** bb is [MIT licensed](https://github.com/get-bb/bb/blob/main/LICENSE).
  Its [platform support](https://github.com/get-bb/bb/blob/main/docs/platform-support.md) documents
  packaged desktop support for Apple Silicon macOS, `npx` operation on macOS and Linux, and Windows
  through WSL2 rather than native PowerShell/CMD.

### ZD assessment

- **Borrow:** the project/thread/environment/host model; durable events; a daemon boundary for local
  execution; typed host contracts; plugin-owned product areas; and equal human/agent control surfaces.
  These are architecture patterns that survive a change of language and renderer.
- **Do not assume:** bb code can be transplanted into a Rust/GPUI shell; an experimental plugin API
  is stable; its React plugin components are portable; or adopting one piece avoids the operational
  cost of its server, daemon, and desktop/web surfaces.
- **Focused spike:** model one real ZD objective and its agent run as bb-style project/thread records,
  then implement one small widget through a ZD-owned, versioned contract. Compare that contract with
  bb’s pinned plugin SDK and record every feature that would otherwise require an experimental member.

## Zed GPUI

### Repository facts

- **What it is and stack:** [GPUI](https://github.com/zed-industries/zed/tree/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui) is
  Zed’s Rust UI framework. Its
  [README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md) describes a hybrid
  immediate/retained, GPU-accelerated UI model. Application state lives in entities; views implement
  `Render`; lower-level elements can own layout and painting; actions, an async executor, and a test
  harness are part of the crate-level programming model. This subsection pins Zed commit
  [`fdf5de99`](https://github.com/zed-industries/zed/commit/fdf5de99c6456d695ac5e0c255915f4fa611fd75)
  because current source and the published crate differ.
- **Reusable API or pattern:** `gpui_platform::application()` establishes the platform application,
  and windows render Rust view trees. The useful ideas for ZD are typed actions, centrally owned state,
  explicit focus/context, async tasks tied to application state,
  [context-scoped key dispatch](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/docs/key_dispatch.md),
  deterministic `#[gpui::test]` scheduling, and custom elements when a component needs its own layout
  or paint path.
- **Maturity and API stability:** the README explicitly calls GPUI pre-1.0, under active development,
  and subject to frequent breaking changes. Registry release
  [0.2.2](https://crates.io/crates/gpui/0.2.2) was published 2025-10-22, while the
  much newer pinned
  [source manifest](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/Cargo.toml)
  still says 0.2.2. Current source documentation uses `gpui_platform::application()`, but
  [`gpui_platform`](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui_platform/Cargo.toml)
  is unpublished; published 0.2.2 documentation and [gpui.rs](https://gpui.rs/) show the older
  `Application::new()` path. Therefore neither the HEAD version field nor wildcard dependencies
  provide a reproducible compatibility signal. GPUI requires current stable Rust, still points
  learners to Zed source, and continues to receive frequent
  [path-level changes](https://github.com/zed-industries/zed/commits/main/crates/gpui).
- **License and platforms:** the GPUI crate manifest declares Apache-2.0. That does not relicense the
  entire Zed codebase: Zed’s unpublished
  [`ui`](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/ui/Cargo.toml)
  and
  [`component`](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/component/Cargo.toml)
  crates are GPL-3.0-or-later, so copied editor/widget code needs a crate-level license review. GPUI’s
  current source covers macOS/Metal, Linux and FreeBSD through Wayland/X11 with wgpu, and Windows
  through Win32/DirectWrite with DirectX. An unpublished
  [browser/Wasm backend](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui_web/src/gpui_web.rs)
  exists, but it is currently constrained to a document-owned canvas and one top-level window, with
  WebGPU preferred and WebGL2 fallback. That is evidence of exploration, not a supported web product
  target or stable package.

### ZD assessment

- **Borrow:** GPUI is a credible foundation for a deliberately native Thought 1, especially for a
  command/action system, a high-density agent timeline, large virtual lists, and custom canvases.
- **Do not assume:** GPUI provides ZD’s desired widget SDK, browser DOM, webview, third-party sandbox,
  accessibility coverage for every custom control, or a ready-made CodeMirror substitute. Moving the
  current TypeScript/DOM editor to GPUI is a product-surface rewrite, not a renderer swap. GPUI’s app
  [state is UI-thread-bound rather than `Send`](https://zed.dev/docs/development/glossary#gpui), so
  background results must return through its contexts; and even its official
  [basic text-input example](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/examples/input.rs)
  owns grapheme movement, UTF-8/UTF-16 conversion, selection, clipboard, IME, layout, painting, focus,
  and bindings.
- **Focused spike:** build a native three-pane shell containing a large virtual list, editable rich
  text, one custom canvas, keyboard/focus routing, actions, accessibility inspection, and GPUI tests.
  Measure startup, input latency, memory, and packaging on macOS, then estimate the real CodeMirror and
  web-widget rewrite from that code—not from Zed’s end-state performance.

## `zed-industries/awesome-gpui`

### Repository facts

- **What it is:** [awesome-gpui](https://github.com/zed-industries/awesome-gpui/tree/c39272d732636eb9da274b8997edd2390c65a70b) is a curated Markdown
  catalog of GPUI applications, libraries, learning material, and examples. It is not a Rust crate,
  component runtime, registry, or compatibility program. This subsection pins catalog commit
  [`c39272d7`](https://github.com/zed-industries/awesome-gpui/commit/c39272d732636eb9da274b8997edd2390c65a70b).
- **Reusable API or pattern:** its useful function is discovery. It can identify candidate component
  libraries and implementation examples, but each linked repository must be evaluated independently.
- **Maturity and API stability:** the catalog’s
  [generator](https://github.com/zed-industries/awesome-gpui/blob/c39272d732636eb9da274b8997edd2390c65a70b/scripts/generate_readme.py)
  calls a repository “active” when its GitHub `pushed_at` timestamp is within 30 days. It does not
  check for GPUI-related commits. The
  [schema](https://github.com/zed-industries/awesome-gpui/blob/c39272d732636eb9da274b8997edd2390c65a70b/projects.schema.json)
  records no GPUI version, license, platform support, build health, or security review. Activity badges
  therefore do not establish API stability, production use, or current GPUI compatibility.
- **License and platforms:** the list is [CC0-1.0 licensed](https://github.com/zed-industries/awesome-gpui/blob/main/LICENSE).
  That license covers the catalog, not the listed applications or libraries. Each candidate’s license,
  supported GPUI revision, and target platform must be checked before reuse.

### ZD assessment

- **Borrow:** use it as a shortlist for controls, layout idioms, and application examples.
- **Do not assume:** inclusion means Zed endorsement, compatibility with current GPUI, a coherent widget
  set, or permission to copy code.
- **Focused spike:** select at most two candidate component libraries needed by the GPUI prototype.
  Pin their commits; audit licenses and GPUI revisions; implement one representative control from each;
  and upgrade GPUI once to expose compatibility and patch-maintenance cost.

## `cloudflare/cloudflare-os`

### Repository facts

- **What it is and stack:** Cloudflare OS says explicitly that it is not an operating system; it is an
  AI workspace with chat agents and sandboxed “gadgets.” The current
  [README](https://github.com/cloudflare/cloudflare-os#readme) describes v2 as a complete rewrite in
  early access and heavy development. Its runtime uses Cloudflare Workers, Durable Objects, Dynamic
  Workers/Facets, KV, and R2; its
  [frontend package](https://github.com/cloudflare/cloudflare-os/tree/main/packages/workshop-frontend)
  uses React, Kumo, and Vite.
- **Reusable API or pattern:** the strongest design material is in the
  [blueprints document](https://github.com/cloudflare/cloudflare-os/blob/main/docs/blueprints.md).
  A blueprint holds code plus binding metadata, not credentials or instance state. Each instantiated
  gadget gets its own storage, bindings, and history. Blueprint snapshots are versioned/exportable;
  changing a blueprint does not silently update existing instances. Bindings distinguish gatekeepers,
  AI models, and agent spawners. Gatekeepers are narrow capability bridges with logs and optional
  human approval.
- **Maturity and API stability:** v2 is labeled early access with rough edges, and the
  [repository had no tagged GitHub release](https://github.com/cloudflare/cloudflare-os/releases) on
  the research date. The private root workspace’s `1.0.0` value in
  [package.json](https://github.com/cloudflare/cloudflare-os/blob/main/package.json) is not a public
  semantic-version promise.
- **License and platforms:** the repository is
  [Apache-2.0 licensed](https://github.com/cloudflare/cloudflare-os/blob/main/LICENSE). The documented
  production architecture is Cloudflare-specific. The local Wrangler/workerd flow is described as
  development, not as a packaged offline desktop runtime.

### ZD assessment

- **Borrow:** separate immutable widget source/template from instance data and capabilities; require
  declared bindings; issue narrow host capabilities rather than ambient authority; log sensitive
  actions; support approval; and make import/export explicit and inspectable.
- **Do not assume:** the repository is a reusable widget SDK, its sandbox claims constitute a formal
  security proof, its local development path is offline-first, or its Cloudflare service graph maps to
  celld. “Each gadget is isolated” still depends on the host’s implementation and threat model.
- **Focused spike:** define a minimal ZD widget manifest with code hash, schema version, requested
  capabilities, instance storage, and export format. Instantiate two copies, grant one a read-only
  project capability, deny the other, and verify audit/approval behavior without Cloudflare services.

## `ericdrowell/brometal`

### Repository facts

- **What it is and stack:**
  [BroMetal](https://github.com/ericdrowell/brometal/tree/ea87c08e1c216377fcd531efc4752d3f37e42bf2)
  is a TypeScript shader DSL and ahead-of-time compiler. Build-time input such as `*.shader.ts` is
  compiled to WGSL and generated TypeScript; a small runtime creates renderers and programs. The pinned
  [package manifest](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/packages/brometal/package.json)
  and [npm package](https://www.npmjs.com/package/brometal/v/0.17.2) identify ESM package `brometal`
  0.17.2; `@webgpu/types` is a development dependency rather than a shipped runtime dependency. This
  subsection pins repository commit
  [`ea87c08e`](https://github.com/ericdrowell/brometal/commit/ea87c08e1c216377fcd531efc4752d3f37e42bf2).
- **Reusable API or pattern:** author type-checked shader functions in a constrained TypeScript
  subset, generate WGSL before runtime, and call the generated program through a thin WebGPU-facing
  API. This is useful when ZD owns a shader-heavy canvas and prefers TypeScript tooling to handwritten
  WGSL.
- **Maturity and API stability:** the README calls the project pre-1.0 and allows breaking minor
  releases. The current
  [changelog](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/CHANGELOG.md)
  records 0.17.2 as a 2026-08-11 maintenance release. Since the 0.14 WebGPU-only break, 0.15 added
  typed creation/device-loss errors and 0.16–0.17 added and refined the separate `--js13k` output;
  0.16 also made unknown CLI flags fail instead of being ignored. The compiler accepts a TypeScript
  subset, so ordinary TypeScript outside that subset fails at shader compilation.
- **License and platforms:** BroMetal is
  [MIT licensed](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/LICENSE).
  Version 0.17.2 remains WebGPU-only with no WebGL fallback. Its
  [README](https://github.com/ericdrowell/brometal/blob/ea87c08e1c216377fcd531efc4752d3f37e42bf2/README.md#webgpu)
  lists Chrome and Edge 113+, Firefox 141+, and Safari 26+; actual availability in ZD still depends on
  the Tauri system webview, OS, adapter, driver, and enabled features, so runtime detection and a
  fallback remain necessary.

### ZD assessment

- **Borrow:** use it only for an identified graph, visualization, animation, or compute kernel where
  checked-in generated WGSL and TypeScript ergonomics provide clear value.
- **Do not assume:** it is a scene graph, component toolkit, WebGPU portability layer, fallback
  renderer, or accelerator for React/DOM/CodeMirror/network/database work.
- **Focused spike:** implement one representative graph widget with BroMetal and an ordinary Canvas
  or CPU fallback. Pin exactly 0.17.2 and check generated files. Exercise its typed creation and
  `onError`/device-loss paths. Measure cold start, frame time, GPU memory, failure recovery, and visual
  parity in current Chrome and every Tauri webview ZD intends to ship.

## WebGPU

### Specification facts

- **What it is:** the [WebGPU specification](https://gpuweb.github.io/gpuweb/) defines a low-level
  rendering and general-purpose GPU compute API built around adapters, devices, queues, pipelines,
  buffers, textures, bind groups, and command submission. Shaders use WGSL, whose current
  [W3C Candidate Recommendation Draft](https://www.w3.org/TR/WGSL/) remains a separately evolving
  language specification.
- **Reusable API or pattern:** explicit resources and pipelines work well for large parallel compute,
  dense visualizations, image processing, and custom drawing surfaces whose data can remain near the
  GPU. Applications must negotiate features and limits and handle device loss.
- **Maturity and API stability:** the WebGPU editor’s draft still contains work-in-progress portions.
  MDN marks [WebGPU](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) as limited availability
  rather than Baseline and requires a secure context. Implementations can expose different optional
  features and numeric limits even when the API exists.
- **License and platforms:** WebGPU is a web standard, not a vendored application library. Browser,
  OS, driver, and webview implementations have their own delivery and licensing terms. Tauri’s system
  webview means the same application can have different WebGPU capability across macOS, Windows, and
  Linux installations.

### ZD assessment

- **Borrow:** reserve a clean GPU surface abstraction for measured visualization or compute hotspots;
  feature-detect adapters and limits; expose a non-GPU path; and record device-loss telemetry without
  sensitive content.
- **Do not assume:** GPU acceleration improves text editing, DOM reconciliation, IPC, startup, agent
  execution, or storage. Nor does API presence guarantee acceptable drivers, limits, or power use.
- **Focused spike:** profile the current product first. If a real hot path exists, benchmark the whole
  user action—not only shader time—across supported webviews, integrated/discrete GPU cases, device
  loss, battery use, and fallback. Reject WebGPU as a foundation if the fallback must implement most of
  the product anyway.

## WebAssembly

### Specification facts

- **What it is:** [WebAssembly](https://webassembly.org/specs/) is a portable low-level binary
  instruction format and abstract machine. The [core specification](https://www.w3.org/TR/wasm-core/)
  defines modules, functions, memories, tables, imports, and exports without assuming a particular
  web UI or operating system.
- **Reusable API or pattern:** Wasm can package compute kernels or define a language-neutral module
  boundary. In a browser/Tauri frontend it receives capabilities through host imports and Web APIs;
  in other runtimes, WASI or custom imports may provide different capabilities. celld’s V8 runtime
  documents core WebAssembly support.
- **Maturity and API stability:** the core format is standardized, but component tooling, bindings,
  WASI support, garbage collection, threads, and host integration vary by runtime and toolchain. A
  `.wasm` module’s ABI and state-migration policy are application contracts, not guaranteed by the
  core standard.
- **License and platforms:** the format is standardized; compilers, bindgen tools, runtimes, and
  linked dependencies retain their own licenses. The official
  [portability notes](https://webassembly.org/docs/portability/) emphasize that the embedder supplies
  environment capabilities.

### ZD assessment

- **Borrow:** consider Wasm for a narrow, versioned plugin compute ABI or a hot kernel that must run in
  both browser and server contexts. Host imports can become a capability boundary if they are small,
  explicit, and denied by default.
- **Do not assume:** Wasm brings UI, filesystem, network, WebGPU, sandbox policy, zero-copy data
  exchange, or native performance automatically. JavaScript/host crossings, copies, startup, bundle
  size, and threading constraints are part of the result.
- **Focused spike:** compile one real compute kernel and one minimal plugin module. Compare JavaScript,
  Rust-native, and Wasm end to end, including transfer, initialization, bundle size, cancellation, and
  failure recovery. Separately version the host imports and test that an older plugin fails closed.

## `denoland/celld`

### Repository facts

- **What it is and stack:** [celld](https://github.com/denoland/celld/blob/v0.1.0/README.md) is a Rust daemon and CLI
  that embeds V8 to run Wrangler-generated Workers bundles and Durable Objects. Each object receives a
  named SQLite database; database snapshots are replicated to an S3-compatible bucket. The bucket also
  supplies compare-and-swap leases so one machine owns an object at a time. celld explicitly avoids a
  central control plane or consensus system.
- **Reusable API or pattern:** the interesting boundary is a small self-hosted Worker/Durable Object
  fleet with SQLite state, content-addressed snapshots, leases, and process-level deployment. It accepts
  compiled Worker bundles; the documented product surface is a daemon/CLI, not an embeddable Rust crate
  API.
- **Maturity and API stability:** celld’s [v0.1.0 release](https://github.com/denoland/celld/releases/tag/v0.1.0)
  shipped 2026-08-05. Its security and limitations documents call the project alpha; the README says
  its runtime and compatibility surface is evolving. The
  [security document](https://github.com/denoland/celld/blob/v0.1.0/docs/security.md) says it is not
  safe for hostile multitenancy and only the newest release receives fixes.
- **Compatibility:** the
  [Cloudflare compatibility table](https://github.com/denoland/celld/blob/v0.1.0/docs/cloudflare-compat.md)
  supports module Workers, `fetch`, JS RPC, service bindings, static assets, Durable Objects, and V8
  WebAssembly. Dynamic code/Worker Loader support is experimental. KV and R2 are not provided; declared
  R2 bindings throw. Numerous platform APIs and Wrangler options are absent or partial.
- **License, platforms, and runtime constraints:** celld is
  [Apache-2.0 licensed](https://github.com/denoland/celld/blob/v0.1.0/LICENSE). Release containers target
  Linux x86_64/ARM64; release binaries cover those Linux targets plus Apple Silicon macOS. The
  [limitations](https://github.com/denoland/celld/blob/v0.1.0/docs/limitations.md) say Windows is
  unavailable; Intel Macs have no prebuilt binary, though the document says a source build works.
  Deployment requires `esbuild` and an S3-compatible bucket. Peer HTTP has no TLS and is intended for
  a private encrypted network. Bucket credentials are effectively fleet-administrator authority.
  celld provides no end-user authentication, public TLS, global scheduler, or managed ingress.

### ZD assessment

- **Borrow:** celld is worth testing as a self-hostable cloud runtime for a deliberately small,
  compatible Worker/Durable Object subset. Its SQLite-plus-object-store pattern may also inform ZD’s
  own replication design.
- **Do not assume:** Cloudflare OS runs unchanged; a Durable Object API implies Cloudflare parity;
  celld is a safe untrusted-plugin sandbox; the daemon can be linked “inside” Tauri; or “local” means
  offline while an S3-compatible bucket is still required. Bundling a local S3 service would add a
  second process and lifecycle.
- **Focused spike:** have Tauri supervise a pinned celld sidecar and deploy one Worker plus one Durable
  Object. Bind only to loopback, use structured arguments and a dedicated data directory, and test
  first run, offline restart, crash recovery, persistence, clean shutdown, binary update, and secret
  handling. Run a separate Cloudflare OS dependency inventory; treat every KV, R2, Facet, and loader
  use as replacement work rather than a presumed compatibility item.

## Tauri

### Official facts

- **What it is and stack:** [Tauri 2](https://v2.tauri.app/start/) combines a Rust application with a
  web frontend. JavaScript can call Rust commands through `invoke`; TAO supplies the window/event loop
  and WRY integrates platform webviews. Tauri serves HTML/CSS/JavaScript and may serve Wasm, but it is
  not itself a browser engine or GPU renderer.
- **Reusable API or pattern:** Tauri is a strong native authority boundary for window behavior, global
  shortcuts, filesystem/process access, packaging, updates, and supervised sidecars while product UI
  remains web technology. Its
  [capability system](https://v2.tauri.app/security/capabilities/) scopes which windows and webviews may
  invoke commands and plugins; remote origins are not permitted unless explicitly configured.
- **Maturity and API stability:** the current stable line is Tauri 2; the
  [2.11.5 release](https://github.com/tauri-apps/tauri/releases/tag/tauri-v2.11.5) was latest on the
  research date. Plugins and webview behavior still need platform-specific testing even when core
  APIs are stable.
- **License and platforms:** Tauri’s core components use MIT and/or Apache-2.0 licenses. Official
  [distribution documentation](https://v2.tauri.app/distribute/) covers macOS, Windows, Linux, Android,
  and iOS. The actual desktop HTML engine is the operating system webview, so WebGPU, codecs, developer
  tools, and behavior can differ by platform and OS version.

### ZD assessment

- **Borrow:** for Thought 2, retain Tauri as the narrow desktop supervisor: UI window, capability ACL,
  celld lifecycle, local-only ports, update coordination, logs, and recovery. Keep the celld protocol
  explicit so a future remote deployment uses the same application contract.
- **Do not assume:** capabilities defend against malicious Rust code, overly broad scopes, supply-chain
  compromise, or webview vulnerabilities. Do not assume a child process becomes an in-process runtime,
  or that Tauri’s version guarantees WebGPU support.
- **Focused spike:** package a no-op pinned sidecar first. Prove signed-binary location, per-user data
  directories, one-instance locking, port negotiation, structured shutdown, crash backoff, logs, update
  compatibility, and capability denial before adding celld or gadget execution.

## Cross-source conclusions

### What can be composed with reasonable evidence

- A **Thought 1** prototype can combine bb’s product/data-model ideas with GPUI’s native Rust rendering,
  provided the team accepts a rewrite of the current web editor and owns a new widget/plugin contract.
  `awesome-gpui` is useful only for surveying implementation candidates.
- A **Thought 2** prototype can retain Tauri, use Cloudflare OS’s blueprint/capability ideas, and add
  WebGPU/BroMetal or Wasm to isolated measured workloads. These pieces have compatible conceptual
  boundaries even though they do not form an off-the-shelf stack.
- Tauri can supervise celld as a sidecar. That is ordinary process composition, not embedded-Rust reuse,
  and it needs explicit install, storage, networking, shutdown, and update design.

### What is not established

- There is no primary evidence that Cloudflare OS v2 runs on celld. Current documentation establishes
  the opposite for several required facilities: KV/R2 are absent and dynamic loading is experimental.
- There is no evidence that WebGPU plus Wasm makes the overall ZD UI faster. Only workload-specific
  profiling can establish that.
- Neither GPUI, Cloudflare OS, WebGPU, Wasm, nor celld supplies the requested durable, user-customizable
  mini-app/widget ABI. ZD must define capability requests, UI slots, state schema/versioning, lifecycle,
  compatibility, failure isolation, packaging, updates, and recovery.
- Permissive upstream licenses reduce legal friction but do not make copied code automatically
  compatible. GPUI’s Apache-2.0 crate must be distinguished from GPL-licensed Zed code, and every
  awesome-gpui candidate and Wasm dependency requires its own license check.

## Decision-grade validation order

Every focused spike records an immutable upstream revision, a representative ZD fixture, a
reproducible test command, a quantitative or behavioral pass condition, the applicable phase from
[`security-and-trust.md`](security-and-trust.md), and an explicit fallback or stop outcome. A
successful build or isolated benchmark alone is not adoption evidence.

1. Define one renderer-neutral widget manifest and capability model; instantiate two basic widgets.
2. Prototype the same representative ZD workflow in GPUI and in the existing Tauri/web surface.
3. Profile the web prototype before introducing WebGPU or Wasm; accelerate one proven hotspot with a
   mandatory fallback.
4. Supervise a pinned no-op sidecar from Tauri, then replace it with a minimal celld Worker/Durable
   Object deployment.
5. Inventory Cloudflare OS’s runtime dependencies against celld’s compatibility table. Do not begin a
   port until KV, R2, Dynamic Workers/Facets, auth, ingress, and local object storage each have an owned
   replacement or an explicit cut.

That sequence answers the largest unknowns—the extension contract, rewrite cost, actual performance,
and runtime incompatibility—without committing ZD to any upstream’s unstable internal APIs.
