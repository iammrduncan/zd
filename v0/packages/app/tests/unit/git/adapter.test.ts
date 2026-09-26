import { describe, expect, it, vi } from "vitest";
import {
  createTauriGitAdapter,
  unavailableGitAdapter,
  type GitComparison,
  type GitDiff,
  type GitHistoryPage,
  type GitStatusSnapshot,
} from "@/git";

const scope = { projectId: "project-a", worktreeId: "worktree-a" };

const status: GitStatusSnapshot = {
  scope,
  availability: "available",
  entries: [],
  truncated: false,
  problem: null,
};

const history: GitHistoryPage = {
  scope,
  availability: "available",
  commits: [],
  nextCursor: null,
  truncated: false,
  problem: null,
};

const comparison: GitComparison = {
  scope,
  availability: "available",
  baseCommitId: "a".repeat(40),
  headCommitId: "b".repeat(40),
  entries: [],
  truncated: false,
  problem: null,
};

const diff: GitDiff = {
  scope,
  availability: "available",
  base: {
    status: "text",
    identity: "base-buffer",
    path: "notes.md",
    revision: "a".repeat(40),
    text: "before\n",
    byteLength: 7,
  },
  head: {
    status: "text",
    identity: "head-buffer",
    path: "notes.md",
    revision: "working-tree",
    text: "after\n",
    byteLength: 6,
  },
  problem: null,
};

describe("the native Git adapter", () => {
  it("uses four closed commands with only scope, stable change, cursor, and commit identities", async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(status)
      .mockResolvedValueOnce(history)
      .mockResolvedValueOnce(comparison)
      .mockResolvedValueOnce(diff);
    const adapter = createTauriGitAdapter(invoke);

    await adapter.status(scope);
    await adapter.history({ scope, cursor: "a".repeat(40) + ":20", pageSize: 40 });
    await adapter.compare({
      scope,
      baseCommitId: comparison.baseCommitId,
      headCommitId: comparison.headCommitId,
    });
    await adapter.diff({
      scope,
      source: { kind: "working-tree", changeId: "git-change" },
    });

    expect(invoke.mock.calls).toEqual([
      ["git_status", { scope }],
      ["git_history_page", { request: { scope, cursor: "a".repeat(40) + ":20", pageSize: 40 } }],
      [
        "git_compare",
        {
          request: {
            scope,
            baseCommitId: comparison.baseCommitId,
            headCommitId: comparison.headCommitId,
          },
        },
      ],
      [
        "git_diff",
        {
          request: {
            scope,
            source: { kind: "working-tree", changeId: "git-change" },
          },
        },
      ],
    ]);
    const payload = JSON.stringify(invoke.mock.calls);
    expect(payload).not.toContain("path");
    expect(payload).not.toContain("command");
    expect(payload).not.toContain("arguments");
  });

  it("clamps history page sizes before crossing the native boundary", async () => {
    const invoke = vi.fn().mockResolvedValue(history);
    const adapter = createTauriGitAdapter(invoke);

    await adapter.history({ scope, cursor: null, pageSize: 50_000 });
    await adapter.history({ scope, cursor: null, pageSize: -1 });

    expect(invoke.mock.calls).toEqual([
      ["git_history_page", { request: { scope, cursor: null, pageSize: 200 } }],
      ["git_history_page", { request: { scope, cursor: null, pageSize: 1 } }],
    ]);
  });

  it("has an honest inert browser implementation for every repository operation", async () => {
    await expect(unavailableGitAdapter.status(scope)).resolves.toMatchObject({
      scope,
      availability: "unavailable",
      entries: [],
    });
    await expect(
      unavailableGitAdapter.history({ scope, cursor: null, pageSize: 20 }),
    ).resolves.toMatchObject({ scope, availability: "unavailable", commits: [] });
    await expect(
      unavailableGitAdapter.compare({
        scope,
        baseCommitId: comparison.baseCommitId,
        headCommitId: comparison.headCommitId,
      }),
    ).resolves.toMatchObject({
      scope,
      availability: "unavailable",
      baseCommitId: comparison.baseCommitId,
      headCommitId: comparison.headCommitId,
      entries: [],
    });
    await expect(
      unavailableGitAdapter.diff({
        scope,
        source: { kind: "working-tree", changeId: "git-change" },
      }),
    ).resolves.toMatchObject({
      scope,
      availability: "unavailable",
      problem: expect.any(String),
    });
  });
});
