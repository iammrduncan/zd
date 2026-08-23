import { describe, expect, it, vi } from "vitest";

import { FileTreeController } from "@/files";
import type {
  FileTreeActions,
  FileTreeAdapter,
  FileTreeMetric,
  FileTreeResult,
  NativeFileTreeEntry,
} from "@/files";

function entry(relativePath: string, kind: "directory" | "file" = "file"): NativeFileTreeEntry {
  const index = relativePath.lastIndexOf("/");
  return {
    relativePath,
    parentPath: index < 0 ? null : relativePath.slice(0, index),
    name: relativePath.slice(index + 1),
    kind,
    ignored: false,
    byteLength: kind === "file" ? 10 : null,
    modified: 1,
  };
}

function ready(
  revision: string,
  entries: readonly NativeFileTreeEntry[],
  overrides: Partial<Extract<FileTreeResult, { status: "ready" }>> = {},
): FileTreeResult {
  return {
    status: "ready",
    projectId: "alpha",
    worktreeId: "alpha-root",
    revision,
    entries,
    truncated: false,
    ignoredTruncated: false,
    unreadableDirectories: 0,
    elapsedMicros: 100,
    ...overrides,
  };
}

function sequence(results: readonly (FileTreeResult | Error)[]): FileTreeAdapter & {
  snapshot: ReturnType<typeof vi.fn>;
} {
  let index = 0;
  return {
    snapshot: vi.fn(async () => {
      const result = results[Math.min(index++, results.length - 1)]!;
      if (result instanceof Error) throw result;
      return result;
    }),
    watch: () => () => {},
  };
}

const scope = { projectId: "alpha", worktreeId: "alpha-root" } as const;

describe("FileTreeController", () => {
  it("loads one scope and preserves expansion, selection, scroll, and active file on refresh", async () => {
    const adapter = sequence([
      ready("one", [entry("src", "directory"), entry("src/a.ts"), entry("notes.md")]),
      ready("two", [
        entry("src", "directory"),
        entry("src/a.ts"),
        entry("src/b.ts"),
        entry("notes.md"),
      ]),
    ]);
    const controller = new FileTreeController(adapter);
    await controller.activate(scope, "notes.md");
    controller.expand("src");
    controller.select("src/a.ts");
    controller.setScroll({ top: 120, left: 45 });

    await controller.refresh("disk");

    expect(controller.snapshot()).toMatchObject({
      state: "ready",
      selectedPath: "src/a.ts",
      activePath: "notes.md",
      scroll: { top: 120, left: 45 },
      revision: "two",
    });
    expect(controller.snapshot().expandedPaths.has("src")).toBe(true);
    expect(controller.rows().map((row) => row.entry.relativePath)).toEqual([
      "src",
      "src/a.ts",
      "src/b.ts",
      "notes.md",
    ]);
  });

  it("restores pre-filter selection and both scroll axes when clearing", async () => {
    const controller = new FileTreeController(
      sequence([ready("one", [entry("src", "directory"), entry("src/a.ts"), entry("notes.md")])]),
    );
    await controller.activate(scope);
    controller.select("notes.md");
    controller.setScroll({ top: 81, left: 37 });
    controller.summonFilter();
    controller.setFilter("type:code");
    controller.select("src/a.ts");
    controller.setScroll({ top: 19, left: 90 });

    controller.setFilter("");

    expect(controller.snapshot()).toMatchObject({
      selectedPath: "notes.md",
      scroll: { top: 81, left: 37 },
      filterOpen: true,
    });
  });

  it("keeps independent view memory when projects switch", async () => {
    const adapter: FileTreeAdapter = {
      snapshot: vi.fn(async (request) =>
        ready(request.projectId, [entry("src", "directory"), entry("src/main.ts")], {
          projectId: request.projectId,
          worktreeId: request.worktreeId,
        }),
      ),
      watch: () => () => {},
    };
    const controller = new FileTreeController(adapter);
    await controller.activate(scope);
    controller.expand("src");
    controller.select("src/main.ts");
    controller.setScroll({ top: 42, left: 11 });
    await controller.activate({ projectId: "beta", worktreeId: "beta-root" });
    controller.select("src");

    await controller.activate(scope);

    expect(controller.snapshot()).toMatchObject({
      selectedPath: "src/main.ts",
      scroll: { top: 42, left: 11 },
    });
    expect(controller.snapshot().expandedPaths.has("src")).toBe(true);
    expect(adapter.snapshot).toHaveBeenCalledTimes(3);
  });

  it("coalesces refresh bursts into one follow-up instead of polling", async () => {
    let resolveFirst!: (result: FileTreeResult) => void;
    const first = new Promise<FileTreeResult>((resolve) => {
      resolveFirst = resolve;
    });
    const adapter: FileTreeAdapter = {
      snapshot: vi
        .fn()
        .mockImplementationOnce(() => first)
        .mockResolvedValueOnce(ready("two", [entry("a.md"), entry("b.md")])),
      watch: () => () => {},
    };
    const controller = new FileTreeController(adapter);
    const activation = controller.activate(scope);
    const refreshOne = controller.refresh("disk");
    const refreshTwo = controller.refresh("disk");
    resolveFirst(ready("one", [entry("a.md")]));

    await Promise.all([activation, refreshOne, refreshTwo]);

    expect(adapter.snapshot).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().revision).toBe("two");
  });

  it("routes file activation through the root action and keeps refusals local", async () => {
    const actions: FileTreeActions & { activateFile: ReturnType<typeof vi.fn> } = {
      activateFile: vi.fn(async () => ({ status: "refused" as const, reason: "README is dirty" })),
    };
    const controller = new FileTreeController(
      sequence([ready("one", [entry("notes.md")])]),
      actions,
    );
    await controller.activate(scope);
    controller.select("notes.md");

    await controller.activateSelected();

    expect(actions.activateFile).toHaveBeenCalledExactlyOnceWith({
      projectId: "alpha",
      worktreeId: "alpha-root",
      relativePath: "notes.md",
    });
    expect(controller.snapshot()).toMatchObject({
      activePath: null,
      notice: "README is dirty",
    });
  });

  it("keeps useful rows through refresh failure and rejects crossed-scope responses", async () => {
    const controller = new FileTreeController(
      sequence([
        ready("one", [entry("notes.md")]),
        new Error("watch refresh failed"),
        ready("crossed", [entry("secret.md")], { projectId: "other" }),
      ]),
    );
    await controller.activate(scope);
    await controller.refresh("focus");
    expect(controller.snapshot()).toMatchObject({ state: "ready", notice: "watch refresh failed" });
    expect(controller.snapshot().entries.map(({ relativePath }) => relativePath)).toEqual([
      "notes.md",
    ]);

    await controller.refresh("manual");
    expect(controller.snapshot().notice).toBe("A stale file-tree response was refused.");
    expect(controller.snapshot().entries.map(({ relativePath }) => relativePath)).toEqual([
      "notes.md",
    ]);
  });

  it("retains bounded-tree context when a refresh reports no disk changes", async () => {
    const controller = new FileTreeController(
      sequence([
        ready("one", [entry("notes.md")], { truncated: true }),
        {
          ...scope,
          status: "unchanged",
          revision: "one",
          elapsedMicros: 20,
        },
      ]),
    );
    await controller.activate(scope);
    await controller.refresh("focus");

    expect(controller.snapshot().notice).toContain("bounded file-tree limit");
  });

  it("reports watcher failure without replacing rows or bounded-tree context", async () => {
    const controller = new FileTreeController(
      sequence([ready("one", [entry("notes.md")], { truncated: true })]),
    );
    await controller.activate(scope);

    controller.setWatchProblem("Automatic updates are unavailable.");

    expect(controller.snapshot()).toMatchObject({ state: "ready", revision: "one" });
    expect(controller.snapshot().entries.map(({ relativePath }) => relativePath)).toEqual([
      "notes.md",
    ]);
    expect(controller.snapshot().notice).toContain("bounded file-tree limit");
    expect(controller.snapshot().notice).toContain("Automatic updates are unavailable.");

    controller.setWatchProblem(null);
    expect(controller.snapshot().notice).toBe("The project exceeds the bounded file-tree limit.");
  });

  it("adds Git state without status letters and records path-free measurements", async () => {
    const metrics: FileTreeMetric[] = [];
    const controller = new FileTreeController(
      sequence([ready("one", [entry("notes.md")], { truncated: true })]),
      undefined,
      {
        record: (metric) => {
          metrics.push(metric);
        },
      },
    );
    await controller.activate(scope);
    controller.reconcileGit(
      new Map([
        ["notes.md", "modified"],
        ["removed.md", "deleted"],
      ]),
    );
    controller.summonFilter();
    controller.setFilter("markdown");

    expect(controller.snapshot().entries[0]?.gitState).toBe("modified");
    expect(
      controller.snapshot().entries.find(({ relativePath }) => relativePath === "removed.md"),
    ).toMatchObject({ gitState: "deleted", byteLength: null });
    expect(controller.snapshot().notice).toContain("bounded file-tree limit");
    expect(metrics.some((metric) => metric.operation === "refresh")).toBe(true);
    expect(JSON.stringify(metrics)).not.toContain("notes.md");
  });

  it("routes validated create, rename, and Trash operations through scoped actions", async () => {
    const actions: FileTreeActions = {
      activateFile: vi.fn(async () => ({ status: "committed" as const })),
      createEntry: vi.fn(async () => {}),
      renameEntry: vi.fn(async () => {}),
      trashEntry: vi.fn(async () => {}),
    };
    const controller = new FileTreeController(
      sequence([ready("one", [entry("docs", "directory"), entry("docs/notes.md")])]),
      actions,
    );
    await controller.activate(scope);

    await expect(controller.createEntry("docs", "new.md", "file")).resolves.toBe(true);
    await expect(controller.renameEntry("docs/notes.md", "draft.md")).resolves.toBe(true);
    await expect(controller.trashEntry("docs/notes.md")).resolves.toBe(true);

    expect(actions.createEntry).toHaveBeenCalledWith(
      { ...scope, relativePath: "docs/new.md" },
      "file",
    );
    expect(actions.renameEntry).toHaveBeenCalledWith(
      { ...scope, relativePath: "docs/notes.md" },
      "draft.md",
    );
    expect(actions.trashEntry).toHaveBeenCalledWith({
      ...scope,
      relativePath: "docs/notes.md",
    });
  });

  it("does not publish a completed mutation after its project loses focus", async () => {
    let finishCreate!: () => void;
    const createPending = new Promise<void>((resolve) => {
      finishCreate = resolve;
    });
    const actions: FileTreeActions = {
      activateFile: vi.fn(async () => ({ status: "committed" as const })),
      createEntry: vi.fn(() => createPending),
    };
    const adapter: FileTreeAdapter = {
      snapshot: vi.fn(async (request) =>
        ready(request.projectId, [entry("docs", "directory")], {
          projectId: request.projectId,
          worktreeId: request.worktreeId,
        }),
      ),
      watch: () => () => {},
    };
    const controller = new FileTreeController(adapter, actions);
    await controller.activate(scope);

    const creation = controller.createEntry("docs", "new.md", "file");
    await controller.activate({ projectId: "beta", worktreeId: "beta-root" });
    finishCreate();

    await expect(creation).resolves.toBe(false);
    expect(controller.snapshot()).toMatchObject({
      scope: { projectId: "beta", worktreeId: "beta-root" },
      selectedPath: null,
      notice: null,
    });
  });

  it("keeps invalid names and protected metadata out of mutation actions", async () => {
    const actions: FileTreeActions = {
      activateFile: vi.fn(async () => ({ status: "committed" as const })),
      createEntry: vi.fn(async () => {}),
      renameEntry: vi.fn(async () => {}),
      trashEntry: vi.fn(async () => {}),
    };
    const controller = new FileTreeController(
      sequence([ready("one", [entry(".git", "directory"), entry("notes.md")])]),
      actions,
    );
    await controller.activate(scope);

    await expect(controller.createEntry(null, "../escape", "file")).resolves.toBe(false);
    await expect(controller.renameEntry(".git", "metadata")).resolves.toBe(false);
    await expect(controller.trashEntry(".git")).resolves.toBe(false);

    expect(actions.createEntry).not.toHaveBeenCalled();
    expect(actions.renameEntry).not.toHaveBeenCalled();
    expect(actions.trashEntry).not.toHaveBeenCalled();
    expect(controller.snapshot().notice).toBe("Repository metadata is protected.");
  });

  it.each(["empty", "missing", "denied", "not-directory", "unavailable"] as const)(
    "exposes the %s state explicitly",
    async (status) => {
      const result: FileTreeResult =
        status === "empty"
          ? { ...scope, status, revision: "empty", elapsedMicros: 1 }
          : status === "unavailable"
            ? { ...scope, status, problem: "native unavailable" }
            : { ...scope, status };
      const controller = new FileTreeController(sequence([result]));
      await controller.activate(scope);
      expect(controller.snapshot().state).toBe(status);
    },
  );
});
