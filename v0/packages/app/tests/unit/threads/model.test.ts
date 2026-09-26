import { describe, expect, it } from "vitest";

import {
  THREAD_ATTENTION_EVENT_VERSION,
  ThreadAttentionDeduplicator,
  acknowledgeThreadAttention,
  applyThreadLifecycle,
  orderedProjectThreads,
  threadOrderAfterInsertion,
  type ThreadRecord,
} from "@/threads";

function thread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
  return {
    id: "thread-alpha",
    projectId: "project-alpha",
    worktree: {
      id: "worktree-alpha",
      label: "feature/threads",
      root: "/workspace/feature-threads",
      kind: "worktree",
      availability: "available",
    },
    name: "Build threads",
    order: 0,
    type: { kind: "terminal", agent: "codex" },
    lifecycle: "idle",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attention: { unread: false, version: 0 },
    backing: {
      kind: "terminal",
      referenceId: "terminal-thread-alpha",
      availability: "ready",
    },
    recovery: null,
    ...overrides,
  };
}

describe("the thread model", () => {
  it("emits exactly one versioned attention event for one supported-agent busy-to-waiting transition", () => {
    const busy = applyThreadLifecycle(thread(), {
      lifecycle: "busy",
      revision: 1,
      source: "supported-agent",
    });
    const waiting = applyThreadLifecycle(busy.thread, {
      lifecycle: "waiting",
      revision: 2,
      source: "supported-agent",
    });
    const duplicate = applyThreadLifecycle(waiting.thread, {
      lifecycle: "waiting",
      revision: 2,
      source: "supported-agent",
    });
    const repeated = applyThreadLifecycle(duplicate.thread, {
      lifecycle: "waiting",
      revision: 3,
      source: "supported-agent",
    });

    expect(waiting.event).toEqual({
      schemaVersion: THREAD_ATTENTION_EVENT_VERSION,
      eventId: "thread-alpha:1",
      kind: "waiting",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      threadType: "terminal",
      agent: "codex",
      attentionVersion: 1,
    });
    expect(waiting.thread.attention).toEqual({ unread: true, version: 1 });
    expect(duplicate).toEqual({ thread: waiting.thread, event: null });
    expect(repeated.event).toBeNull();
    expect(repeated.thread.attention.version).toBe(1);
  });

  it("does not infer attention from process output or an unsupported lifecycle path", () => {
    const processBusy = applyThreadLifecycle(thread(), {
      lifecycle: "busy",
      revision: 1,
      source: "process",
    });
    const processWaiting = applyThreadLifecycle(processBusy.thread, {
      lifecycle: "waiting",
      revision: 2,
      source: "process",
    });
    const agentWaitingWithoutBusy = applyThreadLifecycle(thread(), {
      lifecycle: "waiting",
      revision: 1,
      source: "supported-agent",
    });

    expect(processWaiting.event).toBeNull();
    expect(agentWaitingWithoutBusy.event).toBeNull();
  });

  it("deduplicates delivered events by thread and monotonic attention version", () => {
    const deduplicator = new ThreadAttentionDeduplicator();
    const first = applyThreadLifecycle(
      applyThreadLifecycle(thread(), {
        lifecycle: "busy",
        revision: 1,
        source: "supported-agent",
      }).thread,
      { lifecycle: "waiting", revision: 2, source: "supported-agent" },
    ).event!;

    expect(deduplicator.accept(first)).toBe(true);
    expect(deduplicator.accept(first)).toBe(false);
    expect(deduplicator.accept({ ...first, attentionVersion: 0, eventId: "thread-alpha:0" })).toBe(
      false,
    );
    expect(deduplicator.accept({ ...first, attentionVersion: 2, eventId: "thread-alpha:2" })).toBe(
      true,
    );
  });

  it("acknowledges only the observed attention version", () => {
    const waiting = thread({ attention: { unread: true, version: 3 }, lifecycle: "waiting" });

    expect(acknowledgeThreadAttention(waiting, 2)).toBe(waiting);
    expect(acknowledgeThreadAttention(waiting, 3).attention).toEqual({
      unread: false,
      version: 3,
    });
  });

  it("keeps stable project-local order while unrelated lifecycle fields change", () => {
    const threads = [
      thread({ id: "late", order: 2 }),
      thread({ id: "other-project", projectId: "project-beta", order: 0 }),
      thread({ id: "early", order: 0, lifecycle: "waiting" }),
      thread({ id: "middle", order: 1, lifecycle: "failed" }),
    ];

    expect(orderedProjectThreads(threads, "project-alpha").map(({ id }) => id)).toEqual([
      "early",
      "middle",
      "late",
    ]);
    expect(threadOrderAfterInsertion(threads, "project-alpha", "late", 0)).toEqual([
      "late",
      "early",
      "middle",
    ]);
  });
});
