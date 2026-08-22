import { describe, expect, it, vi } from "vitest";

import type { CreateThreadWorktreeRequest, CreateThreadWorktreeResult } from "@/platform";
import type { TerminalAdapter, TerminalExitStatus, TerminalSessionHandle } from "@/terminal";
import type { CreateThreadRequest, ThreadAttentionEventV1 } from "@/threads";
import { createRootThreadsAdapter } from "@/workbench/threads";
import type { ProjectGrant } from "@/workbench/resources";
import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  type ThreadState,
} from "@/workbench/state";

const project: ProjectGrant = {
  id: "project-alpha",
  name: "Alpha",
  root: "/work/alpha",
  availability: "available",
  worktrees: [
    {
      id: "worktree-alpha",
      name: "main",
      root: "/work/alpha",
      availability: "available",
    },
  ],
};

function owner() {
  return createWorkbenchStateOwner({
    ...defaultWorkbenchState(),
    projects: [
      {
        id: project.id,
        name: project.name,
        root: project.root,
        availability: project.availability,
      },
    ],
    worktrees: project.worktrees.map((worktree) => ({
      ...worktree,
      projectId: project.id,
    })),
    active: {
      projectId: project.id,
      worktreeId: project.worktrees[0]!.id,
      threadId: null,
      fileId: null,
    },
  });
}

function durableThread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    id: "thread-existing",
    projectId: project.id,
    worktreeId: project.worktrees[0]!.id,
    name: "Existing",
    order: 0,
    type: "terminal",
    agent: "codex",
    lifecycle: "unknown",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attentionUnread: false,
    attentionVersion: 0,
    backingId: "terminal-thread-existing",
    backingAvailability: "missing",
    recovery: null,
    fileId: null,
    ...overrides,
  };
}

function terminalAdapter() {
  const exit: TerminalExitStatus = { reason: "terminated", code: null, signal: "TERM" };
  const adapter: TerminalAdapter & {
    start: ReturnType<typeof vi.fn>;
    pollExit: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  } = {
    start: vi.fn(async (request): Promise<TerminalSessionHandle> => ({
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      sessionId: "native-session-secret",
    })),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    read: vi.fn(async (session) => ({
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [],
      readError: null,
    })),
    pollExit: vi.fn(async () => null),
    terminate: vi.fn(async () => exit),
    dispose: vi.fn(async () => undefined),
  };
  return adapter;
}

function platform(
  terminal = terminalAdapter(),
  grants: readonly ProjectGrant[] = [project],
  createThreadWorktree: CreateThreadWorktreeResult = {
    status: "refused",
    kind: "git-failed",
    reason: "unused",
  },
) {
  return {
    terminal,
    projectGrants: vi.fn(async () => grants),
    createThreadWorktree: vi.fn(async (request: CreateThreadWorktreeRequest) => {
      void request;
      return createThreadWorktree;
    }),
  };
}

function existingRequest(): CreateThreadRequest {
  return {
    name: "Review",
    type: { kind: "terminal", agent: "codex" },
    workspace: {
      kind: "project-root",
      projectId: project.id,
      worktreeId: project.worktrees[0]!.id,
    },
  };
}

describe("the root Threads runtime adapter", () => {
  it("maps durable state to the feature model without reviving a native handle", async () => {
    const state = owner();
    await state.addThread(durableThread());
    const runtime = createRootThreadsAdapter(state, platform());

    expect(runtime.snapshot()).toMatchObject({
      projects: [{ id: project.id, order: 0 }],
      threads: [
        {
          id: "thread-existing",
          type: { kind: "terminal", agent: "codex" },
          worktree: { kind: "project-root", availability: "available" },
          backing: { referenceId: "terminal-thread-existing", availability: "missing" },
          recovery: { kind: "missing-session" },
        },
      ],
    });
    expect(runtime.session("thread-existing")).toBeNull();
  });

  it("creates one root-owned record while keeping the native handle runtime-only", async () => {
    const state = owner();
    const native = terminalAdapter();
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-created",
    });
    const seen = vi.fn();
    state.subscribe(seen);

    await expect(runtime.createThread(existingRequest())).resolves.toEqual({
      status: "committed",
    });

    expect(native.start).toHaveBeenCalledOnce();
    expect(native.start.mock.calls[0]![0]).toEqual({
      projectId: project.id,
      worktreeId: "worktree-alpha",
      viewport: { rows: 24, columns: 80, pixelWidth: 0, pixelHeight: 0 },
    });
    expect(state.snapshot().threads[0]).toMatchObject({
      id: "thread-created",
      lifecycle: "idle",
      backingId: "terminal:thread-created",
      backingAvailability: "ready",
    });
    expect(state.snapshot().threads[0]).not.toHaveProperty("sessionId");
    expect(runtime.session("thread-created")?.snapshot().sessionId).toBe("native-session-secret");
    expect(seen.mock.calls.every(([snapshot]) => snapshot.active.projectId === project.id)).toBe(
      true,
    );
  });

  it("creates a worktree only through the structured native operation and refreshes its grant", async () => {
    const state = owner();
    const native = terminalAdapter();
    const featureWorktree = {
      id: "worktree-feature",
      name: "review",
      root: "/work/alpha-review",
      availability: "available" as const,
    };
    const refreshed = { ...project, worktrees: [...project.worktrees, featureWorktree] };
    const shell = platform(native, [refreshed], {
      status: "created",
      worktree: featureWorktree,
    });
    const runtime = createRootThreadsAdapter(state, shell, { createId: () => "thread-feature" });

    await runtime.createThread({
      name: "Feature",
      type: { kind: "terminal", agent: "shell" },
      workspace: {
        kind: "new-worktree",
        projectId: project.id,
        name: "review",
        branch: "feature/review",
        baseRevision: "main",
      },
    });

    expect(shell.createThreadWorktree).toHaveBeenCalledExactlyOnceWith({
      projectId: project.id,
      name: "review",
      branch: "feature/review",
      baseRevision: "main",
    });
    expect(shell.createThreadWorktree.mock.calls[0]![0]).not.toHaveProperty("path");
    expect(native.start.mock.calls[0]![0]).toMatchObject({ worktreeId: "worktree-feature" });
    expect(state.snapshot().worktrees.map(({ id }) => id)).toContain("worktree-feature");
  });

  it("emits one versioned event for one supported busy-to-waiting transition", async () => {
    const state = owner();
    await state.addThread(
      durableThread({
        lifecycle: "busy",
        lifecycleSource: "supported-agent",
        lifecycleRevision: 4,
      }),
    );
    const runtime = createRootThreadsAdapter(state, platform());
    const events: ThreadAttentionEventV1[] = [];
    runtime.subscribeAttention((event) => events.push(event));

    await runtime.observeLifecycle("thread-existing", {
      lifecycle: "waiting",
      source: "supported-agent",
      revision: 5,
    });
    await runtime.observeLifecycle("thread-existing", {
      lifecycle: "waiting",
      source: "supported-agent",
      revision: 5,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      schemaVersion: 1,
      threadId: "thread-existing",
      attentionVersion: 1,
    });
    expect(state.snapshot().threads[0]).toMatchObject({
      lifecycle: "waiting",
      attentionUnread: true,
      attentionVersion: 1,
    });
  });

  it("requires the explicit recovery action before terminating a live thread", async () => {
    const state = owner();
    const native = terminalAdapter();
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-live",
    });
    await runtime.createThread(existingRequest());

    const close = await runtime.closeThread("thread-live");

    expect(close).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("running"),
      recovery: { label: expect.stringContaining("Terminate") },
    });
    expect(native.terminate).not.toHaveBeenCalled();

    if (close.status === "refused") await close.recovery?.run();
    expect(native.terminate).toHaveBeenCalledOnce();
    await expect(runtime.removeThread("thread-live")).resolves.toEqual({ status: "committed" });
    expect(state.snapshot().threads).toEqual([]);
    expect(Object.keys(runtime)).not.toContain("removeWorktree");
  });

  it("disposes a naturally exited native session when the thread is closed", async () => {
    const state = owner();
    const native = terminalAdapter();
    native.pollExit.mockResolvedValueOnce({ reason: "exited", code: 0, signal: null });
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-exited",
    });
    await runtime.createThread(existingRequest());
    await runtime.session("thread-exited")!.pollExit();

    await expect(runtime.closeThread("thread-exited")).resolves.toEqual({
      status: "committed",
    });

    expect(native.dispose).toHaveBeenCalledOnce();
    expect(state.snapshot().threads[0]).toMatchObject({ backingAvailability: "closed" });
  });

  it("releases an exited session before recovering the same durable thread", async () => {
    const state = owner();
    const native = terminalAdapter();
    native.pollExit.mockResolvedValueOnce({ reason: "exited", code: 1, signal: null });
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-restart",
    });
    await runtime.createThread(existingRequest());
    await runtime.session("thread-restart")!.pollExit();

    await expect(runtime.recoverThread("thread-restart")).resolves.toEqual({
      status: "committed",
    });

    expect(native.dispose).toHaveBeenCalledOnce();
    expect(native.start).toHaveBeenCalledTimes(2);
    expect(runtime.session("thread-restart")?.snapshot().status).toBe("running");
  });

  it("keeps a missing scope recoverable instead of partially activating it", async () => {
    const state = owner();
    await state.addThread(durableThread());
    await state.refreshProjectGrant({
      ...project,
      worktrees: [
        {
          id: "worktree-recovered",
          name: "recovered",
          root: "/work/alpha-recovered",
          availability: "available",
        },
      ],
    });
    const runtime = createRootThreadsAdapter(state, platform());

    await expect(runtime.activateThread("thread-existing")).resolves.toMatchObject({
      status: "refused",
      reason: expect.stringContaining("worktree-alpha"),
    });
    expect(runtime.snapshot().threads[0]).toMatchObject({
      recovery: { kind: "missing-worktree" },
    });
    expect(state.snapshot().active.threadId).not.toBe("thread-existing");
  });
});
