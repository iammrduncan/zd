import {
  AttentionNotificationCoordinator,
  type AttentionNotificationAdapter,
} from "@/notifications";
import type { ThreadAttentionEventV1, ThreadWorkbenchSnapshot } from "@/threads";

interface AttentionPerformanceFixture {
  readonly calls: string[];
  dispatch(count: number): Promise<number>;
}

declare global {
  interface Window {
    attentionPerformanceFixture: AttentionPerformanceFixture;
  }
}

const calls: string[] = [];
const snapshot: ThreadWorkbenchSnapshot = {
  projects: [
    { id: "performance-project", name: "Performance", order: 0, availability: "available" },
  ],
  threads: [
    {
      id: "performance-thread",
      projectId: "performance-project",
      worktree: {
        id: "performance-worktree",
        label: "main",
        root: "/workspace/performance",
        kind: "project-root",
        availability: "available",
      },
      type: { kind: "terminal", agent: "codex" },
      name: "Performance thread",
      order: 0,
      lifecycle: "waiting",
      lifecycleSource: "supported-agent",
      lifecycleRevision: 2,
      attention: { unread: true, version: 1 },
      backing: { kind: "terminal", referenceId: "terminal:performance", availability: "ready" },
      recovery: null,
    },
  ],
  activeThreadId: null,
  visibility: "full",
};
const adapter: AttentionNotificationAdapter = {
  permission: async () => {
    calls.push("permission");
    return "granted";
  },
  requestPermission: async () => "granted",
  show: async () => {
    calls.push("show");
    return { status: "presented", problem: null };
  },
  onAction: () => () => {},
  playSound: async () => {
    calls.push("sound");
    return { status: "played", problem: null };
  },
};
let now = 10_000;
const coordinator = new AttentionNotificationCoordinator({
  adapter,
  threads: {
    snapshot: () => snapshot,
    subscribeAttention: () => () => {},
    activateThread: async () => ({ status: "committed" }),
  },
  settings: () => ({
    desktopEnabled: true,
    soundEnabled: true,
    muted: false,
    volume: 0.5,
    agentSounds: { codex: "subtle", "claude-code": "gentle", opencode: "bright" },
  }),
  window: {
    isFocused: () => false,
    targetThreadOwnsFocus: () => false,
    showWorkbench: async () => undefined,
  },
  now: () => now,
});

function attention(version: number): ThreadAttentionEventV1 {
  return {
    schemaVersion: 1,
    eventId: `performance-thread:${version}`,
    kind: "waiting",
    projectId: "performance-project",
    worktreeId: "performance-worktree",
    threadId: "performance-thread",
    threadType: "terminal",
    agent: "codex",
    attentionVersion: version,
  };
}

window.attentionPerformanceFixture = {
  calls,
  dispatch: async (count) => {
    const started = performance.now();
    for (let version = 1; version <= count; version += 1) {
      now += 2_000;
      await coordinator.handleAttention(attention(version));
    }
    return performance.now() - started;
  },
};

const host = document.getElementById("attention-performance");
if (!host) throw new Error("Attention performance fixture host is missing");
host.dataset.ready = "true";
host.textContent = "Attention performance fixture";
