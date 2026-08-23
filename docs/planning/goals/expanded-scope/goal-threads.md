# Threads Goal

Status: **complete — 2026-08-22**

## Outcome

Threads organize project-scoped terminal and future agent sessions, show where attention is needed,
and switch the complete workbench to the thread's project/worktree without losing inactive work.

## Visual References

- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) defines the compact left-side
  project/thread hierarchy and the state in which a selected thread owns the centre surface.
- [Approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) defines the state in
  which the active thread remains beside the selected file.

The project and thread names, lifecycle copy, and colours in the concepts are illustrative; this
goal owns their real state and accessible presentation. Apply the shared Visual Reference Contract
in `goal.md`.

## Acceptance Criteria

1. A thread has a stable ID, project ID, optional worktree context, type, name, order, lifecycle,
   attention state, and backing session reference. Runtime terminal handles are not serialized into
   durable project state.
2. The initial thread type wraps one terminal session. The model leaves a narrow future adapter for
   ACP without implementing ACP or forcing terminal behavior through an ACP abstraction.
3. The Threads region sits in the approved workbench location and can be full width, collapsed to
   labelled icons, or hidden. Each state remains keyboard-operable and restores its selection.
4. A row shows the thread name, terminal/agent type, current lifecycle and attention state, and
   worktree. Icons supplement accessible text and never carry the only status signal.
5. The lifecycle distinguishes at least starting, idle, busy, waiting, exited, failed, and unknown.
   `waiting` means a previously busy supported agent is ready for user attention; merely printing
   output does not create repeated completion events.
6. Activating a thread atomically activates its project and worktree, then restores its file,
   terminal, and region state. A missing project, worktree, or backing process produces a recoverable
   thread state rather than a partial context switch.
7. A user can create, rename, reorder, activate, close, and remove threads. Closing a live process,
   dirty document, or worktree requires the owning feature's explicit safe action.
8. A thread may attach to the project root, an existing worktree, or a newly created worktree.
   Worktree creation uses structured Git operations, detects collisions/locks, and never deletes a
   worktree automatically when the thread closes.
9. One transition to `waiting` emits one versioned attention event. Threads owns the state and
   event; Notifications owns desktop presentation and sound.
10. Large thread counts virtualize or defer inactive rendering only when measurement shows need.
    Inactive threads and status detection do not create continuous polling or repaint.
11. Unit, browser, Git-integration, and native tests cover lifecycle transitions, attention
    deduplication, region modes, activation, missing resources, thread operations, worktree safety,
    terminal cleanup, and project isolation.

## Completion Evidence

- `packages/app/src/threads/` owns stable thread records, lifecycle/attention reduction, the compact
  project-nested region, create/rename/reorder/activate/close/remove/recover operations, and terminal
  presentation while keeping runtime handles out of durable state.
- The `PROJECTS` header switches the left region between its saved full width and a 56 px rail of
  project monograms plus labelled thread icons without changing active context or live sessions.
- The root thread coordinator resolves project/worktree scope, attaches scoped terminal sessions,
  restores project/worktree/thread/file/region state atomically, and serializes lifecycle changes
  with transition guards.
- Structured native worktree creation validates names/revisions/collisions, runs only the approved
  Git operation, grants the resulting worktree, and never couples thread close/remove to destructive
  worktree or branch cleanup.
- Versioned supported-agent detection emits one attention event only for a new busy-to-waiting
  transition; duplicates and out-of-order lifecycle revisions are ignored.
- Chromium mounted 1,000 project-grouped rows in 5.50 ms with no interval polling. Unit, browser,
  native PTY, worktree, and root-integration tests cover operations, region modes, missing resources,
  cleanup, isolation, and attention deduplication.

## Terminal Condition

A user can run and organize many terminal-backed threads across projects/worktrees, identify the
single threads awaiting attention, and switch among them without losing state, leaking authority,
or creating unsafe worktree/process side effects.

## Dependencies

- Requires stable Projects and Terminal lifecycle contracts plus the workbench layout/focus owner.
- The state/UI portion may be built against a fake terminal adapter in parallel with the PTY work;
  lifecycle integration is sequential after the Terminal contract stabilizes.
- Produces the attention event consumed by Notifications.

## Exclusions

- ACP or first-party agent implementations.
- Automatically deleting worktrees, branches, or uncommitted changes.
- Persisting live process handles or raw terminal transcripts as project metadata.
