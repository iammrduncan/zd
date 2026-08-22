# 0005: Own one versioned workbench state

## Status

Accepted

## Context

The first TypeScript application booted a selected miniapp and let that surface own the active
workspace and document. The workbench now needs projects, worktrees, threads, files, terminals,
region geometry, and attention to switch together.

If each region owns an active ID or stitches a switch together through local setters, a rendered
frame can combine different projects. Remounting a region can also destroy dirty text or running
processes that the view does not own.

The existing CodeMirror editor and platform boundary remain valuable deep modules. Replacing their
product behavior for a naming change would add risk without creating the required state boundary.

## Decision

We will boot one workbench shell instead of resolving a miniapp.

One versioned workbench state owner will hold stable project, worktree, thread, and open-file IDs,
plus region geometry and focus ownership. Views will observe immutable snapshots and request typed
transitions. They will not keep competing active IDs.

Project and thread activation will be one transaction. The state owner will ask dirty buffers,
terminal sessions, native grants, and unavailable resources to preserve, refuse, or recover before
it commits the new active context. A failed transition will leave the previous snapshot active.

Editor buffers and terminal process handles will remain inside their owning deep modules. Durable
workbench state will reference them by stable ID rather than serialize runtime objects.

The shell will expose Threads, current content, Files/Changes, and terminal-backed thread content as
regions of the same application. The CodeMirror document surface will remain the editor engine.

## Consequences

- Every region renders one coherent project/worktree/thread/file snapshot.
- View teardown cannot silently decide the fate of dirty text or live processes.
- State migrations need explicit schema versions and tests.
- Features must propose new state through the workbench interface instead of adding local globals.
- The former miniapp registry and boot path can be removed after launch, save, and close behavior
  migrate.
- Runtime owners need narrow preserve/refuse/recover protocols for transactional switching.
