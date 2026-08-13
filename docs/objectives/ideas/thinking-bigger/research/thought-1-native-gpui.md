# Thought 1: a native Rust/GPUI ZD workbench

Research snapshot: 2026-08-12

Repository snapshot: `4a5fe03`

Status: implementation proposal and experiment plan, not accepted architecture

## Bottom line

This direction is coherent, but it is a **native product rewrite**, not a cheaper desktop shell.
GPUI can plausibly supply the rendering, state, input, window, and test foundations for a fast Rust
application. `gpui-component` can plausibly shorten the route to controls, tabs, docks, Markdown,
and a basic editor. bb and Cloudflare OS supply strong product ideas: projects containing live work,
user/agent parity, small composable applications, and default-deny capabilities.

The expensive part is ZD's product differentiator. The current rendered-but-always-editable Markdown
surface is implemented deeply in CodeMirror, the DOM, and CSS. It cannot be reused in a pure GPUI
application. The global shortcut, project catalog, task surface, attention overview, and ordinary
panels are much easier than reproducing that editor's text input, selections, incremental Markdown
decorations, tables, caret geometry, IME behavior, accessibility, and save guarantees.

The recommendation is therefore:

> Build a parallel, bounded GPUI-native vertical slice with compiled-in widgets and declarative
> layout/keymap configuration. Keep the current Tauri app shipping until a parity gate is met. Do not
> design a public plugin SDK, load native dynamic libraries, fork Zed, or migrate canonical data in
> the first slice.

The **decision slice** should attack the rewrite risk first: one representative existing document on
one source-backed, rendered-and-editable surface; selection/undo; IME and VoiceOver; dirty/save refusal
and external-change behavior; plus one adjacent read-only Attention surface and summon/hide. It should
reuse current formats, assets, safety rules, and test corpora. Do not build Objectives writes, an Agent
Thread, general tabs/splits, or a durable project database until this slice passes and demonstrates a
material advantage over extending the current product.

## What the references establish

### Verified facts

- GPUI describes itself as a hybrid immediate/retained, GPU-accelerated Rust UI framework. A
  standalone app begins with `gpui_platform::application()`. Application state lives in `Entity<T>`;
  renderable entities implement `Render`; low-level `Element`s cover specialized rendering. It also
  provides an event-loop-integrated async executor and `#[gpui::test]` support. The project explicitly
  says it is pre-1.0 and frequently breaking ([GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md)).
- The current GPUI manifest declares version `0.2.2` and Apache-2.0. Its platform notes say macOS uses
  Metal, Linux/FreeBSD can use Wayland/X11, and Windows uses Win32/DirectWrite
  ([GPUI manifest](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/Cargo.toml)). This is a
  dated observation, not a compatibility promise for a future build.
- GPUI's documented keyboard model maps serializable application-defined actions through key
  contexts and key bindings. The same action can therefore be invoked by several chords without
  teaching product code about physical keys
  ([key-dispatch guide](https://docs.rs/crate/gpui/0.2.2/source/docs/key_dispatch.md)).
- Current `WindowOptions` includes normal, popup, and floating window kinds, initial display,
  visibility, focus, bounds, and titlebar choices. No system-wide shortcut registration contract was
  found in the public `App`/window documentation
  ([WindowOptions](https://docs.rs/gpui/0.2.2/gpui/struct.WindowOptions.html),
  [App](https://docs.rs/gpui/0.2.2/gpui/struct.App.html)). The second sentence is a documentation
  finding, not proof that a platform-specific implementation is impossible.
- The official `awesome-gpui` catalog currently contains agent workbenches, native editors, terminals,
  Markdown applications, launchers, file explorers, and panel-oriented tools. It also lists multiple
  component/layout libraries. This proves breadth of experiments, not that their APIs, licenses,
  quality, or GPUI revisions are mutually compatible
  ([awesome-gpui](https://github.com/zed-industries/awesome-gpui)).
- The third-party Apache-2.0 `gpui-component` project currently declares version `0.5.2` and advertises
  more than 60 controls, dock/tab/split layouts, virtualized lists/tables, Markdown rendering, and a
  code editor with LSP support. Its own workspace currently depends on GPUI from Zed's Git repository,
  and its examples include dock, editor, and Markdown surfaces
  ([README](https://github.com/longbridge/gpui-component#readme),
  [manifest](https://github.com/longbridge/gpui-component/blob/main/crates/ui/Cargo.toml)). These are
  upstream claims to validate in a spike, not performance guarantees inherited by ZD.
- bb is a programmable agent workspace with first-class desktop, web, CLI, and HTTP surfaces. Its
  central model is project -> thread -> environment/host; a SQLite-backed server and host daemons
  separate durable product state from process/workspace execution
  ([bb README](https://github.com/get-bb/bb#readme),
  [vision](https://github.com/get-bb/bb/blob/main/docs/VISION.md),
  [system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)). Its current app
  plugin contract includes navigation panels, persisted thread-panel tabs, file openers, actions, and
  thread attention data
  ([app contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts)).
- Cloudflare OS v2 describes private per-user "Gadgets," reusable "Blueprints," and Gatekeepers that
  mediate narrow resource capabilities, audit actions, and handle approvals. Gadget clients run in
  sandboxed iframes and are denied ambient external access; agents and Gadgets start with no resource
  capabilities. Its implementation is a Workers/workerd system, not a native-widget framework
  ([Cloudflare OS README](https://github.com/cloudflare/cloudflare-os#readme)).
- Current ZD is a TypeScript/DOM/CodeMirror product inside a thin Tauri/Rust authority layer. It has
  one active workspace, one miniapp, no project-session owner, no PTY, and no global summon behavior.
  The native file layer already implements scoped reads, ignored-aware enumeration, atomic writes,
  stamps, and URL validation
  ([current-architecture research](../../thinking-differently/research/zd-current-architecture.md)).
- Accepted suite and Markdown decisions currently choose Tauri plus a portable web frontend and one
  CodeMirror-backed rendered/editable document surface
  ([suite ADR 0001](../../../../adr/suite/0001-use-tauri-with-portable-web-frontend_H.md),
  [Markdown ADR 0002](../../../../adr/md/0002-use-one-always-editable-document-surface_H.md)). A native
  replacement would require superseding decisions after evidence, not silently ignoring them.

### Inferences

- GPUI is capable enough for the workbench shell. The existence of Zed and the smaller applications
  in `awesome-gpui` makes that a reasonable engineering inference; it does not prove that ZD's exact
  editor or quick-window interaction is inexpensive.
- Cloudflare OS's extensibility cannot be copied literally. A web Gadget can be isolated by a Worker,
  iframe, CSP, and message/RPC boundary. A Rust widget linked into the GPUI process has the user's full
  process authority. Loading arbitrary `.dylib` widgets would make "customizable" mean "trusted native
  code execution."
- bb's best transferable idea is not its distributed topology. It is its explicit project/thread
  model, append-only runtime events, attention state, equivalent human/agent commands, and host-owned
  extension slots. A single-user local v1 does not need bb's central server and daemon network.
- `gpui-component` is useful only behind a small ZD-owned seam. GPUI and the component library both
  move quickly; leaking their dock/editor serialization formats through ZD's stored state would turn
  every dependency upgrade into a data migration.
- The fastest honest route to "complete redesign" is source ownership: an agent or user edits the Rust
  workspace and produces a reviewed build. Runtime third-party UI extensibility should wait until two
  genuinely different external widgets reveal a narrow, capability-safe contract.

### Unknowns that require running code

- Whether `gpui` and `gpui-component` can be pinned to one compatible, buildable revision across the
  target macOS toolchain without importing unrelated Zed internals.
- Whether the component editor handles ZD's required Unicode, IME, selection, undo, large Markdown,
  accessibility, spellcheck, and caret geometry well enough to become a base rather than a demo.
- Whether GPUI's popup/floating windows can deliver the desired current-Space/full-screen quick-access
  behavior, or whether an AppKit adapter can safely control the underlying window.
- Whether the component Dock supports deterministic layout restore and missing-widget recovery. ZD
  should own its schema regardless.
- Actual cold start, warm summon, project switch, typing latency, frame time, idle memory, and GPU
  behavior on the target Mac.
- The maintenance cadence and compatibility policy of community widget/editor/terminal projects.
- What portion of ZD's current browser visual test suite can become native interaction tests versus
  differential/manual acceptance tests.

## Product contract

The native app is a local-first, single-user **project attention workbench**. It owns project identity,
workspace layout, ZD documents/objectives, and references to live agent work. Specialist runtimes own
provider authentication and process execution.

The post-gate native decision loop mirrors the shared Quick Attention slice:

1. A configurable system chord summons a warm window on the current display/Space.
2. `Command-1` through `Command-3` selects an explicitly pinned project without recreating its
   document session.
3. A read-only Attention surface shows what is working, waiting, failed, or ready for review.
4. The user resumes or opens the referenced document; Objective writes and Agent Thread input remain
   post-MVP additions.
5. The same global chord hides the workbench without closing buffers or runtimes.

macOS is the product target for this experiment. GPUI's other platforms should remain buildable where
cheap, but behavioral parity is not a first-slice condition.

### Two meanings of widget

To avoid an architecture made from a naming collision:

- A **control** is a button, text input, list, tab, menu, tooltip, scroll area, splitter, dialog, or
  similar UI building block. ZD may wrap selected `gpui-component` controls.
- A **workspace widget** is a persisted user-facing tool instance placed in a panel: Attention,
  Document, Objectives, or Agent Thread. Workspace widgets have stable identities, configuration,
  commands, and close/restore behavior.
- A **panel/region** is a host position containing one active widget. Later layout nodes may arrange
  regions in splits or tab groups; the panel is not itself a tab stack or plugin.
- A **mini-app** is a named domain workflow such as `md` or future `td`. It may choose a default
  composition, but it is not merely a saved layout. A named layout/profile remains ordinary data.

### Basic workspace widgets for a post-gate native candidate

This catalog begins only after Phase 0 proves Document fidelity, adjacent read-only Attention, and
summon/hide. It is not the decision slice.

| Widget | First-candidate behavior | Deliberate limit |
| --- | --- | --- |
| Attention | One row per project/thread with `working`, `waiting`, `failed`, `review`, or `quiet`; opens the referenced work | No analytics, workflow engine, or copied provider transcript |
| Document | Scoped file tree plus plain Markdown/text editing, dirty state, external-change detection, atomic save, and safe read-only rendered preview | It is a validation editor until the rendered-always-editable parity gate passes |
| Objectives | Parses the existing `todo.txt`/objective records, filters open/blocked/done, and opens source lines; mutations call one domain service | No replacement database and no redefinition of the repository workflow |
| Agent Thread | One deep adapter, typed event timeline, input, approval/question response, cancel/detach, and attention rollup | Not a terminal emulator and not a lowest-common-denominator multi-provider framework |

The project switcher, command palette, settings/keymap editor, layout controls, and shortcut reference
are shell surfaces rather than widgets. An "open terminal for project" command may launch an external
terminal in v1; an embedded terminal is a separate product decision.

### Customization ladder

The app should be honest about what is customizable at each level:

1. **Post-gate, after the design revision:** themes/tokens, key bindings, project slots, visibility,
   and compiled-in widget instances. General tabs/splits begin only after a second workflow proves
   them; they are not part of the native decision slice.
2. **Next:** installable configuration bundles containing layouts, themes, keymaps, commands that call
   already-authorized semantic operations, and widget presets. They contain data, not executable code.
3. **Explore later:** a WASM or out-of-process extension can register commands and a constrained,
   host-rendered view description. Each extension receives explicit project/file/network/process
   capabilities. Crashes and timeouts cannot take down the shell.
4. **Complete redesign:** fork/edit the Rust source and rebuild. This is the only credible unrestricted
   UI path until a safe extension renderer exists.

Do not expose Rust ABI plugins. Rust has no stable plugin ABI, GPUI is pre-1.0, and in-process native
code cannot provide Cloudflare-style least privilege.

## Design it twice

### Approach A — parallel native vertical slice, then compiled widgets (recommended)

Create a sibling GPUI binary and run the Phase 0 fidelity slice first. Only after that gate, build a
small ZD-owned project/session/layout model and the four built-in widgets. Use `gpui-component`
selectively for controls and as a candidate editor/dock implementation, but keep persisted state and
domain behavior independent of it. The current app remains the supported product until a measured
gate permits replacement.

**Advantages**

- Tests the actual Rust/GPUI thesis, including native latency and source-level customizability.
- Keeps early failure cheap and does not destabilize the existing editor.
- A static widget registry is simple, type-safe, and sufficient to learn the real boundaries.
- Preserves local files as canonical data while adding only session metadata.

**Costs and failure modes**

- The Markdown product must eventually be reimplemented.
- Parallel applications temporarily duplicate shell, packaging, design, and tests.
- GPUI/component churn is absorbed directly by ZD.
- Native UI iteration and visual regression tooling may be slower than the browser loop.

### Approach B — GPUI shell with the current editor embedded as a web surface

GPUI owns projects, panels, commands, agent attention, and native widgets while a WebKit/WebView child
keeps the current CodeMirror editor. State crosses a narrow document RPC boundary.

**Advantages**

- Retains the most valuable implemented surface and its browser tests.
- Allows native widgets and project state to be explored before editor parity.
- Could become a fallback if the native-editor spike fails but the workbench shell is compelling.

**Costs and failure modes**

- No supported GPUI webview embedding contract was found. Window parenting, clipping, GPU composition,
  focus, IME, shortcuts, drag/drop, accessibility, theming, scaling, and lifecycle become ZD's problem.
- Two rendering systems and an RPC seam can be more complex than the current Tauri app.
- A privileged webview must remain isolated from agent/process authority.
- It proves a hybrid architecture, not Thought 1's pure native UI.

### Approach C — reuse Zed internal crates or maintain a Zed fork

Use Zed's editor/workspace/terminal implementation to avoid rebuilding major systems, then add ZD
surfaces and quick-window behavior.

**Why it is not recommended:** GPUI is Apache-2.0, but most Zed product crates are GPL and are not a
stable embedding SDK. ZD would inherit upstream internals and merge pressure. The earlier Zed research
already concludes that "use GPUI" is a new implementation choice, whereas "fork Zed" is a different,
high-cost product and licensing decision
([Zed licensing](https://github.com/zed-industries/zed#licensing),
[Zed research](../../thinking-differently/research/zed.md)).

### Decision

Choose Approach A for an experiment. Keep Approach B as an explicit escape hatch, not a hidden first
step. Reject Approach C unless the desired product later becomes "a Zed distribution" and that fork,
license, and maintenance cost is accepted on purpose.

## Proposed architecture

Start as one binary with cohesive modules. Do not create a crate for every box. Extract `zd_core` or
`scoped_fs` only when the current Tauri app or a test harness becomes a real second consumer.

An initial repository shape can stay this small:

```text
packages/native/
  Cargo.toml
  src/main.rs                 application/window bootstrap
  src/app.rs                  root view and AppModel ownership
  src/commands.rs             stable ids, availability, dispatch, keymap loading
  src/project.rs              project catalog and retained sessions
  src/layout.rs               split/tab algebra, validation, restore
  src/store.rs                SQLite schema and migrations
  src/services/{files,objectives,agents}.rs
  src/platform/macos.rs       QuickAccessWindow only
  src/ui.rs                   selected gpui-component wrappers and theme
  src/widgets/{attention,document,objectives,agent}.rs
  tests/                      domain/integration fixtures; no standalone throwaway tests
```

Split a module when responsibility—not line count alone—makes the cut obvious. The previous native
prototype's 14,211-line `app.rs` is direct evidence against concentrating product, layout, input, and
platform behavior in one view.

```text
macOS global chord / ordinary app launch
                  |
         QuickAccessWindow adapter
                  |
         GPUI RootView + AppModel Entity
                  |
       semantic CommandDispatcher
          /          |          \
 ProjectCatalog  SessionStore   RuntimeRegistry
       |              |          |
 project roots   layout/widgets  agent adapters
       \______________|__________/
                      |
             WidgetHost entities
       /          /         /          \
 Attention   Document   Objectives   Agent Thread
       |          |         |          |
       +----- capability-scoped services --------+
              files | objectives | agents
```

The UI thread owns GPUI entities. Blocking filesystem/database/process work runs on background
executors. Results return as typed messages and update the owning entity through GPUI's context; there
is no general event bus. `cx.notify()` invalidates only the entity whose visible state changed.

### State ownership

| Owner | State | Persistence |
| --- | --- | --- |
| Filesystem/repository | Markdown, todo, objectives, agent instruction files | Existing files remain canonical |
| `AppModel` | project catalog, active project/profile references, command registry, device settings | Versioned local store |
| `ProjectSession` | layout, widget instances, active/focused widget, document restore hints | Versioned local store |
| Widget entity | live selection, scroll, draft input, transient errors | Memory; small allowlisted snapshots only |
| Agent adapter | provider process/session, provider events, credentials | Provider-owned; ZD stores typed handles and attention only |
| GPUI | view/entity/window/input/render lifecycle | Never treated as canonical product data |

Use SQLite for app/session metadata because transactions and schema migrations are useful, and bb
demonstrates the local model successfully. The initial schema needs only `schema_migrations`,
`projects(id, name, root_ref, shortcut_slot, last_opened_at)`, and
`sessions(project_id, payload_version, payload_json, updated_at)`. Store a layout and its widget specs
as one transactionally replaced session payload. Migrations must explicitly preserve unknown JSON
fields rather than getting that behavior accidentally from Serde. Use one versioned Profile file as
the canonical `BindingSetV1`/theme data for human editing; the command registry is its runtime
projection, and SQLite stores only the active profile reference. Do not move project content into
SQLite.

### Core model

The following is an interface sketch, not promised GPUI-compiling syntax; `AnyView` and context names
must be rechecked against the pinned GPUI revision.

```rust
struct AppModel {
    projects: ProjectCatalog,
    sessions: HashMap<ProjectId, ProjectSession>,
    active_project: ProjectId,
    commands: CommandRegistry,
    widgets: WidgetRegistry,
}

struct Project {
    id: ProjectId,                 // UUID, never derived only from a path
    name: String,
    root: ScopedRoot,
    shortcut_slot: Option<u8>,     // 1..=9, unique when present
}

struct ProjectSession {
    layout: LayoutNode,
    instances: HashMap<WidgetId, WidgetSpec>,
    active_widget: Option<WidgetId>,
    attention: ProjectAttention,
}

enum LayoutNode {
    Split { axis: Axis, ratio: f32, first: Box<Self>, second: Box<Self> },
    Tabs { widgets: Vec<WidgetId>, active: usize },
}

struct WidgetSpec {
    id: WidgetId,
    kind: WidgetKindId,            // e.g. "zd.document"
    config_version: u32,
    config: serde_json::Value,
}
```

Layout validation clamps ratios, rejects duplicate widget IDs, replaces missing widget kinds with a
recoverable placeholder, and always produces at least one usable tab stack. Loading corrupt state
falls back to a default layout while preserving the bad payload for diagnosis; it never produces a
blank window.

### Widget contract

For the first candidate, factories are registered by trusted Rust code at startup. A factory returns
a type-erased GPUI view hosted by a ZD-owned `WidgetHost`. The host—not the widget—owns tab chrome,
close/restore, crash/error fallback, and layout persistence.

```rust
trait WidgetFactory: 'static {
    fn descriptor(&self) -> WidgetDescriptor;
    fn create(
        &self,
        spec: &WidgetSpec,
        services: WidgetServices,
        window: &mut Window,
        cx: &mut App,
    ) -> Result<AnyView>;
}

struct WidgetDescriptor {
    kind: WidgetKindId,
    title: &'static str,
    singleton: bool,
    config_version: u32,
    commands: &'static [CommandId],
}
```

`WidgetServices` is a bundle of narrow handles such as `ProjectFiles`, `ObjectiveService`,
`AgentRuntime`, and `CommandDispatcher`, created for one project. It is not a reference to a global
service locator and never contains `run_shell(String)`. A widget requests structured operations; the
service validates project scope, argv, and permissions.

Do not generalize snapshot state yet. Each built-in widget can define a small versioned restore value.
If a widget cannot restore, recreating it from `WidgetSpec` is valid. Durable drafts need an explicit
product decision, not accidental serialization of an entity graph.

### Agent/thread model borrowed from bb, reduced for local ZD

One project owns zero or more `ThreadRef`s. A thread belongs to one provider adapter and one explicit
working directory. Its timeline is append-only while live, but ZD only persists the provider handle,
last seen event, and rolled-up attention by default.

```rust
trait AgentAdapter {
    fn start(&self, request: StartThread) -> BoxFuture<'_, Result<ThreadHandle>>;
    fn attach(&self, handle: ThreadHandle) -> BoxFuture<'_, Result<AgentEventStream>>;
    fn send(&self, handle: ThreadHandle, input: UserInput) -> BoxFuture<'_, Result<()>>;
    fn respond(
        &self,
        handle: ThreadHandle,
        response: InteractionResponse,
    ) -> BoxFuture<'_, Result<()>>;
    fn cancel(&self, handle: ThreadHandle) -> BoxFuture<'_, Result<()>>;
}

enum AgentEvent {
    StateChanged(ThreadState),
    MessageDelta { role: Role, text: String },
    ApprovalRequested(Approval),
    QuestionAsked(Question),
    ToolActivity(ToolSummary),
    Failed(DisplayError),
}
```

Provider-specific events remain available as bounded opaque metadata; the shared interface should not
erase useful capabilities. The first adapter must be chosen and implemented deeply. A fake adapter is
used for deterministic tests, not presented as provider support.

### Commands and hotkeys

Product behavior is addressed by stable semantic IDs such as `project.activate.1`,
`layout.split.right`, `widget.open.objectives`, and `agent.send`. Default and user keymaps resolve to
these commands. GPUI actions are the input adapter, not the persisted identity: changing a Rust module
name must not invalidate a user's keymap.

The UI is only one command caller. Keeping validation and effects behind `CommandDispatcher` leaves a
clean seam for a later local CLI or authenticated agent-control API to invoke the same operations, as
bb's first-class surfaces do. Do not build an HTTP server or remote protocol merely to prove that seam.

- Register one serializable GPUI action such as `InvokeCommand { id }` and bind it in key contexts, or
  generate equivalent built-in actions while retaining the stable `CommandId` mapping.
- First choose context precedence: `modal > focused widget > panel > workspace > app`. A text input
  consumes text; shell chords must not leak into it unless explicitly marked global within the app.
  Within the winning context apply source precedence: explicit user, workspace, core default, then
  extension default.
- Validate duplicate chords at load. A lower source becomes a visible shadowed binding. Equal source
  precedence with overlapping conditions remains unresolved and neither dispatches until the user
  chooses. Show both sources and contexts. An invalid keymap falls back per binding rather than
  disabling every shortcut.
- `Command-1..9` activates pinned projects only while ZD is focused. Slots are explicit persisted
  properties, so recent-project ordering cannot silently change a muscle-memory binding.
- The system-wide summon chord is a separate native facility. It is configurable, collision-aware,
  and should not ship as immutable `Command-T`. GPUI in-app bindings cannot receive keys while another
  app is active.

`QuickAccessWindow` should expose only `register`, `unregister`, `show_on_active_display`, `hide`, and
`is_visible`. The macOS implementation may use GPUI window operations plus a small AppKit bridge. No
general native-window escape hatch reaches widgets.

### Panels and layout customization

Persist ZD's `LayoutNode`, then render it with the pinned component Dock or small native split/tab
views. Never serialize the component library's internal types.

The first layout operations are intentionally few: split focused panel horizontally/vertically, move
a tab, close a tab, resize a split, toggle a named sidebar, save/reset layout. Drag-and-drop is optional
until command-driven operations and restore are correct. Undo applies to the current layout-edit
session only; content undo remains widget-owned.

A named layout preset contains only layout nodes and widget specs. Import validates every widget kind,
config version, ID, ratio, and size before replacing the live layout. The previous layout remains
available for one-click rollback.

## Migration and implementation sequence

### Phase 0 — bounded feasibility spikes

Run these on a throwaway native package, with exact dependency revisions in `Cargo.lock`:

1. **GPUI/component compatibility (1 day):** build a window with theme, text input, virtualized list,
   tabs, split resize, focus traversal, actions, and `#[gpui::test]`. Record every Zed-internal import.
2. **Document fidelity (3 days):** load one representative existing Markdown fixture on one
   source-backed, rendered-and-editable surface; edit ASCII, emoji, CJK, combining marks, RTL, and IME
   text; preserve source positions across styled runs; undo/redo; select; exercise dirty/save refusal,
   external change, safe links/content, and VoiceOver. Mount one adjacent read-only Attention surface
   and compare behavior with current `zd md` rather than a toy string or source-plus-preview.
3. **Fixed-region durability (1 day):** switch the one support region among hidden, Files, and
   Attention; change side/size; restart 100 times; migrate one older schema; remove one registered
   widget kind; and corrupt the payload. A split/tab component may be exercised with disposable state
   in the compatibility spike, but no general layout graph becomes durable before the fidelity gate.
4. **Quick window (2 days):** register a configurable global chord and perform 100 warm toggles across
   two displays, Spaces, a full-screen app, Stage Manager, sleep/wake, and shortcut conflicts.
5. **Async stream (1 day):** feed a fake agent at burst rates, cancel/reattach, hide/show the window,
   and prove bounded buffering plus responsive typing.

**Hard gate:** do not begin Phase 1 until the document fidelity slice preserves the tested
single-source editing/save invariants, has a credible IME/accessibility path, and produces a material
product or operational benefit. Stop the direction early if it cannot, GPUI needs a maintained Zed
fork, the component stack cannot be pinned coherently, or the AppKit/GPUI window boundary is not safely
reachable. A failed spike is a result, not a reason to widen the prototype.

### Phase 1 — shell and retained projects

- Add a sibling native binary/package with a distinct bundle ID and data directory.
- Implement in-memory `AppModel`, three pinned projects, command palette, keyboard contexts, default
  layout, error boundary/placeholder, and ordinary window lifecycle.
- Add a versioned SQLite project/session store only after switching works without losing in-memory
  state.
- Port scoped-file semantics and their tests into the native package. Extract a shared Rust crate only
  when both desktop implementations actually consume it.

### Phase 2 — the four built-in widgets

- Attention first, driven by fixture data and then the real first agent adapter.
- Objectives read-only first; add writes only through a Rust domain implementation validated against
  the existing task-format and archive tests.
- Document with safe source editing, external-change detection, and atomic saves. Add safe preview as
  a separate presentation until one-surface editing is proved.
- Agent Thread last, using structured events and explicit project cwd/permissions.

### Phase 3 — customization that is data

- User keymap, theme tokens, widget configs, project slots, named layouts, split/tab manipulation, and
  import/export with validation/rollback.
- A small control gallery and widget harness become permanent development tools.
- Do not add a marketplace, plugin ABI, scripting language, or generated UI protocol.

### Phase 4 — parity and architecture gate

Use the existing app as the oracle. A native candidate cannot replace it until it preserves at least:

- one always-editable rendered Markdown surface, or a deliberately accepted superseding product
  decision;
- dirty-buffer, close-confirmation, external-change, atomic-save, scoped-file, and unsafe-Markdown
  guarantees;
- the representative typography/caret/table/list/focus behaviors encoded by current fixtures/tests;
- launch/open-file CLI behavior and recoverable failure states;
- acceptable VoiceOver, keyboard-layout, IME, and spellcheck behavior.

If the gate passes, write superseding ADRs and migrate the executable gradually. If it fails but the
native workbench is valuable, evaluate Approach B or keep it as a companion. Do not strand two partial
primary apps.

### Reuse versus rewrite ledger

| Existing asset | Native treatment |
| --- | --- |
| `packages/tauri/src/fs.rs` scope, ignore, atomic-write, stamp, URL rules | Reuse/port Rust algorithms and tests; later extract at a proven shared seam |
| `Platform` capability boundary | Preserve the design rule; replace Tauri IPC with narrow Rust service handles |
| Suite command registry and mini-app/suite-surface ownership rules | Preserve current semantics and stable command IDs; derive workspace-widget ownership in the proposed host |
| Fonts, icons, color/type/spacing tokens | Reuse assets and translate reviewed tokens into one native theme module |
| Markdown/editor TypeScript, DOM, CSS, CodeMirror extensions | Rewrite; use behavior and fixture corpus as acceptance oracle |
| Review ledger in browser `localStorage` | Add an explicit export from the old app if migration is needed; never scrape WebKit storage |
| Objective/todo text formats and session-loop rules | Keep files canonical; port domain parsing with differential tests |
| Playwright/browser tests | Retain for old app and product oracle; rewrite critical flows as GPUI/native integration tests |
| Tauri packaging/window code | Keep for the shipping app; do not force it into GPUI |

## Verification strategy

Favor tests at stable cut points over snapshots of every view.

- **Pure domain tests:** project slots, layout validation/normalization, schema migrations, missing
  widget fallback, keymap conflict resolution, attention precedence, objective parsing, and command
  availability. Add property tests for arbitrary layout edit sequences and serialize/restore.
- **Filesystem integration:** real temporary directories for canonicalization, symlink escape, ignore
  rules, Unicode paths, external modifications, atomic replacement, permissions, and full-disk/write
  failures where the platform permits simulation.
- **GPUI integration:** `#[gpui::test]` for action dispatch, focus contexts, project switching, panel
  lifecycle, widget creation/close/restore, async completion, and failure placeholders. Mock only
  files, database, OS hotkey, and agent processes at their boundaries.
- **Differential editor corpus:** drive the same Markdown fixture documents and edit sequences through
  current CodeMirror and the native candidate. Compare saved bytes, selection/undo invariants, safe
  link/image policy, and reviewed screenshots. Pixel equality across renderers is not the goal.
- **Agent contract:** deterministic recorded/fake streams covering deltas, bursts, approval, question,
  failure, cancellation, reconnect, duplicate events, and out-of-order provider messages.
- **Native/manual matrix:** VoiceOver, IME, keyboard layouts, multi-display/Spaces/full-screen/Stage
  Manager, open-file events, crash recovery, app updates, signing, and notarization.
- **Upgrade test:** a CI job builds the exact pinned GPUI/component revisions. Dependency upgrades are
  explicit branches that run layout migration, screenshots, editor corpus, and native smoke tests.

Initial performance budgets, to validate and revise with profiles on the target Mac:

- warm summon to focused/key-ready: p95 <= 100 ms;
- retained project switch to interactive: p95 <= 100 ms without synchronous disk scanning;
- ordinary command to next paint: p95 <= 50 ms;
- typing must not miss a 60 Hz frame in a representative 1 MiB Markdown file during an agent stream;
- agent UI buffers are bounded by count/bytes and batch visible updates at frame cadence;
- idle memory and cold-start budgets are recorded in Phase 0 before a ship target is chosen.

These are experiment thresholds, not claims GPUI already satisfies. Profile before optimizing.

## Security and reliability constraints

- Project roots are explicit capabilities. Canonicalize every file operation, reject symlink escape,
  and never give a widget ambient filesystem access merely because it is built in.
- Markdown remains hostile input: no raw HTML execution, unsafe URL schemes, or automatic remote
  images. A native renderer does not remove content attacks or parser bugs.
- Agent adapters launch structured executable + argv + cwd requests, never interpolated shell
  strings. Show provider, cwd, capability/approval mode, and network implications before launch.
- Provider credentials and full transcripts remain provider-owned by default. Logs redact document
  bodies, prompts, environment variables, tokens, and terminal/process output.
- In-process Rust widgets are fully trusted. Do not market them as sandboxed. Future executable
  extensions must be WASM/out-of-process, default-deny, resource-limited, auditable, and revocable.
- Capabilities should be semantic (`read_project_file`, `propose_objective_change`, `send_agent_input`),
  not broad (`filesystem`, `shell`). Cloudflare's Gatekeeper model is inspiration for this boundary,
  not code that GPUI supplies.
- Pin GPUI, `gpui-component`, parsers, database, and platform crates. Review licenses and advisories on
  every deliberate upgrade. A lockfile alone is not a supply-chain policy.
- Writes are transactional/atomic; layout/settings saves use temp + fsync/rename or SQLite
  transactions. Corrupt metadata never blocks access to repository files.
- Background streams have cancellation, bounded queues, sequence/deduplication rules, and cleanup on
  project close/app quit. Hiding the window is not closing a session.

## Main performance and maintenance risks

| Risk | Response |
| --- | --- |
| GPUI pre-1.0/API churn | Pin exact versions/revisions; isolate framework glue; upgrade intentionally |
| `gpui-component` couples to matching GPUI revisions | One `ui` module owns wrappers; ZD owns persisted schemas; keep a remove/replace spike |
| Native editor becomes another 14,000-line prototype | Split by buffer/input/render/Markdown/save responsibilities; 500-line cohesion checks; parity gates |
| Too many entities notify too broadly | Clear state ownership; direct subscriptions; measure invalidations/frame time |
| Large files or event streams block UI | Background parse/I/O, virtualization, batching, bounded channels, cancellation |
| Layout customization creates invalid graphs | Small split/tab algebra, normalization, migrations, placeholder fallback, rollback |
| macOS quick-window fork diverges from GPUI | Tiny platform adapter and upstreamable changes; no window calls in widgets |
| Source-level customization creates unsafe builds | Explicit review/build/sign flow; reproducible dependency lock; never self-install silently |

## Explicit non-goals for the first candidate

- A public or binary-compatible plugin SDK.
- Loading arbitrary Rust libraries, scripts, or agent-generated binaries at runtime.
- A plugin marketplace, auto-install, or unattended self-modification.
- A general terminal emulator, browser, IDE/LSP platform, debugger, Git host, or cloud service.
- bb-compatible servers/daemons, remote machines, multi-user collaboration, or mobile access.
- Cloudflare Workers/workerd, Gadget iframe execution, Gatekeeper simulation, or deferred side-effect
  commits.
- Full cross-platform quick-window parity.
- Reusing Zed's GPL product crates or maintaining a Zed fork.
- Moving Markdown/objective/project files into the app database.
- Claiming current `zd md` parity from a source editor plus preview.
- A universal layout graph, generic event bus, service locator, or one interface that flattens every
  agent provider.

## Go/no-go gates

Continue from spikes to a candidate only if all are true:

1. The pinned GPUI/component stack builds without a Zed fork or broad internal-crate imports.
2. Text input, focus, IME, accessibility, save, and large-document tests have credible paths.
3. The native quick-window spike works on the user's actual Mac test matrix.
4. Layout restore is deterministic and recovers from corrupt/missing widget data.
5. Streaming agent work cannot stall input or grow memory without bound.
6. The vertical slice feels materially faster or more adaptable than extending current Tauri ZD.

Replace the current application only after the Phase 4 parity gate, superseding ADRs, an export/import
story for non-file state, signed packaging, and a manual rollback release. If the native editor is the
only failed gate, compare the hybrid escape hatch against simply keeping the current Tauri frontend;
do not let a prior rewrite investment decide the answer.

## Primary sources

- [GPUI README](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/README.md)
- [GPUI Cargo manifest](https://github.com/zed-industries/zed/blob/fdf5de99c6456d695ac5e0c255915f4fa611fd75/crates/gpui/Cargo.toml)
- [GPUI key-dispatch guide](https://docs.rs/crate/gpui/0.2.2/source/docs/key_dispatch.md)
- [GPUI `WindowOptions`](https://docs.rs/gpui/0.2.2/gpui/struct.WindowOptions.html)
- [GPUI test macro](https://docs.rs/gpui/0.2.2/gpui/attr.test.html)
- [awesome-gpui catalog](https://github.com/zed-industries/awesome-gpui)
- [gpui-component](https://github.com/longbridge/gpui-component)
- [bb repository](https://github.com/get-bb/bb)
- [bb vision](https://github.com/get-bb/bb/blob/main/docs/VISION.md)
- [bb system overview](https://github.com/get-bb/bb/blob/main/docs/system-overview.md)
- [bb app plugin contract](https://github.com/get-bb/bb/blob/main/packages/plugin-sdk/src/app-contract.ts)
- [Cloudflare OS repository and README](https://github.com/cloudflare/cloudflare-os)
