# File Tree Goal

Status: **complete — 2026-08-22**

## Outcome

The project navigation region has two coherent views: Files for the active project/worktree and
Changes for its Git state, history, comparisons, and read-only diffs.

## Visual References

- [Approved overlap workbench](assets/workbench-light-overlap-v2.png) and
  [approved side-by-side workbench](assets/workbench-light-side-by-side-v2.png) define the compact
  right-side Files/Changes region, expanded tree density, small file-type icons, shallow nesting,
  and Git state expressed through filename/icon colour.
- [Current reader](../../../user-facing-docs/assets/zd-reader.jpeg) records the actual navigation
  typography, selection hairline, surfaces, and restrained light-theme treatment to preserve while
  moving project navigation to the right.

The concepts do not define Git behavior, filtering, accessibility alternatives, or exact sample
paths. Apply the shared Visual Reference Contract in `goal.md`.

## Acceptance Criteria

1. The region has keyboard-accessible Files and Changes tabs that preserve independent selection,
   expansion, filter, and scroll state while switching.
2. Files renders the complete approved project hierarchy with stable nesting guides, file-type
   icons plus accessible labels, deterministic ordering, and explicit loading, empty, denied, and
   unavailable states.
3. Files scrolls vertically and horizontally without changing row height or clipping long paths.
   Keyboard navigation can reach every visible entry and expand/collapse directories.
4. A focused filter narrows by filename/path terms and supported file-type categories. Clearing it
   restores the same expanded tree and selection. Workspace content search is not implied by this
   filter.
5. Native watching or bounded refresh updates changed paths without rescanning continuously,
   stealing selection, collapsing directories, or moving the active file.
6. Git state reconciles filesystem and repository data so added, modified, deleted, renamed,
   conflicted, untracked, ignored, and submodule entries are represented correctly. State is never
   communicated by colour alone.
7. Ignored entries are visually de-emphasized when shown, but traversal is bounded so ignored
   dependency/build directories cannot freeze the UI or consume unbounded memory.
8. Changes lists current uncommitted changes and remains useful outside a Git repository with an
   honest unavailable state. This goal does not add staging, committing, branch mutation, or push.
9. A user can browse bounded commit history, select a previous commit, and compare two commits.
   History is loaded progressively and does not block ordinary Files interaction.
10. Opening a change or comparison uses the Editor Goal's read-only diff contract. The current and
    revision buffers have explicit identities; diff navigation cannot overwrite or mark the live
    document dirty.
11. Large-tree and large-repository fixtures measure initial paint, filter, expand, status refresh,
    history paging, memory, and idle CPU in a release build.
12. Unit, browser, and native tests cover filtering, scrolling, accessibility, watch updates, every
    Git state, non-repository behavior, ignored-path bounds, history, comparison, and editor diff
    integration.
13. file tree/directory tree updates as files on disk change.

## Completion Evidence

- `packages/app/src/files/` owns the persistent Files controller, compact 19 px virtualized tree,
  roving keyboard navigation, filtering, expansion/selection/scroll restoration, bounded refresh,
  and Git-state reconciliation without continuous polling.
- Native file snapshots use project/worktree IDs, cap ordinary and ignored entries, never descend
  ignored directories, report unreadable/truncated states, and reject path/traversal knobs.
- `packages/app/src/git/`, native Git inspection, and `packages/app/src/changes/` provide bounded
  read-only status, progressive frozen-head history, commit comparison, Changes virtualization, and
  identity-safe read-only editor diffs without staging or repository mutation.
- A 10,004-entry browser fixture mounted 23 live rows in 27.2 ms and preserved state through filter,
  expansion, and refresh. The native 4,096-file fixture returned its 2,048-entry proof cap in
  14.02 ms; Git release fixtures remained within their documented process/output bounds.
- Unit, Chromium, and Rust fixtures cover every represented Git state, ignored/deleted synthesis,
  non-repositories, large trees, history paging, comparisons, diff safety, accessibility, and idle
  behavior.

## Terminal Condition

A user can navigate and filter a large active project, understand its complete Git state, inspect
uncommitted and historical changes, compare revisions, and open a safe diff without project-context
drift or continuous background work.

## Dependencies

- Files requires the Workbench Reorganization and Projects goals.
- Structured Git status/history requires a scoped native Git boundary.
- Diff integration requires the Editor Goal's read-only buffer contract.
- Files UI, Git data service, and editor diff support may begin in parallel behind fixed interfaces;
  Changes integration is sequential after all three are stable.

## Exclusions

- Editing names or paths, staging, committing, branching, merging, rebasing, fetching, pushing, or
  resolving conflicts.
- Workspace-wide file-content search.
- Unbounded eager traversal of ignored or historical content.
