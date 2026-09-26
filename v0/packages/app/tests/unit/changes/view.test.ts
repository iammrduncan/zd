import { describe, expect, it, vi } from "vitest";

import {
  CHANGE_ROW_HEIGHT,
  ChangesController,
  mountChanges,
  type ChangesStatusSource,
} from "@/changes";
import type {
  GitAdapter,
  GitChangeEntry,
  GitComparison,
  GitDiff,
  GitHistoryPage,
  GitScope,
  GitStatusSnapshot,
} from "@/git";

const scope: GitScope = { projectId: "project-alpha", worktreeId: "worktree-alpha" };

function change(index: number, state: GitChangeEntry["state"] = "modified"): GitChangeEntry {
  return {
    id: `change-${index}`,
    path: `src/file-${String(index).padStart(5, "0")}.ts`,
    previousPath: null,
    state,
    indexState: null,
    worktreeState: state === "ignored" ? null : "modified",
    submodule: false,
  };
}

function status(
  entries: readonly GitChangeEntry[] = [change(1)],
  availability: GitStatusSnapshot["availability"] = "available",
): GitStatusSnapshot {
  return { scope, availability, entries, truncated: false, problem: null };
}

function statuses(): ChangesStatusSource & { emit(snapshot: GitStatusSnapshot | null): void } {
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

function diff(): GitDiff {
  return {
    scope,
    availability: "available",
    base: {
      status: "text",
      identity: "base-buffer",
      path: "src/file-00001.ts",
      revision: "a".repeat(40),
      text: "before\n",
      byteLength: 7,
    },
    head: {
      status: "text",
      identity: "head-buffer",
      path: "src/file-00001.ts",
      revision: "working-tree",
      text: "after\n",
      byteLength: 6,
    },
    problem: null,
  };
}

function adapter(history: GitHistoryPage | null = null): GitAdapter {
  return {
    status: vi.fn(async () => status()),
    history: vi.fn(
      async (request): Promise<GitHistoryPage> =>
        history ?? {
          scope: request.scope,
          availability: "available",
          commits: [],
          nextCursor: null,
          truncated: false,
          problem: null,
        },
    ),
    compare: vi.fn(async (request): Promise<GitComparison> => ({
      scope: request.scope,
      availability: "available",
      baseCommitId: request.baseCommitId,
      headCommitId: request.headCommitId,
      entries: [
        {
          id: "comparison-change",
          path: "src/file-00001.ts",
          previousPath: null,
          state: "modified",
          submodule: false,
        },
      ],
      truncated: false,
      problem: null,
    })),
    diff: vi.fn(async () => diff()),
  };
}

function fixture(history: GitHistoryPage | null = null) {
  const source = statuses();
  const git = adapter(history);
  const controller = new ChangesController(git, source);
  controller.activate(scope);
  return { source, git, controller };
}

describe("Changes view", () => {
  it("renders current states accessibly and opens a stable-ID diff", async () => {
    const { source, git, controller } = fixture();
    source.emit(status([change(1, "modified"), change(2, "deleted")]));
    const host = document.createElement("div");
    const unmount = mountChanges(host, controller);

    const modified = host.querySelector<HTMLButtonElement>("[data-change-id='change-1']")!;
    expect(modified.getAttribute("aria-label")).toContain("modified");
    expect(modified.textContent).toContain("src/file-00001.ts");
    expect(host.querySelector("[data-change-state='deleted']")?.textContent).toContain(
      "src/file-00002.ts",
    );
    modified.click();

    await vi.waitFor(() => expect(git.diff).toHaveBeenCalledOnce());
    expect(git.diff).toHaveBeenCalledWith({
      scope,
      source: { kind: "working-tree", changeId: "change-1" },
    });
    expect(JSON.stringify(vi.mocked(git.diff).mock.calls)).not.toContain("path");
    unmount();
  });

  it("loads history progressively and compares two selected commits", async () => {
    const newer = "c".repeat(40);
    const older = "b".repeat(40);
    const page: GitHistoryPage = {
      scope,
      availability: "available",
      commits: [
        { id: newer, parentIds: [older], authorName: "A", authoredAt: 2, subject: "new change" },
        { id: older, parentIds: [], authorName: "A", authoredAt: 1, subject: "old change" },
      ],
      nextCursor: "cursor-2",
      truncated: false,
      problem: null,
    };
    const { git, controller } = fixture(page);
    const host = document.createElement("div");
    const unmount = mountChanges(host, controller);

    await vi.waitFor(() => expect(host.querySelectorAll("[data-commit-id]")).toHaveLength(2));
    host.querySelector<HTMLButtonElement>(`[data-commit-id='${newer}']`)!.click();
    host.querySelector<HTMLButtonElement>(`[data-commit-id='${older}']`)!.click();
    await vi.waitFor(() => expect(git.compare).toHaveBeenCalledOnce());
    expect(host.querySelector("[data-comparison-change-id='comparison-change']")).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>("[data-load-more-history]")).not.toBeNull();
    unmount();
  });

  it("preserves its filter and reports a non-repository honestly", () => {
    const { source, controller } = fixture();
    source.emit(status([], "non-repository"));
    controller.setFilter("readme");
    const host = document.createElement("div");
    const unmount = mountChanges(host, controller);

    expect(host.querySelector<HTMLInputElement>("[aria-label='Filter changes']")?.value).toBe(
      "readme",
    );
    expect(host.textContent).toContain("not a Git repository");
    unmount();
  });

  it("keeps a large status list to a bounded live row window", () => {
    const { source, controller } = fixture();
    source.emit(status(Array.from({ length: 10_000 }, (_, index) => change(index))));
    const host = document.createElement("div");
    const unmount = mountChanges(host, controller);
    const viewport = host.querySelector<HTMLElement>("[data-changes-viewport='working']")!;
    Object.defineProperty(viewport, "clientHeight", { configurable: true, value: 220 });
    viewport.scrollTop = CHANGE_ROW_HEIGHT * 5_000;
    viewport.dispatchEvent(new Event("scroll"));

    const rows = host.querySelectorAll("[data-change-id]");
    expect(rows.length).toBeLessThan(40);
    expect(host.querySelector("[data-change-id='change-5000']")).not.toBeNull();
    unmount();
  });
});
