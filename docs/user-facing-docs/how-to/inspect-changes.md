# Inspect Git changes

Use **Changes** to review the active project/worktree without staging, committing, or changing Git
state. `zd` runs a fixed set of read-only Git operations inside the native-approved scope.

## Review the working tree

Choose **Changes** on the right. The list distinguishes added, modified, deleted, renamed,
conflicted, untracked, ignored, and submodule entries with visible text or accessible descriptions;
colour is never the only status signal.

Use the filter to narrow the bounded list. Select a change to open read-only base and head buffers.
The comparison cannot overwrite or dirty the live file.

## Browse history

Scroll the commit list and load another page when needed. History is bounded and progressively
loaded, so opening a large repository does not start an unbounded traversal.

Select two full commit entries to compare them. Then select a changed file to open its read-only
revision buffers. Binary, undecodable, missing, denied, and over-limit files show an explicit state
instead of guessed text.

## Handle an unavailable result

If the active folder is not a Git repository, **Changes** says so and **Files** remains usable. If
Git is not installed, the repository is outside the approved scope, or a bounded operation fails,
the panel reports that state without falling back to a shell command or arbitrary path.

Refreshes run only after bounded focus, disk, or manual signals. The file tree and Git panels do not
poll continuously while idle.
