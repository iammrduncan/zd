# Projects Goal

## Outcome

One `zd` session can hold multiple user-approved folders as projects. Activating a project changes
every project-scoped workbench region together while preserving inactive projects and their work.

## Acceptance Criteria

1. A project has a stable ID, canonical root, display name, order, availability state, and native
   filesystem grant. Adding the same canonical root twice activates the existing project rather
   than creating competing identities.
2. A user can add, open, reorder, activate, and remove projects without restarting `zd`.
3. Activating a project updates Threads, current file, Files, Changes, terminal context, and
   project-scoped commands in one state transition. No region briefly shows a different project.
4. Project switching preserves each project's open file, selection, scroll position, tree state,
   thread selection, and live terminals for the current session.
5. Removing or losing access to a project cannot silently discard a dirty document, kill a process,
   or delete a worktree. The project remains recoverable or removal is refused until the user
   resolves the named work.
6. `cmd+1` through `cmd+9` on macOS and the approved Windows equivalents activate the corresponding
   visible project. Projects beyond the shortcut range remain reachable through the project UI and
   command registry.
7. Pointer activation, including the approved modified-click behavior, invokes the same project
   transition as keyboard activation.
8. A thread may select a Git worktree within its owning project without creating a second project.
   The active workspace context names both the project root and selected worktree explicitly.
9. Unavailable, moved, denied, and non-directory roots remain visible with a specific recovery
   state rather than causing launch failure or being silently removed.
10. Unit, browser, and native tests cover identity, duplicate roots, ordering, shortcuts, context
    synchronization, unavailable roots, grant boundaries, dirty buffers, and live terminals.

## Terminal Condition

A user can work in at least two projects, switch between them repeatedly by pointer and keyboard,
and recover the exact project-scoped state without leaked authority or lost document/process state.

## Dependencies

- Requires the Workbench Reorganization Goal's state owner, region contracts, and multi-grant
  platform boundary.
- Provides the project-context contract required by File Tree, Terminal, and Threads.

## Exclusions

- Cloud workspaces, remote folders, project templates, or nested project graphs.
- Treating every Git worktree as a top-level project.
- Cross-restart restoration unless a later persistence decision adds it explicitly.
