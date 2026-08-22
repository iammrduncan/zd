import { describe, expect, it, vi } from "vitest";

import { ChangesController, type ChangesStatusSource } from "@/changes";
import type { GitAdapter, GitComparison, GitDiff, GitHistoryPage, GitStatusSnapshot } from "@/git";

const alpha = { projectId: "project-alpha", worktreeId: "worktree-alpha" };
const beta = { projectId: "project-beta", worktreeId: "worktree-beta" };

function status(scope = alpha): GitStatusSnapshot {
  return {
    scope,
    availability: "available",
    entries: [
      {
        id: `change-${scope.projectId}`,
        path: "src/main.ts",
        previousPath: null,
        state: "modified",
        indexState: null,
        worktreeState: "modified",
        submodule: false,
      },
    ],
    truncated: false,
    problem: null,
  };
}

function history(
  commits: GitHistoryPage["commits"],
  nextCursor: string | null,
  scope = alpha,
): GitHistoryPage {
  return {
    scope,
    availability: "available",
    commits,
    nextCursor,
    truncated: false,
    problem: null,
  };
}

function diff(): GitDiff {
  return {
    scope: alpha,
    availability: "available",
    base: {
      status: "text",
      identity: "buffer-base",
      path: "src/main.ts",
      revision: "a".repeat(40),
      text: "before\n",
      byteLength: 7,
    },
    head: {
      status: "text",
      identity: "buffer-head",
      path: "src/main.ts",
      revision: "working-tree",
      text: "after\n",
      byteLength: 6,
    },
    problem: null,
  };
}

function source(): ChangesStatusSource & { emit(snapshot: GitStatusSnapshot | null): void } {
  let current: GitStatusSnapshot | null = null;
  const listeners = new Set<(snapshot: GitStatusSnapshot | null) => void>();
  return {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: vi.fn(async () => undefined),
    emit: (snapshot) => {
      current = snapshot;
      for (const listener of listeners) listener(snapshot);
    },
  };
}

function git(): GitAdapter {
  return {
    status: vi.fn(async (scope) => status(scope)),
    history: vi.fn(async (request) => history([], null, request.scope)),
    compare: vi.fn(async (request): Promise<GitComparison> => ({
      scope: request.scope,
      availability: "available",
      baseCommitId: request.baseCommitId,
      headCommitId: request.headCommitId,
      entries: [],
      truncated: false,
      problem: null,
    })),
    diff: vi.fn(async () => diff()),
  };
}

describe("Changes controller", () => {
  it("keeps current status and appends bounded history pages", async () => {
    const statuses = source();
    const adapter = git();
    vi.mocked(adapter.history)
      .mockResolvedValueOnce(
        history(
          [
            { id: "c".repeat(40), parentIds: [], authorName: "A", authoredAt: 3, subject: "C" },
            { id: "b".repeat(40), parentIds: [], authorName: "A", authoredAt: 2, subject: "B" },
          ],
          "cursor-2",
        ),
      )
      .mockResolvedValueOnce(
        history(
          [{ id: "a".repeat(40), parentIds: [], authorName: "A", authoredAt: 1, subject: "A" }],
          null,
        ),
      );
    const controller = new ChangesController(adapter, statuses);
    controller.activate(alpha);
    statuses.emit(status());

    await controller.loadHistory();
    await controller.loadMoreHistory();

    expect(controller.snapshot()).toMatchObject({
      scope: alpha,
      status: { entries: [{ id: "change-project-alpha" }] },
      history: { commits: [{ subject: "C" }, { subject: "B" }, { subject: "A" }] },
      historyLoading: false,
    });
    expect(adapter.history).toHaveBeenNthCalledWith(2, {
      scope: alpha,
      cursor: "cursor-2",
      pageSize: 50,
    });
  });

  it("orders two selected commits and opens comparison entries by stable id", async () => {
    const statuses = source();
    const adapter = git();
    const newer = "c".repeat(40);
    const older = "b".repeat(40);
    vi.mocked(adapter.history).mockResolvedValueOnce(
      history(
        [
          { id: newer, parentIds: [older], authorName: "A", authoredAt: 2, subject: "new" },
          { id: older, parentIds: [], authorName: "A", authoredAt: 1, subject: "old" },
        ],
        null,
      ),
    );
    vi.mocked(adapter.compare).mockResolvedValueOnce({
      scope: alpha,
      availability: "available",
      baseCommitId: older,
      headCommitId: newer,
      entries: [
        {
          id: "comparison-change",
          path: "src/main.ts",
          previousPath: null,
          state: "modified",
          submodule: false,
        },
      ],
      truncated: false,
      problem: null,
    });
    const controller = new ChangesController(adapter, statuses);
    controller.activate(alpha);
    await controller.loadHistory();

    await controller.selectCommit(newer);
    await controller.selectCommit(older);
    await controller.openComparisonDiff("comparison-change");

    expect(adapter.compare).toHaveBeenCalledWith({
      scope: alpha,
      baseCommitId: older,
      headCommitId: newer,
    });
    expect(adapter.diff).toHaveBeenCalledWith({
      scope: alpha,
      source: {
        kind: "comparison",
        baseCommitId: older,
        headCommitId: newer,
        changeId: "comparison-change",
      },
    });
    expect(controller.snapshot().diff?.base.identity).toBe("buffer-base");
  });

  it("preserves per-scope filter state and rejects crossed-scope results", async () => {
    const statuses = source();
    const adapter = git();
    let resolveHistory!: (page: GitHistoryPage) => void;
    vi.mocked(adapter.history).mockImplementationOnce(
      () => new Promise((resolve) => (resolveHistory = resolve)),
    );
    const controller = new ChangesController(adapter, statuses);
    controller.activate(alpha);
    controller.setFilter("type:ts");
    const pending = controller.loadHistory();
    controller.activate(beta);
    controller.setFilter("readme");
    resolveHistory(history([], null, alpha));
    await pending;

    expect(controller.snapshot()).toMatchObject({ scope: beta, filter: "readme", history: null });
    controller.activate(alpha);
    expect(controller.snapshot()).toMatchObject({ scope: alpha, filter: "type:ts", history: null });
  });

  it("opens a working-tree diff without sending a path and can close it", async () => {
    const statuses = source();
    const adapter = git();
    const controller = new ChangesController(adapter, statuses);
    controller.activate(alpha);
    statuses.emit(status());

    await controller.openWorkingDiff("change-project-alpha");
    expect(adapter.diff).toHaveBeenCalledWith({
      scope: alpha,
      source: { kind: "working-tree", changeId: "change-project-alpha" },
    });
    expect(JSON.stringify(vi.mocked(adapter.diff).mock.calls)).not.toContain("path");
    controller.closeDiff();
    expect(controller.snapshot().diff).toBeNull();
  });
});
