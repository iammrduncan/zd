import type { TerminalThreadSession } from "@/threads";
import type {
  ThreadLifecycleSignal,
  ThreadRecord,
  ThreadRecoveryState as FeatureThreadRecoveryState,
  ThreadWorkbenchSnapshot,
} from "@/threads";
import type { ThreadRuntimeUpdate, ThreadState, WorkbenchState } from "./state";

let fallbackIdentity = 0;

export function defaultThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `thread-${crypto.randomUUID()}`;
  }
  fallbackIdentity += 1;
  return `thread-${Date.now().toString(36)}-${fallbackIdentity.toString(36)}`;
}

export function inferredThreadRecovery(
  thread: ThreadState,
  state: WorkbenchState,
  hasRuntime: boolean,
): FeatureThreadRecoveryState | null {
  const project = state.projects.find(({ id }) => id === thread.projectId);
  if (!project || project.availability !== "available") {
    return {
      kind: "missing-project",
      summary: "This thread's project is unavailable.",
      actionLabel: "Recover project",
    };
  }
  const worktree = state.worktrees.find(
    ({ id, projectId }) => id === thread.worktreeId && projectId === thread.projectId,
  );
  if (!worktree || worktree.availability !== "available") {
    return {
      kind: "missing-worktree",
      summary: "This thread's worktree is unavailable.",
      actionLabel: "Recover worktree",
    };
  }
  if (
    !hasRuntime &&
    (thread.backingAvailability === "ready" || thread.backingAvailability === "missing")
  ) {
    return {
      kind: "missing-session",
      summary: "This thread's terminal process is no longer attached.",
      actionLabel: "Restart terminal",
    };
  }
  return thread.recovery;
}

export function threadRecordFromState(
  thread: ThreadState,
  state: WorkbenchState,
  hasRuntime: boolean,
): ThreadRecord {
  const project = state.projects.find(({ id }) => id === thread.projectId);
  const worktree = state.worktrees.find(
    ({ id, projectId }) => id === thread.worktreeId && projectId === thread.projectId,
  );
  const backingAvailability =
    !hasRuntime && thread.backingAvailability === "ready" ? "missing" : thread.backingAvailability;
  return {
    id: thread.id,
    projectId: thread.projectId,
    worktree: {
      id: thread.worktreeId,
      label: worktree?.name ?? thread.worktreeId,
      kind: project && worktree?.root === project.root ? "project-root" : "worktree",
      availability: worktree?.availability ?? "missing",
    },
    type: { kind: thread.type, agent: thread.agent },
    name: thread.name,
    order: thread.order,
    lifecycle: thread.lifecycle,
    lifecycleSource: thread.lifecycleSource,
    lifecycleRevision: thread.lifecycleRevision,
    attention: { unread: thread.attentionUnread, version: thread.attentionVersion },
    backing: {
      kind: "terminal",
      referenceId: thread.backingId,
      availability: backingAvailability,
    },
    recovery: inferredThreadRecovery(thread, state, hasRuntime),
  };
}

export function threadSnapshotFromState(
  state: WorkbenchState,
  sessions: ReadonlyMap<string, TerminalThreadSession>,
): ThreadWorkbenchSnapshot {
  return {
    projects: state.projects.map((project, order) => ({
      id: project.id,
      name: project.name,
      order,
      availability: project.availability,
    })),
    threads: state.threads.map((thread) =>
      threadRecordFromState(thread, state, sessions.has(thread.id)),
    ),
    activeThreadId: state.active.threadId,
    visibility: state.regions.threads.visibility,
  };
}

export function processBackingAfter(
  signal: ThreadLifecycleSignal,
  current: ThreadState,
): ThreadRuntimeUpdate["backingAvailability"] {
  if (signal.source !== "process") return current.backingAvailability;
  switch (signal.lifecycle) {
    case "starting":
      return "starting";
    case "idle":
    case "busy":
    case "waiting":
      return "ready";
    case "exited":
      return "closed";
    case "failed":
      return "missing";
    case "unknown":
      return current.backingAvailability;
  }
}

export function processRecoveryAfter(
  signal: ThreadLifecycleSignal,
  current: ThreadState,
): ThreadRuntimeUpdate["recovery"] {
  if (signal.source !== "process") return current.recovery;
  if (signal.lifecycle === "failed") {
    return {
      kind: "failed",
      summary: "The terminal process could not be started or observed.",
      actionLabel: "Restart terminal",
    };
  }
  return ["idle", "busy", "waiting"].includes(signal.lifecycle) ? null : current.recovery;
}
