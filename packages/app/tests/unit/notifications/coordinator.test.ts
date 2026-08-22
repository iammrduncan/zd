import { describe, expect, it, vi } from "vitest";

import {
  AttentionNotificationCoordinator,
  defaultAttentionSettings,
  type AttentionNotificationAdapter,
  type AttentionNotificationSettings,
  type NotificationActionV1,
} from "@/notifications";
import type { ThreadAttentionEventV1, ThreadRecord, ThreadWorkbenchSnapshot } from "@/threads";
import type { TransitionResult } from "@/workbench/state";

const event: ThreadAttentionEventV1 = {
  schemaVersion: 1,
  eventId: "thread-alpha:1",
  kind: "waiting",
  projectId: "project-alpha",
  worktreeId: "worktree-alpha",
  threadId: "thread-alpha",
  threadType: "terminal",
  agent: "codex",
  attentionVersion: 1,
};

function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: "thread-alpha",
    projectId: "project-alpha",
    worktree: {
      id: "worktree-alpha",
      label: "main",
      kind: "project-root",
      availability: "available",
    },
    type: { kind: "terminal", agent: "codex" },
    name: "Review output",
    order: 0,
    lifecycle: "waiting",
    lifecycleSource: "supported-agent",
    lifecycleRevision: 2,
    attention: { unread: true, version: 1 },
    backing: { kind: "terminal", referenceId: "terminal:alpha", availability: "ready" },
    recovery: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<ThreadWorkbenchSnapshot> = {}): ThreadWorkbenchSnapshot {
  return {
    projects: [{ id: "project-alpha", name: "Workbench", order: 0, availability: "available" }],
    threads: [thread()],
    activeThreadId: null,
    visibility: "full",
    ...overrides,
  };
}

function adapter(
  permission: AttentionNotificationAdapter["permission"] extends () => Promise<infer P>
    ? P
    : never = "granted",
) {
  let action: ((event: NotificationActionV1) => void) | null = null;
  const show = vi.fn(async () => ({ status: "presented" as const, problem: null }));
  const playSound = vi.fn(async () => ({ status: "played" as const, problem: null }));
  return {
    value: {
      permission: vi.fn(async () => permission),
      requestPermission: vi.fn(async () => permission),
      show,
      onAction: (listener) => {
        action = listener;
        return () => {
          action = null;
        };
      },
      playSound,
    } satisfies AttentionNotificationAdapter,
    show,
    playSound,
    emitAction: (next: NotificationActionV1) => action?.(next),
  };
}

function settings(
  overrides: Partial<AttentionNotificationSettings> = {},
): AttentionNotificationSettings {
  return {
    ...defaultAttentionSettings(),
    desktopEnabled: true,
    ...overrides,
  };
}

function coordinator(options: {
  native?: ReturnType<typeof adapter>;
  current?: ThreadWorkbenchSnapshot;
  preferences?: AttentionNotificationSettings;
  focused?: boolean;
  targetFocused?: boolean;
  now?: () => number;
}) {
  const native = options.native ?? adapter();
  let current = options.current ?? snapshot();
  let attention: ((next: ThreadAttentionEventV1) => void) | null = null;
  const activateThread = vi.fn<() => Promise<TransitionResult>>(async () => ({
    status: "committed",
  }));
  const showWorkbench = vi.fn(async () => "ordinary" as const);
  const reportProblem = vi.fn();
  const value = new AttentionNotificationCoordinator({
    adapter: native.value,
    threads: {
      snapshot: () => current,
      subscribeAttention: (listener) => {
        attention = listener;
        return () => {
          attention = null;
        };
      },
      activateThread,
    },
    settings: () => options.preferences ?? settings(),
    window: {
      isFocused: () => options.focused ?? false,
      targetThreadOwnsFocus: (threadId) =>
        (options.targetFocused ?? false) && current.activeThreadId === threadId,
      showWorkbench,
    },
    reportProblem,
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    value,
    native,
    activateThread,
    showWorkbench,
    reportProblem,
    emitAttention: (next: ThreadAttentionEventV1) => attention?.(next),
    setSnapshot: (next: ThreadWorkbenchSnapshot) => {
      current = next;
    },
  };
}

function action(overrides: Partial<NotificationActionV1> = {}): NotificationActionV1 {
  return {
    schemaVersion: 1,
    notificationId: "attention:thread-alpha:1",
    action: "view",
    projectId: "project-alpha",
    worktreeId: "worktree-alpha",
    threadId: "thread-alpha",
    ...overrides,
  };
}

describe("attention notification coordination", () => {
  it("presents one closed privacy-safe notification for one versioned transition", async () => {
    const runtime = coordinator({});

    await runtime.value.handleAttention(event);
    await runtime.value.handleAttention(event);
    await runtime.value.handleAttention({ ...event, eventId: "replayed-id" });

    expect(runtime.native.show).toHaveBeenCalledExactlyOnceWith({
      schemaVersion: 1,
      notificationId: "attention:thread-alpha:1",
      eventId: "thread-alpha:1",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      title: "zd",
      body: "Workbench · Review output · Codex",
    });
    const serialized = JSON.stringify(runtime.native.show.mock.calls);
    expect(serialized).not.toContain("prompt");
    expect(serialized).not.toContain("output text");
    expect(serialized).not.toContain("relativePath");
  });

  it("suppresses presentation and sound only when the exact thread owns foreground focus", async () => {
    const native = adapter();
    const runtime = coordinator({
      native,
      current: snapshot({ activeThreadId: "thread-alpha" }),
      focused: true,
      targetFocused: true,
      preferences: settings({ soundEnabled: true }),
    });

    await runtime.value.handleAttention(event);

    expect(native.show).not.toHaveBeenCalled();
    expect(native.playSound).not.toHaveBeenCalled();

    const visibleButFileFocused = coordinator({
      preferences: settings({ soundEnabled: true }),
      current: snapshot({ activeThreadId: "thread-alpha" }),
      focused: true,
      targetFocused: false,
    });
    await visibleButFileFocused.value.handleAttention(event);
    expect(visibleButFileFocused.native.show).toHaveBeenCalledOnce();
    expect(visibleButFileFocused.native.playSound).toHaveBeenCalledOnce();
  });

  it("treats denied and unsupported native presentation as non-blocking", async () => {
    for (const permission of ["denied", "unsupported"] as const) {
      const native = adapter(permission);
      const runtime = coordinator({ native });

      await expect(runtime.value.handleAttention(event)).resolves.toBeUndefined();
      expect(native.show).not.toHaveBeenCalled();
      expect(runtime.reportProblem).not.toHaveBeenCalled();
    }
  });

  it("routes View through summon followed by the one atomic thread activation", async () => {
    const runtime = coordinator({});
    runtime.value.start();
    await runtime.value.handleAttention(event);

    runtime.native.emitAction(action());
    await vi.waitFor(() => expect(runtime.activateThread).toHaveBeenCalledWith("thread-alpha"));

    expect(runtime.showWorkbench).toHaveBeenCalledOnce();
    expect(runtime.showWorkbench.mock.invocationCallOrder[0]).toBeLessThan(
      runtime.activateThread.mock.invocationCallOrder[0]!,
    );
    expect(runtime.activateThread).toHaveBeenCalledExactlyOnceWith("thread-alpha");
  });

  it("routes one native action once when live delivery races the pending-action drain", async () => {
    const runtime = coordinator({});
    runtime.value.start();
    await runtime.value.handleAttention(event);

    runtime.native.emitAction(action());
    runtime.native.emitAction(action());
    await vi.waitFor(() => expect(runtime.activateThread).toHaveBeenCalledOnce());

    expect(runtime.showWorkbench).toHaveBeenCalledOnce();
    expect(runtime.activateThread).toHaveBeenCalledExactlyOnceWith("thread-alpha");
  });

  it("makes Close a notification-only action", async () => {
    const runtime = coordinator({});
    const stop = runtime.value.start();
    await runtime.value.handleAttention(event);

    runtime.native.emitAction(action({ action: "close" }));
    await Promise.resolve();

    expect(runtime.showWorkbench).not.toHaveBeenCalled();
    expect(runtime.activateThread).not.toHaveBeenCalled();
    stop();
  });

  it("reports an exact stale target rather than activating any fallback", async () => {
    const runtime = coordinator({});
    runtime.activateThread.mockResolvedValueOnce({
      status: "refused",
      reason: "Worktree worktree-alpha is missing",
    });
    runtime.value.start();
    await runtime.value.handleAttention(event);

    runtime.native.emitAction(action());
    await vi.waitFor(() => expect(runtime.reportProblem).toHaveBeenCalledOnce());

    expect(runtime.reportProblem).toHaveBeenCalledWith({
      notificationId: "attention:thread-alpha:1",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      summary: "Worktree worktree-alpha is missing",
    });
    expect(runtime.activateThread).toHaveBeenCalledExactlyOnceWith("thread-alpha");
  });

  it("keeps sound off by default and applies mute, per-agent choice, volume, and rate limits", async () => {
    let now = 10_000;
    const native = adapter();
    const runtime = coordinator({ native, now: () => now });

    await runtime.value.handleAttention(event);
    expect(native.playSound).not.toHaveBeenCalled();

    const enabled = coordinator({
      native,
      now: () => now,
      preferences: settings({
        soundEnabled: true,
        volume: 0.35,
        agentSounds: { codex: "bright", "claude-code": "subtle", opencode: "gentle" },
      }),
    });
    await enabled.value.handleAttention(event);
    expect(native.playSound).toHaveBeenCalledWith({ sound: "bright", volume: 0.35 });

    await enabled.value.handleAttention({
      ...event,
      attentionVersion: 2,
      eventId: "thread-alpha:2",
    });
    expect(native.playSound).toHaveBeenCalledOnce();

    now += 2_000;
    await enabled.value.handleAttention({
      ...event,
      attentionVersion: 3,
      eventId: "thread-alpha:3",
    });
    expect(native.playSound).toHaveBeenCalledTimes(2);

    const muted = coordinator({
      native,
      preferences: settings({ soundEnabled: true, muted: true }),
    });
    await muted.value.handleAttention(event);
    expect(native.playSound).toHaveBeenCalledTimes(2);
  });

  it("subscribes without interval polling and stops both event sources", () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const runtime = coordinator({});

    const stop = runtime.value.start();
    runtime.emitAttention(event);
    stop();

    expect(interval).not.toHaveBeenCalled();
    expect(() => runtime.native.emitAction(action())).not.toThrow();
  });
});
