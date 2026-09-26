import type {
  GitChangeEntry,
  GitCommit,
  GitHistoryPage,
  GitScope,
  GitStatusSnapshot,
} from "./types";

function sameScope(left: GitScope, right: GitScope): boolean {
  return left.projectId === right.projectId && left.worktreeId === right.worktreeId;
}

function sameEntry(left: GitChangeEntry, right: GitChangeEntry): boolean {
  return (
    left.id === right.id &&
    left.path === right.path &&
    left.previousPath === right.previousPath &&
    left.state === right.state &&
    left.indexState === right.indexState &&
    left.worktreeState === right.worktreeState &&
    left.submodule === right.submodule
  );
}

/**
 * Reuses unchanged entries by their native stable id. A tree can retain
 * selection and row state without treating array position as file identity.
 */
export function reconcileGitStatus(
  previous: GitStatusSnapshot,
  next: GitStatusSnapshot,
): GitStatusSnapshot {
  if (!sameScope(previous.scope, next.scope)) return next;
  const previousById = new Map(previous.entries.map((entry) => [entry.id, entry]));
  const entries = next.entries.map((entry) => {
    const prior = previousById.get(entry.id);
    return prior && sameEntry(prior, entry) ? prior : entry;
  });
  return { ...next, entries };
}

function sameCommit(left: GitCommit, right: GitCommit): boolean {
  return (
    left.id === right.id &&
    left.authorName === right.authorName &&
    left.authoredAt === right.authoredAt &&
    left.subject === right.subject &&
    left.parentIds.length === right.parentIds.length &&
    left.parentIds.every((parent, index) => parent === right.parentIds[index])
  );
}

/** Append one bounded page while retaining commit identity at page boundaries. */
export function appendGitHistoryPage(
  previous: GitHistoryPage,
  next: GitHistoryPage,
): GitHistoryPage {
  if (!sameScope(previous.scope, next.scope)) {
    throw new Error("Cannot append Git history from another project/worktree scope");
  }
  const commits = [...previous.commits];
  const indexes = new Map(commits.map((commit, index) => [commit.id, index]));
  for (const commit of next.commits) {
    const index = indexes.get(commit.id);
    if (index === undefined) {
      indexes.set(commit.id, commits.length);
      commits.push(commit);
    } else if (!sameCommit(commits[index]!, commit)) {
      commits[index] = commit;
    }
  }
  return { ...next, commits };
}
