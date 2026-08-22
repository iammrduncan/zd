# zd workbench vision

Date: 2026-08-21

Status: **canonical and binding**

Supersedes: the 2026-07-28 `zd md` second-prototype vision and the growing-miniapp product model.

ZenSuite is the product-family and repository identity. The application, workbench, and command are
named `zd`. The name is complete and is not expanded in product copy.

## 1. Authority

When current documents disagree, use this order:

1. Human direction defines owner intent.
2. This vision defines product behavior and scope.
3. Accepted [architecture decisions](adr/README.md) define implementation boundaries.
4. [DESIGN.md](DESIGN.md) defines visual and interaction behavior.
5. The active [expanded-scope execution plan](planning/goals/expanded-scope/goal.md) sequences work
   without overriding product or architecture authority.
6. [User documentation](user-facing-docs/README.md) describes behavior that has shipped.
7. Source code and tests show what the current implementation can prove.

Research, ideas, historical objectives, and superseded records preserve context. They do not direct
new implementation.

## 2. Why this exists

Coding agents create long documents, terminal sessions, changes, and unfinished questions across
several repositories. The difficult part is no longer opening one file. It is keeping the project,
conversation, process, file, and Git context together long enough to understand and steer the work.

`zd` is a calm, local-first agent workbench. It gives one project-aware place to read and edit files,
run terminal-backed agent threads, inspect changes, and return to work that needs attention.

Success means a person can summon `zd`, recover the exact context of a project or thread, understand
what changed, act, and leave again without rebuilding state or fighting interface chrome.

## 3. Product character

The restraint of iA Writer, OmmWriter, and the existing `zd` editor remains the visual foundation.

- Content is the interface. Typography, spacing, alignment, colour, and hairlines carry hierarchy.
- The workbench is calm, not sparse; capable, not noisy; technical, not IDE-like.
- Persistent regions exist only for work that must stay visible together.
- Actions use text and complete keyboard semantics. Icons clarify file and thread type; they do not
  become decorative controls.
- State changes are immediate and geometrically stable. Nothing unrelated jumps when a project,
  thread, file, theme, or Git snapshot changes.
- Local behavior is the default. Network access, process authority, and notifications are explicit
  capabilities, not ambient assumptions.
- Performance is part of the aesthetic. Idle work, delayed input, flicker, and unbounded background
  activity are product defects.

## 4. One workbench

ZenSuite ships one application named `zd`, not a launcher for separate tools.

The supported launch forms are:

```text
zd
zd <folder>
zd <file>
```

Bare `zd`, Dock, Spotlight, and Start menu activation open the existing workbench or its quiet home
state. Folder and file activation resolve or add a project, then use the same safe context switch as
in-app navigation. The former `zd md` launch form is not a compatibility alias.

One running process owns one root workbench window. The initial product does not create independent
document windows. A global shortcut reuses the root window in a temporary quick-access presentation:
it appears on the active display and Space, accepts input, and hides on repeated summon, Escape, or
focus loss. Hiding is not closing and never destroys work. Ordinary activation restores normal window
behavior.

## 5. Workbench state and regions

One versioned `WorkbenchState` owns stable identities and the active context:

```text
WorkbenchState
├── projects[]
├── activeProjectId
├── activeWorktreeId
├── activeThreadId
├── activeFileId
├── region geometry and focus ownership
├── theme and shared preferences
└── recoverable availability/error state
```

Projects, worktrees, threads, terminal sessions, editor buffers, and revision buffers have distinct
identities. Views observe this state and request transitions; they do not keep competing active IDs.

The shell has four semantic regions:

1. **Threads**, on the left, groups threads beneath their owning projects.
2. **Current content**, in the centre, shows the active file or active thread.
3. **Files/Changes**, on the right, navigates the active project and Git state.
4. **Terminal content**, owned by a terminal-backed thread and shown in the centre rather than as a
   permanent bottom drawer.

The centre has two presentation modes:

- **Overlap** shows either the selected thread or the selected file in the centre.
- **Side by side** shows the active thread next to the selected file.

Responsive layout may collapse, hide, or temporarily replace navigation regions. It may not create
a second state owner, discard region selection, or squeeze content below its usable minimum.

A project or thread switch is one transaction. It either activates the complete target context or
leaves the previous context intact with a specific reason. An incidental component remount never
decides what happens to dirty text, running processes, unavailable paths, or worktrees.

## 6. Projects and worktrees

A project is a user-approved local folder with a stable opaque ID, canonical root, display name,
order, availability state, and native filesystem grant.

- One session holds multiple projects without restarting.
- Adding the same canonical root activates the existing project.
- Activating a project updates Threads, current content, Files, Changes, terminal context, and
  project-scoped commands atomically.
- Each project retains its open file, editor position, tree expansion/filter/scroll, active thread,
  worktree, and live terminals while inactive.
- Moved, missing, denied, or non-directory roots remain visible with a recovery path.
- Removing a project cannot discard a dirty buffer, kill a process, or delete a worktree as a side
  effect.

A thread may use the project root or an explicit Git worktree. A worktree is context within its
owning project, not a duplicate top-level project. Creation uses structured Git operations, detects
collisions and locks, and never implies automatic deletion.

## 7. Threads and terminals

A thread organizes one continuing unit of work inside a project/worktree. Its durable record has a
stable ID, project/worktree identity, type, name, order, lifecycle, attention state, and reference to
its backing session. Runtime process handles are never serialized as durable state.

The initial thread type wraps one native terminal session. ACP and a first-party agent are future
scope; the first implementation does not force terminal behavior through a speculative agent
abstraction.

Thread lifecycle distinguishes `starting`, `idle`, `busy`, `waiting`, `exited`, `failed`, and
`unknown`. A row presents name, terminal or agent type, worktree, lifecycle, and attention in an
accessible form. `waiting` means a supported agent that was busy is ready for the person again; raw
output alone does not infer completion.

A person can create, rename, reorder, activate, close, and remove threads. Closing a live process or
a context with dirty work requires the owning feature's explicit safe action.

Native code owns pseudoterminal creation, cwd, structured environment policy, resize, input/output,
exit status, descendant cleanup, and disposal. The frontend receives a bounded terminal-session API,
not generic arbitrary-command IPC.

Terminal presentation supports Unicode, grapheme-safe selection, copy/paste, keyboard input,
resize/reflow, search, accessible focus, and bounded scrollback. Processes remain alive across project
and thread switches. Quitting cleans every owned process and buffer; hiding does not.

Codex, Claude Code, and OpenCode run as their ordinary CLIs. `zd` reports which supported adapter and
cwd it launched, but it does not absorb their credentials, permissions, or provider contracts.

## 8. Files and Changes

The right navigation region has two keyboard-accessible views with independent selection,
expansion, filter, and scroll state.

### Files

Files shows the complete approved project hierarchy, not only Markdown:

- compact rows, shallow nesting, disclosure controls, and small file-type icons;
- deterministic directory-first, case-insensitive ordering;
- vertical and horizontal scrolling without changing row height;
- keyboard traversal and directory expansion;
- filename/path and supported file-category filtering that preserves the underlying tree state;
- explicit loading, empty, denied, missing, and unavailable states; and
- bounded filesystem watching or refresh that updates paths without stealing selection, collapsing
  directories, or moving the active file.

Git state covers added, modified, deleted, renamed, conflicted, untracked, ignored, and submodule
entries. The compact visual treatment may colour the filename and icon; the complete state is also
present in the row's accessible name and description. Ignored paths are de-emphasized and traversed
under strict bounds so dependency and build trees cannot freeze the workbench.

### Changes

Changes is inspection-only in this scope:

- list current uncommitted changes;
- remain useful outside a Git repository with an honest unavailable state;
- browse bounded, progressively loaded commit history;
- compare two commits; and
- open current/revision buffers in a read-only editor diff.

Revision buffers have explicit identities and never overwrite, dirty, or replace the live document.
Staging, committing, branching, merging, rebasing, fetching, pushing, and conflict resolution are not
part of this goal.

## 9. One editor engine

CodeMirror is the one editor engine for Markdown and supported text files.

Markdown preserves the current rendered, directly editable reading experience: semantic typography,
source honesty, rendered tables/code/images, selection, undo, safe rendering, Raw Mode, and the same
document position for caret, focus, find, save, and viewport restoration.

Non-Markdown text uses the same editor owner without Markdown parsing or decoration. It receives the
shared canvas, code typography, syntax colour, wrap preference, selection, undo/redo, and atomic save
path. It does not receive language servers, completion, diagnostics, refactoring, debugging,
breadcrumbs, a minimap, line numbers, or IDE gutters.

A versioned language registry maps names and extensions to bundled CodeMirror language support.
Rust, JavaScript, JSX, TypeScript, TSX, and HTML remain required. Additional languages are selected
from real repository fixtures. Unknown text stays honest monospaced plain text.

Binary, undecodable, missing, permission-denied, and over-limit files remain inspectable where safe
and state why editing is unavailable. The editor never guesses an encoding or saves through a
read-only buffer.

Current-file Find supports next, previous, result position/count, case sensitivity, whole word, and
regular expressions. Replace next and Replace all are single undoable transactions. Markdown matches
are always backed by real source ranges, including rendered constructs and Raw Mode.

Focus Mode is off by default. When enabled it keeps the established line, paragraph, or section
targeting and typewriter relationship. Find and Focus are distinct commands.

Saving is atomic. A buffer becomes clean only after the platform confirms the write. External changes
are detected and reconciled; failures preserve the buffer and explain the refusal near the file.

## 10. Attention and notifications

One transition from a supported thread's `busy` state to `waiting` emits one versioned attention
event. Threads owns that state and event. Notifications only present it.

A desktop notification identifies `zd`, project, thread, and agent type without showing prompt,
terminal, file, or secret content. View summons the existing workbench and activates the exact
project/worktree/thread transactionally. Close dismisses only the notification.

Foreground presentation follows one rule: the in-app attention state always updates; desktop
presentation and sound are suppressed while the target thread is already visible and focused.
Permission denial, unsupported APIs, registration failure, and operating-system suppression never
block the thread or application.

Completion sound is off by default. A person may enable a global chime and select a sound per
supported thread/agent type. Missing files fall back safely; repeated events are rate-limited.

## 11. Themes and shared appearance

One suite-owned theme resolver feeds the shell, editor, navigation, terminal, diffs, transients, and
notifications. No feature owns a private palette or font scale.

Themes are versioned, validated data files named `<name>.theme.config` under the `zd` configuration
directory. Invalid, incomplete, unsupported, or unsafe files fail closed and cannot prevent launch.
Theme data cannot execute code or widen capabilities.

The application ships the current warm light theme, a dark theme, and a Dracula-style theme through
the same loader. System/light/dark choice, warmth, typography, Focus, wrapping, region geometry,
notification sound, and instrumentation are shared workbench preferences with versioned migration
and safe defaults.

## 12. Commands and shortcuts

One command registry owns command identity, availability, dispatch, and displayed labels. Text-entry
keymaps may own editor-local behavior; they do not own application commands.

Default application bindings are:

| Command | macOS | Windows |
| --- | --- | --- |
| Current-file Find | `Cmd+F` | `Ctrl+F` |
| Focus Mode | `Cmd+Shift+F` | `Ctrl+Shift+F` |
| Activate project 1…9 | `Cmd+1`…`Cmd+9` | `Ctrl+1`…`Ctrl+9` |
| Focus terminal/thread | `Cmd+J` | `Ctrl+J` |
| Command List | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Global summon | `Cmd+Shift+Space` | `Ctrl+Shift+Space` |

The global binding is registered natively, detects collisions, and fails without preventing ordinary
launch. Platform modifiers never shadow macOS Control editing behavior. Every displayed binding runs
through the production registry and reports unavailable context honestly.

## 13. Local instrumentation

Instrumentation is local, explicit, and off by default. Disabled means no diagnostic file, writer,
periodic sampler, or measurable background work.

An enabled diagnostic session writes a versioned manifest, structured events, spans, errors, and
bounded CPU/memory samples under the platform `zd` diagnostic directory. Rotation, retention, and
total-size limits are mandatory. Disabling flushes and closes writers.

Events may carry stable project/thread/session IDs and redacted logical paths. They never contain
raw prompts, terminal transcripts, document contents, secrets, environment dumps, or full user
paths. A diagnostic fixture must let an agent reconstruct one slow interaction and one memory-growth
interval without private content.

## 14. Security and authority

The Tauri shell remains thin. Product modules use the typed platform boundary; only native code owns
operating-system authority.

- File access is a native-owned set of explicit project/worktree grants.
- Every path operation canonicalizes its target and rejects parent or symbolic-link escape.
- The frontend may choose among existing grants but cannot widen them by supplying a path.
- Markdown and agent-produced markup are untrusted. Raw HTML is inert, remote images are blocked,
  unsafe links do not activate, and HTTP(S) links open through the operating system.
- Terminal authority is expressed through structured sessions, never generic command execution.
- Notification content is privacy-minimal.
- Theme files are validated data, not plugins.
- Hiding, switching, removing, closing, and quitting each have distinct lifecycle semantics.

## 15. Accessibility

Every region, row, tab, action, editor state, terminal state, Git state, and notification route has a
stable accessible name, role, value, and state. The complete product is keyboard-operable.

Selection, focus, lifecycle, Git state, errors, and unavailable state are not exposed to assistive
technology through colour alone. Text scales without clipping. Focus order follows the visible
region order and survives collapse/restore. Reduce Motion removes the one optional focus transition.
CodeMirror virtualisation and large trees must not make off-screen content unreachable.

## 16. Performance contract

Release builds are measured on representative macOS and Windows hardware.

- A useful first frame appears before optional Git, syntax, history, diagnostics, or terminal work.
- Warm global summon is input-ready without visible Space or focus flicker.
- Text input appears in the receiving frame.
- Parsing, search, decoration, tree work, Git work, and terminal rendering are incremental,
  viewport-bounded, progressively loaded, or explicitly capped.
- Idle CPU is near zero. No feature introduces continuous polling, repaint, parsing, or sampling.
- Scrollback, queued terminal output, filesystem traversal, history, diagnostic storage, and cached
  clean sessions have explicit bounds.
- Project, theme, region, font, and window changes preserve the semantic viewport anchor.
- Large files, long lines, large trees, many inactive threads, and large repositories have release
  fixtures that record latency, memory, throughput, and idle behavior.

The current release baseline is recorded before each performance-sensitive goal begins. A regression
requires evidence and an explicit decision; it is not hidden behind a larger timeout.

## 17. Out of scope

- ACP transport or a first-party `zd` agent.
- Language servers, completion, diagnostics, refactoring, debugging, or a general IDE.
- A generic arbitrary-command IPC API.
- Remote projects, cloud sync, accounts, collaboration, or mobile delivery.
- An executable plugin framework. Installable themes are validated data.
- Git mutation: stage, commit, branch, merge, rebase, fetch, push, or conflict resolution.
- Workspace-wide content search; current-file Find and file-tree filtering remain separate.
- Automatically deleting a worktree, branch, dirty buffer, process, or terminal transcript.
- Multiple independent workbench/document windows in the initial product.

## 18. How completion is proven

Each feature goal closes only with its own unit, browser, native, accessibility, and release-build
evidence. Integration gates run the complete repository checks and exercise real state transitions
across project, thread, file, terminal, and notification boundaries.

Final acceptance requires:

1. the three launch forms enter one workbench;
2. multiple projects and terminal-backed threads survive repeated switching;
3. Markdown retains its established rendered editing behavior;
4. files, Git history, comparisons, and read-only diffs remain scoped and responsive;
5. quick access and notifications return to the exact context without losing work;
6. themes, diagnostics, errors, and unsupported platform features fail safely;
7. the website and user docs describe only verified released behavior; and
8. no active repository instruction directs implementation toward the retired product model.
