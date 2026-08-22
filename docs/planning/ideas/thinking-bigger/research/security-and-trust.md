# Security and trust boundaries for a self-customizing ZD

Research snapshot: 2026-08-12

This is a threat model and initial security specification for the two directions in
[`thoughts.md`](../thoughts.md). It is not an accepted ADR. The current
[platform-boundary](../../../../adr/suite/0002-put-native-authority-behind-platform-boundary_H.md),
[workspace-scope](../../../../adr/suite/0003-scope-file-access-to-launch-workspace_H.md), and
[untrusted-Markdown](../../../../adr/md/0004-treat-rendered-markdown-as-untrusted_H.md) decisions remain
authoritative.

## Bottom line

The safe interpretation of “complete customization” is **user-controlled composition over narrow,
revocable capabilities**, not arbitrary code inheriting the authority of the ZD process.

- GPUI, Rust, WebAssembly, WebGPU, V8, Tauri, and celld solve different problems. None makes an
  extension system safe merely by being present.
- Direction 1 may load bundled Rust/GPUI widgets in-process because they are part of the reviewed ZD
  binary. Third-party native libraries must not be loaded in-process. They would have the app's files,
  processes, network, memory, secrets, signing identity, and UI authority.
- Direction 2 may use Wasm for portable computation, but Wasm receives exactly the power exposed by
  its embedding. Wasm loaded beside privileged JavaScript in the main Tauri webview is not an
  extension boundary. WebGPU is a rendering/compute API, not a plugin sandbox.
- **celld is not a container or VM isolation layer.** Its official security page says the current
  alpha is “not safe for hostile multi-tenant use,” does not authenticate application users, and does
  not terminate public TLS. Its peer HTTP is authenticated but unencrypted, and bucket credentials
  are fleet-administrator authority. Its current fleet also runs one application deployment. See
  celld's official [security](https://github.com/denoland/celld/blob/v0.1.0/docs/security.md),
  [limitations](https://github.com/denoland/celld/blob/v0.1.0/docs/limitations.md), and
  [README](https://github.com/denoland/celld/blob/v0.1.0/README.md). A Docker image packages celld; it does not turn
  the V8 workload into a VM or establish hostile-code isolation.
- Therefore local single-user operation and cloud multi-tenant operation have separate acceptance
  gates. A supervised local celld sidecar may run one ZD-authored deployment. Arbitrary cloud
  extension code needs an independently designed sandbox and tenancy control plane; celld alone must
  not be credited with either.

The recommended sequence is:

1. bundled widgets and data-only customization;
2. a local, no-authority Wasm extension host;
3. individually brokered local capabilities;
4. an optional celld sidecar spike for trusted first-party code only;
5. a private cloud deployment with one security principal;
6. shared cloud tenancy only after auth, tenant isolation, secrets, quotas, recovery, and an
   independent security review pass;
7. arbitrary publisher code or a marketplace only after signing, revocation, sandbox, and update
   recovery are all real.

This follows the repository's guidance to default-deny, minimize blast radius, and avoid speculative
frameworks in [`GOOD_ENGINEERING_H.md`](../../../../GOOD_ENGINEERING_H.md).

## Security objectives and non-objectives

### Assets to protect

| Asset | Required property |
| --- | --- |
| Workspace files, unsaved buffers, objectives, todos, and review data | Confidentiality, integrity, no cross-project access, crash-safe writes |
| Project/session identities, panels, layouts, themes, commands, and hotkeys | Integrity, bounded parsing, recoverable customization, no security-UI spoofing |
| Extension packages, manifests, compiled modules, grants, and state | Authenticity, version binding, non-delegation, revocation, rollback |
| Local processes, PTYs, environment, clipboard, notifications, and browser handoffs | User intent, least authority, lifecycle cleanup, no ambient secret inheritance |
| Provider tokens, OAuth sessions, API keys, cloud cookies, update keys, bucket credentials, and celld peer secret | Confidentiality, narrow scope, rotation, never rendered or logged |
| celld deployments, per-cell SQLite state, ownership records, and object-store snapshots | Tenant binding, integrity, availability, recoverability |
| CPU, memory, disk, file descriptors, sockets, GPU time/VRAM, battery, bandwidth, and cloud spend | Fair bounded use, cancellation, graceful degradation |
| Audit history | Tamper evidence appropriate to topology, useful attribution, content minimization |
| User attention and control | Trusted prompts, honest origin/publisher identity, safe mode, immediate revoke/stop |

### Actors

- **User:** controls projects and grants, but can be tricked by vague prompts or spoofed UI.
- **ZD core and bundled widgets:** trusted code shipped through the ZD release process. A bug here can
  violate every boundary.
- **Extension author/publisher:** may be benign, compromised, abandoned, careless, or malicious.
- **Extension dependency/build system:** may inject code without the publisher noticing.
- **Untrusted content:** Markdown, repository files, copied data, remote pages, server responses,
  synced layouts, agent output, and terminal escape sequences.
- **Local peer:** another process running as the user, malware, a browser page reaching loopback, or a
  second stale ZD/daemon instance.
- **Remote attacker:** attacks ingress, sessions, update delivery, extension packages, or public APIs.
- **Other cloud tenant:** legitimately authenticated but hostile to another tenant's data and quota.
- **Operator/administrator:** can deploy code and often access infrastructure; this power must be
  explicit rather than hidden behind a “zero knowledge” implication.

### Explicit assumptions

- Compromise of the user's OS account or ZD's signed core binary is outside the extension sandbox's
  protection boundary. It still belongs in release, hardening, and recovery planning.
- Rust memory safety reduces accidental memory-corruption risk; it does not constrain intentionally
  malicious native code or unsafe dependencies.
- Wasm isolates module memory and requires imported host functions, but host imports determine real
  authority. The official WebAssembly [security model](https://webassembly.org/docs/security/) and
  Wasmtime [security documentation](https://docs.wasmtime.dev/security.html) make this separation
  explicit.
- A user intentionally opening a full terminal chooses to run commands with their own authority. That
  does not imply that an extension may silently drive the terminal, read its scrollback, or inherit
  its environment.
- Cloud operators and infrastructure are trusted unless an end-to-end-encryption design explicitly
  removes them from the data path. This proposal makes no such claim.

## Trust zones and topology

The durable boundary should be the same conceptually in both directions even when enforcement differs:

```text
untrusted document / remote page / extension package
                    │ parsed, size-limited messages
                    ▼
        untrusted extension execution zone
          no ambient files/process/network/secrets
                    │ capability IDs + opaque handles
                    ▼
           ZD-owned capability brokers
     files ─ state ─ network ─ tasks ─ secrets ─ UI
                    │ native/cloud enforcement
                    ▼
        OS account or authenticated tenant data
```

Security prompts, extension management, safe mode, update recovery, and the grant ledger remain in a
small core-owned surface that extensions cannot restyle, replace, cover, or intercept.

### Local native topology

For Direction 1, the GPUI process owns trusted chrome, rendering, the capability brokers, and bundled
widgets. Untrusted extension code runs in a separate Wasmtime store and preferably a separate child
process once it receives privileged or parser-heavy inputs. It returns validated view descriptions or
domain data; it does not receive GPUI objects, raw pointers, platform handles, or an `App` context.

GPUI's official README describes a pre-1.0, GPU-accelerated Rust UI framework with platform services
available from the application context. That is useful for a trusted core, but it is evidence that an
in-process GPUI plugin would be *inside* application authority, not isolated from it. See the official
[GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md).

### Local Tauri/WebGPU/celld topology

For Direction 2, the privileged Tauri control surface and any remote/browser surface must be different
webviews or execution contexts. A remote page has zero Tauri IPC capabilities. Tauri can target
capabilities by exact webview, but its documentation warns that overlapping capabilities merge their
permissions and that registered application commands require deliberate protection. See Tauri's
[capabilities guide](https://v2.tauri.app/security/capabilities/) and
[capability reference](https://v2.tauri.app/reference/acl/capability/).

The current [`default.json`](../../../../../packages/tauri/capabilities/default.json) targets the
`main` *window*. Tauri says a window match enables the capability on every webview in that window and
recommends exact `webviews` targets for a multi-webview window. It also says application commands
registered through `invoke_handler` are allowed by default. Before adding any untrusted child webview,
ZD must replace the window-wide match with an exact privileged-view policy and add permissions or
caller checks for the custom file/link/lifecycle commands. The current “default deny” plugin list is
not proof that a new remote view cannot invoke those application commands.

If Tauri starts celld, celld is a **supervised sidecar process**, not code “inside” the Rust process and
not a sandbox. The first acceptable experiment is one ZD-authored Worker deployment, loopback-only,
with no third-party code. It also needs an answer for celld's mandatory S3-compatible bucket: starting
celld locally does not by itself make the product offline or eliminate object-store credentials.

### Cloud topology

The minimum cloud shape is:

```text
TLS ingress + application authentication
                 │ authenticated principal; server-derived tenant ID
                 ▼
        ZD authorization/capability service
                 │ scoped requests; quotas; request ID
                 ▼
       trusted ZD deployment on celld nodes
                 │ per-tenant object/cell names
                 ▼
    fleet bucket (deployments, state, leases, peer secret)
```

The bucket and its credentials are an administrative root of trust. celld peer addresses belong only
on a trusted private network or encrypted overlay because peer HTTP does not terminate TLS. Public TLS,
user authentication, authorization, tenant mapping, rate limits, secrets, audit, deletion, and billing
controls sit outside celld and remain ZD's responsibility.

No cloud diagram should draw a container or VM around a celld cell unless a separately implemented
container/VM layer actually exists. For comparison, Firecracker's security claim depends on KVM plus
process constraints, seccomp, cgroups, namespaces, privilege dropping, and its jailer; those are not
celld properties. See Firecracker's official [design](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md).

## Direction-specific threat model

### Thought 1: Rust + GPUI native workbench

#### Acceptable first trust model

- Bundled widgets are first-party core code and go through normal code review, dependency locking,
  testing, and signed application releases.
- User customization begins as data: widget instances, typed settings, layout, theme tokens, command
  bindings, and project associations.
- Untrusted code, when introduced, is a Wasm component behind a narrow message protocol. WASI begins
  with no preopened directories and no inherited network. Wasmtime supports read-only/read-write
  preopens and explicit network inheritance, so ZD must never call broad inheritance helpers for an
  extension. See Wasmtime's [`WasiCtxBuilder`](https://docs.wasmtime.dev/api/wasmtime_wasi/struct.WasiCtxBuilder.html).
- UI output is a bounded ZD-owned widget tree. Extensions cannot submit native views, arbitrary event
  callbacks, custom shaders, or security prompts.

#### Principal threats

| Threat | Consequence | Required control |
| --- | --- | --- |
| Native dynamic library or Rust plugin | Full same-process compromise | Do not support third-party in-process native plugins; bundled native code is part of the TCB |
| GPUI context leaked through an extension API | Platform actions and arbitrary app-state mutation | Pass serializable values and opaque handles only; no framework objects across the boundary |
| Infinite Wasm loop or allocation bomb | Frozen UI or process OOM | Separate store/worker, memory/table/instance limits, fuel or epoch interruption, wall deadline, cancellation |
| Malformed or huge view tree | Layout explosion, memory pressure, inaccessible UI | Schema validation, maximum depth/nodes/text/asset bytes, keyed diff budget, reject-on-overflow |
| Hotkey/command capture | User action redirected or Save/Quit disabled | Core registry owns conflicts; reserved chords and core recovery commands are unshadowable |
| Theme/layout spoofing | Fake permission dialog or hidden security state | Unstyleable trusted chrome, prompt origin/publisher shown by core, minimum contrast/focus rules |
| Extension crash/panic | Whole application crash or corrupt state | Process boundary before privileged beta; transactional state; crash counter and quarantine |
| Unsafe hostcall implementation | Sandbox escape through confused deputy | Product-shaped hostcalls, canonicalization at use time, adversarial boundary tests, no generic FFI |

Wasmtime exposes deterministic fuel and lower-overhead epoch interruption specifically to stop runaway
guests. At least one must be configured; a sandbox with no time or memory bound is only a confidentiality
boundary, not an availability boundary. See Wasmtime's official
[interruption guide](https://docs.wasmtime.dev/examples-interrupting-wasm.html).

#### Rejected shortcut

“Extensions are written in Rust, therefore they are safe” is rejected. A publisher-provided native
library can call OS APIs directly, inspect process memory, replace callbacks, and bypass every broker.
Supporting it would collapse “install a widget” into “trust this publisher as much as ZD itself.” If a
future power-user mode deliberately permits that, it must be labeled **full-trust native add-on**,
disabled by default, excluded from cloud, and never accepted as the ordinary extension path.

### Thought 2: WebGPU + Wasm + celld + Tauri

#### Browser/Wasm boundary

WebAssembly in a browser follows the browser's origin and permission policy and can call whatever its
JavaScript imports expose. It must run in a dedicated Worker or sandboxed child context with no DOM and
no Tauri bridge; a core-owned broker validates every message. Loading extension JavaScript/Wasm into
the privileged main webview is equivalent to loading privileged frontend code.

Remote pages, Markdown renderers, previews, and extension UI must not share a webview with file,
process, terminal, agent, updater, or secret capabilities. This preserves the earlier
[browser-integration rule](../../thinking-differently/research/browser-integration.md): remote content
gets zero native IPC and communicates only through a tiny ZD-owned controller.

#### WebGPU boundary

WebGPU implementations validate commands before they reach native GPU APIs, but the specification
still identifies driver bugs, timing/side-channel concerns, fingerprinting, memory/compute exhaustion,
and denial of service. User agents may impose memory limits or watchdogs; those are implementation
heuristics, not a per-extension quota contract. See the W3C WebGPU
[security and privacy considerations](https://gpuweb.github.io/gpuweb/#security-considerations).

BroMetal compiles typed TypeScript to WGSL ahead of time and handles device loss/errors, but it is
pre-1.0 and does not change the runtime GPU trust boundary. See its official
[README](https://github.com/ericdrowell/brometal#readme).

The initial design therefore keeps pipelines and shaders in trusted ZD code. Extensions request
high-level charts, textures, geometry, or animation primitives with budgets. Arbitrary extension WGSL
is a later experimental capability only after the host proves device-loss recovery and practical GPU
time/VRAM containment. If those cannot be attributed and bounded per extension, raw shaders remain off.

#### celld boundary

celld embeds V8, executes Wrangler bundles, and uses an S3-compatible bucket for deployments, cell
state, leases, and peer authentication. It continuously replicates each cell's SQLite database. This
can be valuable for a trusted ZD cloud service. It does not currently provide:

- hostile multi-tenant code execution;
- application user accounts, login, session management, or authorization;
- public TLS termination;
- encrypted peer HTTP;
- a multi-application scheduler; or
- container/VM isolation for each cell.

celld v0.1.0's README and release notes conflict on whether RSS pressure shedding is opt-in or enabled
at 80% of available memory. Verify the pinned binary and exact configuration before defining ZD's
resource controls. Cells with active work or live host WebSockets may also resist shedding. ZD must
supply per-user request, CPU, storage, connection, egress, and spend limits rather than assuming celld
will. See celld's [README](https://github.com/denoland/celld/blob/v0.1.0/README.md#operate-a-fleet) and
[v0.1.0 release](https://github.com/denoland/celld/releases/tag/v0.1.0).

#### Accepted uses by topology

| Use | Status | Boundary |
| --- | --- | --- |
| Tauri launches a fixed, ZD-authored celld build and deployment for one local user | Spike allowed | celld is trusted first-party application code; OS account is the boundary |
| Private cloud for one operator/security principal running fixed ZD code | Alpha candidate | Private peer network, external TLS/auth, dedicated bucket credentials, backup and quotas required |
| Shared service where mutually untrusted users use the same fixed ZD code | Blocked pending tenancy phase | ZD authz and tenant data isolation require implementation, property testing, and security review |
| User/publisher uploads arbitrary Worker/Wasm code to a shared celld fleet | Explicitly prohibited | celld says its alpha is unsafe for hostile multi-tenant use; add a reviewed sandbox/VM architecture first |

## Shared extension security specification

### Extension tiers

Do not begin with one universal plugin type. The authority model should grow in four visible tiers:

1. **Configuration:** layout, theme tokens, hotkeys, and instances of bundled widgets. No executable
   code and no capability prompt.
2. **Sandboxed widget:** signed or locally pinned Wasm, private quota-bound storage, host-rendered UI,
   no files/process/network/secrets/GPU by default.
3. **Capability extension:** the same sandbox plus explicit project-scoped file, origin-scoped network,
   clipboard, notification, or named-task grants.
4. **Full-trust integration:** bundled native code or a user-launched external tool. It is not marketed
   as sandboxed, cannot be silently installed, and receives no automatic cloud portability.

The extension manifest declares identity and *requests* authority; the separate core-owned grant
ledger records what the user actually allowed. A minimum manifest needs immutable publisher/package
identity, version, API compatibility, artifact digest, contribution points, requested capabilities
with plain-language reasons, and resource-limit hints. Resource limits are enforced by the host, not
trusted because the manifest asks politely.

### Practical capability matrix

`Automatic` means the host safely namespaces and quotas the capability. `Grant` means core-owned user
consent scoped to the shown resource. `No` is a design decision, not an unimplemented prompt.

| Capability | Configuration | Sandboxed local Wasm | Full-trust/bundled native | Remote page/preview | Cloud trusted Worker | Enforcement and grant scope |
| --- | --- | --- | --- | --- | --- | --- |
| Render host widgets | Automatic, known widget types | Automatic, bounded view model | Yes | Own pixels only | Returns bounded data/view model | Node/depth/text/asset/frame budgets; no security chrome |
| Add panel/menu/command | Declarative | Automatic after install | Yes | No | Declarative response only | Namespaced IDs; core owns placement and menu labeling |
| Add or change hotkey | User confirms conflicts | Declares suggestion | Yes, still registry-mediated | No | No | Reserved recovery/Save/Quit chords; one visible conflict owner |
| Redesign complete work surface | Data model only | May contribute regions, never trusted chrome | Bundled release only | No | Synced data model only | Safe mode ignores custom layout; schema and size limits |
| Private extension key/value state | Namespaced quota | Automatic | Yes | Origin storage, never ZD store | Tenant + extension namespace | Versioned values, byte/entry limits, export/delete |
| Read widget configuration/project identity | Automatic, non-secret | Automatic minimum | Yes | No | Tenant-scoped minimum | Stable opaque IDs, not filesystem paths or credentials |
| List/read workspace files | No | Grant: extension + project + read | Brokered for bundled code | No | No local files | Opaque handles; current workspace only; canonicalize on every use |
| Write/create workspace files | No | Separate grant: extension + project + write | Brokered, atomic | No | No local files | Atomic write, parent revalidation, dirty-file conflict rules, audit |
| Read outside workspace | No | No in ordinary tier | Explicit OS picker/bookmark only | No | No | Never infer from a path string; a new user-selected handle is required |
| Watch files | No | Later grant, bounded filters | Brokered | No | No | Project scope, event coalescing/rate limit, revoke closes watcher |
| Spawn process or shell | No | No | Named ZD task or explicit full terminal | No | No local process | Never expose `exec(string)`; structured executable/argv/cwd; clean tree |
| Send PTY input/read output | No | No by default | User-focused terminal only | No | No | User gesture, visible attachment, output/control-sequence sanitization |
| Network fetch | No | Grant: scheme + exact origin + purpose | Brokered | Page's web origin only | Broker/service binding | Redirect recheck, DNS/private-IP/metadata defense, byte/time/rate limits |
| Listen on a port | No | No | Core-owned preview/daemon only | No | Platform ingress only | Loopback by default, random port, authenticated session, lifecycle owner |
| Open external URL | Declarative URL | User gesture through broker | Brokered HTTP(S) only | Normal navigation policy | No client action | Scheme validation; core shows destination where surprising |
| Clipboard read | No | Per-use user gesture | Brokered | Browser policy only | No | No persistent grant for background reads |
| Clipboard write/notification | No | Grant or user gesture | Brokered | Browser policy only | No direct device access | Rate limit and visible publisher attribution |
| Use provider/API secret | No | No raw secret; brokered operation grant | Vault/broker only | No | Service binding/broker | Secret never enters guest memory, state, prompt, URL, or logs |
| Raw WebGPU shader/device | No | No in initial phases | Trusted renderer only | Page's browser sandbox, zero ZD data | No by default | Later spike; device loss/OOM handling, no sensitive buffers shared |
| Install/update/grant another extension | No | No | Core updater only | No | No | Non-delegable; core-owned verified transaction |
| Read audit/grant ledger | Own status only | Own status only | Security UI only | No | Tenant admin endpoint only | Extensions cannot enumerate another extension's data or grants |

### Prompt and grant rules

- Prompts are rendered only by core trusted chrome and show publisher, package, requested operation,
  exact project/origin/task, duration, and reason.
- Choices are `once`, `this session`, `this project`, or `always` only where the capability can be
  safely made persistent. Clipboard read, new external roots, secret use, and destructive actions may
  require a fresh gesture regardless of prior grants.
- A denied extension cannot prompt in a loop. Repeated requests are rate-limited and become an entry in
  extension settings rather than another modal.
- Grants bind publisher identity, package ID, capability schema version, resource scope, and optional
  major version. A content update with a new capability or broader scope is disabled until separately
  approved. A digest change without valid publisher/update authorization is a different package.
- Capabilities are non-delegable. One extension cannot lend a file handle, secret broker handle,
  network session, or task handle to another extension.
- Revocation is immediate: cancel outstanding calls, close watchers/sockets/handles, terminate attached
  guest work, and prevent queued events from resurrecting the capability.
- “Allow all” is not offered. Development mode may show a full-trust warning, but it must not mutate
  ordinary grants or produce packages that look marketplace-safe.

## Authority-specific controls

### Filesystem

Keep the existing native launch scope and canonicalization rules. Extensions receive opaque resource
handles, not authority-bearing absolute paths. Every operation revalidates the handle, active project,
canonical parent, and symlink target at the native broker immediately before use. Writes retain atomic
replacement and dirty-buffer reconciliation. A project switch atomically moves the user's active scope
but does not silently move an extension grant; inactive-project background access is a separate future
capability.

Project read and write are distinct. Reading `.env`, credentials, Git internals, hidden files, ignored
files, and tool state should be excluded from the ordinary project-read view unless a product feature
proves it needs them. A broad workspace grant must not accidentally include SSH agents, home-directory
config, OS keychains, or files reached by links.

### Process and terminal

A generic shell command is equivalent to the user account and defeats filesystem/network/secret
brokers. The ordinary extension API therefore exposes named product tasks, not `runShell(string)`.
Each task uses a visible executable, structured argv, explicit cwd, a minimal environment allowlist,
bounded output, deadline/cancel, and supervised descendants. It never inherits the complete parent
environment, cloud credentials, signing keys, SSH agent, or arbitrary open file descriptors.

PTY output is untrusted. Wasmtime itself filters terminal control sequences because they can manipulate
some terminals or mislead users; ZD's terminal renderer needs its own bounded parser and must not turn
escape sequences into privileged app commands. Closing/revoking kills the entire owned process group,
including grandchildren, and crash recovery cleans recorded orphans.

### Network

Network starts denied. A fetch grant names HTTPS by default, an exact origin, allowed methods, purpose,
response/body limits, and duration. The broker rechecks every redirect and resolved address. It blocks
link-local/cloud metadata addresses, loopback, Unix sockets, private address ranges, peer/control-plane
ports, and DNS rebinding unless a specific first-party localhost-preview capability says otherwise.

Credentials are injected by a request broker and never returned to the extension. This protects the
credential bytes, not the authority they represent: an extension allowed to call an API may still
perform destructive calls or exfiltrate returned data, so operation-level and response-level limits
are required for sensitive services.

### Browser and remote content

Remote views get no ZD filesystem, process, agent, updater, extension-management, or secret IPC. They
cannot navigate the privileged local view, register custom schemes, download executable code into the
extension directory, or communicate with celld's peer/control interface. Any browser companion uses an
authenticated, user-approved semantic message such as `{url, title, selectedText?}`, not CDP-wide
control or arbitrary local commands.

### GPU

Core-owned rendering validates sizes before allocation, caps dimensions/buffer counts/frame work, and
handles adapter absence, device loss, validation errors, and out-of-memory by disabling the offending
surface and falling back to a non-GPU error UI. Extension data is copied into fresh buffers; buffers
containing another extension's or another tenant's data are never reused without clearing.

GPU diagnostics expose coarse adapter classes by default to reduce fingerprinting. Raw adapter IDs,
timestamps, timestamp queries, shared buffers, and extension-supplied WGSL stay unavailable until a
specific need and privacy review justify them. A background or hidden panel is throttled/suspended.

## Package, update, signing, and revocation

The current release ADR publishes checksums but explicitly leaves macOS and Windows signing for future
work. A checksum beside a compromised artifact is not publisher authenticity. Third-party executable
extensions and automatic updates must not ship until ZD's own core packages are platform-signed (and
notarized where applicable) and the extension trust root has an operational recovery plan. See the
current [release ADR](../../../../adr/repository/0002-publish-versioned-desktop-releases_H.md).

Wasmtime JIT/AOT choices and celld's embedded V8 also interact with platform signing. Apple warns that
JIT engines require specific Hardened Runtime treatment and that runtime exceptions remove particular
protections. Prefer a separately signed helper or AOT path that keeps any JIT entitlement out of the
main authority process, and never solve a packaging failure by broadly allowing unsigned executable
memory or disabling library validation. The required entitlements, helper signing, notarization, and
update behavior need a release spike against the actual binaries. See Apple's official
[Hardened Runtime guidance](https://developer.apple.com/documentation/xcode/configuring-the-hardened-runtime/)
and [notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

Minimum executable-extension distribution rules:

- packages are content-addressed and signed over manifest, module, assets, dependency metadata, and
  API/version constraints;
- install verifies signature, digest, size, declared files, and compatibility before extraction into a
  new non-executable staging directory; paths, links, duplicate names, and archive bombs are rejected;
- first-party bundled extensions follow the app signature; locally developed/sideloaded extensions are
  visibly marked, pinned by digest, and never silently promoted to trusted publisher status;
- automatic update is initially off for third-party packages; the user sees publisher, old/new version,
  permission delta, and restart/state-migration impact;
- the previous package and state snapshot remain available for transactional rollback;
- a signed revocation record can block publisher keys, package versions, or artifact digests. It has an
  expiry, monotonic version, offline-cache behavior, and a user-visible reason;
- publisher key rotation is authorized by the old key and the new key or by an offline recovery root;
  losing one online signing key must not make every installed client permanently un-updatable;
- build dependencies are locked, CI actions pinned, provenance/SBOM retained, and release/signing keys
  kept out of extension build jobs and runtime environments.

Tauri's updater requires a signature and does not allow verification to be disabled, which is a useful
core primitive, but a mature marketplace also needs rollback/freeze defense, delegated publisher keys,
and revocation. The Update Framework specification provides the relevant model: versioned and expiring
metadata, threshold roles, key rotation, and rollback/freeze checks. See Tauri's
[updater documentation](https://v2.tauri.app/plugin/updater/) and the
[TUF specification](https://theupdateframework.github.io/specification/latest/).

## Persistence, synchronization, cloud identity, and secrets

### Local persistence

The current suite stores preferences and presence identity in webview `localStorage`. Extension grants,
package trust, project identity, security events, and synchronized layout must move to a versioned store
owned below the UI. An extension receives a namespaced logical store, never database file access.

Every persisted structure has a schema version, maximum size/count/depth, atomic transaction, backup or
journal, migration rollback, and unknown-field policy. Extension state migration runs with the same
deadline and CPU/memory limits as the extension, against a copy, before the active version switches.
It receives access only to its own storage namespace—no file, network, process, clipboard, secret, UI,
or other normal extension grants.

### Sync data

Sync is opt-in and classifies data before upload:

| Data | Default sync policy |
| --- | --- |
| Layout, theme, enabled widgets, non-sensitive preferences | Eligible after schema validation and quota |
| Hotkeys and commands | Eligible, but conflicts re-evaluated locally; cannot replace reserved recovery bindings |
| Extension list and artifact digests | Eligible as intent; each device independently verifies and grants |
| Capability grants | Never copied as authority; another device asks independently |
| Workspace paths and recent filenames | Local by default; disclose separately if synced |
| Document/objective content and transcripts | Off until the product defines retention, encryption, sharing, export, and deletion |
| Secrets, bearer tokens, environment, signing keys, bucket credentials | Never general sync data; use a dedicated credential system |
| Audit logs | Local by default; cloud security events follow stated retention and access policy |

Synced records carry account/tenant identity, object version, device ID, and bounded payload. The server
rejects tenant IDs supplied as authority by the client, stale/replayed mutations, unknown extension
schemas, and packages revoked on the receiving device. Keep recoverable history so one corrupt or
malicious client cannot permanently overwrite every device. “Reset synced customization” must restore
a core default without deleting documents.

### Cloud authentication and tenancy

Use a vetted identity provider/protocol rather than home-grown passwords or tokens. Web sessions use
Secure, HttpOnly, SameSite cookies, CSRF protection where needed, short lifetimes, rotation, explicit
logout/revocation, and step-up authentication for account export/delete, secret changes, publisher
actions, and administrative operations.

The authenticated server derives tenant/user identity. Object names, cell IDs, database queries,
WebSocket subscriptions, cache keys, logs, metrics, background jobs, backups, and restore paths all
carry and enforce it. Never accept `tenantId` in a client body as authorization. Cross-tenant negative
tests cover direct IDs, guessed names, search, pagination, exports, WebSockets, races, error messages,
cache reuse, and restore tooling.

Shared infrastructure uses a dedicated celld fleet bucket and narrowly scoped service identity per
environment/security realm. Development and local clients never receive production bucket credentials.
Because bucket access is fleet administrator access, ordinary application code and extension guests do
not receive it. Rotation is rehearsed, old credentials are disabled, and peer-auth material is excluded
from application responses, diagnostics, and logs.

Provider secrets live in an OS credential vault locally and a managed secret/KMS boundary in cloud.
They are referenced by opaque IDs and injected only into a brokered operation or dedicated service
binding. Logs, panic reports, terminal output, crash dumps, URLs, sync payloads, and extension state are
redacted at the source. Secret rotation and deletion invalidate active sessions and cached broker
handles.

## Availability, denial of service, and denial of wallet

Every extension invocation has limits for CPU/fuel, wall time, linear memory, tables/instances, message
bytes, output events, view-tree complexity, storage, open handles, watchers, sockets, requests,
redirects, response bytes, log bytes, and restart rate. Limits are per extension and aggregate per app.
The host remains responsive enough to show Stop/Disable even when the guest is hostile.

Cloud adds per-account/tenant/IP rate limits, concurrent request/WebSocket/job caps, storage/egress/CPU
budgets, bounded fan-out, circuit breakers, spend alarms, and a hard tenant kill switch. Backpressure
must reject work before unbounded queues grow. Expensive operations are idempotent and carry request IDs
so retries do not duplicate work or billing.

The extension host, renderer, daemon, and cloud service report coarse pressure without document content.
Repeated resource violations quarantine the responsible extension or tenant instead of restarting it in
a crash loop. GPU loss disables GPU work; celld pressure does not become the only overload control.

## Audit, logging, and privacy

Security events include:

- extension install/update/remove, digest, signer/publisher, verification result, and rollback;
- capability request/grant/deny/revoke and the resource scope, without file contents or secrets;
- privileged operation outcome, extension ID, project/tenant opaque ID, destination class, and request
  ID;
- extension crash, timeout, quota breach, quarantine, and recovery action;
- local daemon start/version/hash/bind address, authentication failure, crash, upgrade, and clean stop;
- authentication, session revocation, administrator action, tenant export/delete/restore, and detected
  cross-tenant denial;
- deployment/update/revocation metadata version and signing identity.

Command lines, environment, file contents, full paths, URLs with query strings, headers, tokens,
clipboard, prompts, transcripts, and Wasm memory are not logged by default. Developer diagnostics require
an explicit time-limited mode and preview the collected bundle before sharing. Local logs stay local by
default, have rotation/size/retention limits, and can be deleted. Telemetry is opt-in and cannot be a
prerequisite for safe mode, revocation, or update verification.

Audit logs are evidence, not an authorization mechanism. Local malware running as the same user may
alter local logs; cloud audit storage needs append restrictions and separate administrator access if it
is intended for incident investigation.

## Recovery and safe mode

Safe mode is an invariant, not another extension:

- a documented startup modifier and CLI flag start core UI with third-party code, custom layout,
  synced commands, GPU effects, and optional local daemons disabled;
- a reserved command opens extension management even if all user hotkeys/layout are corrupt;
- the last-known-good core layout, grants, package set, and state snapshots can be restored separately;
- startup detects repeated crashes, names the last activated extension, and offers Disable/Roll Back
  without executing it again;
- malformed state is quarantined, not repeatedly migrated or silently discarded; export remains
  possible where safe;
- revoke/disable kills guest processes, task descendants, watchers, sockets, GPU loops, and queued
  callbacks;
- local daemon supervision detects stale PID/lock/socket state, refuses an unknown binary or protocol,
  and can cleanly reset daemon state without deleting project documents;
- cloud operations provide per-version deployment rollback, signer/package kill switches, tenant
  session revocation, credential rotation, backup verification, and point-in-time tenant restore;
- deletion and account closure remove live state, scheduled work, secrets, and documented backups on a
  stated schedule.

## Concrete abuse cases the design must pass

1. A “theme” draws a pixel-identical permission prompt and covers the real publisher label.
2. A widget binds Save/Quit/safe-mode chords, captures typing, or creates an infinite command loop.
3. A read-only extension traverses `..`, follows or races a symlink, reads `.env`, or reuses a handle
   after switching projects.
4. A network extension redirects from an allowed origin to loopback, cloud metadata, celld peers, or a
   DNS-rebound private address, then exfiltrates a workspace file.
5. A task extension injects shell metacharacters, inherits AWS/signing/SSH credentials, leaves a
   grandchild running, or hides terminal control sequences in output.
6. A remote page or Markdown payload invokes a custom Tauri command or posts a privileged message to
   the main view.
7. A Wasm extension loops forever, recursively emits widgets, allocates until OOM, floods events/logs,
   or crashes during state migration.
8. A shader allocates extreme buffers, spins expensive work, fingerprints the adapter, or causes device
   loss that blanks unrelated panels.
9. A compromised publisher key ships a quiet update with a broader capability, then the update server
   withholds the revocation or serves an older “good” metadata set forever.
10. A local website guesses the sidecar port, steals a URL token from history/logs, replays a command,
    races daemon startup, or connects to a stale process from another app version.
11. Tenant A guesses Tenant B's cell/object ID, subscribes to its WebSocket, hits it through an export,
    cache, error, backup, or restore path, or makes Tenant B pay for work.
12. A stolen celld bucket credential changes deployments, state, leases, or peer auth. The incident
    procedure treats it as fleet-admin compromise rather than an ordinary app token leak.
13. A corrupt synced layout disables every surface on every device or repeatedly re-enables a revoked
    extension.
14. A user loses network access during update, migration, grant change, or sync conflict and still has a
    usable local core plus recoverable previous state.

## Staged security acceptance criteria

These are release gates, not future cleanup tasks.

### Phase 0 — preserve the current boundary

Applies before either rewrite/spike.

- The current scoped filesystem and untrusted-content tests remain passing or are reproduced at the new
  platform boundary.
- The capability inventory is generated/reviewed; no new generic filesystem, shell, HTTP, or custom IPC
  pass-through appears.
- The current default network connection to SSPS is classified in privacy UI and remains independently
  disableable. A “fully local” claim either removes it by default or names the exception.
- Core release artifacts state their actual signing/notarization status; extension-security claims do
  not outrun core authenticity.

### Phase 1 — bundled widgets and data-only customization

Applies equally to GPUI and WebGPU prototypes.

- Customization schema supports one real widget, panel placement, settings, and hotkey without
  executable extension code.
- Depth/count/string/asset limits reject hostile layout fixtures while the core remains responsive.
- Reserved chrome/commands cannot be styled, covered, removed, or rebound.
- Safe mode and one-click default-layout recovery work after corrupt state and simulated startup crash.
- Configuration writes and migrations are atomic and rollback-tested.

**Kill condition:** if full customization requires executable code merely to place ordinary widgets or
bind ordinary commands, simplify the model before adding a plugin runtime.

### Phase 2 — local single-user sandboxed extension

The first third-party execution slice has host-rendered UI and private storage only.

- One malicious Wasm fixture for each abuse class—loop, memory growth, trap, malformed message, huge
  view, event flood, storage flood, migration crash—is contained and attributed.
- No preopened filesystem, inherited environment, network, process, clipboard, raw GPU, Tauri IPC, GPUI
  context, or secret exists in the guest.
- CPU/wall/memory/output/storage quotas and cancel work; Stop/Disable responds within the stated UI
  target even under attack.
- Package digest/signature verification, sideload labeling, transactional install/update/rollback, and
  crash quarantine work offline.
- Two extensions cannot access each other's state, handles, events, or identity-private data.

**Direction 1 gate:** prove GPUI ↔ extension-host message/UI latency with three representative widgets;
do not load a Rust dylib as the shortcut.

**Direction 2 gate:** prove a Worker/child context cannot reach privileged Tauri commands or DOM even
after compromised extension JavaScript glue; test on every supported system webview.

### Phase 3 — brokered local authority

Add one capability at a time, starting with project read.

- Prompts, grant binding/deltas, expiry, denial backoff, audit, and immediate revoke pass end-to-end.
- File tests cover absolute/relative paths, `..`, symlinks, symlink replacement races, missing parents,
  project switches, hidden/sensitive files, stale handles, atomic writes, and dirty-buffer conflicts.
- Network tests cover schemes, credentials in URLs, redirects, DNS rebinding, private/link-local/metadata
  addresses, response streaming limits, timeouts, and revoke during request.
- Named task tests cover structured argv, minimal env, cwd, output/control-sequence bounds, cancellation,
  descendants, crash/orphan cleanup, and no secret logging.
- Full shell/PTY stays a separately labeled user surface; an extension cannot background-drive it.

**Kill condition:** if a useful capability can only be expressed as raw paths, `exec(string)`, inherited
network, raw tokens, or blanket “workspace trust,” do not ship it under the sandboxed tier.

### Phase 4 — local celld sidecar spike (Direction 2 only)

This phase runs fixed ZD-authored code for one local OS user. It is not an extension sandbox.

- celld binary and deployment are version-pinned, provenance/signature/digest verified before launch,
  and protocol-compatible with the app.
- The supervisor uses per-install state with restrictive permissions, one owner lock, bounded restart
  backoff, clean shutdown, orphan detection, upgrade rollback, and recoverable corruption handling.
- Client ingress binds loopback only on a non-predictable port and uses a per-launch high-entropy secret
  outside URLs, logs, and persisted web storage; Origin/Host/replay handling is tested.
- Peer listening is disabled if possible for one node or confined to an explicitly trusted/encrypted
  network. Nothing binds `0.0.0.0` by convenience.
- The bucket/object-store topology, credentials, offline behavior, backup, disk quota, and uninstall are
  demonstrated. No claim of “all local/offline” is made while a remote bucket is required.
- A malicious local web page, stale client, mismatched app version, and second process cannot operate
  the daemon.
- Resource pressure and active WebSockets cannot freeze the Tauri core; the app degrades without data
  loss when the daemon is absent or killed.

**Kill condition:** if local celld requires an externally reachable peer, broad AWS credentials, an
unmanaged object-store daemon, or cannot deliver a materially deeper module than an embedded database
and Worker runtime, remove celld from the local architecture.

### Phase 5 — private cloud alpha, one security principal

- Public ingress has managed TLS and vetted authentication; celld peer traffic stays on a private
  network or encrypted overlay.
- A dedicated environment/fleet bucket identity cannot access another environment and is absent from
  Worker responses, extension guests, CI logs, and client bundles.
- Deployment, data backup, restore, credential rotation, signer revocation, rollback, monitoring, and
  spend limits have been rehearsed from clean infrastructure.
- Fixed trusted code only; no user/publisher code upload or marketplace execution.
- Operator access, plaintext-visible data, retention, telemetry, export, deletion, and incident contact
  are stated honestly.

### Phase 6 — shared cloud service with mutually untrusted users

This is a new security milestone, not a configuration flag on Phase 5.

- Tenant identity is server-derived and enforced in every store, cell/object name, cache, queue,
  WebSocket, export, log, metric, backup, and restore path.
- Automated cross-tenant negative/property tests and concurrency tests pass for the abuse cases above;
  an independent reviewer examines authorization and infrastructure boundaries.
- Per-tenant rate/CPU/storage/connection/egress/spend quotas, hard kill, and fair backpressure work under
  deliberate abuse.
- Session theft/replay, CSRF, account recovery, administrator escalation, and delete/export flows are
  threat-modeled and tested.
- Restore of one tenant cannot overwrite or disclose another tenant. Backups are encrypted, access
  audited, and restore drills measured.
- celld remains trusted infrastructure for the fixed app, not the isolation claim for hostile code.

**Blocker:** celld's current alpha warning against hostile multi-tenant use must be re-evaluated against
the exact deployed version and threat model. A stronger upstream claim alone is not sufficient; ZD's
own tenancy tests and review still apply.

### Phase 7 — third-party marketplace or arbitrary cloud code

- The signed metadata/revocation/key-rotation/update design survives compromised online publisher and
  mirror scenarios, rollback, freeze, partial download, and offline clients.
- Publisher verification, abuse reporting, emergency disable, privacy disclosure, vulnerability intake,
  patch SLA, dependency provenance, and abandoned-extension policy are operational.
- Hostile code receives process/VM-grade defense in depth appropriate to the topology, independent
  resource accounting, no shared secrets, mediated egress, and tested escape response. celld by itself
  does not satisfy this item.
- Native full-trust packages are either prohibited or separated into a clearly non-sandboxed channel
  with platform signatures and explicit user/admin policy.
- A red-team exercise covers supply chain, sandbox hostcalls, GPU, local daemon, cloud tenant, update,
  recovery, and denial-of-wallet paths before general availability.

## Risks designed out now versus questions that need spikes

### Design out

- Third-party native code in the ZD process.
- Extension code/JavaScript in the privileged Tauri page.
- Remote pages with any local IPC capability.
- Generic shell/process APIs and inherited parent environments.
- Authority expressed as caller-provided absolute paths or tenant IDs.
- Raw secrets handed to extensions or synchronized as ordinary state.
- Extensions rendering prompts, granting/installing/updating peers, or replacing safe mode.
- Permission grants silently following a package capability increase or another device.
- Arbitrary extension WGSL in early phases.
- Public/guessable unauthenticated localhost APIs and `0.0.0.0` local-daemon defaults.
- Claiming Docker, V8, Wasm, WebGPU, or celld is a VM boundary.
- Arbitrary publisher code in a shared celld fleet while celld disclaims hostile multi-tenancy.

### Bounded spikes

| Spike | Question | Success / kill condition |
| --- | --- | --- |
| GPUI + Wasmtime widget host | Can a separate guest produce rich responsive widgets without leaking GPUI authority? | Three representative widgets meet input/render latency and crash isolation; otherwise restrict customization to data/bundled widgets |
| Web Worker/Tauri isolation | Can extension JS/Wasm be kept out of DOM and all custom/native IPC on every platform? | Compromised-glue tests cannot invoke IPC; otherwise use a separate process/webview or reject executable web extensions |
| OS process sandbox | Can privileged guests receive defense in depth consistently on macOS/Windows/Linux? | Documented enforceable profile plus escape/lifecycle tests; otherwise keep privileged execution Wasm-only and brokered |
| GPU containment | Can device work be attributed, bounded, canceled, and recovered per extension? | One hostile shader cannot starve/blank unrelated UI; otherwise keep raw shaders core-only |
| celld local/offline | Can one app supervise celld without remote admin credentials or another unmanaged service? | Loopback-authenticated lifecycle and offline/recovery story are simpler than alternatives; otherwise use an embedded runtime/store |
| celld protocol/update | Can app and daemon upgrade/rollback without split-brain or state loss? | Version negotiation, migration copy, rollback, and stale-daemon tests pass; otherwise distribute separately or remove sidecar |
| Platform signing + JIT | Can Wasmtime/celld helpers remain signed, notarized, and narrowly entitled without weakening the main app? | Actual packaged builds pass platform verification with JIT/AOT/helper boundaries documented; otherwise choose AOT or remove the embedded runtime |
| Cloud tenant isolation | Can every data/control path derive and enforce tenant identity? | Automated cross-tenant suite plus independent review finds no bypass; otherwise remain private single-principal |
| Sync/privacy model | Which content is server-readable, encrypted, retained, shared, recoverable, and deletable? | A product decision and tested recovery exist before document/transcript sync; otherwise sync customization metadata only |
| Update trust recovery | Can keys rotate/revoke across offline and old clients without bricking updates? | Compromised-key, rollback, freeze, and lost-key drills pass; otherwise manual verified packages only |

## Decision recommendation

Security does not choose GPUI versus WebGPU, but it rules out unsafe versions of both:

- A GPUI direction is credible if GPUI is the trusted renderer and third-party customization remains
  data or isolated Wasm—not native libraries.
- A WebGPU direction is credible if WebGPU is an optional trusted rendering accelerator and untrusted
  extensions cannot submit unlimited GPU work or reach Tauri IPC.
- A celld direction is credible first as trusted deployment/state infrastructure. It is not presently a
  foundation for arbitrary multi-tenant extension execution, and “run it in Docker” does not repair that
  mismatch.

The deepest shared module worth designing now is a small capability broker plus grant ledger, exercised
first by bundled widgets and one local Wasm guest. Do not build a marketplace, universal UI protocol,
cloud code scheduler, or full-trust native SDK until those smaller boundaries work under adversarial
tests.

## Primary sources

- [Current ZD capability configuration](../../../../../packages/tauri/capabilities/default.json) and
  [Tauri CSP](../../../../../packages/tauri/tauri.conf.json)
- [Tauri capabilities](https://v2.tauri.app/security/capabilities/),
  [capability reference](https://v2.tauri.app/reference/acl/capability/),
  [CSP](https://v2.tauri.app/security/csp/),
  [isolation pattern](https://v2.tauri.app/concept/inter-process-communication/isolation/), and
  [localhost warning](https://v2.tauri.app/plugin/localhost/)
- [GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md)
- [WebAssembly security model](https://webassembly.org/docs/security/),
  [WASI capability model](https://wasi.dev/), and
  [Wasmtime security](https://docs.wasmtime.dev/security.html)
- [WebGPU specification security/privacy considerations](https://gpuweb.github.io/gpuweb/#security-considerations)
- [BroMetal README](https://github.com/ericdrowell/brometal#readme)
- [celld README](https://github.com/denoland/celld/blob/v0.1.0/README.md),
  [security](https://github.com/denoland/celld/blob/v0.1.0/docs/security.md), and
  [limitations](https://github.com/denoland/celld/blob/v0.1.0/docs/limitations.md)
- [Cloudflare Workers security model](https://developers.cloudflare.com/workers/reference/security-model/)
  for the additional isolate, process, namespace/seccomp, API-design, and patch-operation work a
  production hostile-code platform performs beyond merely embedding V8
- [Firecracker design and threat containment](https://github.com/firecracker-microvm/firecracker/blob/main/docs/design.md)
- [Tauri updater](https://v2.tauri.app/plugin/updater/) and
  [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
