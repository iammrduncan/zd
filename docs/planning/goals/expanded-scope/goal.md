# Expanded Scope Execution Plan

## Outcome

Execute the pivot from `zd md`/Zen Suite to one `zd` agent workbench without letting parallel work
create competing state, platform authority, themes, shortcuts, or lifecycle models. Each feature
goal remains independently verifiable; integration crosses explicit sequential gates.

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
native authority. Old binding documents cannot remain the instructions feature agents are expected
to follow.

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
no active repository context directs future agents back toward Zen Suite or miniapps.
