# Product shape and delivery plan for a self-customizable ZD

Research snapshot: 2026-08-12

Status: product hypothesis and validation plan, not an accepted product or architecture decision

This report turns the direction in [`thoughts.md`](../thoughts.md) into observable product behavior.
It deliberately does not select GPUI, WebGPU, Wasm, celld, Tauri, or another implementation stack.
The two technical directions should be judged by whether they can deliver this contract without
discarding the parts of ZD that already work.

## Recommendation

Build a **globally summonable, retained project-attention layer that opens into the existing calm ZD
surface**. Ship an opinionated default before building a general workbench:

1. Keep `zd md` as the first and primary mini-app.
2. Add stable, retained project contexts and a configurable system-wide summon/hide chord.
3. Make project switching and an Attention surface available everywhere through semantic commands.
4. Prove only one new workspace-widget model at first: read-only Attention beside the existing
   Document and Files surfaces. Keep the layout fixed to one primary region plus one optional support
   region.
5. Persist only project slots, the active project, support-region choice/size/side, and the first
   user binding after an owner-approved design revision. Do not begin with a universal layout graph
   or executable plugin SDK.
6. Add Objectives and an actionable Agent Thread only after the summon-switch-inspect-hide loop
   measurably beats the user's present workflow.

This is smaller than the four-widget programmable workbench described in the native direction. It
tests the product claim before making customization infrastructure the product.

## Evidence and constraints

### What the inspiration actually asks for

The earlier [`thinking-differently/thoughts.txt`](../../thinking-differently/thoughts.txt) describes a
specific repeated job: summon the development context over any current Mac app, switch among a few
projects with muscle memory, inspect or steer agent work, and disappear back to the prior app. The
newer [`thoughts.md`](../thoughts.md) adds a long-term requirement: ZD should start opinionated but let
people add mini-apps, widgets, panels, and hotkeys until the interface can become recognizably their
own.

The useful product ideas from the named projects are composition, durable project/thread identity,
substantial plugin-owned product areas, capability-bound gadgets, and one command language. They do
not establish that GPU rendering, Wasm, or a local/cloud service makes this user loop better. The
current fact sheet records those corrections in [`source-projects.md`](source-projects.md). The
detailed runtime contribution model and threat boundaries live in
[`extensibility-model.md`](extensibility-model.md) and
[`security-and-trust.md`](security-and-trust.md); this report specifies the user-facing reason and
order for adopting any part of them.

### What ZD already has and must not casually lose

The current application already proves several hard product decisions:

- one rendered, always-editable Markdown source with one caret, selection, undo history, and dirty
  truth ([md ADR 0002](../../../../adr/md/0002-use-one-always-editable-document-surface_H.md));
- atomic, confirmed saves and refusal to report failed writes as clean
  ([md ADR 0003](../../../../adr/md/0003-confirm-writes-before-marking-a-document-clean_H.md));
- scoped local file authority and untrusted Markdown that cannot silently fetch or execute
  ([suite ADR 0003](../../../../adr/suite/0003-scope-file-access-to-launch-workspace_H.md),
  [md ADR 0004](../../../../adr/md/0004-treat-rendered-markdown-as-untrusted_H.md));
- a suite-owned command registry that is both the dispatch source and the shortcut reference
  ([suite ADR 0004](../../../../adr/suite/0004-dispatch-application-commands-from-suite-registry_H.md));
- a quiet, typography-led, local-first default whose primary measure is sustained comprehension of
  long agent documents ([VISION.md](../../../../VISION.md), [`DESIGN.md`](../../../../DESIGN.md)); and
- a static mini-app seam that makes a compiled-in second mini-app cheap without pretending to be a
  runtime plugin system ([mini-app rules at this research snapshot](https://github.com/iammrduncan/zd/blob/889acc9445170594ca6ae38baa5033d5cd518528/packages/app/src/miniapps/README.md)).

The present gaps are equally concrete: there is one active root, one mounted document, one registered
mini-app, hard-coded in-window chords, no stable project identity, no retained project collection, no
general layout model, no live agent adapter, and no system-wide shortcut. Several canonical surfaces,
including working Home actions, Settings, and Command List, are specified but are not current product
capabilities. The implementation audit is in [`current-zd-fit.md`](current-zd-fit.md).

### Product-contract conflict that must be resolved openly

The binding design system says that ZD is “never a dashboard, IDE, productivity cockpit, or collection
of panels,” permits at most one primary surface and one quiet navigation surface, and prohibits
persistent tabs and control strips. Its current closed Settings inventory also explicitly excludes a
keybinding editor. The new idea asks for widgets, panels, and hotkeys that may eventually redesign the
UI.

The provisional resolution in this report is:

- preserve the current restraint as the shipped default and as the reset target;
- use one primary region plus one optional support region in the first slice;
- reveal layout editing only through an explicit Customize Workspace command later; and
- require a deliberate design-contract revision before shipping user keymap editing, arbitrary
  persistent splits/tabs, or a multi-panel default.

Calling a new panel system “just implementation” would silently supersede accepted product behavior.
The revision is a precondition to the first binding override in Stage 3. It must also decide whether
`DESIGN.md` governs only the shipped/reset profile or every contributed surface; the latter is
incompatible with the Level 5 redesign promise below.

## Product thesis

ZD is the calm, local-first place where a person **resumes, understands, and steers active project
work**. It owns the durable context that remains useful when the editor, terminal, browser, or agent
harness changes. Specialist tools may continue to own code intelligence, terminal emulation, browser
identity, provider credentials, and inference history.

The core loop is:

> summon -> orient -> switch if needed -> inspect or act -> hide

The product earns expansion only if that loop is faster and calmer than finding the right app,
window, project, document, and agent session manually.

## Target users and jobs

### Primary user

A solo, keyboard-oriented developer on macOS who works across roughly two to nine local repositories,
uses one or more coding-agent harnesses, and routinely reads long generated Markdown. The current
repository owner is the first design partner, not proof of a general market.

Primary jobs:

1. **Resume:** bring the current project's exact reading/editing context above whatever app is visible.
2. **Orient:** identify within seconds which project or agent is working, waiting, failed, ready for
   review, or quiet.
3. **Switch:** move to a pinned project without reconstructing its document, reading position, dirty
   buffer, or associated live-work references.
4. **Understand:** read and edit plans, research, reviews, objectives, and other agent-produced text in
   the existing ZD experience.
5. **Steer:** answer a structured question or approval, send input, interrupt, or open the owning
   specialist tool without scraping terminal output.
6. **Remember:** retain project identity, open ZD resources, attention references, and personal
   commands across restarts.
7. **Personalize:** gradually change shortcuts and composition without first designing a workspace or
   trusting arbitrary code.

### Secondary users

- researchers, technical writers, and reviewers whose main material is generated Markdown but who do
  not need agent control;
- developers on Windows who want retained projects and the ZD document experience even if the first
  macOS overlay behavior is unavailable; and
- advanced users who eventually want to package a repeatable project layout or a constrained custom
  tool.

### Not an initial target

Teams seeking real-time collaboration, non-technical consumers, mobile-only users, people seeking a
full IDE replacement, and organizations requiring a hosted multi-tenant agent platform are outside the
initial validation cohort.

## Product vocabulary and ownership

These terms must stay distinct so “customizable” does not become a bag of shared mutable UI.

| Term | Product meaning | Owns | Does not own |
| --- | --- | --- | --- |
| Project | Stable ZD identity associated with one explicitly granted workspace | Name, pinned slot, last ZD context, references to specialist sessions | Raw filesystem authority merely because it stores a path |
| Project context | The restorable ZD state for one project | Active mini-app/resource, selection/viewport references, support surface, attention summary | Provider databases, PTY streams, browser cookies |
| Mini-app | A named, purpose-specific primary ZD experience such as `md` or future `td` | Primary workflow and domain behavior | Window, global settings, command dispatch, permissions |
| Workspace widget | One bounded tool instance placed by the suite, such as Document, Files, Attention, Objectives, or Agent Thread | Small validated configuration and ephemeral view state | Layout, raw host APIs, another widget's state |
| Panel/region | A place that hosts one widget at a time; later it may split or stack | Placement, size, active widget reference | Document bytes or provider state |
| Suite surface | A cross-mini-app transient or held surface, such as Command List, Attention, Settings, or Shortcut Reference | Cross-context presentation and routing | Domain data it merely displays |
| Command | A stable semantic action such as `project.activate.1` or `attention.open` | Identity, availability, dispatch, binding metadata | Private keyboard listener inside a widget |
| Profile | Exportable, versioned customization data | Layout templates/presets, widget configs, theme/keymap choices, and unresolved symbolic project roles | Device project slots/IDs/paths, workspace grants, documents, credentials, transcripts, executable payloads |

For the first slice, Attention should be a suite surface backed by one bundled widget model rather than
a new mini-app. It answers “what needs me across projects?” and must remain available above `md` and
future `td`. A terminal remains a suite facility or external target, consistent with the existing
mini-app rules; it is not a mini-app merely because it can occupy space.

## Opinionated default experience

### First run

1. ZD opens the future `zd md` Home surface; today, launching without a path shows a “No document
   open” state. There is no blank canvas, account requirement, marketplace, layout wizard, or
   telemetry prompt masquerading as onboarding.
2. The user opens a folder or file. That explicit grant creates a stable Project record; the first
   three projects may be pinned to slots 1–3 as the user opens or pins them.
3. The Document is the primary surface. The existing Files support region is available on the chosen
   side. No Attention dashboard replaces the document at rest.
4. ZD explains the configurable global summon chord, `Command-1…9` project slots, Command List, and
   Shortcut Reference in one dismissible text sheet. Every command is immediately executable or
   labelled unavailable.
5. The app works without a network connection. Connecting an agent provider is a separate, explicit
   action after the local loop works.

### Daily use

1. The system-wide chord shows the already-warm ZD context on the active display/Space and focuses the
   last meaningful ZD target.
2. `Command-1…9`, while ZD is active, selects an explicitly pinned project slot. Recent-project order
   never changes these bindings silently.
3. `attention.open` shows a quiet, keyboard-navigable cross-project plane. It lists only actionable or
   recent items, with `working`, `waiting`, `failed`, `review`, or `quiet` expressed in words and a
   colour-independent cue.
4. Enter opens the referenced ZD document/objective/thread. An item owned by an external specialist
   offers an explicit Open in owning tool action.
5. The same system-wide chord hides ZD without closing buffers or sessions and returns the person to
   the prior app naturally.

The default summon behavior is **resume the last ZD state**, not always open Attention. That preserves
the “state beneath remains unchanged” character of the current product. Whether an optional
“summon into Attention” preference is useful is a Stage 0 test question.

## Representative bundled workflows

The catalog below is a product target, not an instruction to build all entries in one release.

| Surface | Representative user workflow | First honest boundary |
| --- | --- | --- |
| Document widget / `zd md` | Open a generated plan, read with focus, edit in place, add review feedback, save, and resume at the same position | Retain the current one-source editor, dirty truth, external-change refusal, and scoped writes |
| Files support widget | Move among granted workspace files without leaving the active project | One scoped workspace; no arbitrary filesystem browser |
| Attention suite surface | Scan all pinned projects, select “agent waiting for approval,” and open its owner | Read-only rollup first; no copied full transcripts and no guessed state from terminal pixels |
| Objectives widget / future `zd td` | Filter open or blocked work, open the source record, and perform one validated status change | Existing repository files remain canonical; no replacement task database in the first version |
| Agent Thread widget | Read a typed event timeline, answer one question or approval, send input, interrupt, and detach | One deep adapter first; provider owns credentials and full history |
| External terminal command | Open or focus the terminal target associated with the active project, then return to ZD | Semantic launch/focus action; no new terminal emulator in the initial product |
| Project preview, later | Open one explicitly trusted local preview and hand off general browsing to the system browser | Separate unprivileged context; no general browser profile |

### Mini-app workflows

- **`zd md`:** document-first. Document is primary; Files is the default support widget; Attention and
  commands are transient. This remains the first-run and reset experience.
- **Future `zd td`:** objective-first. Objectives is primary; a referenced Document may occupy the
  support region. It reuses suite projects, commands, appearance, and Attention rather than cloning
  them.
- **Named workspace presets, later:** “Review” or “Steer” may select a mini-app plus a saved
  composition. A preset is data, not automatically a new runtime type or CLI noun.

### Panel workflows

The first panel model should be deliberately shallow:

- one primary region and one optional support region;
- show/hide the support region, choose its side, resize it, and select Files or Attention;
- persist those choices per profile or project, with Reset to ZD Default always available; and
- keep switching command-driven so a persistent tab strip is not required.

Only after a second real workflow needs simultaneous tools should ZD test split, move, tab, and saved
layout operations. A panel is successful when it hides composition complexity from widgets and can
restore missing or incompatible widgets safely; the number of visible rectangles is not a success
metric.

### Hotkey workflows

| Command | Default behavior | Customization and conflict rule |
| --- | --- | --- |
| System `zd.toggle` | Show/hide the warm app from another application | Configurable; registration failure is explicit; do not reserve `Command-T` as an immutable default |
| `project.activate.1…9` | Select the project explicitly pinned to that slot while ZD is active | Empty slots are honest no-ops; recency never reorders muscle memory |
| `attention.open` | Show the cross-project Attention plane | Available from every mini-app; one semantic ID regardless of presentation |
| `command-list.open` | Discover and run all available commands | The command list renders the same registry that dispatches |
| `shortcut-reference.hold` | Show current bindings while held | Includes overridden, shadowed, and unavailable commands honestly |
| `document.save` | Save through the active document owner | Never dispatches to an inactive or unknown document |
| `terminal.open-for-project` | Open/focus the configured external target | Unavailable until the user explicitly configures a target |

After the design revision permits user bindings, first choose the most-specific matching context:
modal/transient, focused widget (including the editor), region, workspace, then application. Within
that context apply source precedence: explicit user, workspace, core default, then extension default.
A lower source becomes visibly shadowed. Equal source precedence with overlapping conditions disables
both until the user explicitly resolves it. Invalid custom entries fall back per binding; one mistake
must not disable the whole keymap. Widgets never install private application-level key listeners.

## What “complete customization over time” must mean

“Complete” cannot honestly mean that downloaded code receives unrestricted file, process, network,
window, and credential authority. It should mean that the **visible working composition and command
language can become entirely personal while the safety shell remains invariant**.

Observable product milestones are:

| Level | User can observe | Deliberate boundary |
| --- | --- | --- |
| 0. Opinionated | Open ZD and work immediately with the shipped layout, commands, theme, and bundled tools | No setup and no customization vocabulary required |
| 1. Personal | Pin projects, rebind commands, choose support side/size/visibility, tune appearance, and reset any choice | Data only; no executable extension |
| 2. Composed | Create/remove widget instances, split/move regions, save a named preset, preview it, export/import it, and roll back | Bundled widget kinds and validated configuration only |
| 3. Packaged | Install a signed/inspectable configuration bundle containing themes, keymaps, presets, and semantic commands | It may call only already-authorized product actions |
| 4. Extended | Install a separately versioned widget/mini-app that declares capabilities, survives restart/update, can be disabled, and fails behind a placeholder | Constrained execution; no ambient host authority or unstable in-process ABI promise |
| 5. Redesigned | Replace every ordinary workspace region and visible bundled widget with chosen alternatives so the result need not resemble the default | Permission, recovery, update, accessibility, and unsaved-work surfaces remain suite-owned |

The end-state test is not “there is a plugin API.” It is that a user can build and share a profile
whose normal workspace has different tools, placement, commands, and visual tokens; inspect exactly
what it requests; update ZD without losing it; disable one broken component; and return to the shipped
default without touching project files.

Unrestricted source modification and rebuilding may always offer a sixth level. That is a fork, not a
safe runtime customization promise.

### Invariants customization cannot replace

- explicit file, process, network, microphone, camera, and external-application grants;
- truthful dirty/save/conflict/close behavior;
- recovery from corrupt, missing, crashing, or newer customization state;
- command dispatch and binding-conflict disclosure;
- accessibility focus, naming, and emergency keyboard recovery;
- unshadowable safe-mode, permission, update-recovery, and reset commands;
- update/migration and profile export/reset surfaces; and
- the distinction between local and cloud workspaces.

## Progressive disclosure

The product should reveal power in this order:

1. **Work:** the user sees Document and optional Files, not a configuration canvas.
2. **Discover:** Command List and Shortcut Reference expose available actions without persistent
   chrome.
3. **Adjust:** Settings exposes the small shipped preference set and key binding for the command the
   user is changing.
4. **Compose:** Customize Workspace freezes content mutations, previews region operations, and offers
   Save, Undo, Cancel, and Reset to ZD Default. Exiting returns to ordinary content-first use.
5. **Extend:** an Extensions/Profiles inspector appears only after the user invokes installation or
   management. It shows origin, version, requested capabilities, compatibility, storage, and Disable.
6. **Diagnose:** safe mode starts with third-party components disabled and offers a readable recovery
   report. It is never part of the daily UI.

No “advanced” drawer should exist merely to hold speculative options. A setting appears only after a
working feature and an observed need for a choice.

## Compatibility, accessibility, offline, and privacy expectations

### Compatibility

- macOS is the first quick-access target. The manual 100-toggle matrix must cover multiple displays,
  Spaces, native full-screen apps, Stage Manager, sleep/wake, display removal, and chord conflicts.
- Windows remains a supported ordinary-window product. Retained projects, in-app commands, profiles,
  documents, and offline behavior must work there; platform-global overlay parity is a separate gate,
  not a reason to weaken macOS validation.
- Linux remains best-effort until the existing product commitment changes.
- Markdown and objective files remain ordinary files. A profile uses an explicit schema version and
  portable command/widget IDs rather than renderer, DOM, or native view objects.
- Unknown newer profile records and missing widget kinds open in a safe placeholder while preserving
  the unread data for a newer build. They never block access to project files.
- Each installable component declares product API range, state-schema version, platform support, and
  required capabilities. Compatibility is checked before activation, not inferred from install
  success.

### Accessibility

- Fresh install, onboarding, project creation, summon, switching, Attention, editing, saving,
  customization, reset, and recovery are fully keyboard operable.
- Focus order and restoration are deterministic across show/hide, project switch, region change, and
  widget failure. No command strands focus in an absent region.
- Every state has words plus a colour-independent cue. Controls expose stable name, role, value,
  selected/disabled state, and errors to assistive technology.
- Text scaling, high contrast, colour-vision differences, Reduce Motion, 1x/high-density/fractional
  scaling, IME, bidirectional text, and grapheme-safe editing remain release checks.
- A third-party view must supply accessible semantics through the supported host contract or provide a
  host-rendered semantic fallback. “Custom canvas” is not an accessibility exemption.
- Safe mode and Reset to ZD Default have documented, non-customizable keyboard entrances.

### Offline and local-first

- The shipped default, local projects, bundled widgets, profiles, fonts, help, and customization
  editor work after installation with networking disabled and without an account.
- Network-backed Attention items and agent actions degrade to explicit unavailable/stale states; they
  do not block launch, reading, editing, or local saves.
- Adding a cloud workspace is explicit. ZD never uploads an existing local workspace, profile,
  document, objective, review, or project name to create “parity.”
- Local mode does not require a public listener, cloud identity, or a service that can reach the
  public network. If a local helper is eventually used, it must remain an implementation detail of
  the same offline contract.
- The current SSPS connection is an explicit caveat to a strict offline claim: native windows create
  a persistent anonymous ID and connect by default unless disabled. This product direction should not
  quietly treat that as research consent; changing presence policy is a separate decision.

### Privacy-respecting product feedback

Validation telemetry is **off by default**. The preferred path is a local, user-visible session log
and structured interviews.

With explicit study consent, record only events needed to test the hypotheses: summon/hide latency and
outcome, project-slot selection, Attention open/target activation, command/customization use, recovery
events, and coarse task duration. Do not collect document text, selected text, prompts, responses,
paths, project names, terminal output, environment values, provider identity, credentials, or full
transcripts. Use study-scoped random IDs, not the SSPS visitor ID.

A Send Feedback action should generate an inspectable Markdown or JSON bundle locally. The user can
read and remove fields before sending. Automatically submitted study events require a separate
consent toggle, a visible retention period no longer than 30 days for raw study data, deletion by
study ID, transport failure that never blocks work, and no retry after consent is withdrawn.

## State, migration, and rollback expectations

The product needs clear authorities even before a particular storage implementation is selected.

| Fact | Authority | Durable form |
| --- | --- | --- |
| Committed document/objective content | Granted local or explicit cloud workspace | Ordinary content plus backend revision/stamp |
| Unsaved text, selection, undo, viewport | Per-project Document session | Optional crash journal only after a separate design |
| Project identity, pinned slot, active context | Versioned suite state | Stable IDs and backend references |
| Applied support-region placement and widget-instance state | Versioned suite state | Device/project placement, selected widget, and instance overrides |
| Portable layout templates and default widget config | Versioned portable profile | Validated template/default data with symbolic project roles only |
| Bindings | Versioned portable profile; suite command registry is the runtime projection | Command ID, chord, and context |
| Agent/terminal/browser live state | Owning specialist runtime | Typed handle and minimum attention summary only |
| Permissions | Native/service capability authority | Explicit grant references and audit metadata where needed |

Retained project switching needs a minimal lifecycle before it needs a general layout model. A
`DocumentSession` is keyed by stable project and document references and moves among active-clean,
suspended-clean, active-dirty, suspended-dirty, and conflicted states. Clean sessions may release and
recreate their views under a bounded eviction policy. Dirty/conflicted sessions retain their buffer,
undo state, and base revision and are never silently evicted. Switching commits the new active
project only after the current session suspends safely and the native owner activates the target's
existing root grant; failure leaves the prior context and grant active. Quit, update, project removal,
and destructive reset enumerate every dirty session, not only the visible document.

Keep three stores distinct:

- device-local suite state owns projects, pinned slots, root references, and last contexts;
- a portable profile owns layout templates, theme, bindings, and widget configuration; and
- a non-exportable grant ledger owns platform capability handles and approvals.

Profile export never includes paths, workspace grants, credentials, or device project IDs. Imported
project roles remain unresolved until the user explicitly binds and grants a local workspace.

Migration rules:

1. No migration changes Markdown or objective bytes merely to adopt the new shell or layout.
2. Before the first suite-state migration, export current preferences and review ledgers to a
   versioned, inspectable record. Review IDs matter; the generated feedback file is not a complete
   substitute.
3. Migrations are idempotent and transactional. Keep the pre-migration record until the new version
   opens, validates, and survives one restart.
4. There is one writable authority for each fact at every step. Do not indefinitely dual-write old
   local storage and a new suite store.
5. A dirty document blocks project-scope replacement, downgrade, or destructive reset. Hiding the app
   never closes or cleans it.
6. Corrupt layout/profile state opens the shipped default and preserves the bad record for export or
   diagnosis. It does not rename, delete, or rewrite project content.
7. Missing or disabled widgets become labelled placeholders with Remove, Reinstall/Enable, and Keep
   Data choices. Unknown config is retained until the user chooses removal.
8. Every schema-changing release keeps one last-known-good backup and a documented rollback path. If
   an older binary cannot read new suite state, it must still open ordinary Markdown without importing
   or mutating that state.
9. Reset to ZD Default changes only layout/profile/binding data selected in a preview. Project removal
   forgets the reference; it never deletes the workspace.

## Explicit non-goals

For the first product candidate, do not build:

- a general IDE, language server platform, debugger, Git host, terminal emulator, or authenticated
  general browser;
- real-time collaboration, multi-user administration, mobile clients, hosted multi-tenancy, or local
  to cloud synchronization;
- a plugin marketplace, arbitrary runtime code installation, self-modifying UI generated and executed
  without review, or a stable binary extension ABI;
- a universal agent abstraction, provider credential store, copied transcript database, workflow
  engine, or terminal-output scraper;
- a free-form dashboard, unlimited nested layout graph, or visible panel/tab system before a second
  real workflow proves the need;
- GPU/Wasm acceleration without a measured workload and an accessible fallback;
- automatic upload, opt-out product analytics, or reuse of presence identity for research;
- complete `zd md` reimplementation as a prerequisite for testing quick access; or
- architectural replacement merely to make the prototype look more extensible.

## MVP alternatives

### Scope S — Quick Attention Loop (recommended)

Deliver:

- the existing `zd md` default and all save/security invariants;
- a configurable system-wide summon/hide chord on macOS;
- three durable, explicitly pinned project contexts with `Command-1…3` switching;
- preservation of active document, caret/reading anchor, dirty truth, and file authority per project
  while switching or hiding;
- one Attention suite surface fed by a single read-only structured source plus local document/review
  state;
- Document plus Files/Attention in the fixed primary/support-region model;
- persistence of project slots, active project, and support side/size/choice, plus one remapped command
  only after the design revision;
- Shortcut Reference/Command List truthfulness, Reset to ZD Default, corrupt-state fallback, and
  inspectable export; and
- local feedback logging plus the native/accessibility/offline test matrix.

Do not include in-app agent input, approvals, arbitrary splits/tabs, third-party widgets, cloud
workspaces, or an embedded terminal/browser.

### Scope L — Programmable Project Workbench

Deliver everything in Scope S plus Document, Attention, Objectives, and actionable Agent Thread
widgets; arbitrary split/tab/move layouts; named presets; a second mini-app; persisted user keymap;
one external package format; one live agent adapter; and local/cloud workspace parity.

### Comparison

| Criterion | Scope S | Scope L |
| --- | --- | --- |
| Hypothesis tested | Does summon/switch/orient remove real context-switch pain? | Can ZD also become a generalized customizable workbench? |
| New durable concepts | Project, slot, attention item, one support-region choice | Project plus general layout, widget lifecycle, extension/package, agent and service contracts |
| Risk to current `md` | Bounded; existing surface remains the primary path | High; several new authorities and interaction models arrive together |
| Honest customization proof | One binding and one region choice survive restart/reset | Stronger, but it can look successful before the core loop is useful |
| Accessibility/security burden | Native window behavior plus one new suite surface | Multiple custom views, runtime authority, layout recovery, package trust, cloud auth |
| Failure value | Leaves a useful overlay/project experiment and clear evidence | Large sunk framework whose product premise may remain untested |
| Decision clarity | High: fast user loop has measurable baseline | Low: a failure cannot identify whether product, editor, layout, agent, cloud, or stack caused it |

Choose Scope S. It is the 80/20 product slice and follows the repository's guidance to design twice,
ship a working simple thing, and extract interfaces only after a second real consumer. Scope L is an
expansion roadmap, not an MVP.

## Staged delivery and test plan

Each stage ends in a user-visible demo and a decision. All behavior contracts are stack-independent.

### Stage 0 — baseline the real switch

Run at least 30 naturally occurring context switches over five work sessions. Record locally: trigger,
starting app, target project, desired action, elapsed time, gestures, wrong-window/project events, and
whether the switch ended in reading, editing, status inspection, approval, terminal, or browser work.

Demo: replay the five most common flows as a paper/clickable interaction prototype with two summon
defaults: resume-last and open-Attention.

Acceptance/gate:

- at least 60% of observed painful switches cluster into resume, project switch, Attention, or review;
- the user chooses a predictable summon behavior after trying both; and
- if terminal/browser/code work dominates instead, keep ZD focused and validate companion integration
  rather than widening this product.

### Stage 1 — summon, switch, hide

Use three real local projects. Summon ZD from another app, switch slots, edit an unsaved document, move
among Spaces/displays, hide, and return. The state may begin in memory during implementation but the
stage is not accepted until clean-context and suite-state restoration is durable and versioned.
Dirty sessions block deliberate quit, update, or restart until saved or explicitly discarded; crash
recovery for unsaved buffers is a separate product design rather than an accidental suite-state field.

User-facing acceptance:

- first press shows the warm app on the active display/Space with the last meaningful target focused;
- second press hides it and does not close, save, discard, or recreate anything;
- 100 consecutive toggles produce zero Space jumps, focus leaks, lost state, or stuck shortcuts;
- 100 project switches preserve the correct document, selection/anchor, dirty state, and native file
  scope; and
- an empty slot, shortcut collision, deleted root, or unavailable project explains itself in text and
  leaves the current context intact.

Verification:

- pure state tests for every DocumentSession transition, clean-session eviction, dirty-session
  non-eviction, project/slot activation, and switch refusal;
- integration tests at document/suite/file-authority boundaries;
- close/quit/update tests enumerate all dirty sessions, and CLI/Finder opens route through the same
  queued safe-switch and native-grant protocol;
- native manual matrix for displays, Spaces, full screen, Stage Manager, sleep/wake, and collisions;
- keyboard-only and VoiceOver pass; and
- input-to-usable-frame measurements, with p95 warm show and project switch under 250 ms on the
  reference Mac and no idle polling/repaint introduced.

### Stage 2 — orient with Attention

Add the Attention plane and only one read-only structured agent-status source. Include local dirty,
review, and missing-workspace states so the plane remains useful offline. Enter opens the correct ZD
resource or explicit owning-tool action.

User-facing acceptance:

- a keyboard-only user can identify the project, owner, state, last update freshness, and next action
  without opening each terminal;
- `waiting`, `failed`, `review`, `working`, `stale`, and `quiet` are understandable without colour;
- opening/dismissing Attention leaves the underlying document exactly unchanged;
- disconnecting the source marks affected items stale/unavailable rather than quiet or complete;
- no prompt, response, path, project name, or transcript crosses the network for product analytics;
  and
- 100 recorded source transitions yield zero wrong-project routes and at most two stale/misclassified
  attention states.

Verification includes deterministic event-order/reconnect tests, bounded history, duplicate/out-of-
order event cases, inaccessible-owner cases, screen-reader semantics, and an end-to-end route into one
real target.

### Stage 3 — retain one personal choice and recover

Let the user choose support side/size/content and pin slots. After the owner-approved design revision,
remap one command. Add portable profile export, a separate device-state backup path if needed, Reset
to ZD Default, one prior-schema migration, corrupt-state fallback, and a disabled/missing-widget
placeholder. Do not add general splits or runtime packages.

User-facing acceptance:

- choices survive 100 restarts and project switches without changing content state;
- binding collisions are explained before save and one invalid entry does not disable valid bindings;
- an imported profile is previewed, validates unknown commands/widgets, contains no path/grant/device
  project authority, and can be cancelled without mutation;
- corrupt or newer state opens the shipped default while retaining the unread record;
- reset states exactly which profile facts will change and never deletes project files; and
- downgrade/rollback can still open Markdown and recover the last-known-good profile.

Verification includes schema/property tests, idempotent migration, interrupted write, newer schema,
missing widget, keymap collision/context, export/import round trip, and recovery-mode end-to-end tests.

This is the end of the recommended MVP.

### Stage 4 — one actionable thread, only after the MVP gate

Add one live Agent Thread adapter with typed messages, one question/approval response, send, interrupt,
detach, and explicit provider/cwd/capability presentation. Keep the full transcript and credentials
with the provider.

Gate: users complete at least 80% of sampled steering tasks without opening a terminal to verify what
happened; every command has a confirmed provider outcome; disconnect or adapter failure never invents
success.

### Stage 5 — prove a second domain and composition need

Add Objectives read-only, then one validated mutation against existing repository records. Test it as
a support widget from `md` and as the primary surface of a provisional `td` mini-app. Only now decide
whether mini-apps are behavior types, named layouts, or both.

Gate: the second domain reuses project identity, commands, appearance, capabilities, and recovery
without shallow forwarding abstractions. If it cannot, revise the boundary before publishing it.

### Stage 6 — extension and free-layout proof

Use two independently useful bundled widgets to derive the smallest installable contract. Add one
data-only package first; then, only with a concrete unmet use case, one constrained executable widget.
Run missing-version, denied-capability, timeout/crash, accessibility-fallback, uninstall/reinstall,
upgrade, and safe-mode scenarios before calling it extensible.

Gate: a widget built without private imports installs on a compatible release, requests no ambient
authority, restores state across one host upgrade, fails without taking down the document, and can be
disabled/reset entirely from the keyboard. Otherwise keep customization data-only.

## Falsifiable success and kill criteria

Measure the product hypotheses separately so a pleasing shell cannot hide a failed workflow.

| Hypothesis | Success threshold | Stop, narrow, or kill threshold |
| --- | --- | --- |
| Quick access matters | Over 10 real workdays, the primary user uses summon-act-hide on at least 7 days; in a five-person cohort, at least 4 use it unaided in three or more sessions | Median time or gestures to the target action improve by less than 25%, or users choose ordinary app switching for more than 70% of eligible tasks |
| Retained projects reduce reconstruction | At least 90% of sampled switches resume the intended project/resource without searching; zero dirty-buffer or authority loss | More than 10% land in the wrong context, or any unexplained data loss/scope widening occurs; stop rollout immediately for the latter |
| Attention is trusted | Users identify the correct next action within five seconds in at least 80% of trials; verified stale/wrong state is at most 2% over 100 transitions | Users open the terminal/provider to verify more than half of Attention items, or wrong/stale state exceeds 5%; remove action claims and return to routing only |
| Small customization helps | At least 3 of 5 users keep one non-default binding/region choice after a week and all can reset unaided | Customization adds 20% or more task time/errors, or fewer than 2 users retain a change; keep fixed defaults and stop layout expansion |
| A public extension boundary is earned | Two materially different real widgets use the same small lifecycle/capability contract and one outside prototype needs no private API | The contract grows generic escape hatches for the second widget, or no outside use case survives prioritization; do not ship runtime extensions |
| Cloud is a product job | At least 3 target users demonstrate a recurring remote-access workflow that local/companion operation cannot solve | Cloud is justified only by deployment elegance or stack reuse; keep the product local-only |

“Kill” here means stop the larger workbench/customization investment and preserve the useful `zd md`
product and any independently valuable quick-access improvement. It does not mean rewrite until the
metric passes.

## Assumptions and product questions

### Assumptions being tested

- A Joseph-like solo Mac developer is the correct primary design partner.
- Summoning and retained project identity remove more pain than embedding a terminal or browser.
- Resume-last is a better default than summon-into-Attention.
- Three pinned projects are enough to validate the model before supporting nine.
- A read-only structured attention source provides value before in-app steering.
- One primary plus one support region preserves ZD's calm while exposing a real composition seam.
- Ordinary files, not a suite database, remain the source of truth for documents and objectives.
- Users want deep personalization after the default loop works; the inspiration alone is not evidence
  that they need runtime plugins.

### Decisions required before or during the stages

1. **Does thinking bigger supersede the binding anti-dashboard/panel rules?** Recommendation: no for
   the default; require a reviewed design revision before the Stage 3 binding experiment, and define
   the smaller universal host invariants before Stage 6 free layout.
2. **What does the global chord summon?** Test resume-last against Attention in Stage 0; ship one
   predictable default rather than context-sensitive guessing.
3. **What owns an Attention truth claim?** Name the first structured source and its freshness model
   before Stage 2. Never infer “waiting” from terminal pixels.
4. **Is a mini-app a CLI-launched domain, a saved layout, or both?** Keep the current domain meaning
   through Stage 4; let the Objectives experiment provide the second case.
5. **How much customization must be safe at runtime?** Recommendation: promise complete ordinary
   workspace composition, not replacement of permissions, recovery, accessibility, or save truth.
6. **Should presence remain opt-out while the larger product claims offline/local-first behavior?**
   Resolve separately; do not reuse it for validation.
7. **What is the Windows quick-access promise?** Preserve ordinary-window parity now and make a
   platform-specific overlay commitment only after an equivalent native behavior study.
8. **Is cloud access a user job or an implementation aspiration?** Require the Stage 6-style user
   evidence in the success table before placing it on the core roadmap.
9. **Which five external design partners match the primary profile?** Recruit them before treating
   founder usage as market validation.
10. **Does the first retained-project candidate use one switching window or the vision's multiple
    windows?** Recommendation: one warm switching window first; specify session/grant ownership and
    prevent two windows from editing one dirty session before reintroducing multiple windows.

## Decision summary

The inspiration is strongest when read as a product interaction, not a stack diagram. ZD should start
as the thing it already does unusually well—a calm, trustworthy document surface—and become globally
available, project-aware, and attentive. The first customization should be small, reversible data.
Only demonstrated user value and a second real consumer should earn general panels, executable
widgets, cloud parity, or a complete UI composition system.
