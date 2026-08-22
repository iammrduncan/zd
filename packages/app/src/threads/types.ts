import type { ProjectAvailability, ThreadsVisibility, TransitionResult } from "@/workbench/state";

export const THREAD_ATTENTION_EVENT_VERSION = 1 as const;

export type ThreadLifecycle =
  "starting" | "idle" | "busy" | "waiting" | "exited" | "failed" | "unknown";

export type ThreadLifecycleSource = "process" | "supported-agent" | "terminal-output";
export type ThreadAgent = "shell" | "codex" | "claude-code" | "opencode" | "unknown";

/** The shipped descriptor. ACP can later add a sibling descriptor without wrapping terminals. */
export interface TerminalThreadType {
  readonly kind: "terminal";
  readonly agent: ThreadAgent;
}

export type ThreadType = TerminalThreadType;

export interface ThreadWorktreeContext {
  readonly id: string;
  readonly label: string;
  readonly kind: "project-root" | "worktree";
  readonly availability: ProjectAvailability;
}

export type TerminalBackingAvailability =
  "not-started" | "starting" | "ready" | "missing" | "closed";

/**
 * A stable logical reference, not a serializable native process handle. The
 * TerminalAdapter handle stays in the runtime attachment owned by the root.
 */
export interface TerminalThreadBacking {
  readonly kind: "terminal";
  readonly referenceId: string;
  readonly availability: TerminalBackingAvailability;
}

export type ThreadBacking = TerminalThreadBacking;

export type ThreadRecoveryKind =
  | "missing-project"
  | "missing-worktree"
  | "missing-session"
  | "worktree-collision"
  | "worktree-locked"
  | "failed";

export interface ThreadRecoveryState {
  readonly kind: ThreadRecoveryKind;
  readonly summary: string;
  readonly actionLabel: string;
}

export interface ThreadAttentionState {
  readonly unread: boolean;
  readonly version: number;
}

export interface ThreadRecord {
  readonly id: string;
  readonly projectId: string;
  readonly worktree: ThreadWorktreeContext;
  readonly type: ThreadType;
  readonly name: string;
  readonly order: number;
  readonly lifecycle: ThreadLifecycle;
  readonly lifecycleSource: ThreadLifecycleSource;
  readonly lifecycleRevision: number;
  readonly attention: ThreadAttentionState;
  readonly backing: ThreadBacking;
  readonly recovery: ThreadRecoveryState | null;
}

export interface ThreadProjectGroup {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly availability: ProjectAvailability;
}

export interface ThreadWorkbenchSnapshot {
  readonly projects: readonly ThreadProjectGroup[];
  readonly threads: readonly ThreadRecord[];
  readonly activeThreadId: string | null;
  readonly visibility: ThreadsVisibility;
}

export type ExistingThreadWorkspace = {
  readonly kind: "project-root" | "existing-worktree";
  readonly projectId: string;
  readonly worktreeId: string;
};

/** Native resolves the approved project identity; no caller-provided path crosses the boundary. */
export type NewThreadWorktree = {
  readonly kind: "new-worktree";
  readonly projectId: string;
  readonly name: string;
  readonly branch: string;
  readonly baseRevision: string | null;
};

export type ThreadWorkspaceTarget = ExistingThreadWorkspace | NewThreadWorktree;

export interface CreateThreadRequest {
  readonly name: string;
  readonly type: ThreadType;
  readonly workspace: ThreadWorkspaceTarget;
}

export interface ThreadLifecycleSignal {
  /** Monotonic per thread. Duplicate and out-of-order observations are ignored. */
  readonly revision: number;
  readonly lifecycle: ThreadLifecycle;
  readonly source: ThreadLifecycleSource;
}

export interface ThreadAttentionEventV1 {
  readonly schemaVersion: typeof THREAD_ATTENTION_EVENT_VERSION;
  readonly eventId: string;
  readonly kind: "waiting";
  readonly projectId: string;
  readonly worktreeId: string;
  readonly threadId: string;
  readonly threadType: ThreadType["kind"];
  readonly agent: ThreadAgent;
  readonly attentionVersion: number;
}

export interface ThreadLifecycleApplication {
  readonly thread: ThreadRecord;
  readonly event: ThreadAttentionEventV1 | null;
}

export type ThreadActionResult = TransitionResult;

/**
 * The root implements this over its one state owner. `activateThread` is one
 * atomic project/worktree/thread/file/session/region transition, never setters.
 */
export interface ThreadWorkbenchAdapter {
  snapshot(): ThreadWorkbenchSnapshot;
  subscribe(listener: (snapshot: ThreadWorkbenchSnapshot) => void): () => void;
  createThread(request: CreateThreadRequest): Promise<ThreadActionResult>;
  renameThread(threadId: string, name: string): Promise<ThreadActionResult>;
  reorderThreads(
    projectId: string,
    orderedThreadIds: readonly string[],
  ): Promise<ThreadActionResult>;
  activateThread(threadId: string): Promise<ThreadActionResult>;
  closeThread(threadId: string): Promise<ThreadActionResult>;
  removeThread(threadId: string): Promise<ThreadActionResult>;
  recoverThread(threadId: string): Promise<ThreadActionResult>;
  setThreadsVisibility(visibility: ThreadsVisibility): Promise<ThreadActionResult>;
  acknowledgeAttention(threadId: string, version: number): Promise<ThreadActionResult>;
}

export type ThreadInstrumentationOperation =
  | "thread.create"
  | "thread.rename"
  | "thread.reorder"
  | "thread.activate"
  | "thread.close"
  | "thread.remove"
  | "thread.recover"
  | "thread.visibility"
  | "thread.attention.acknowledge";

export interface ThreadInstrumentationEvent {
  readonly operation: ThreadInstrumentationOperation;
  readonly outcome: "ok" | "refused" | "failed";
  readonly projectId?: string;
  readonly worktreeId?: string;
  readonly threadId?: string;
}

export type ThreadInstrumentation = (event: ThreadInstrumentationEvent) => void | Promise<void>;
