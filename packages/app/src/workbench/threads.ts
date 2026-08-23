import type { InstrumentationClient } from "@/instrumentation";
import type {
  TerminalAdapter,
  TerminalScope,
  TerminalSessionHandle,
  TerminalViewport,
} from "@/terminal";
import {
  applyThreadLifecycle,
  createSupportedAgentDetector,
  TerminalThreadSession,
  type CreateThreadRequest,
  type ThreadAttentionEventV1,
  type ThreadLifecycleSignal,
  type ThreadRecoveryState as FeatureThreadRecoveryState,
  type ThreadWorkbenchAdapter,
  type ThreadWorkbenchSnapshot,
} from "@/threads";
import { ThreadScopeResolver, type ThreadScopePlatform } from "./thread-scope";
import { boundedAutomaticName } from "./thread-name";
import {
  defaultThreadId,
  inferredThreadRecovery,
  processBackingAfter,
  processRecoveryAfter,
  threadRecordFromState,
  threadSnapshotFromState,
} from "./thread-projection";
import type {
  ThreadRuntimeUpdate,
  ThreadState,
  ThreadsVisibility,
  TransitionDecision,
  TransitionResult,
  WorkbenchStateOwner,
} from "./state";

export interface ThreadRuntimePlatform extends ThreadScopePlatform {
  readonly terminal: TerminalAdapter;
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
  readonly #automaticNames = new Map<string, string>();
  readonly #automaticNameTails = new Map<string, Promise<TransitionResult>>();
  readonly #lifecycleTails = new Map<string, Promise<TransitionResult>>();
  readonly #sessions = new Map<string, TerminalThreadSession>();
  readonly #scopes: ThreadScopeResolver;
  readonly #stopOutputReady: () => void;
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
    this.#scopes = new ThreadScopeResolver(owner, platform);
    this.#stopOutputReady =
      platform.terminal.onOutputReady?.((session) => this.#handleOutputReady(session)) ??
      (() => {});
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
    const scope = await this.#scopes.resolve(request);
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
    this.#automaticNames.set(id, durable.name);
    this.#sessions.set(id, terminal);
    const added = await this.owner.addThread(durable);
    if (added.status === "refused") {
      this.#automaticNames.delete(id);
      this.#sessions.delete(id);
      return added;
    }
    try {
      await terminal.start(this.#initialViewport);
      await terminal.refresh();
      await terminal.pollExit();
      await this.#waitForLifecycle(id);
      return { status: "committed" };
    } catch (cause) {
      await this.#waitForLifecycle(id);
      return refused(cause);
    }
  }

  async renameThread(threadId: string, name: string): Promise<TransitionResult> {
    const wasAutomatic = this.#automaticNames.has(threadId);
    this.#automaticNames.delete(threadId);
    await (this.#automaticNameTails.get(threadId) ?? Promise.resolve());
    this.#automaticNames.delete(threadId);
    const result = await this.owner.renameThread(threadId, name);
    if (result.status === "refused" && wasAutomatic) {
      const current = this.owner.snapshot().threads.find(({ id }) => id === threadId);
      if (current) this.#automaticNames.set(threadId, current.name);
    }
    return result;
  }

  updateAutomaticName(threadId: string, title: string): Promise<TransitionResult> {
    const previous =
      this.#automaticNameTails.get(threadId) ??
      Promise.resolve<TransitionResult>({ status: "committed" });
    const work = previous.then(() => this.#applyAutomaticName(threadId, title));
    this.#automaticNameTails.set(
      threadId,
      work.catch((cause) => refused(cause)),
    );
    return work;
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
    if (status === "running" || status === "starting") {
      try {
        await this.#terminateAndClose(threadId);
      } catch (cause) {
        return refused(cause);
      }
    }
    if (terminal?.snapshot().sessionId) {
      try {
        await terminal.dispose();
      } catch (cause) {
        return refused(cause);
      }
    }
    this.#sessions.delete(threadId);
    const result = await this.owner.removeThread(threadId);
    if (result.status === "committed") {
      this.#automaticNames.delete(threadId);
      this.#automaticNameTails.delete(threadId);
    }
    return result;
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

    const refreshed = await this.#scopes.refresh(thread);
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
      await terminal.refresh();
      await terminal.pollExit();
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
    this.#stopOutputReady();
    this.#stopProjectRemovalGuard();
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    this.#automaticNames.clear();
    this.#automaticNameTails.clear();
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

  #handleOutputReady(handle: TerminalSessionHandle): void {
    const terminal = [...this.#sessions.values()].find((candidate) => {
      const snapshot = candidate.snapshot();
      return (
        snapshot.sessionId === handle.sessionId &&
        candidate.scope.projectId === handle.projectId &&
        candidate.scope.worktreeId === handle.worktreeId
      );
    });
    if (!terminal) return;
    void terminal
      .refresh()
      .then(() => terminal.pollExit())
      .catch(() => undefined);
  }

  async #applyAutomaticName(threadId: string, title: string): Promise<TransitionResult> {
    if (!this.#automaticNames.has(threadId)) return { status: "committed" };
    const name = boundedAutomaticName(title);
    if (!name) return { status: "committed" };
    const thread = this.owner.snapshot().threads.find(({ id }) => id === threadId);
    if (!thread) {
      this.#automaticNames.delete(threadId);
      return { status: "refused", reason: `Unknown thread ${threadId}` };
    }
    if (thread.name === name) return { status: "committed" };
    const result = await this.owner.renameThread(threadId, name);
    if (result.status === "committed") this.#automaticNames.set(threadId, name);
    return result;
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
    thread: Pick<ThreadState, "id" | "projectId" | "worktreeId" | "agent">,
    revisionBase: number,
  ): TerminalThreadSession {
    const detector = createSupportedAgentDetector(thread.agent);
    return new TerminalThreadSession(
      this.platform.terminal,
      { projectId: thread.projectId, worktreeId: thread.worktreeId },
      {
        ...(detector ? { detector } : {}),
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
