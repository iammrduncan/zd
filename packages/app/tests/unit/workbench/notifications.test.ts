import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  AttentionNotificationAdapter,
  NotificationActionV1,
} from "@/notifications";
import type { ThreadAttentionEventV1, ThreadWorkbenchSnapshot } from "@/threads";
import { createWorkbenchAttentionRuntime } from "@/workbench/notifications";
import { forgetPreferences, setAttentionDesktopEnabled } from "@/workbench/preferences";
import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  type ThreadState,
} from "@/workbench/state";

const thread: ThreadState = {
  id: "thread-alpha",
  projectId: "project-alpha",
  worktreeId: "worktree-alpha",
  name: "Review output",
  order: 0,
  type: "terminal",
  agent: "codex",
  lifecycle: "waiting",
  lifecycleSource: "supported-agent",
  lifecycleRevision: 2,
  attentionUnread: true,
  attentionVersion: 1,
  backingId: "terminal:alpha",
  backingAvailability: "ready",
  recovery: null,
  fileId: null,
};

const snapshot: ThreadWorkbenchSnapshot = {
  projects: [{ id: "project-alpha", name: "Workbench", order: 0, availability: "available" }],
  threads: [
    {
      id: thread.id,
      projectId: thread.projectId,
      worktree: {
        id: thread.worktreeId,
        label: "main",
        kind: "project-root",
        availability: "available",
      },
      type: { kind: "terminal", agent: "codex" },
      name: thread.name,
      order: 0,
      lifecycle: "waiting",
      lifecycleSource: "supported-agent",
      lifecycleRevision: 2,
      attention: { unread: true, version: 1 },
      backing: { kind: "terminal", referenceId: thread.backingId, availability: "ready" },
      recovery: null,
    },
  ],
  activeThreadId: thread.id,
  visibility: "full",
};

function attention(version: number): ThreadAttentionEventV1 {
  return {
    schemaVersion: 1,
    eventId: `${thread.id}:${version}`,
    kind: "waiting",
    projectId: thread.projectId,
    worktreeId: thread.worktreeId,
    threadId: thread.id,
    threadType: "terminal",
    agent: "codex",
    attentionVersion: version,
  };
}

afterEach(() => {
  forgetPreferences();
  window.localStorage.clear();
});

describe("root attention runtime", () => {
  it("tracks native focus, suppresses only root-focused target events, and tears down listeners", async () => {
    setAttentionDesktopEnabled(true);
    const attentionListener = {
      current: null as ((event: ThreadAttentionEventV1) => void) | null,
    };
    const actionListener = { current: null as ((event: NotificationActionV1) => void) | null };
    const focusListener = { current: null as ((focused: boolean) => void) | null };
    const show = vi.fn(async () => ({
      status: "presented" as const,
      problem: null,
    }));
    const notificationAdapter: AttentionNotificationAdapter = {
      permission: vi.fn(async () => "granted" as const),
      requestPermission: vi.fn(async () => "granted" as const),
      show,
      onAction: (listener) => {
        actionListener.current = listener;
        return () => {
          actionListener.current = null;
        };
      },
      playSound: vi.fn(async () => ({ status: "played" as const, problem: null })),
    };
    const state = createWorkbenchStateOwner({
      ...defaultWorkbenchState(),
      projects: [
        { id: "project-alpha", name: "Workbench", root: "/work", availability: "available" },
      ],
      worktrees: [
        {
          id: "worktree-alpha",
          projectId: "project-alpha",
          name: "main",
          root: "/work",
          availability: "available",
        },
      ],
      threads: [thread],
      active: {
        projectId: "project-alpha",
        worktreeId: "worktree-alpha",
        threadId: "thread-alpha",
        fileId: null,
      },
      regions: {
        ...defaultWorkbenchState().regions,
        focus: "thread",
      },
    });
    const activateThread = vi.fn(async () => ({ status: "committed" as const }));
    const runtime = await createWorkbenchAttentionRuntime(
      state,
      {
        notifications: notificationAdapter,
        showWorkbench: vi.fn(async () => "ordinary" as const),
        isWindowFocused: vi.fn(async () => true),
        onWindowFocusChanged: (listener) => {
          focusListener.current = listener;
          return () => {
            focusListener.current = null;
          };
        },
      },
      {
        snapshot: () => snapshot,
        subscribeAttention: (listener) => {
          attentionListener.current = listener;
          return () => {
            attentionListener.current = null;
          };
        },
        activateThread,
      },
    );
    const stop = runtime.attach();

    attentionListener.current?.(attention(1));
    await Promise.resolve();
    expect(show).not.toHaveBeenCalled();

    state.updateRegions({ ...state.snapshot().regions, focus: "file" });
    attentionListener.current?.(attention(2));
    await vi.waitFor(() => expect(show).toHaveBeenCalledOnce());

    focusListener.current?.(false);
    expect(runtime.focused()).toBe(false);
    stop();
    expect(attentionListener.current).toBeNull();
    expect(actionListener.current).toBeNull();
    expect(focusListener.current).toBeNull();
  });
});
