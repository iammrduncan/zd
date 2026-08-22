# File Tree Goal

## Outcome

The project navigation region has two coherent views: Files for the active project/worktree and
Changes for its Git state, history, comparisons, and read-only diffs.

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
