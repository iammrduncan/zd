# Expanded Scope Execution Plan

Status: **complete — 2026-08-22**

Archived summary: [Expanded Scope Completion Summary](../_completed/expanded-scope.md)

## Outcome

Execute the pivot from `zd md` and the ZenSuite growing-miniapp model to one `zd` agent workbench
without letting parallel work create competing state, platform authority, themes, shortcuts, or
lifecycle models. Each feature goal remains independently verifiable; integration crosses explicit
sequential gates.

## Execution Record

The plan ran through the dependency gates below. Shared state, platform registration, dependencies,
configuration, command dispatch, and theme changes stayed with the integration owner; feature work
landed behind bounded adapters before root integration.

| Goal | Status | Delivered evidence |
| --- | --- | --- |
| D | Complete | Current authority, contributor routes, public docs, website, metadata, deterministic workbench captures, and stale-context contracts |
| R | Complete | One boot path, versioned state owner, atomic context transitions, multi-grant native boundary, responsive regions, commands, preferences, themes, and global window behavior |
| P | Complete | Persistent project/worktree identities, native-approved add/recover/remove flows, compact project hierarchy, and guarded activation |
| I | Complete | Opt-in local diagnostic sessions, redaction, bounded rotation/retention, process sampling, reveal controls, and format fixtures |
| E | Complete | One CodeMirror owner for Markdown/code, bundled language registry, bounded file states, Find/Replace, read-only buffers, and large-file evidence |
| T | Complete | Project-scoped native PTYs, xterm rendering, bounded event-driven output, search/input/resize, process-tree cleanup, and release measurements |
| F | Complete | Compact virtualized Files, bounded native scans, scoped Git status/history/comparison, Changes, and read-only editor diffs |
| H | Complete | Project-nested thread operations, structured worktree creation, terminal runtime attachment, atomic restoration, lifecycle detection, and deduplicated attention |
| N | Complete | Opt-in event-driven desktop routing, exact-thread View action, privacy-safe payloads, rate-limited sound policy, unsupported-state handling, and attention measurements |

| Gate | Status | Integration evidence |
| --- | --- | --- |
| Gate 0 | Complete | `VISION.md`, `DESIGN.md`, ADR authority, naming, CLI, grants, commands, themes, and defaults were settled before feature work |
| Gate 1 | Complete | Workbench boot/state/shell/platform contracts and native multi-grant authority passed unit, browser, and Rust checks |
| Gate 2 | Complete | Projects, diagnostics, editor, and terminal contracts integrated through the shared platform and state owners |
| Gate 3 | Complete | Threads, Files, Git, Changes, and read-only diffs integrated after project, PTY, and editor contracts stabilized |
| Gate 4 | Complete | One versioned busy-to-waiting event drives in-app attention, native notification View routing, and optional sound without polling |
| Gate 5 | Complete | Public docs, website export, generated assets, source maps, historical-context boundaries, and repository stale-context checks reflect the workbench |

The final integrated gate on 2026-08-22 recorded:

- `npm run check`: typecheck, ESLint, version sync, and 745 passing unit/contract tests with 5
  intentional skips;
- normal Playwright: 347/347 passing; release Playwright: 3/3 passing from the production bundle;
- release attention: 1,000 events in 3.2 ms with zero idle calls; Changes: 10,000 entries with 40
  live rows and zero idle calls; terminal: 1,048,625 bytes at 9.0 MiB/s with zero idle calls;
- production app and 15-page website builds, generated-asset and documentation contracts, and the
  repository-wide reserved-name check;
- 194 Cargo all-target tests, Clippy with warnings denied, Rust formatting, repository formatting,
  and a clean diff check.

Windows-specific PTY cleanup remains covered by its `cfg(windows)` Job Object implementation and
native test; the final local native run records macOS evidence rather than claiming a Windows
runtime was available on this host.

## Naming Contract

- `ZenSuite` is the product-family and repository identity.
- `zd` is the complete user-facing name of the application, workbench, and command. It is not an
  abbreviation and receives no spelled-out expansion in product copy.
- Retaining the ZenSuite identity does not retain the old suite launcher, growing-miniapp model, or
  separately launched `zd md` product.

## Visual Reference Contract

Use these assets as shared execution references:

- [Approved light overlap workbench](assets/workbench-light-overlap-v2.png) defines the single-pane
  composition: project-scoped Threads on the left, the active file or thread in the centre, and the
  compact Files/Changes region on the right.
- [Approved light side-by-side workbench](assets/workbench-light-side-by-side-v2.png) defines the
  paired composition in which the active thread and selected file share the centre region.
- [Current reader screenshot](../../../user-facing-docs/assets/zd-reader.jpeg) and
  [current comments screenshot](../../../user-facing-docs/assets/zd-comments.png) record the actual
  editor typography, canvas, focus treatment, spacing, and restrained visual character that the
  workbench must preserve.
- [Current social card](../../../user-facing-docs/assets/zd-social-card.png) records public imagery
  that the Documentation Goal must replace or regenerate from the implemented workbench.

The goal acceptance criteria and the successor `VISION.md`/`DESIGN.md` remain authoritative. Current
screenshots are evidence for retained editor behavior and appearance. The approved concepts are
directional references for workbench composition, region placement, density, hierarchy, and light
theme continuity; their sample copy and exact pixels are not implementation requirements.

## Goal Index

| ID | Goal | Primary result | Prerequisites |
| --- | --- | --- | --- |
| D | [Documentation Migration](goal-docs.md) | Current authority and released-product context | Owner decisions; Phase B follows all features |
| R | [Workbench Reorganization](goal-reorganize.md) | One shell, state owner, multi-grant boundary, themes, global summon | D Phase A |
| P | [Projects](goal-projects.md) | Stable multi-project/worktree context | R |
| I | [Instrumentation](goal-instrumentation.md) | Local opt-in diagnostic evidence | R |
| E | [Editor](goal-editor.md) | One CodeMirror Markdown/code/find owner | R |
| T | [Terminal](goal-terminal.md) | Bounded PTY and terminal lifecycle | R; project integration uses P |
| F | [File Tree](goal-filetree.md) | Files, Git changes/history, and safe diffs | R + P; diff uses E |
| H | [Threads](goal-threads.md) | Project/worktree terminal organization and attention state | P + T |
| N | [Notifications](goal-notifications.md) | Desktop routing and optional completion sound | R + P + H |

## Dependency Graph

```text
D Phase A: replace product/design/ADR authority
  |
  v
R: one workbench shell and shared contracts
  |
  +----------------+----------------+----------------+
  v                v                v                v
P: projects     I: diagnostics   E: editor       T: PTY spike
  |                                                  |
  +----------------------+---------------------------+
  |                      v
  |                  H: threads
  |                      |
  v                      v
F: Files + Git       N: notifications
  |
  +---- E read-only/diff contract
  v
F: history, comparison, editor diff integration
  |
  v
D Phase B: public docs, website, metadata, final stale-context audit
```

## Sequential Gates

### Gate 0: Resolve authority before implementation

Complete Documentation Phase A. The new VISION/DESIGN authority must settle workbench regions,
themes, Focus/sound defaults, tabs/icons, public identity, CLI compatibility, and multi-project
native authority. The settled product and platform decisions in `goal-docs.md` are inputs, not open
questions. Old binding documents cannot remain the instructions feature agents are expected to
follow.

### Gate 1: Establish the workbench foundation

Complete R before feature fanout. The root implementation must expose narrow interfaces for:

- workbench state and stable IDs;
- active project/worktree/thread/file transitions;
- multi-project native grants;
- region mount/focus/geometry ownership;
- validated configuration and theme loading;
- shared commands and platform-specific shortcuts;
- global show/focus/hide behavior.

Do not remove the old boot path until the new path has equivalent launch, editor, save, and close
coverage.

### Gate 2: Freeze foundation contracts

After the first fanout, integrate P, I, E, and the T spike sequentially through their public
interfaces. Run the complete repository check and native smoke tests. Project activation, editor
buffers, terminal handles, diagnostics IDs, and error results must be stable before downstream work
uses them.

### Gate 3: Integrate lifecycle and navigation

Integrate H only after P and T lifecycle tests pass. Integrate F's Changes/history/diff slice only
after project context, scoped Git data, and E's read-only buffer contract pass independently.
Project/thread/worktree/file activation is one root-owned transaction; no feature may stitch it
together with a sequence of local setters.

### Gate 4: Route attention

Freeze H's attention event before N begins integration. Notification adapters may be prepared
earlier, but desktop View routing and sounds cannot infer completion from terminal text or own a
second unread state.

### Gate 5: Finish repository context

Complete D Phase B after behavior and public names stabilize. Run the stale-context audit, docs and
website builds, CLI/package checks, full repository checks, and the native performance/accessibility
checkpoint before declaring the expanded scope executable as the new baseline.

## Subagent Fanouts

### Fanout A: independent foundations after Gate 1

Run these in parallel with exclusive ownership:

| Worker | Scope | Must not own |
| --- | --- | --- |
| P worker | Project model, project UI, project tests | Root state composition or platform command registration |
| I worker | Diagnostic schema, redaction, rotation, writers, tests | Feature-specific event semantics |
| E worker | CodeMirror languages, file states, Find/Replace, editor tests | File-tree filtering or Git diff navigation |
| T worker | One PTY spike, terminal adapter/lifecycle, terminal tests | Threads UI or generic command execution |

The integration/root agent owns shared entry points and resolves interface requests. Parallel
workers do not edit the same root state, `main`/boot, platform facade, Tauri command registry,
shortcut registry, shared configuration schema, dependency manifest, or global theme files.

### Fanout B: workspace features after Gate 2

Run these in parallel behind the frozen contracts:

- F worker 1: Files tree, filtering, watching, accessibility, and large-tree behavior.
- F worker 2: scoped Git status/history service and repository fixtures.
- H worker: thread model and region UI against the stable terminal adapter.
- D worker: contributor/context updates that reflect already-integrated source movement.

Integrate the two F workers sequentially before adding editor diffs. H integrates sequentially with
real terminals and project activation after its fake-adapter tests pass.

### Fanout C: dependent presentation after Gate 3

Run these in parallel:

- F integration worker: Changes, history comparison, and read-only editor diff presentation.
- N worker 1: native notification permission/presentation adapter.
- N worker 2: sound policy, per-type configuration, rate limiting, and tests.
- D worker: draft user docs and website changes for behavior already merged.

The root agent then integrates notification routing with the one H attention event and completes D
only after the feature behavior is verified.

## Work That Must Stay Sequential

- Product, design, ADR, CLI, shortcut, bundle-ID, and domain decisions before dependent docs/code.
- Multi-project authority before any feature accepts arbitrary project/worktree paths.
- PTY proof before generalized terminal sessions or agent detection.
- Project and terminal lifecycle before real thread integration.
- Thread attention semantics before notification routing.
- Filesystem/Git models and read-only editor buffers before Changes diff integration.
- Shared state migrations, configuration schema changes, command-registry edits, theme-token edits,
  Tauri command registration, and dependency changes through one integration owner.
- Public documentation claims and final generated assets after the corresponding behavior ships.

## Fanout Rules

1. Every subagent receives one goal file, one bounded subtask, explicit file/module ownership, and
   the instruction that other agents are working in the same repository.
2. A subagent adds or updates tests with every code change. Reported errors receive a failing test
   before the fix.
3. Shared interfaces are proposed to the integration agent; workers do not independently widen
   them or edit root-owned files to make local work compile.
4. Each incremental feature is committed with a short one-line message and no co-author tag.
5. A fanout result is not complete until its focused tests pass. A gate is not complete until the
   integrated typecheck, lint, unit/browser checks, and proportional native checkpoint pass.
6. Instrumentation remains off by default during ordinary verification; dedicated diagnostic runs
   enable it explicitly.
7. Optimize from release-build measurements. Do not add polling, eager traversal, or virtualization
   solely because a future workload might need it.

## Overall Terminal Condition

All nine goals meet their terminal conditions; one native `zd` workbench can hold multiple
projects, files, terminals, and threads; Git navigation and current-file editing remain responsive;
completion attention returns to the exact thread; local diagnostics explain resource problems; and
no active repository context directs future agents toward the retired ZenSuite miniapp model or a
spelled-out expansion of `zd`.
