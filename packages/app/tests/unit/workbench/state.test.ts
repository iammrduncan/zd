import { describe, expect, it, vi } from "vitest";

import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  parseWorkbenchState,
  type WorkbenchContext,
  type WorkbenchState,
} from "@/workbench/state";

function populatedState(): WorkbenchState {
  return {
    ...defaultWorkbenchState(),
    projects: [
      { id: "project-a", name: "Alpha", root: "/work/alpha", availability: "available" },
      { id: "project-b", name: "Beta", root: "/work/beta", availability: "available" },
    ],
    worktrees: [
      {
        id: "worktree-a",
        projectId: "project-a",
        name: "main",
        root: "/work/alpha",
        availability: "available",
      },
      {
        id: "worktree-b",
        projectId: "project-b",
        name: "main",
        root: "/work/beta",
        availability: "available",
      },
    ],
    threads: [
      {
        id: "thread-a",
        projectId: "project-a",
        worktreeId: "worktree-a",
        name: "Plan",
        sessionId: "session-a",
      },
      {
        id: "thread-b",
        projectId: "project-b",
        worktreeId: "worktree-b",
        name: "Build",
        sessionId: "session-b",
      },
    ],
    openFiles: [
      {
        id: "file-a",
        projectId: "project-a",
        worktreeId: "worktree-a",
        relativePath: "README.md",
        bufferId: "buffer-a",
      },
      {
        id: "file-b",
        projectId: "project-b",
        worktreeId: "worktree-b",
        relativePath: "src/main.ts",
        bufferId: "buffer-b",
      },
    ],
    active: {
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: "file-a",
    },
  };
}

const beta: WorkbenchContext = {
  projectId: "project-b",
  worktreeId: "worktree-b",
  threadId: "thread-b",
  fileId: "file-b",
};

describe("the versioned workbench state", () => {
  it("starts with one safe region, focus, and theme contract", () => {
    expect(defaultWorkbenchState()).toMatchObject({
      schemaVersion: 1,
      active: { projectId: null, worktreeId: null, threadId: null, fileId: null },
      regions: {
        threads: { visibility: "full", width: 236 },
        files: { visibility: "visible", width: 280, tab: "files" },
        centre: { mode: "overlap", split: 0.42 },
        focus: "file",
      },
      window: { presentation: "ordinary" },
      theme: { selected: "system", lastValid: "current-light" },
    });
  });

  it("rejects unsupported or malformed persisted state without preventing launch", () => {
    expect(parseWorkbenchState({ schemaVersion: 2 })).toEqual(defaultWorkbenchState());
    expect(parseWorkbenchState({ schemaVersion: 1, projects: "not-an-array" })).toEqual(
      defaultWorkbenchState(),
    );
    expect(parseWorkbenchState("not state")).toEqual(defaultWorkbenchState());
  });

  it("accepts a valid version-one snapshot", () => {
    const state = populatedState();
    expect(parseWorkbenchState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });
});

describe("atomic workbench context transitions", () => {
  it("publishes one snapshot containing the complete target context", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const seen: WorkbenchContext[] = [];
    owner.subscribe((state) => seen.push(state.active));

    const result = await owner.activateContext(beta);

    expect(result).toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual(beta);
    expect(seen).toEqual([beta]);
  });

  it("refuses a mixed context before any observer can see it", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const seen = vi.fn();
    owner.subscribe(seen);

    const result = await owner.activateContext({ ...beta, fileId: "file-a" });

    expect(result).toMatchObject({ status: "refused", reason: expect.stringContaining("file-a") });
    expect(owner.snapshot().active.projectId).toBe("project-a");
    expect(seen).not.toHaveBeenCalled();
  });

  it("lets a dirty buffer refuse the switch and expose one recovery action", async () => {
    const recover = vi.fn();
    const owner = createWorkbenchStateOwner(populatedState());
    owner.registerTransitionGuard({
      id: "buffer-a",
      prepare: () => ({
        status: "refused",
        reason: "README.md has unsaved work",
        recovery: { label: "Save README.md", run: recover },
      }),
    });

    const result = await owner.activateContext(beta);

    expect(result).toMatchObject({
      status: "refused",
      reason: "README.md has unsaved work",
      recovery: { label: "Save README.md" },
    });
    expect(owner.snapshot().active.projectId).toBe("project-a");
    expect(recover).not.toHaveBeenCalled();
  });

  it("preserves the previous snapshot when a guard itself fails", async () => {
    const before = populatedState();
    const owner = createWorkbenchStateOwner(before);
    owner.registerTransitionGuard({
      id: "terminal-a",
      prepare: () => {
        throw new Error("terminal lifecycle unavailable");
      },
    });

    const result = await owner.activateContext(beta);

    expect(result).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("terminal lifecycle unavailable"),
    });
    expect(owner.snapshot()).toEqual(before);
  });
});

describe("root-owned region state", () => {
  it("clamps geometry and changes focus in one published snapshot", () => {
    const owner = createWorkbenchStateOwner();
    const seen = vi.fn();
    owner.subscribe(seen);

    owner.updateRegions({
      threads: { visibility: "collapsed", width: 50 },
      files: { visibility: "visible", width: 900, tab: "changes" },
      centre: { mode: "side-by-side", split: 0.9 },
      focus: "thread",
    });

    expect(owner.snapshot().regions).toEqual({
      threads: { visibility: "collapsed", width: 184 },
      files: { visibility: "visible", width: 360, tab: "changes" },
      centre: { mode: "side-by-side", split: 0.7 },
      focus: "thread",
    });
    expect(seen).toHaveBeenCalledOnce();
  });

  it("changes quick access presentation without changing work context", () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const before = owner.snapshot().active;

    owner.setWindowPresentation("quick-access");

    expect(owner.snapshot().window.presentation).toBe("quick-access");
    expect(owner.snapshot().active).toEqual(before);
  });
});
