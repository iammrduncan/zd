import { describe, expect, it, vi } from "vitest";

import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  parseWorkbenchState,
  type ThreadState,
  type WorkbenchState,
} from "@/workbench/state";

function stateWithoutThreads(): WorkbenchState {
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
        name: "feature",
        root: "/work/beta-feature",
        availability: "available",
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
      threadId: null,
      fileId: "file-a",
    },
  };
}

function thread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    id: "thread-b",
    projectId: "project-b",
    worktreeId: "worktree-b",
    name: "Build",
    order: 0,
    type: "terminal",
    agent: "shell",
    lifecycle: "starting",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attentionUnread: false,
    attentionVersion: 0,
    backingId: "terminal-thread-b",
    backingAvailability: "not-started",
    recovery: null,
    fileId: "file-b",
    ...overrides,
  };
}

describe("durable root thread state", () => {
  it("migrates a version-one session reference without treating it as a live handle", () => {
    const legacy = {
      ...stateWithoutThreads(),
      schemaVersion: 1,
      threads: [
        {
          id: "thread-a",
          projectId: "project-a",
          worktreeId: "worktree-a",
          name: "Plan",
          sessionId: "old-native-handle",
        },
      ],
      active: {
        projectId: "project-a",
        worktreeId: "worktree-a",
        threadId: "thread-a",
        fileId: "file-a",
      },
    };

    expect(parseWorkbenchState(legacy)).toMatchObject({
      schemaVersion: 2,
      threads: [
        {
          id: "thread-a",
          type: "terminal",
          agent: "shell",
          lifecycle: "unknown",
          backingId: "old-native-handle",
          backingAvailability: "missing",
          fileId: "file-a",
          recovery: { kind: "missing-session" },
        },
      ],
    });
  });

  it("creates and activates a thread in one complete publication", async () => {
    const owner = createWorkbenchStateOwner(stateWithoutThreads());
    const seen = vi.fn();
    owner.subscribe(seen);

    await expect(owner.addThread(thread())).resolves.toEqual({ status: "committed" });

    expect(seen).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toMatchObject({
      active: {
        projectId: "project-b",
        worktreeId: "worktree-b",
        threadId: "thread-b",
        fileId: "file-b",
      },
      regions: { focus: "thread" },
      threads: [{ id: "thread-b", backingId: "terminal-thread-b" }],
    });
  });

  it("restores the thread's remembered file in the same atomic activation", async () => {
    const initial = stateWithoutThreads();
    const owner = createWorkbenchStateOwner({ ...initial, threads: [thread()] });
    const seen = vi.fn();
    owner.subscribe(seen);

    await expect(owner.activateThread("thread-b")).resolves.toEqual({ status: "committed" });

    expect(owner.snapshot().active).toEqual({
      projectId: "project-b",
      worktreeId: "worktree-b",
      threadId: "thread-b",
      fileId: "file-b",
    });
    expect(owner.snapshot().regions.focus).toBe("thread");
    expect(seen).toHaveBeenCalledOnce();
  });

  it("refuses a missing worktree without exposing a partial context", async () => {
    const initial = stateWithoutThreads();
    const owner = createWorkbenchStateOwner({
      ...initial,
      worktrees: initial.worktrees.map((worktree) =>
        worktree.id === "worktree-b" ? { ...worktree, availability: "missing" } : worktree,
      ),
      threads: [thread()],
    });
    const seen = vi.fn();
    owner.subscribe(seen);

    await expect(owner.activateThread("thread-b")).resolves.toMatchObject({
      status: "refused",
      reason: expect.stringContaining("worktree-b"),
    });

    expect(owner.snapshot().active.projectId).toBe("project-a");
    expect(seen).not.toHaveBeenCalled();
  });

  it("retains a durable thread when refreshed grants no longer contain its worktree", async () => {
    const initial = stateWithoutThreads();
    const owner = createWorkbenchStateOwner({ ...initial, threads: [thread()] });
    const alpha = {
      id: "project-a",
      name: "Alpha",
      root: "/work/alpha",
      availability: "available" as const,
      worktrees: [
        {
          id: "worktree-a",
          name: "main",
          root: "/work/alpha",
          availability: "available" as const,
        },
      ],
    };
    const beta = {
      id: "project-b",
      name: "Beta",
      root: "/work/beta",
      availability: "available" as const,
      worktrees: [
        {
          id: "worktree-b-recovered",
          name: "feature",
          root: "/work/beta-feature-moved",
          availability: "available" as const,
        },
      ],
    };

    await owner.applyLaunch(
      { project: alpha, worktreeId: "worktree-a", relativePath: null, problem: null },
      [alpha, beta],
    );

    expect(owner.snapshot().threads).toHaveLength(1);
    expect(owner.snapshot().threads[0]).toMatchObject({
      id: "thread-b",
      worktreeId: "worktree-b",
    });
  });

  it("remembers file-only changes on the active thread", async () => {
    const initial = stateWithoutThreads();
    const owner = createWorkbenchStateOwner({
      ...initial,
      threads: [thread({ projectId: "project-a", worktreeId: "worktree-a", fileId: "file-a" })],
      active: { ...initial.active, threadId: "thread-b" },
    });

    await owner.activateFile({
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "notes.md",
    });

    expect(owner.snapshot().threads[0]).toMatchObject({
      id: "thread-b",
      fileId: expect.stringContaining("notes.md"),
    });
  });

  it("serializes thread ordering, attention acknowledgement, and visibility changes", async () => {
    const initial = stateWithoutThreads();
    const first = thread({ id: "one", order: 0, attentionUnread: true, attentionVersion: 3 });
    const second = thread({ id: "two", order: 1 });
    const owner = createWorkbenchStateOwner({ ...initial, threads: [first, second] });

    await expect(owner.reorderThreads("project-b", ["two", "one"])).resolves.toEqual({
      status: "committed",
    });
    await expect(owner.acknowledgeThreadAttention("one", 3)).resolves.toEqual({
      status: "committed",
    });
    await expect(owner.setThreadsVisibility("collapsed")).resolves.toEqual({
      status: "committed",
    });

    expect(
      owner.snapshot().threads.map(({ id, order, attentionUnread }) => ({
        id,
        order,
        attentionUnread,
      })),
    ).toEqual([
      { id: "one", order: 1, attentionUnread: false },
      { id: "two", order: 0, attentionUnread: false },
    ]);
    expect(owner.snapshot().regions.threads.visibility).toBe("collapsed");
  });

  it("removes an active closed thread with one safe same-workspace fallback", async () => {
    const initial = stateWithoutThreads();
    const active = thread({ id: "active", lifecycle: "exited", backingAvailability: "closed" });
    const fallback = thread({ id: "fallback", order: 1 });
    const owner = createWorkbenchStateOwner({
      ...initial,
      threads: [active, fallback],
      active: {
        projectId: "project-b",
        worktreeId: "worktree-b",
        threadId: "active",
        fileId: "file-b",
      },
    });
    const seen = vi.fn();
    owner.subscribe(seen);

    await expect(owner.removeThread("active")).resolves.toEqual({ status: "committed" });

    expect(owner.snapshot().threads.map(({ id }) => id)).toEqual(["fallback"]);
    expect(owner.snapshot().active).toMatchObject({
      projectId: "project-b",
      worktreeId: "worktree-b",
      threadId: "fallback",
    });
    expect(seen).toHaveBeenCalledOnce();
  });
});
