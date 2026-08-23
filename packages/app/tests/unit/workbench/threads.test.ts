import { describe, expect, it, vi } from "vitest";

import type { TerminalSessionHandle } from "@/terminal";
import type { ThreadAttentionEventV1 } from "@/threads";
import { mountActiveThread } from "@/workbench/features";
import { runCommandTarget } from "@/workbench/shortcuts";
import { createRootThreadsAdapter } from "@/workbench/threads";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
import {
  durableThread,
  existingRequest,
  headlessEmulator,
  owner,
  platform,
  project,
  terminalAdapter,
} from "./threads-fixture";

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

  it("uses terminal titles until the user gives the thread a manual name", async () => {
    const state = owner();
    const runtime = createRootThreadsAdapter(state, platform(), {
      createId: () => "thread-titled",
    });
    await runtime.createThread({ ...existingRequest(), name: "Terminal" });

    await runtime.updateAutomaticName("thread-titled", "npm test");
    expect(state.snapshot().threads[0]?.name).toBe("npm test");

    await runtime.renameThread("thread-titled", "Test runner");
    await runtime.updateAutomaticName("thread-titled", "zsh");
    expect(state.snapshot().threads[0]?.name).toBe("Test runner");
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

  it("guards project removal until its live terminal has an explicit safe action", async () => {
    const state = owner();
    const native = terminalAdapter();
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-project-live",
    });
    await runtime.createThread(existingRequest());
    const revoke = vi.fn(async () => undefined);

    const removal = await state.removeProject(project.id, revoke);

    expect(removal).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("running"),
      recovery: { label: expect.stringContaining("Terminate") },
    });
    expect(revoke).not.toHaveBeenCalled();
    if (removal.status === "refused") await removal.recovery?.run();
    await expect(state.removeProject(project.id, revoke)).resolves.toEqual({
      status: "committed",
    });
    expect(revoke).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it("mounts the active runtime session into the centre thread surface", async () => {
    const state = owner();
    const runtime = createRootThreadsAdapter(state, platform(), {
      createId: () => "thread-mounted",
    });
    await runtime.createThread(existingRequest());
    const host = document.createElement("div");

    const unmount = mountActiveThread(
      host,
      { state } as unknown as WorkbenchRuntimeContext,
      runtime,
      { createEmulator: headlessEmulator },
    );

    expect(host.querySelector(".zd-terminal-thread-surface")).not.toBeNull();
    expect(host.querySelector(".zd-terminal-thread-metadata")?.textContent).toContain("Review");
    unmount();
    expect(host.querySelector(".zd-terminal-thread-surface")).toBeNull();
    await runtime.dispose();
  });

  it("routes the mounted emulator title into the automatic thread name", async () => {
    const state = owner();
    const runtime = createRootThreadsAdapter(state, platform(), {
      createId: () => "thread-mounted-title",
    });
    await runtime.createThread({ ...existingRequest(), name: "Terminal" });
    let emitTitle: ((title: string) => void) | null = null;
    const createEmulator = () => {
      const emulator = headlessEmulator();
      return {
        ...emulator,
        onTitleChange: (listener: (title: string) => void) => {
          emitTitle = listener;
          return () => {
            emitTitle = null;
          };
        },
      };
    };
    const host = document.createElement("div");
    const unmount = mountActiveThread(
      host,
      { state } as unknown as WorkbenchRuntimeContext,
      runtime,
      { createEmulator },
    );

    const publishTitle = emitTitle as ((title: string) => void) | null;
    expect(publishTitle).not.toBeNull();
    publishTitle?.("pnpm test");
    await vi.waitFor(() => expect(state.snapshot().threads[0]?.name).toBe("pnpm test"));

    unmount();
    expect(emitTitle).toBeNull();
    await runtime.dispose();
  });

  it("keeps inactive emulator state mounted and routes find to the focused terminal", async () => {
    const state = owner();
    const identities = ["thread-one", "thread-two"];
    const runtime = createRootThreadsAdapter(state, platform(), {
      createId: () => identities.shift()!,
    });
    await runtime.createThread(existingRequest());
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = mountActiveThread(
      host,
      { state } as unknown as WorkbenchRuntimeContext,
      runtime,
      { createEmulator: headlessEmulator },
    );
    const first = host.querySelector<HTMLElement>(".zd-terminal-thread-surface")!;

    await runtime.createThread({ ...existingRequest(), name: "Second" });
    await vi.waitFor(() =>
      expect(host.querySelectorAll(".zd-terminal-thread-surface")).toHaveLength(2),
    );
    expect(first.hidden).toBe(true);

    await runtime.activateThread("thread-one");
    await vi.waitFor(() => expect(first.hidden).toBe(false));
    first.querySelector("textarea")?.focus();
    expect(runCommandTarget("file.find")).toBe(true);
    expect(first.querySelector<HTMLElement>(".zd-terminal-thread-search")?.hidden).toBe(false);
    expect(runCommandTarget("workbench.escape")).toBe(true);
    expect(first.querySelector<HTMLElement>(".zd-terminal-thread-search")?.hidden).toBe(true);

    unmount();
    await runtime.dispose();
  });

  it("drains output only when native signals that the attached session is ready", async () => {
    const state = owner();
    const native = terminalAdapter() as ReturnType<typeof terminalAdapter> & {
      onOutputReady(listener: (session: TerminalSessionHandle) => void): () => void;
    };
    let outputReady: ((session: TerminalSessionHandle) => void) | null = null;
    native.onOutputReady = (listener) => {
      outputReady = listener;
      return () => {
        outputReady = null;
      };
    };
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-output",
    });
    await runtime.createThread(existingRequest());
    native.read.mockClear();
    native.read.mockResolvedValueOnce({
      session: {
        projectId: project.id,
        worktreeId: "worktree-alpha",
        sessionId: "native-session-secret",
      },
      offset: 0,
      droppedBefore: 0,
      bytes: [...new TextEncoder().encode("prompt")],
      readError: null,
    });

    const emitOutput = outputReady as ((session: TerminalSessionHandle) => void) | null;
    expect(emitOutput).not.toBeNull();
    emitOutput!({
      projectId: project.id,
      worktreeId: "worktree-alpha",
      sessionId: "native-session-secret",
    });

    await vi.waitFor(() => expect(native.read).toHaveBeenCalledOnce());
    expect(runtime.session("thread-output")?.snapshot().rows).toEqual(["prompt"]);
    await runtime.dispose();
    expect(outputReady).toBeNull();
  });

  it("routes one supported-agent busy-to-waiting control event into attention", async () => {
    const state = owner();
    const native = terminalAdapter();
    const runtime = createRootThreadsAdapter(state, platform(native), {
      createId: () => "thread-agent",
    });
    const attention: ThreadAttentionEventV1[] = [];
    runtime.subscribeAttention((event) => attention.push(event));
    await runtime.createThread({
      ...existingRequest(),
      type: { kind: "terminal", agent: "codex" },
    });
    const terminal = runtime.session("thread-agent")!;

    await terminal.writeText("run tests\r");
    await vi.waitFor(() =>
      expect(state.snapshot().threads[0]).toMatchObject({
        lifecycle: "busy",
        lifecycleSource: "supported-agent",
      }),
    );
    native.read.mockResolvedValueOnce({
      session: {
        projectId: project.id,
        worktreeId: "worktree-alpha",
        sessionId: "native-session-secret",
      },
      offset: 0,
      droppedBefore: 0,
      bytes: [7],
      readError: null,
    });
    await terminal.refresh();
    await vi.waitFor(() => expect(attention).toHaveLength(1));

    expect(state.snapshot().threads[0]).toMatchObject({
      lifecycle: "waiting",
      lifecycleSource: "supported-agent",
      attentionUnread: true,
      attentionVersion: 1,
    });
    expect(attention[0]).toMatchObject({
      schemaVersion: 1,
      kind: "waiting",
      threadId: "thread-agent",
      agent: "codex",
      attentionVersion: 1,
    });

    native.read.mockResolvedValueOnce({
      session: {
        projectId: project.id,
        worktreeId: "worktree-alpha",
        sessionId: "native-session-secret",
      },
      offset: 1,
      droppedBefore: 0,
      bytes: [7],
      readError: null,
    });
    await terminal.refresh();
    expect(attention).toHaveLength(1);
    await runtime.dispose();
  });
});
