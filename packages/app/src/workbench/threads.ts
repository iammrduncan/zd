import type { CreateThreadWorktreeRequest, CreateThreadWorktreeResult } from "@/platform";
import type { InstrumentationClient } from "@/instrumentation";
import type { TerminalAdapter, TerminalScope, TerminalViewport } from "@/terminal";
import {
  applyThreadLifecycle,
  TerminalThreadSession,
  type CreateThreadRequest,
  type ThreadAttentionEventV1,
  type ThreadLifecycleSignal,
  type ThreadRecoveryState as FeatureThreadRecoveryState,
  type ThreadWorkbenchAdapter,
  type ThreadWorkbenchSnapshot,
} from "@/threads";
import {
  defaultThreadId,
  inferredThreadRecovery,
  processBackingAfter,
  processRecoveryAfter,
  threadRecordFromState,
  threadSnapshotFromState,
} from "./thread-projection";
import type { ProjectGrant } from "./resources";
import type {
  ThreadRuntimeUpdate,
  ThreadState,
  ThreadsVisibility,
  TransitionDecision,
  TransitionResult,
  WorkbenchStateOwner,
} from "./state";

export interface ThreadRuntimePlatform {
  readonly terminal: TerminalAdapter;
  projectGrants(): Promise<readonly ProjectGrant[]>;
  createThreadWorktree(request: CreateThreadWorktreeRequest): Promise<CreateThreadWorktreeResult>;
}

export interface RootThreadsOptions {
  readonly createId?: () => string;
  readonly initialViewport?: TerminalViewport;
  readonly instrumentation?: InstrumentationClient;
}

const DEFAULT_VIEWPORT: TerminalViewport = {
  rows: 24,
  columns: 80,
  pixelWidth: 0,
  pixelHeight: 0,
};

function refused(cause: unknown): TransitionResult {
  return { status: "refused", reason: cause instanceof Error ? cause.message : String(cause) };
}

function isScope(value: TransitionResult | TerminalScope): value is TerminalScope {
  return !("status" in value);
}

export class RootThreadsAdapter implements ThreadWorkbenchAdapter {
  readonly #attentionListeners = new Set<(event: ThreadAttentionEventV1) => void>();
  readonly #createId: () => string;
  readonly #initialViewport: TerminalViewport;
  readonly #instrumentation?: InstrumentationClient;
  readonly #lifecycleTails = new Map<string, Promise<TransitionResult>>();
  readonly #sessions = new Map<string, TerminalThreadSession>();
  readonly #stopProjectRemovalGuard: () => void;
  #disposed = false;

  constructor(
    readonly owner: WorkbenchStateOwner,
    readonly platform: ThreadRuntimePlatform,
    options: RootThreadsOptions = {},
  ) {
    this.#createId = options.createId ?? defaultThreadId;
    this.#initialViewport = { ...(options.initialViewport ?? DEFAULT_VIEWPORT) };
    this.#instrumentation = options.instrumentation;
    this.#stopProjectRemovalGuard = owner.registerProjectRemovalGuard({
      id: "workbench.threads",
      prepareRemoval: ({ projectId }) => this.#prepareProjectRemoval(projectId),
    });
  }

  snapshot(): ThreadWorkbenchSnapshot {
    return threadSnapshotFromState(this.owner.snapshot(), this.#sessions);
  }

  subscribe(listener: (snapshot: ThreadWorkbenchSnapshot) => void): () => void {
    return this.owner.subscribe((state) =>
      listener(threadSnapshotFromState(state, this.#sessions)),
    );
  }

  subscribeAttention(listener: (event: ThreadAttentionEventV1) => void): () => void {
    this.#attentionListeners.add(listener);
    return () => this.#attentionListeners.delete(listener);
  }

  session(threadId: string): TerminalThreadSession | null {
    return this.#sessions.get(threadId) ?? null;
  }

  async createThread(request: CreateThreadRequest): Promise<TransitionResult> {
    const scope = await this.#resolveScope(request);
    if (!isScope(scope)) return scope;
    const id = this.#createId();
    if (!id || this.owner.snapshot().threads.some((thread) => thread.id === id)) {
      return { status: "refused", reason: "Thread identity generation failed" };
    }
    const order =
      Math.max(
        -1,
        ...this.owner
          .snapshot()
          .threads.filter(({ projectId }) => projectId === scope.projectId)
          .map((thread) => thread.order),
      ) + 1;
    const fileId = this.#rememberedFile(scope);
    const durable: ThreadState = {
      id,
      projectId: scope.projectId,
      worktreeId: scope.worktreeId,
      name: request.name.trim(),
      order,
      type: request.type.kind,
      agent: request.type.agent,
      lifecycle: "starting",
      lifecycleSource: "process",
      lifecycleRevision: 0,
      attentionUnread: false,
      attentionVersion: 0,
      backingId: `terminal:${id}`,
      backingAvailability: "starting",
      recovery: null,
      fileId,
    };
    const terminal = this.#createSession(durable, 0);
    this.#sessions.set(id, terminal);
    const added = await this.owner.addThread(durable);
    if (added.status === "refused") {
      this.#sessions.delete(id);
      return added;
    }
    try {
      await terminal.start(this.#initialViewport);
      await this.#waitForLifecycle(id);
      return { status: "committed" };
    } catch (cause) {
      await this.#waitForLifecycle(id);
      return refused(cause);
    }
  }

  renameThread(threadId: string, name: string): Promise<TransitionResult> {
    return this.owner.renameThread(threadId, name);
  }

  reorderThreads(
    projectId: string,
    orderedThreadIds: readonly string[],
  ): Promise<TransitionResult> {
    return this.owner.reorderThreads(projectId, orderedThreadIds);
  }

  async activateThread(threadId: string): Promise<TransitionResult> {
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const recovery = inferredThreadRecovery(
      thread,
      this.owner.snapshot(),
      this.#sessions.has(threadId),
    );
    if (recovery?.kind === "missing-project" || recovery?.kind === "missing-worktree") {
      await this.#setRecovery(thread, recovery);
      return {
        status: "refused",
        reason: `${recovery.summary} (${thread.worktreeId})`,
      };
    }
    return this.owner.activateThread(threadId);
  }

  async closeThread(threadId: string): Promise<TransitionResult> {
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const terminal = this.#sessions.get(threadId);
    const status = terminal?.snapshot().status;
    if (status === "running" || status === "starting") {
      return {
        status: "refused",
        reason: `${thread.name} is still running`,
        recovery: {
          label: `Terminate ${thread.name}`,
          run: () => this.#terminateAndClose(threadId),
        },
      };
    }
    await this.#waitForLifecycle(threadId);
    return this.#closeDetached(threadId);
  }

  async removeThread(threadId: string): Promise<TransitionResult> {
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const terminal = this.#sessions.get(threadId);
    const status = terminal?.snapshot().status;
    if (status === "running" || status === "starting") return this.closeThread(threadId);
    if (terminal?.snapshot().sessionId) {
      try {
        await terminal.dispose();
      } catch (cause) {
        return refused(cause);
      }
    }
    this.#sessions.delete(threadId);
    return this.owner.removeThread(threadId);
  }

  async recoverThread(threadId: string): Promise<TransitionResult> {
    let thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const existing = this.#sessions.get(threadId);
    if (existing?.snapshot().status === "running") return { status: "committed" };
    await this.#waitForLifecycle(threadId);
    if (existing?.snapshot().sessionId) {
      try {
        await existing.dispose();
      } catch (cause) {
        return refused(cause);
      }
    }
    this.#sessions.delete(threadId);
    thread = this.owner.snapshot().threads.find(({ id }) => id === threadId)!;

    const refreshed = await this.#refreshScope(thread);
    if (refreshed.status === "refused") return refreshed;
    thread = this.owner.snapshot().threads.find(({ id }) => id === threadId)!;
    const nextRevision = thread.lifecycleRevision + 1;
    await this.owner.updateThreadRuntime(threadId, {
      lifecycle: "starting",
      lifecycleSource: "process",
      lifecycleRevision: nextRevision,
      attentionUnread: thread.attentionUnread,
      attentionVersion: thread.attentionVersion,
      backingAvailability: "starting",
      recovery: null,
    });
    const terminal = this.#createSession(thread, nextRevision);
    this.#sessions.set(threadId, terminal);
    try {
      await terminal.start(this.#initialViewport);
      await this.#waitForLifecycle(threadId);
      return { status: "committed" };
    } catch (cause) {
      await this.#waitForLifecycle(threadId);
      return refused(cause);
    }
  }

  setThreadsVisibility(visibility: ThreadsVisibility): Promise<TransitionResult> {
    return this.owner.setThreadsVisibility(visibility);
  }

  acknowledgeAttention(threadId: string, version: number): Promise<TransitionResult> {
    return this.owner.acknowledgeThreadAttention(threadId, version);
  }

  observeLifecycle(threadId: string, signal: ThreadLifecycleSignal): Promise<TransitionResult> {
    const previous = this.#lifecycleTails.get(threadId) ?? Promise.resolve({ status: "committed" });
    const work = previous.then(() => this.#applyLifecycle(threadId, signal));
    this.#lifecycleTails.set(
      threadId,
      work.catch((cause) => refused(cause)),
    );
    return work;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopProjectRemovalGuard();
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.all(
      sessions.map(async (terminal) => {
        try {
          if (terminal.snapshot().sessionId) await terminal.dispose();
        } catch {
          // Native teardown is best effort here; its manager owns final cleanup.
        }
      }),
    );
  }

  #prepareProjectRemoval(projectId: string): TransitionDecision {
    const live = this.owner.snapshot().threads.filter(({ id, projectId: owner }) => {
      if (owner !== projectId) return false;
      const status = this.#sessions.get(id)?.snapshot().status;
      return status === "running" || status === "starting";
    });
    if (live.length === 0) return { status: "ready" };
    return {
      status: "refused",
      reason: `${live.length} project thread${live.length === 1 ? " is" : "s are"} still running`,
      recovery: {
        label: live.length === 1 ? "Terminate project thread" : "Terminate project threads",
        run: async () => {
          for (const thread of live) await this.#terminateAndClose(thread.id);
        },
      },
    };
  }

  async #resolveScope(request: CreateThreadRequest): Promise<TerminalScope | TransitionResult> {
    if (request.workspace.kind === "new-worktree") {
      let created: CreateThreadWorktreeResult;
      try {
        created = await this.platform.createThreadWorktree({
          projectId: request.workspace.projectId,
          name: request.workspace.name,
          branch: request.workspace.branch,
          baseRevision: request.workspace.baseRevision,
        });
      } catch (cause) {
        return refused(cause);
      }
      if (created.status === "refused") return created;
      const refresh = await this.#refreshProject(request.workspace.projectId);
      if (refresh.status === "refused") return refresh;
      const worktree = this.owner
        .snapshot()
        .worktrees.find(
          ({ id, projectId }) =>
            id === created.worktree.id && projectId === request.workspace.projectId,
        );
      return worktree?.availability === "available"
        ? { projectId: request.workspace.projectId, worktreeId: worktree.id }
        : { status: "refused", reason: "Native worktree grant was not published" };
    }

    const workspace = request.workspace;
    const state = this.owner.snapshot();
    const project = state.projects.find(({ id }) => id === workspace.projectId);
    const worktree = state.worktrees.find(
      ({ id, projectId }) => id === workspace.worktreeId && projectId === workspace.projectId,
    );
    if (!project || project.availability !== "available") {
      return { status: "refused", reason: `Project ${workspace.projectId} is unavailable` };
    }
    if (!worktree || worktree.availability !== "available") {
      return {
        status: "refused",
        reason: `Worktree ${workspace.worktreeId} is unavailable`,
      };
    }
    if (workspace.kind === "project-root" && worktree.root !== project.root) {
      return { status: "refused", reason: "The selected worktree is not the project root" };
    }
    return { projectId: project.id, worktreeId: worktree.id };
  }

  async #refreshProject(projectId: string): Promise<TransitionResult> {
    try {
      const grant = (await this.platform.projectGrants()).find(({ id }) => id === projectId);
      return grant
        ? this.owner.refreshProjectGrant(grant)
        : { status: "refused", reason: `Native project grant ${projectId} is unavailable` };
    } catch (cause) {
      return refused(cause);
    }
  }

  async #refreshScope(thread: ThreadState): Promise<TransitionResult> {
    const state = this.owner.snapshot();
    const project = state.projects.find(({ id }) => id === thread.projectId);
    const worktree = state.worktrees.find(
      ({ id, projectId }) => id === thread.worktreeId && projectId === thread.projectId,
    );
    if (project?.availability === "available" && worktree?.availability === "available") {
      return { status: "committed" };
    }
    const refreshed = await this.#refreshProject(thread.projectId);
    if (refreshed.status === "refused") return refreshed;
    const available = this.owner
      .snapshot()
      .worktrees.some(
        ({ id, projectId, availability }) =>
          id === thread.worktreeId &&
          projectId === thread.projectId &&
          availability === "available",
      );
    return available
      ? { status: "committed" }
      : { status: "refused", reason: `Worktree ${thread.worktreeId} is unavailable` };
  }

  #rememberedFile(scope: TerminalScope): string | null {
    const state = this.owner.snapshot();
    if (
      state.active.projectId === scope.projectId &&
      state.active.worktreeId === scope.worktreeId
    ) {
      return state.active.fileId;
    }
    return (
      state.openFiles.find(
        ({ projectId, worktreeId }) =>
          projectId === scope.projectId && worktreeId === scope.worktreeId,
      )?.id ?? null
    );
  }

  #createSession(
    thread: Pick<ThreadState, "id" | "projectId" | "worktreeId">,
    revisionBase: number,
  ): TerminalThreadSession {
    return new TerminalThreadSession(
      this.platform.terminal,
      { projectId: thread.projectId, worktreeId: thread.worktreeId },
      {
        onLifecycle: async (signal) => {
          await this.observeLifecycle(thread.id, {
            ...signal,
            revision: revisionBase + signal.revision,
          });
        },
        onInstrumentation: (event) => {
          void this.#instrumentation?.record({
            recordType: "event",
            operation: event.operation,
            outcome: event.outcome,
            context: {
              projectId: event.projectId,
              worktreeId: event.worktreeId,
              threadId: thread.id,
              ...(event.sessionId ? { threadSessionId: event.sessionId } : {}),
            },
          });
        },
      },
    );
  }

  async #applyLifecycle(
    threadId: string,
    signal: ThreadLifecycleSignal,
  ): Promise<TransitionResult> {
    const state = this.owner.snapshot();
    const durable = state.threads.find(({ id }) => id === threadId);
    if (!durable) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const current = threadRecordFromState(durable, state, this.#sessions.has(threadId));
    const applied = applyThreadLifecycle(current, signal);
    if (applied.thread === current) return { status: "committed" };
    const update: ThreadRuntimeUpdate = {
      lifecycle: applied.thread.lifecycle,
      lifecycleSource: applied.thread.lifecycleSource,
      lifecycleRevision: applied.thread.lifecycleRevision,
      attentionUnread: applied.thread.attention.unread,
      attentionVersion: applied.thread.attention.version,
      backingAvailability: processBackingAfter(signal, durable),
      recovery: processRecoveryAfter(signal, durable),
    };
    const result = await this.owner.updateThreadRuntime(threadId, update);
    if (result.status === "committed" && applied.event) {
      for (const listener of this.#attentionListeners) listener(applied.event);
    }
    return result;
  }

  async #waitForLifecycle(threadId: string): Promise<void> {
    await (this.#lifecycleTails.get(threadId) ?? Promise.resolve());
  }

  async #setRecovery(
    thread: ThreadState,
    recovery: FeatureThreadRecoveryState,
  ): Promise<TransitionResult> {
    return this.owner.updateThreadRuntime(thread.id, {
      lifecycle: "unknown",
      lifecycleSource: thread.lifecycleSource,
      lifecycleRevision: thread.lifecycleRevision,
      attentionUnread: thread.attentionUnread,
      attentionVersion: thread.attentionVersion,
      backingAvailability: thread.backingAvailability,
      recovery,
    });
  }

  async #terminateAndClose(threadId: string): Promise<void> {
    const terminal = this.#sessions.get(threadId);
    if (!terminal) throw new Error(`Thread ${threadId} has no attached terminal`);
    await terminal.terminate();
    await this.#waitForLifecycle(threadId);
    await terminal.dispose();
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return;
    await this.owner.updateThreadRuntime(threadId, {
      lifecycle: thread.lifecycle,
      lifecycleSource: thread.lifecycleSource,
      lifecycleRevision: thread.lifecycleRevision,
      attentionUnread: thread.attentionUnread,
      attentionVersion: thread.attentionVersion,
      backingAvailability: "closed",
      recovery: null,
    });
  }

  async #closeDetached(threadId: string): Promise<TransitionResult> {
    const terminal = this.#sessions.get(threadId);
    if (terminal?.snapshot().sessionId) {
      try {
        await terminal.dispose();
      } catch (cause) {
        return refused(cause);
      }
    }
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    this.#sessions.delete(threadId);
    return this.owner.updateThreadRuntime(threadId, {
      lifecycle: thread.lifecycle === "starting" ? "unknown" : thread.lifecycle,
      lifecycleSource: thread.lifecycleSource,
      lifecycleRevision: thread.lifecycleRevision,
      attentionUnread: thread.attentionUnread,
      attentionVersion: thread.attentionVersion,
      backingAvailability: "closed",
      recovery: null,
    });
  }
}

export function createRootThreadsAdapter(
  owner: WorkbenchStateOwner,
  platform: ThreadRuntimePlatform,
  options?: RootThreadsOptions,
): RootThreadsAdapter {
  return new RootThreadsAdapter(owner, platform, options);
}
