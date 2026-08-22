import { describe, expect, it } from "vitest";
import {
  appendGitHistoryPage,
  reconcileGitStatus,
  type GitChangeEntry,
  type GitHistoryPage,
  type GitStatusSnapshot,
} from "@/git";

const scope = { projectId: "project-a", worktreeId: "worktree-a" };

function entry(overrides: Partial<GitChangeEntry> = {}): GitChangeEntry {
  return {
    id: "git-stable",
    path: "notes.md",
    previousPath: null,
    state: "modified",
    indexState: null,
    worktreeState: "modified",
    submodule: false,
    ...overrides,
  };
}

function snapshot(entries: readonly GitChangeEntry[]): GitStatusSnapshot {
  return {
    scope,
    availability: "available",
    entries,
    truncated: false,
    problem: null,
  };
}

describe("Git status reconciliation", () => {
  it("preserves object identity for unchanged stable entries", () => {
    const retained = entry();
    const next = snapshot([entry()]);

    const reconciled = reconcileGitStatus(snapshot([retained]), next);

    expect(reconciled.entries[0]).toBe(retained);
    expect(reconciled.scope).toBe(next.scope);
  });

  it("keeps the stable id but replaces an entry whose state changed", () => {
    const previous = entry();
    const changed = entry({ state: "conflicted", indexState: "unmerged" });

    const reconciled = reconcileGitStatus(snapshot([previous]), snapshot([changed]));

    expect(reconciled.entries[0]?.id).toBe(previous.id);
    expect(reconciled.entries[0]).toBe(changed);
  });

  it("does not reconcile identities across project/worktree scopes", () => {
    const previous = snapshot([entry()]);
    const next = {
      ...snapshot([entry()]),
      scope: { projectId: "project-b", worktreeId: "worktree-b" },
    };

    expect(reconcileGitStatus(previous, next)).toBe(next);
  });
});

describe("progressive history", () => {
  it("appends pages in order and deduplicates a boundary commit by identity", () => {
    const first: GitHistoryPage = {
      scope,
      availability: "available",
      commits: [
        { id: "a", parentIds: ["b"], authorName: "A", authoredAt: 3, subject: "A" },
        { id: "b", parentIds: ["c"], authorName: "A", authoredAt: 2, subject: "B" },
      ],
      nextCursor: "cursor-2",
      truncated: false,
      problem: null,
    };
    const second: GitHistoryPage = {
      ...first,
      commits: [
        first.commits[1]!,
        { id: "c", parentIds: [], authorName: "A", authoredAt: 1, subject: "C" },
      ],
      nextCursor: null,
    };

    const combined = appendGitHistoryPage(first, second);

    expect(combined.commits.map((commit) => commit.id)).toEqual(["a", "b", "c"]);
    expect(combined.nextCursor).toBeNull();
  });

  it("refuses to combine history from another project/worktree", () => {
    const first: GitHistoryPage = {
      scope,
      availability: "available",
      commits: [],
      nextCursor: null,
      truncated: false,
      problem: null,
    };
    const next = {
      ...first,
      scope: { projectId: "project-b", worktreeId: "worktree-b" },
    };

    expect(() => appendGitHistoryPage(first, next)).toThrow("scope");
  });
});
