import { describe, expect, it, vi } from "vitest";

import {
  ThreadsController,
  type CreateThreadRequest,
  type ThreadActionResult,
  type ThreadRecord,
  type ThreadWorkbenchAdapter,
  type ThreadWorkbenchSnapshot,
} from "@/threads";

const committed: ThreadActionResult = { status: "committed" };

function record(id: string, order = 0): ThreadRecord {
  return {
    id,
    projectId: "project-alpha",
    worktree: {
      id: "project-alpha-root",
      label: "project root",
      kind: "project-root",
      availability: "available",
    },
    name: id,
    order,
    type: { kind: "terminal", agent: "shell" },
    lifecycle: "idle",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attention: { unread: false, version: 0 },
    backing: { kind: "terminal", referenceId: `session-${id}`, availability: "ready" },
    recovery: null,
  };
}

function snapshot(): ThreadWorkbenchSnapshot {
  return {
    projects: [{ id: "project-alpha", name: "Alpha", order: 0, availability: "available" }],
    threads: [record("first", 0), record("second", 1)],
    activeThreadId: "first",
    visibility: "full",
  };
}

function adapter(current = snapshot()) {
  const workbench: ThreadWorkbenchAdapter & {
    createThread: ReturnType<typeof vi.fn>;
    renameThread: ReturnType<typeof vi.fn>;
    reorderThreads: ReturnType<typeof vi.fn>;
    activateThread: ReturnType<typeof vi.fn>;
    closeThread: ReturnType<typeof vi.fn>;
    removeThread: ReturnType<typeof vi.fn>;
    recoverThread: ReturnType<typeof vi.fn>;
    setThreadsVisibility: ReturnType<typeof vi.fn>;
    acknowledgeAttention: ReturnType<typeof vi.fn>;
  } = {
    snapshot: () => current,
    subscribe: () => () => {},
    createThread: vi.fn(async () => committed),
    renameThread: vi.fn(async () => committed),
    reorderThreads: vi.fn(async () => committed),
    activateThread: vi.fn(async () => committed),
    closeThread: vi.fn(async () => committed),
    removeThread: vi.fn(async () => committed),
    recoverThread: vi.fn(async () => committed),
    setThreadsVisibility: vi.fn(async () => committed),
    acknowledgeAttention: vi.fn(async () => committed),
  };
  return workbench;
}

describe("the Threads controller", () => {
  it("creates only a structured terminal thread target without a path or executable", async () => {
    const workbench = adapter();
    const controller = new ThreadsController(workbench);
    const request: CreateThreadRequest = {
      name: "Review",
      type: { kind: "terminal", agent: "codex" },
      workspace: {
        kind: "new-worktree",
        projectId: "project-alpha",
        name: "review",
        branch: "feature/review",
        baseRevision: "main",
      },
    };

    await controller.createThread(request);

    expect(workbench.createThread).toHaveBeenCalledExactlyOnceWith(request);
    expect(request).not.toHaveProperty("path");
    expect(request).not.toHaveProperty("command");
    expect(request).not.toHaveProperty("environment");
  });

  it("rejects blank names and malformed structured worktree fields before native work", async () => {
    const workbench = adapter();
    const controller = new ThreadsController(workbench);

    await expect(
      controller.createThread({
        name: " ",
        type: { kind: "terminal", agent: "shell" },
        workspace: {
          kind: "new-worktree",
          projectId: "project-alpha",
          name: "../outside",
          branch: "feature/test",
          baseRevision: null,
        },
      }),
    ).resolves.toMatchObject({ status: "refused" });
    expect(workbench.createThread).not.toHaveBeenCalled();
  });

  it("routes activation through one root-owned atomic operation", async () => {
    const workbench = adapter();
    const controller = new ThreadsController(workbench);

    await controller.activateThread("second");

    expect(workbench.activateThread).toHaveBeenCalledExactlyOnceWith("second");
  });

  it("submits a complete project-local order", async () => {
    const workbench = adapter();
    const controller = new ThreadsController(workbench);

    await controller.moveThread("project-alpha", "second", 0);

    expect(workbench.reorderThreads).toHaveBeenCalledExactlyOnceWith("project-alpha", [
      "second",
      "first",
    ]);
  });

  it("never removes a worktree as a side effect of closing or removing a thread", async () => {
    const workbench = adapter();
    const controller = new ThreadsController(workbench);

    await controller.closeThread("first");
    await controller.removeThread("first");

    expect(workbench.closeThread).toHaveBeenCalledExactlyOnceWith("first");
    expect(workbench.removeThread).toHaveBeenCalledExactlyOnceWith("first");
    expect(Object.keys(workbench)).not.toContain("removeWorktree");
  });

  it("preserves refused close and recovery results for the owning feature safe action", async () => {
    const workbench = adapter();
    workbench.closeThread.mockResolvedValue({
      status: "refused",
      reason: "Build is still running",
      recovery: { label: "Review Build", run: vi.fn() },
    });
    const controller = new ThreadsController(workbench);

    await expect(controller.closeThread("first")).resolves.toMatchObject({
      status: "refused",
      reason: "Build is still running",
    });
  });
});
