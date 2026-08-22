# Extensibility without giving away the computer

Research snapshot: 2026-08-12.

This is a proposal and implementation sketch for the goal in
[`thoughts.md`](../thoughts.md). It is not an accepted architecture decision. Accepted decisions
remain in [`docs/adr/`](../../../../adr/README.md).

## Answer in one page

ZD should become customizable in layers, not begin with a universal plugin SDK.

The useful near-term model is:

1. Treat first-party mini-apps, panels, widgets, and commands as **linked feature packs**. They use
   typed in-process registration, ship with ZD, and are trusted exactly as much as ZD. This is the
   80/20 path for either today's TypeScript/DOM host or a future Rust/GPUI host.
2. Derive a constrained boundary from two materially different bundled widgets, then require one
   independently developed outside prototype to use it without private imports before adding
   **sandboxed extension packages**. Their code runs in a WebAssembly component, isolated
   worker/webview, or separate service. They receive only host-issued capabilities and contribute UI
   into host-owned slots. Require a second outside prototype before broadening that first API.
3. Let users reshape the application through a validated **layout document**, keymap, theme tokens,
   and selected surfaces. Those are data, not ambient code authority. A layout may produce a UI that
   looks nothing like stock ZD while the host retains recovery, permissions, filesystem/process
   authority, and extension isolation.
4. Reserve complete native-shell replacement for a trusted source build or signed alternate shell.
   Loading an arbitrary Rust dynamic library is not sandboxing, and neither a Wasm guest nor a web
   bundle should receive GPUI, Tauri, a raw GPU device, a filesystem path, or a process handle.

The stable boundary is therefore **semantic contributions plus capabilities**, not GPUI, DOM,
WebGPU, Tauri, Workers, or `celld`. Host-specific renderers are allowed; pretending all hosts can
render the same UI is not.

The first release should keep the shell, layout vocabulary, permission UI, extension manager,
project/file authority, global shortcuts, and core Markdown safety hardcoded. It should not download
or execute third-party code.

## What exists, and why it matters

ZD already contains small, useful seams:

- A [`MiniApp` at the research snapshot](https://github.com/iammrduncan/zd/blob/4a5fe03/packages/app/src/suite/types.ts)
  gets an element, a small
  `SuiteContext`, and returns idempotent teardown. The current registry is in-process and
  [`main.ts`](../../../../../packages/app/src/main.ts) is the hardcoded catalog.
- The [command registry](../../../../../packages/app/src/suite/shortcuts.ts) is suite-owned. One
  entry supplies behavior and the Shortcut Reference; duplicate chords are rejected instead of won
  by registration order. Commands are installed and removed with the active surface.
- Native authority is behind [`platform.ts`](../../../../../packages/app/src/platform.ts), and the
  accepted [platform-boundary ADR](../../../../adr/suite/0002-put-native-authority-behind-platform-boundary_H.md)
  says to add only semantic product operations. The Rust side canonicalizes and confines file
  access to the launch workspace.
- The Markdown workspace layout is not a general compositor. It constructs one sidebar, resizer,
  and document host directly in
  [`workspace/index.ts`](../../../../../packages/app/src/miniapps/md/workspace/index.ts). That is a sound concrete
  implementation, not failed plugin infrastructure.
- The accepted architecture still uses Tauri and a portable DOM/CodeMirror frontend. A GPUI rebuild
  would supersede, not merely extend, the
  [portable-frontend decision](../../../../adr/suite/0001-use-tauri-with-portable-web-frontend_H.md) and
  the [browser-layout decision](../../../../adr/md/0001-use-browser-layout-for-markdown_H.md). It must
  earn the rewrite of ZD's highest-value surface.

The prior architecture audit reached the same important limit: these are natural cut points, but
there is not yet evidence for a universal plugin SDK or cross-host layout framework. See
[`zd-current-architecture.md`](../../thinking-differently/research/zd-current-architecture.md) and
the repository's guidance to [design twice and abstract after a real cut
point](../../../../GOOD_ENGINEERING_H.md).

The prior [`bb` research](../../thinking-differently/research/bb.md) is the strongest product
precedent: its plugin contracts reach panels, file openers, commands, services, and plugin-owned
state, and its first-party Docs, Tasks, and Workflows plugins show that large product areas can live
outside a small core. It also shows the cost: a broad contract accumulates experimental slots and
host-specific UI coupling. ZD should copy the contribution/state-ownership pattern, not copy the
entire API before it has equivalent consumers.

### Current runtime facts that constrain the design

- GPUI is a compelling **host implementation**, not a stable third-party ABI. Its current README
  describes entities, renderable views, low-level elements, and actions, while still labeling GPUI
  pre-1.0 with frequent breaking changes. Native feature packs can compile against it; downloaded
  extensions should not. [GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md)
- BroMetal is an ahead-of-time TypeScript-to-WGSL shader compiler with a thin WebGPU runtime. Its
  own comparison says it has no scene graph and that the application owns the draw loop. It can
  accelerate graphs, canvases, simulations, or visual effects; it is not a text/layout/widget
  framework and should not become ZD's extension contract.
  [BroMetal README](https://github.com/ericdrowell/brometal#readme)
- Cloudflare OS supplies the most useful security inspiration: each generated Gadget has an
  isolated server, a sandboxed iframe client, no external access by default, and narrow
  Gatekeepers for explicit resources. The transferable idea is capability mediation and
  per-app isolation, not a requirement to adopt its entire Workers stack.
  [Cloudflare OS README](https://github.com/cloudflare/cloudflare-os#readme)
- `celld` is currently a young daemon that embeds V8, executes Wrangler bundles, keeps each Durable
  Object in its own SQLite database, and replicates state through an S3-compatible bucket. Its
  compatibility surface is explicitly evolving; its current compatibility document excludes KV
  and R2 and marks dynamic Worker loading experimental. It is a possible later backend experiment,
  not an embeddable UI runtime, a drop-in Cloudflare OS host, or proof that one bundle can
  transparently be local and cloud-hosted.
  [celld README](https://github.com/denoland/celld/blob/v0.1.0/README.md) and
  [compatibility matrix](https://github.com/denoland/celld/blob/v0.1.0/docs/cloudflare-compat.md)
- WIT can describe versioned imports and exports for WebAssembly components without sharing
  implementation memory or language-specific types. That makes it a credible binary boundary for
  extension logic. It does not solve UI composition, storage policy, permissions, or distribution.
  [WIT reference](https://component-model.bytecodealliance.org/design/wit.html) and
  [worlds](https://component-model.bytecodealliance.org/design/worlds.html)

## Product invariants

Both possible hosts should preserve these rules:

1. **ZD state stays sovereign.** Project identity, workspace authority, enabled extensions,
   permission grants, keymap, and layout profiles belong to the host, not a plugin or cloud runtime.
2. **Capabilities are semantic and default-deny.** Extensions ask to read Markdown in the active
   project, open an external URL, or use namespaced storage. They do not receive a `TauriHandle`,
   `std::fs`, `Deno`, `GPUDevice`, shell string, or arbitrary localhost fetch.
3. **The host composes; extensions contribute.** ZD owns containers, focus traversal, accessibility,
   resizing, tab/split behavior, transient ordering, and recovery. An extension owns only the
   contents of surfaces granted to it.
4. **Untrusted code cannot impersonate authority.** Permission prompts, update warnings, trust
   labels, crash notices, and safe mode render in host UI outside extension surfaces.
5. **No invisible winners.** IDs, commands, chords, panels, service exports, and layout nodes resolve
   deterministically. Installation order never decides behavior.
6. **Local is complete.** Core ZD and local extensions work without a cloud account. Cloud execution,
   collaboration, and sync are explicit backends, not conditions of opening one's own work.
7. **The escape path is always available.** A safe launch ignores third-party layout/code and can
   disable, roll back, export, or remove an extension without first activating it.
8. **Performance is measured by surface.** GPU acceleration is an implementation choice for the
   surfaces that need it. No extension design gets justified by “WebGPU is fast” without a profile.

## Two extension models

### Model A: linked feature packs

A linked feature pack is application code built, tested, signed, and released with ZD.

Today the host has a `MiniApp` registry and a separate suite command registry; it has no
`FeaturePack`, panel/widget, or settings-factory registration. A proposed TypeScript linked pack would
add transactional contributions only as built-in consumers prove them. In a GPUI host the analogous
pack is a Rust crate registered at application startup. It may use deep host APIs because it shares
the host's trust and release lifecycle.

```text
ZD release
  shell + authority + state
  built-in feature catalog
    md feature pack
    terminal feature pack
    goals feature pack
    optional experimental feature pack
```

The catalog can carry manifest-shaped metadata, but it is compiled data. There is no dynamic Rust
ABI, downloaded JavaScript, runtime signature verifier, marketplace, or sandbox.

Advantages:

- Smallest change from today's `MiniApp`, command, and platform boundaries.
- Native GPUI packs can expose the full fidelity and performance of the host.
- The current DOM Markdown surface can stay intact under Tauri.
- Refactors are atomic because host and feature code compile and test together.
- A trusted pack can add a native window, renderer, PTY supervisor, or alternate root view when the
  product truly requires one.

Costs and limits:

- Every pack has full application authority and can crash, hang, read memory, or bypass policy.
- Enabling new code requires an application build/update.
- Third-party development means contributing to ZD or maintaining a fork.
- A GPUI pack and a DOM pack are different implementations; Rust's unstable ABI does not become a
  distribution format because the registry looks plugin-like.

This is the recommended **v0 extension model**.

### Model B: sandboxed package with host-owned composition

A sandboxed package is an independently installed, content-addressed artifact. Its manifest is
validated before code runs. The host then instantiates one or more isolated entrypoints and fulfills
only granted imports.

```text
signed/locally approved package
  manifest + assets
  Wasm logic component and/or sandboxed web UI
             │ typed requests
             ▼
  capability broker ── namespaced state
        │              scoped files
        │              allowed network origins
        │              command/layout contributions
        ▼
  GPUI host or Tauri/web host
```

Possible presentation paths are deliberately unequal:

- A Tauri/web host can place an extension UI bundle in a sandboxed, opaque-origin iframe or a
  separate unprivileged webview. It communicates over a host-created `MessagePort`; it receives no
  Tauri IPC object and its CSP denies network by default.
- A GPUI host can call Wasm component logic and render a small host-defined declarative widget tree.
  Extensions needing arbitrary HTML can use an isolated webview surface. Extensions needing fully
  native GPUI views must graduate to a reviewed linked feature pack.
- A headless extension may expose only commands, data transforms, or a brokered service. It needs no
  UI runtime.

Advantages:

- Independent install, enable, update, rollback, and removal.
- Code can be denied filesystem, process, network, secrets, clipboard, and global-input authority.
- The same semantic command/storage capability can work in native, web, local-server, and cloud
  hosts even when their renderers differ.
- Crashes, timeouts, memory growth, and permission use can be attributed to an extension instance.

Costs and limits:

- This adds a package format, runtime, broker, permissions product, layout engine, updater,
  compatibility policy, diagnostics, and conformance suite before it adds the first user feature.
- Arbitrary UI either inherits a webview or is limited by a declarative protocol. Wasm alone does
  not render a GPUI view.
- Sandboxing constrains authority, but resource exhaustion, deceptive in-surface UI, supply-chain
  compromise, and data intentionally given to an extension remain real risks.
- Local/cloud state and offline behavior become distributed-systems problems if introduced too
  early.

This is a **v1-after-evidence model**, not a prerequisite for new first-party widgets.

### Comparison

| Criterion | Linked feature pack | Sandboxed package |
| --- | --- | --- |
| First useful feature | Fast | Slow; platform work first |
| GPUI fidelity | Full | Declarative UI or isolated webview |
| Current DOM reuse | Full | Full inside bounded web surface |
| Independent installation | No | Yes |
| Security isolation | None | Meaningful if every import is brokered |
| Crash/resource containment | Process-wide | Per guest/webview/service where supported |
| API compatibility burden | One release graph | Long-lived public contract |
| Complete native redesign | Yes, trusted build | No; layout/root canvas only |
| Best use | Core and deep integrations | Third-party panels, widgets, commands, mini-apps |

## Recommended 80/20 sequence

### v0: make first-party composition explicit

Ship no downloaded code. Add only what a second built-in feature needs.

- Introduce an internal `FeaturePack` activation boundary that can register a mini-app and a batch
  of contributions, then dispose the batch atomically. Wrap `md` where it already lives; do not
  reorganize the editor merely to look extensible.
- Split command identity/behavior from key bindings. Keep the current single window listener and
  Shortcut Reference. Continue rejecting ambiguous bindings loudly.
- Add one named panel/widget slot only when a real second surface needs it. The existing Markdown
  sidebar does not need to become a general layout tree first.
- Put feature metadata in typed source, not a JSON package parser. Validate duplicate IDs and
  lifecycle cleanup in tests.
- Keep native authority behind semantic host services even for trusted code. That is architecture
  hygiene, not a claim of sandboxing.
- Measure activation time, mount time, idle CPU, and teardown leaks for each built-in pack.

An initial current-host shape could be:

```text
packages/app/src/extensions/
  types.ts              internal contributions and activation context
  host.ts               transactional register/activate/deactivate
  builtins.ts           explicit compiled catalog
  keymap.ts             bindings separate from command handlers

packages/app/src/miniapps/md/
  index.ts              unchanged product implementation
  feature.ts            thin adapter into the compiled catalog
```

This is a sketch, not a requirement to create all five files at once. Start with the narrowest seam
the next feature proves.

### v1: one constrained third-party path

Begin only after two materially different bundled widgets have derived the small contract and one
independently developed outside prototype—such as a read-only Markdown statistics widget—uses it
without private imports. Require a second outside prototype before broadening the constrained API.

- Define manifest schema v1, immutable package IDs, content digests, and one sandbox runtime.
- Support commands, one widget slot, one panel slot, a full-canvas mini-app, namespaced key/value
  storage, active-workspace read access, and explicit external URL opening.
- Support local sideload/dev directories before a public catalog. Installation starts disabled and
  shows the exact requested grant set.
- Add a validated v1 layout profile using a small set of host nodes: `surface`, `split`, and `tabs`.
- Add user keybindings and deterministic conflict UI. Extensions contribute command defaults, not
  ownership of physical keys.
- Deny downloaded extensions process spawn, PTY, arbitrary network, secrets, global hotkeys,
  titlebar/window control, raw GPU handles, Tauri IPC, and GPUI objects.
- Implement export, disable, rollback, remove, and safe mode before auto-update.

The runtime choice should follow the two prototypes. Wasmtime/WIT is attractive for logic and
host-rendered UI; a sandboxed web bundle is attractive for rich existing UI. Supporting both on day
one is not an 80/20 solution.

### Later, after adoption proves the cost

- More panel locations, background tasks, extension-to-extension services, structured database
  storage, optional origin-scoped network, and brokered process/PTY actions.
- Signed publisher catalog, transparency/provenance metadata, staged automatic updates, dependency
  resolution, and compatibility telemetry.
- Layout profiles that can replace the complete workspace canvas, multiple windows, portable
  profile bundles, and an alternate trusted shell package.
- A cloud state/execution backend, possibly Workers or a measured `celld` deployment, with explicit
  offline, conflict, deletion, authentication, and migration semantics.
- Collaboration and sync only after single-user local ownership is correct.
- More than one public host API major only when real installed extensions justify supporting it.

### What stays hardcoded at first

The following are part of the trusted computing base in v0 and v1:

- process startup, app update, code-signing trust, and safe-mode selection;
- the root window, titlebar/overlay behavior, global hotkey registrar, and OS integration;
- project identity, workspace scope, path canonicalization, save atomicity, and unsaved-work rules;
- permission, install, update, crash, and recovery UI;
- the command dispatcher, keymap resolver, focus model, transient stack, and accessibility rules;
- the layout node vocabulary, parser, quotas, and guaranteed recovery layer;
- design tokens and the host chrome that identifies extension-owned surfaces;
- the core Markdown editor and its untrusted-content renderer until an alternate editor proves an
  equally safe contract;
- the capability broker and audit log;
- which extension capabilities exist at all.

Hardcoded does not mean permanently unconfigurable. It means third-party code cannot redefine the
mechanism that limits third-party code.

## Shared contract

The following is the target semantic model. v0 implements only its in-process subset.

### Contribution layers

| Layer | Contribution | Authority | Earliest stage |
| --- | --- | --- | --- |
| 0 | Theme token values, keymap, layout profile | Inert validated data | v0 keymap; v1 layout |
| 1 | Command | Runs only when invoked; no UI required | v0 linked, v1 sandboxed |
| 2 | Widget | Small bounded surface in a named slot | v0 when needed |
| 3 | Panel | Resizable/tabbable surface with lifecycle | v0 when needed; v1 external |
| 4 | Mini-app | Owns the workspace canvas for a launch target | Exists linked today; v1 external |
| 5 | Layout profile | Places contributed and core surfaces | v1 constrained, later complete canvas |
| 6 | Shell feature pack | Native windows, renderers, process services | Trusted linked code only |

An extension does not gain layer 6 authority by contributing enough layer 1–5 objects.

### Illustrative manifest v1

This is intentionally a small declaration, not a promise that every field ships in v1:

```json
{
  "$schema": "https://example.invalid/zd/extension-manifest.v1.json",
  "schemaVersion": 1,
  "id": "dev.example.project-notes",
  "version": "0.3.1",
  "displayName": "Project Notes",
  "publisher": "dev.example",
  "requires": {
    "hostApi": ">=1.1.0 <2.0.0",
    "interfaces": ["commands@1", "ui.panel@1", "storage.kv@1"]
  },
  "entrypoints": {
    "wasm": "dist/logic.component.wasm",
    "web": "dist/panel/index.html"
  },
  "activation": ["onCommand:capture", "onPanel:notes"],
  "contributes": {
    "commands": [
      {
        "id": "capture",
        "title": "Capture selection in project notes",
        "defaultBindings": [{ "keys": "Mod+Shift+N", "when": "editor.hasSelection" }]
      }
    ],
    "panels": [
      {
        "id": "notes",
        "title": "Notes",
        "slot": "workspace.secondary",
        "entry": "web"
      }
    ]
  },
  "requests": [
    {
      "capability": "storage.kv@1",
      "scope": "project",
      "required": true,
      "reason": "Store notes for this project"
    },
    {
      "capability": "workspace.files.read@1",
      "scope": "active-project",
      "patterns": ["**/*.md"],
      "required": false,
      "reason": "Link notes to Markdown documents"
    }
  ]
}
```

Every local contribution ID expands to `<extension-id>/<local-id>`. Manifests cannot declare native
entrypoints. A built-in catalog may use similar metadata but can also register a trusted native
factory that never appears in an installable package.

### Identity and versioning

- **Extension ID:** immutable, lowercase reverse-domain identifier. Ownership transfers are an
  explicit signed event, never inferred from a matching display name.
- **Package version:** SemVer for update ordering and human support. It is not the API version.
- **Package digest:** hash of the exact manifest and artifacts. Grants, diagnostics, and rollback
  name both extension ID and digest/version.
- **Publisher identity:** signing key or catalog identity in the later distribution model. A local
  developer install is visibly `unpublished/local` and cannot silently become catalog code.
- **Contribution ID:** stable across package versions so layouts, keymaps, and stored state survive
  updates.
- **Install ID:** host-generated identity for one installation. This distinguishes two development
  copies without changing the durable extension ID.
- **Runtime instance ID:** new opaque ID per activation/surface. It keys logs and capability handles
  and is never persisted as product identity.
- **State schema:** independently versioned per storage namespace. Package rollback must not assume
  application-code version and data-schema version are identical.

Layouts and keymaps reference stable contribution IDs, never file paths, module URLs, GPUI type
names, or Wasm export ordinals.

### Trust classes and capabilities

| Trust class | Examples | Security meaning |
| --- | --- | --- |
| Core host | shell, broker, recovery, updater | Trusted computing base |
| Linked feature pack | bundled Markdown, terminal, native GPUI view | Same authority as core; review and release boundary only |
| Sandboxed extension | installed Wasm/web package | Only granted imports and bounded surface |
| Remote service | extension backend, cloud cell | Separate authenticated principal and data-egress boundary |
| Layout/theme/keymap | JSON-like data | No executable authority; parser and quotas still required |

Capabilities should be narrow, versioned interfaces. Initial candidates are:

- `storage.kv@1(scope=installation|project)`;
- `workspace.files.read@1(project, patterns)` using host-owned resource handles;
- `workspace.files.write@1(project, patterns)` as a separate grant with atomic host writes;
- `navigation.open-external@1(origins)` for HTTP(S), preferably after a user action;
- `clipboard.write@1` and later `clipboard.read@1`, separately;
- `ui.panel@1`, `ui.widget@1`, `commands@1`, and `layout.contribute@1`;
- later `network.fetch@1(origins, methods)`, `process.spawn@1(command IDs, not shell text)`, and
  `terminal.attach@1(project)` only after dedicated threat models.

The host stores the decision, not a bearer token in extension storage:

```json
{
  "extensionId": "dev.example.project-notes",
  "packageDigest": "sha256:…",
  "interface": "workspace.files.read@1",
  "resource": { "projectId": "prj_…", "patterns": ["**/*.md"] },
  "decision": "allow",
  "source": "user",
  "grantedAt": "2026-08-12T18:00:00Z"
}
```

Rules:

- No ambient WASI filesystem, environment, sockets, clocks, or randomness. Add a specific import
  when a working feature needs it.
- A file handle is bound to the extension instance, project, grant, and canonical resource. The
  guest cannot widen scope by supplying another absolute path.
- Network is origin- and method-scoped; loopback, link-local, private ranges, redirects, DNS
  rebinding, and response-size limits are policy concerns, not “just fetch.”
- Secrets are used by a brokered operation and are not returned as bytes. Raw secret read should not
  be a normal extension capability.
- Capability grants are not transitive between extensions or from a UI frame to its remote backend.
- New required permissions disable an update until approved. Optional denied capabilities appear as
  unavailable features, not activation failure.
- Extension UI receives input only while its surface is focused. It never installs a window-level
  key listener or observes commands meant for other surfaces.
- User-gesture tokens are short-lived, single-use, and bound to an operation such as clipboard read
  or external navigation.

### Lifecycle

The host owns this state machine:

```text
discovered → validated → installed-disabled → enabled → activating → active
                      ↘ incompatible        ↘ denied       ↘ failed/quarantined
active → suspended → active
active → deactivating → disabled → removed
installed version N → staged N+1 → validated/migrated → switched → rollback N
```

1. **Discover:** read built-in metadata, explicit local development roots, or catalog metadata. Do
   not execute entrypoints.
2. **Validate:** verify schema, IDs, digest/signature, archive paths, size limits, host/API range,
   entrypoint types, contribution collisions, and declared capabilities.
3. **Install disabled:** copy to a content-addressed location, record provenance, and show requested
   permissions. Installing is not activating.
4. **Enable:** resolve grants and contributions as one transaction. A collision or missing required
   interface leaves the previous application state untouched.
5. **Activate lazily:** instantiate on its declared event. Pass an activation context containing
   instance ID, host/interface versions, granted capability handles, and cancellation—not global
   services.
6. **Mount:** create one surface instance. Mount either succeeds and returns idempotent disposal, or
   the host replaces it with an attributed failure surface.
7. **Suspend/resume:** hidden projects and panels stop animation, polling, and GPU loops. Suspension
   does not imply durable teardown.
8. **Deactivate:** cancel work, dispose surfaces, unregister commands/services, flush bounded state,
   and release handles. The host enforces a deadline and can terminate the sandbox.
9. **Update:** stage new code beside old, validate and migrate against a snapshot, start the new
   version, atomically switch contributions, and retain one rollback candidate. Never run two
   writers against one namespace during the switch.
10. **Remove:** deactivate and delete executable artifacts. Offer “keep exportable data” versus
    “purge data and grants”; default to retaining data until the user chooses.

Linked packs follow the same registration/mount/disposal shape for correctness, but the host cannot
reliably kill one or contain a panic. A failing linked pack is an application defect.

### State and storage ownership

The host owns:

- project IDs, workspace roots/handles, current session, open core documents, and unsaved buffers;
- extension install records, grants, effective keymap, layout profiles, and surface placement;
- storage namespaces, encryption policy, quotas, migrations/rollback snapshots, export, and deletion.

An extension owns the schema and values inside its namespace. Suggested scopes are:

- **installation:** preferences shared by every project on this device;
- **project:** durable app data for one stable ZD project ID;
- **surface instance:** ephemeral state discarded with that surface;
- **account/cloud:** later and explicitly remote; never the implicit fallback for local storage.

Workspace documents remain user files, not “extension state.” They use scoped file capabilities and
the host's atomic-write/concurrency rules. The current use of `localStorage` is acceptable for the
small suite preferences that exist, but it should not become the extension database or the
local/cloud synchronization protocol.

Each migration declares `from`, `to`, maximum supported downgrade, and whether it is reversible. The
host snapshots first, runs migration with storage-only authority and a deadline, validates the new
schema, then switches code. Failed migration keeps old code and data active. Removal and project
deletion can enumerate all namespaces without executing their owners.

For a future remote backend, use `(account, project ID, extension ID)` as the logical partition. A
local SQLite namespace and a Durable Object/cell may implement the same storage operations, but they
do not silently share consistency semantics. Sync needs an explicit conflict model, offline queue,
encryption and key ownership, retention, account deletion, and a visible data-location choice.

### UI and layout composition

Every UI contribution resolves to a `SurfaceDescriptor` and creates a `SurfaceInstance` inside a
host-owned rectangle. The descriptor contains stable identity, title, allowed slots, minimum/preferred
size, renderer kind, restore token schema, and accessibility label. It does not contain a host object.

The host owns:

- layout, clipping, resize handles, tabs, focus traversal, drag/drop, full-screen behavior, and
  minimum-size enforcement;
- theme token delivery, text scale, reduced motion, contrast, and platform input notation;
- top-level dialogs/transients, permission prompts, notifications, and recovery;
- placeholder behavior when a surface is missing, incompatible, disabled, or crashed.

A web extension owns HTML/CSS only inside its sandbox. Its styles cannot reach host DOM. A GPUI
declarative extension supplies a bounded tree of supported primitives and events; the host renders
it. A canvas extension can request a WebGPU-capable surface later, but owns only that canvas and a
budget. It is never handed the host compositor/device. WebGPU loss must degrade that surface, not
blank the application.

An illustrative layout profile is inert data:

```json
{
  "schemaVersion": 1,
  "id": "dev.example.review-layout",
  "root": {
    "type": "split",
    "direction": "row",
    "ratio": 0.24,
    "children": [
      { "type": "surface", "surface": "zd.core/file-tree" },
      {
        "type": "tabs",
        "active": "zd.core/markdown",
        "children": [
          { "type": "surface", "surface": "zd.core/markdown" },
          { "type": "surface", "surface": "dev.example.project-notes/notes" }
        ]
      }
    ]
  }
}
```

Validation limits depth, node count, ratios, minimum sizes, duplicate singleton surfaces, renderer
availability, and unknown IDs. Missing surfaces become removable placeholders. Profiles are previewed
transactionally and auto-revert unless confirmed. The stock layout and a safe-mode command can never
be overwritten.

#### How a complete redesign emerges safely

“Complete” has three levels:

1. **Personal composition:** reorder/hide core surfaces, replace the home mini-app, nest panels,
   select a theme/token set, and remap commands. This can look wholly unlike stock ZD and is safe as
   validated data.
2. **Custom workspace canvas:** a sandboxed mini-app fills the complete product canvas and composes
   its own internal UI. Host-owned identity, permissions, recovery affordance, and OS window remain
   above/outside it.
3. **Native shell redesign:** custom titlebars, windows, GPUI primitives, global gestures, native
   menus, GPU compositor, or new authority services. This is a trusted linked pack or alternate ZD
   distribution, reviewed and signed with the application—not a marketplace extension.

Untrusted code can therefore redesign what the user works in without gaining the authority that
installs, confines, or rescues that code.

### Commands and hotkeys

The current `Command` combines ID, chord, availability callback, and handler. External extensions
need two registries:

```text
CommandDefinition = id + title + declarative availability keys + invoke handler
KeyBinding        = chord/sequence + command ID + declarative when clause + source
```

The host owns context keys such as `surface.focused`, `editor.hasSelection`, `project.trusted`, and
`transient.active`. An extension may publish values only under its namespace. Availability and
`when` clauses are parsed/evaluated by the host; they are not arbitrary callbacks run while drawing
the Shortcut Reference.

`BindingSetV1` is canonical portable `Profile` data; `CommandRegistry` is its runtime projection. A
native host may persist that schema in a versioned file and a service host in suite state, but neither
may dual-write two authorities. Extension defaults are contributions to the projection, not ownership
of the user's physical keys.

Resolution rules:

1. Normalize the logical `Mod` per platform and retain the current rule that foreign physical
   modifiers do not match.
2. Reserve only safety/OS chords. An extension never receives a global shortcut by default; a user
   explicitly binds an extension command through the native global-hotkey owner.
3. First select the most-specific matching context: modal/transient, focused widget, region/panel,
   workspace, then application. Within that context, source precedence is explicit user binding,
   workspace binding, core default, then extension default.
4. The same chord may target different commands only when host-provable `when` clauses do not
   overlap. Equal source precedence with overlapping conditions is an unresolved conflict: neither
   binding dispatches until chosen. Registration order is never a tiebreaker.
5. Invoking a command returns `handled`, `unavailable`, `cancelled`, or an attributed failure. Only
   `handled` consumes the event.
6. The Shortcut Reference renders the effective keymap, including unavailable commands and unresolved
   conflicts. It reads the same context evaluation as dispatch.
7. On deactivate, all commands/context keys/bindings registered by that activation disappear as one
   transaction. A stale disposer cannot remove a new version's definitions.

v0 may retain the current duplicate-chord exception while separating definitions from bindings. The
full precedence/context resolver belongs with user-installable extensions, not before.

### API, ABI, and compatibility

There are four independent versions:

1. manifest schema;
2. host semantic API;
3. individual capability interfaces such as `storage.kv@1`;
4. extension-owned state schema.

Do not tie them to the ZD app version.

For a Wasm runtime, WIT worlds should be small and additive. Conceptually:

```wit
package zd:extension@1.0.0;

world extension {
  import host-info;
  import commands;
  import storage-kv;
  export lifecycle;
}
```

The instantiated world contains only interfaces granted to that extension. Resource handles remain
host-owned. Wasmtime can enforce guest memory limits and interrupt/fuel policies, but those controls
must be explicitly configured; its default store is not a complete product sandbox.
[Wasmtime `Store` documentation](https://docs.wasmtime.dev/api/wasmtime/struct.Store.html)

For a sandboxed web surface, use a private `MessagePort` with validated envelopes:

```json
{
  "protocol": "zd.extension",
  "version": 1,
  "requestId": "req_…",
  "instanceId": "exti_…",
  "method": "storage.kv.get",
  "params": { "key": "draft" }
}
```

Enforce direction, schema, byte/depth limits, cancellation, timeouts, and one response per request.
The parent never accepts ambient `window.postMessage` from arbitrary origins after the private port
handshake.

Compatibility policy:

- A required interface major mismatch disables the extension with an actionable reason.
- Minor additions are feature-detected; absence returns `unsupported`, not a fabricated result.
- New meanings require a new interface major. Old and new majors may coexist only while supported
  extensions justify the maintenance.
- Adapters may narrow authority but never silently emulate a grant with broader authority.
- Linked GPUI/TypeScript packs compile against the application and have no stable ABI promise.
- Neither GPUI types, DOM nodes, WebGPU types, Tauri commands, nor `celld` protocol objects cross the
  public extension boundary.
- A package may carry host-specific web and Wasm entrypoints. The host selects a compatible one; it
  does not claim every extension is portable.

### Host mapping

| Semantic concept | Current Tauri/web host | Possible GPUI host |
| --- | --- | --- |
| Linked mini-app/panel | TypeScript mount factory and DOM container | Rust factory returning GPUI entity/view |
| Sandboxed logic | Worker or embedded Wasm runtime | Wasmtime component |
| Rich sandboxed UI | Opaque-origin iframe/unprivileged webview | Isolated webview surface |
| Simple sandboxed UI | Host DOM primitives if worthwhile | Host-rendered declarative GPUI tree |
| Commands | Existing window dispatcher, future separate keymap | GPUI actions plus host keymap resolver |
| Scoped files | Existing Rust/Tauri authority | Same Rust domain service behind native adapter |
| Layout | DOM/CSS host compositor | GPUI host compositor |
| WebGPU | Canvas-only opt-in surface | Separate canvas/webview or trusted native renderer |

This mapping is intentionally asymmetric. The semantic capability can be shared without forcing the
renderer to be shared.

### Local and cloud execution

Thought 2 should be decomposed into three independent choices:

1. **UI renderer:** DOM/CSS, GPUI, or a canvas/WebGPU surface.
2. **extension isolation:** Wasm component, sandboxed web frame/worker, or process.
3. **state/compute placement:** local host service, local daemon, or authenticated cloud service.

WebGPU does not make Wasm safer or state cloud-deployable. `celld` does not host a desktop UI. A
Tauri application spawning `celld` would be supervising a networked V8 daemon whose documented
durability depends on S3-compatible storage; that introduces binary updates, ports/authentication,
credentials, crash recovery, logs, resource limits, and data-location policy. Its peer interface
also expects a trusted private network and its compatibility surface is evolving. Cloudflare OS
cannot be assumed to run on it unchanged while APIs the OS uses are absent and dynamic Worker
loading remains experimental; that compatibility must be proven feature by feature.

The first local implementation should therefore be direct in-process host storage and semantic
capability calls. A later `StateBackend` experiment can compare:

- local SQLite/Rust implementation;
- local `workerd`/Workers implementation;
- single-node or distributed `celld` with object storage;
- Cloudflare Workers/Durable Objects.

Run the same black-box capability conformance tests against each, but document differences in
latency, offline behavior, consistency, quotas, authentication, and deletion. Do not market “run the
whole cloud app locally” until those tests and an offline recovery exercise pass.

### Discovery, install, update, and removal

Discovery sources arrive in this order:

1. compiled built-in catalog;
2. explicit local development directory;
3. user-selected package file;
4. later, signed catalog metadata.

There is no recursive scan of arbitrary workspace code and no auto-execution from a repository.
Project configuration can request an extension by ID/version, but the user installs and grants it.

Package installation must reject path traversal, links, duplicate/case-confusable IDs, undeclared
entrypoints, unsupported compression, excessive files/expanded size, invalid signatures/digests,
and incompatible API ranges before activation. The installed lock record includes source,
publisher, version, digest, grants, and last known-good version.

Updates are downloaded/staged without running. A permission diff and release provenance appear
before switching. New authority never inherits an old approval by display-name similarity. Crashes
after update trigger bounded automatic rollback; repeated crashes quarantine the extension rather
than restart-looping the app.

Disable is reversible and preserves state/layout placeholders. Remove deletes executable packages
and bindings, replaces layout references safely, and asks whether to export, retain, or purge data.
Purge can operate without extension code.

### Developer workflow

v0 development remains ordinary repository work: add a linked feature, register it in the compiled
catalog, add tests, and ship it with ZD.

When v1 is justified, provide one supported path:

```text
zd extension new project-notes
zd extension check
zd extension dev ./project-notes
zd extension test
zd extension pack
```

The tools should:

- generate only the chosen runtime/template, not every possible entrypoint;
- validate the manifest and generate typed WIT/message bindings;
- launch a visibly labeled development sandbox with hot reload;
- simulate granted, denied, revoked, unavailable, slow, and cancelled capabilities;
- show extension-scoped logs, traces, storage, effective bindings, and layout nodes;
- run host conformance fixtures and accessibility checks;
- produce a deterministic archive, SBOM/provenance metadata, digest, and optional signature.

The two API-driving samples should be real and remain in conformance tests:

1. a read-only Markdown statistics widget with no workspace write/network/process grant;
2. a project notes panel with project-scoped storage, command, keybinding default, suspend/resume,
   migration, layout placement, and export/remove behavior.

A GPU graph sample comes later and should prove why a canvas capability is needed. It should not
dictate the ordinary panel API.

### Observability and recovery

Every lifecycle transition, command invocation, capability decision/call, state migration, layout
resolution, crash, timeout, and update switch emits a structured event with:

- timestamp, severity, request/trace ID;
- extension ID, package version/digest, runtime instance and surface ID;
- host/API/interface versions;
- duration/outcome and a stable error code;
- resource counters where available.

Record payload sizes and resource identities, not document contents, selections, tokens, secrets, or
environment values. Paths shown to the user may be useful; exported diagnostic bundles should use
project-relative or redacted paths by default.

User-facing diagnostics need:

- an extension manager showing source, trust class, requested/effective grants, storage size, last
  activation, crashes, and last update;
- per-extension runtime log-level control and a bounded ring buffer;
- slow activation/mount/host-call warnings;
- CPU/fuel/time, memory, message-rate/size, storage, surface count, and WebGPU/canvas budgets where
  the runtime supports them;
- “restart extension,” “disable,” “rollback,” “export diagnostics,” and “launch safe mode” actions;
- a startup crash marker so the next launch can bypass the last activating third-party extension.

Logging cannot contain a linked pack's crash, and a sandbox does not make every denial recoverable.
The on-screen fallback must follow the existing boot rule: an attributed sentence is better than a
blank window.

### Tests and conformance

Favor integration tests at the host/runtime/capability cut points.

Minimum suites:

- **Manifest/package:** valid fixtures plus unknown fields/version, ID collisions, confusables,
  archive traversal/link bombs, size quotas, digest/signature, incompatible API, and permission diff.
- **Lifecycle:** lazy activation, atomic contribution batch, failed activation rollback, idempotent
  disposal, suspend/resume, cancellation, crash quarantine, update/migration switch, rollback, and
  removal without executing code.
- **Commands:** current platform modifier rules, definition/binding separation, context overlap,
  precedence, unresolved conflicts, unavailable state, held chords, stale disposal, Reference parity,
  and no input observation outside a focused surface.
- **Capabilities:** canonical path/symlink escape, pattern limits, revoked handle, project switch,
  atomic write, network redirect/SSRF cases, clipboard user gesture, grant isolation, and no
  transitive authority.
- **Storage:** namespace/scope isolation, quota, concurrent calls, migration failure, downgrade,
  snapshot, export, retain/purge, and project/account deletion.
- **Layout/UI:** schema fuzzing, maximum depth/nodes, missing/crashed surface, min-size pressure,
  focus/keyboard traversal, screen-reader names, reduced motion, theme isolation, preview rollback,
  and safe-mode recovery.
- **Sandbox:** no ambient filesystem/network/environment/Tauri IPC, malformed/oversized/replayed
  messages, WIT import mismatch, infinite loop interruption, memory growth, event flood, iframe CSP
  and navigation escape, and host survival after guest termination.
- **Cross-host conformance:** the same golden command, storage, file-handle, lifecycle, and error-code
  fixtures against every supported host adapter. UI fidelity remains renderer-specific.
- **Local/cloud backend:** the same state operations plus explicit offline, retry, conflict, deletion,
  authentication-expiry, and migration tests for each advertised backend.

Native/GPUI feature packs still need ordinary unit, integration, and end-to-end tests because they
are outside the sandbox. Every production bug gets a failing regression first, consistent with the
repository instructions.

### Escape hatches

The design needs deliberate ways past its safe common path:

- **Linked native feature pack:** for a terminal emulator, alternate GPUI editor, window manager, or
  GPU renderer that genuinely needs host internals. It ships as ZD code and shares ZD's authority.
- **Sandboxed full-canvas web mini-app:** for rich custom UI that exceeds declarative primitives but
  can stay within brokered capabilities.
- **Sidecar/bridge:** for mature external tools, language runtimes, agents, and services. Launch or
  connect through a narrow authenticated protocol instead of embedding their entire SDK.
- **Local developer build:** users can fork/recompile ZD and change the shell. It is visibly outside
  marketplace guarantees and is the honest route to unlimited native customization.
- **Open externally:** a panel can hand an explicit resource to the system browser/editor/terminal
  when embedding would add more authority and complexity than value.
- **Promote a seam:** after two linked features repeat a host need, add a deep semantic capability.
  Do not let extensions import an internal module “temporarily”; temporary private APIs become the
  hardest compatibility promises.

## Initial implementation drafts by host direction

### If ZD keeps Tauri and the portable web surface

1. Preserve `platform.ts` as the native-authority adapter; introduce small domain services behind it
   rather than expanding one giant pass-through interface.
2. Add the internal linked-pack host beside the current suite registries. Wrap `md`; do not move its
   implementation.
3. Separate commands and bindings while keeping the one capture-phase keyboard path.
4. Add a concrete panel host only with the next real panel. Keep the Markdown file tree's current
   direct implementation until another mini-app shares the compositor.
5. Prototype one unprivileged sandboxed web surface with CSP `default-src 'none'`, package-local
   assets, no same-origin privilege, no Tauri IPC, and a private port. Prove it cannot read a file
   before it is granted one.
6. Decide between web-worker logic and Wasm components only after the two sample extensions expose
   the required call shape.

This is the lowest-risk path because it preserves the existing CodeMirror product and browser tests.

### If ZD rebuilds as native Rust/GPUI

1. Treat the migration as a product rewrite with a fidelity gate for the rendered/editable Markdown
   surface, not as an extensibility refactor.
2. Define Rust linked feature packs around application startup, actions, view factories, and deep
   domain services. Pin GPUI and update all native packs with the host.
3. Keep extension-facing types in a separate crate with no GPUI exports. It contains IDs,
   contributions, layout schema, command context, capability definitions, and stable error codes.
4. Use Wasmtime/WIT for sandboxed logic only after a headless command/storage prototype. Add a small
   declarative GPUI renderer for common controls only if real widgets fit it.
5. Use an isolated webview for arbitrary third-party UI instead of trying to serialize all of GPUI.
6. Reuse or extract the existing Rust file-authority logic below Tauri macros so both shells can call
   the same canonicalization and atomic-write domain code.

GPUI improves native rendering and control. It does not remove the need for a public boundary or
make untrusted Rust safe.

### If ZD pursues WebGPU/Wasm plus local/cloud execution

1. Keep text, accessibility, layout, and ordinary controls in DOM/CSS or a native widget system.
   Use BroMetal/WebGPU for one profiled canvas-heavy surface such as a state graph.
2. Make the Wasm component boundary carry domain operations and events, not pixels or host objects.
3. Start with an in-process local state backend. Define the storage capability through observed
   calls from the sample extensions.
4. Run the same extension/backend contract against local Workers, `celld`, and hosted Workers in a
   throwaway spike. Measure cold/warm latency, idle cost, binary/process footprint, offline recovery,
   migration, and data deletion.
5. If Tauri supervises a daemon, bind to an authenticated loopback/OS-local channel, generate
   per-install credentials, health-check it, cap logs/resources, terminate it cleanly, and show where
   data and object-store credentials live.
6. Adopt a remote backend only when collaboration, multi-device access, or durable remote agents
   pays for the operational and privacy boundary.

## Decision gates

Do not advance a stage because the architecture is attractive. Advance when evidence passes these
gates:

- **v0 composition gate:** a second built-in mini-app/panel registers and tears down without editing
  boot, shortcut reference, or native authority code in multiple places.
- **public API gate:** two materially different bundled widgets derive the same semantic capability,
  and one independently developed outside prototype uses it without private imports. A second outside
  prototype is required before broadening the constrained API.
- **sandbox gate:** malicious fixtures cannot access a workspace, network, process, host DOM/GPUI,
  or Tauri IPC without the corresponding grant; hangs and memory growth do not blank ZD.
- **layout gate:** a radically different profile is useful in daily work, survives missing/updated
  extensions, remains keyboard/accessibility-correct, and always reverts to stock safely.
- **native rewrite gate:** the GPUI prototype matches the core Markdown reading/editing fidelity and
  demonstrates a measured benefit worth leaving the accepted portable frontend.
- **WebGPU gate:** a real profiled surface is limited by CPU rendering and the GPU version improves
  it without harming accessibility, power, fallback behavior, or maintainability.
- **cloud gate:** a repeated multi-device/collaboration/remote-agent need outweighs offline,
  authentication, privacy, billing, operation, and conflict complexity.

### Failure outcomes

- If v0 composition fails, retain direct built-ins and do not add a feature-pack abstraction.
- If the public-API gate fails, retain linked packs and data-only customization.
- If the sandbox gate fails, prohibit executable third-party packages.
- If the layout gate fails, retain fixed host-owned slots and the stock recovery layout.
- If the native gate fails, retain Tauri and the portable frontend.
- If the WebGPU gate fails, retain DOM/Canvas rendering for that surface.
- If the cloud gate fails, keep ZD local-only.

### Open questions before a public package runtime

- Which one sandbox runtime best fits the first outside prototype: Wasm components, an isolated web
  worker/webview, or a separate process?
- Which two bundled widgets expose a genuinely reusable lifecycle and capability cut rather than a
  coincidental shared helper?
- Can a full-canvas outside prototype remain useful with host-owned identity, recovery, permissions,
  focus traversal, and accessibility around it?
- What publisher/update channel can establish provenance and rollback without being mistaken for an
  isolation boundary?

## Recommendation

Build the product that can grow extensions before building the extension platform.

For the next feature, use a trusted linked pack, a transactional contribution batch, the existing
suite command path, and one concrete layout slot. Keep the manifest idea as typed metadata and keep
all code compiled into ZD. That makes both Thought 1 and Thought 2 viable without choosing either as
a public API.

When real third-party demand arrives, make the first public surface intentionally constrained:
commands, one widget, one panel, project-scoped storage, read-only workspace handles, and a sandbox.
Let layouts and keymaps provide most customization because data is easier to validate, migrate,
diff, share, and recover than executable shell mutations.

This path reaches the actual goal—ZD begins opinionated and can become deeply personal—while keeping
the most important asymmetry intact: users may redesign their workspace, but an untrusted widget may
not redesign its own authority.
