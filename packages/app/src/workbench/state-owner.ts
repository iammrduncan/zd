import type { FileResource, LaunchRequest, ProjectGrant } from "./resources";
import { cloneState, parseWorkbenchState } from "./state-codec";
import { ProjectStateMutations } from "./state-owner-projects";
import {
  bufferStateId,
  clamp,
  contextForLaunch,
  contextProblem,
  defaultWorkbenchState,
  fileStateId,
  launchFile,
  sameContext,
  stateWithGrants,
  uniqueGrants,
  type ContextTransition,
  type OpenFileState,
  type ProjectRemoval,
  type ProjectRemovalGuard,
  type ThreadRuntimeUpdate,
  type ThreadState,
  type ThreadsVisibility,
  type TransitionDecision,
  type TransitionGuard,
  type TransitionResult,
  type WindowPresentation,
  type WorkbenchContext,
  type WorkbenchRegions,
  type WorkbenchState,
} from "./state-core";

const MAX_THREAD_NAME_LENGTH = 160;

function threadNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_THREAD_NAME_LENGTH) {
    return "Thread name must be non-empty and bounded";
  }
  const hasControlCharacter = [...trimmed].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || codePoint === 127;
  });
  return hasControlCharacter ? "Thread name cannot contain control characters" : null;
}

export class WorkbenchStateOwner {
  readonly #guards = new Map<string, TransitionGuard>();
  readonly #listeners = new Set<(state: WorkbenchState) => void>();
  readonly #projectContexts = new Map<string, WorkbenchContext>();
  readonly #projectMutations: ProjectStateMutations;
  readonly #projectRemovalGuards = new Map<string, ProjectRemovalGuard>();
  #state: WorkbenchState;
  #transitionTail: Promise<void> = Promise.resolve();

  constructor(initial: WorkbenchState = defaultWorkbenchState()) {
    this.#state = parseWorkbenchState(initial);
    this.#projectMutations = new ProjectStateMutations({
      snapshot: () => this.#state,
      commitTransition: (candidate, target) => this.#commitTransition(candidate, target),
      contextForProject: (state, projectId) => this.#contextForProject(state, projectId),
      forgetContext: (projectId) => this.#projectContexts.delete(projectId),
      prepareProjectRemoval: (change) => this.#prepareProjectRemoval(change),
      prepareTransition: (change) => this.#prepareTransition(change),
      publish: (next) => this.#publish(next),
      rememberContext: (state, context) => this.#rememberContext(state, context),
    });
    this.#rememberContext(this.#state, this.#state.active);
  }

  #enqueue(operation: () => Promise<TransitionResult>): Promise<TransitionResult> {
    const work = this.#transitionTail.then(operation);
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  snapshot(): WorkbenchState {
    return this.#state;
  }

  subscribe(listener: (state: WorkbenchState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  registerTransitionGuard(guard: TransitionGuard): () => void {
    this.#guards.set(guard.id, guard);
    return () => {
      if (this.#guards.get(guard.id) === guard) this.#guards.delete(guard.id);
    };
  }

  registerProjectRemovalGuard(guard: ProjectRemovalGuard): () => void {
    this.#projectRemovalGuards.set(guard.id, guard);
    return () => {
      if (this.#projectRemovalGuards.get(guard.id) === guard) {
        this.#projectRemovalGuards.delete(guard.id);
      }
    };
  }

  activateContext(target: WorkbenchContext): Promise<TransitionResult> {
    return this.#enqueue(() => this.#activateContext(target));
  }

  async #activateContext(target: WorkbenchContext): Promise<TransitionResult> {
    return this.#commitTransition(this.#state, target);
  }

  activateProject(projectId: string): Promise<TransitionResult> {
    return this.#enqueue(() => this.#activateProject(projectId));
  }

  async #activateProject(projectId: string): Promise<TransitionResult> {
    const target = this.#contextForProject(this.#state, projectId);
    return target
      ? this.#commitTransition(this.#state, target)
      : { status: "refused", reason: `Unknown project or approved worktree ${projectId}` };
  }

  addThread(thread: ThreadState): Promise<TransitionResult> {
    return this.#enqueue(() => this.#addThread(thread));
  }

  async #addThread(thread: ThreadState): Promise<TransitionResult> {
    if (this.#state.threads.some(({ id }) => id === thread.id)) {
      return { status: "refused", reason: `Thread ${thread.id} already exists` };
    }
    const problem = this.#threadScopeProblem(thread);
    if (problem) return { status: "refused", reason: problem };
    const nameProblem = threadNameProblem(thread.name);
    if (nameProblem) return { status: "refused", reason: nameProblem };

    const candidate: WorkbenchState = {
      ...this.#state,
      threads: [...this.#state.threads, { ...thread }],
      regions: {
        ...this.#state.regions,
        threads: { ...this.#state.regions.threads },
        files: { ...this.#state.regions.files },
        centre: { ...this.#state.regions.centre },
        focus: "thread",
      },
    };
    return this.#commitTransition(candidate, this.#contextForThread(candidate, thread));
  }

  activateThread(threadId: string): Promise<TransitionResult> {
    return this.#enqueue(() => this.#activateThread(threadId));
  }

  async #activateThread(threadId: string): Promise<TransitionResult> {
    const thread = this.#state.threads.find(({ id }) => id === threadId);
    if (!thread) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const problem = this.#threadScopeProblem(thread);
    if (problem) return { status: "refused", reason: problem };
    const candidate: WorkbenchState = {
      ...this.#state,
      regions: {
        ...this.#state.regions,
        threads: { ...this.#state.regions.threads },
        files: { ...this.#state.regions.files },
        centre: { ...this.#state.regions.centre },
        focus: "thread",
      },
    };
    return this.#commitTransition(candidate, this.#contextForThread(candidate, thread));
  }

  renameThread(threadId: string, name: string): Promise<TransitionResult> {
    return this.#enqueue(() => this.#renameThread(threadId, name));
  }

  async #renameThread(threadId: string, name: string): Promise<TransitionResult> {
    const index = this.#state.threads.findIndex(({ id }) => id === threadId);
    if (index < 0) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const problem = threadNameProblem(name);
    if (problem) return { status: "refused", reason: problem };
    const trimmed = name.trim();
    if (this.#state.threads[index]!.name === trimmed) return { status: "committed" };
    const threads = [...this.#state.threads];
    threads[index] = { ...threads[index]!, name: trimmed };
    this.#publish({ ...this.#state, threads });
    return { status: "committed" };
  }

  reorderThreads(projectId: string, orderedIds: readonly string[]): Promise<TransitionResult> {
    return this.#enqueue(() => this.#reorderThreads(projectId, orderedIds));
  }

  async #reorderThreads(
    projectId: string,
    orderedIds: readonly string[],
  ): Promise<TransitionResult> {
    if (!this.#state.projects.some(({ id }) => id === projectId)) {
      return { status: "refused", reason: `Unknown project ${projectId}` };
    }
    const current = this.#state.threads.filter(({ projectId: owner }) => owner === projectId);
    const currentIds = current.map(({ id }) => id);
    const exact =
      orderedIds.length === currentIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      currentIds.every((id) => orderedIds.includes(id));
    if (!exact) {
      return {
        status: "refused",
        reason: "Thread order must contain the project's complete identity set",
      };
    }
    const order = new Map(orderedIds.map((id, index) => [id, index]));
    const threads = this.#state.threads.map((thread) =>
      thread.projectId === projectId ? { ...thread, order: order.get(thread.id)! } : thread,
    );
    if (threads.every((thread, index) => thread === this.#state.threads[index])) {
      return { status: "committed" };
    }
    this.#publish({ ...this.#state, threads });
    return { status: "committed" };
  }

  updateThreadRuntime(threadId: string, update: ThreadRuntimeUpdate): Promise<TransitionResult> {
    return this.#enqueue(() => this.#updateThreadRuntime(threadId, update));
  }

  async #updateThreadRuntime(
    threadId: string,
    update: ThreadRuntimeUpdate,
  ): Promise<TransitionResult> {
    const index = this.#state.threads.findIndex(({ id }) => id === threadId);
    if (index < 0) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const current = this.#state.threads[index]!;
    if (
      !Number.isSafeInteger(update.lifecycleRevision) ||
      update.lifecycleRevision < current.lifecycleRevision ||
      !Number.isSafeInteger(update.attentionVersion) ||
      update.attentionVersion < current.attentionVersion
    ) {
      return { status: "refused", reason: `Thread ${threadId} runtime update is out of order` };
    }
    const threads = [...this.#state.threads];
    threads[index] = { ...current, ...update };
    this.#publish({ ...this.#state, threads });
    return { status: "committed" };
  }

  acknowledgeThreadAttention(threadId: string, version: number): Promise<TransitionResult> {
    return this.#enqueue(() => this.#acknowledgeThreadAttention(threadId, version));
  }

  async #acknowledgeThreadAttention(threadId: string, version: number): Promise<TransitionResult> {
    const index = this.#state.threads.findIndex(({ id }) => id === threadId);
    if (index < 0) return { status: "refused", reason: `Unknown thread ${threadId}` };
    const current = this.#state.threads[index]!;
    if (!current.attentionUnread || current.attentionVersion !== version) {
      return { status: "committed" };
    }
    const threads = [...this.#state.threads];
    threads[index] = { ...current, attentionUnread: false };
    this.#publish({ ...this.#state, threads });
    return { status: "committed" };
  }

  removeThread(threadId: string): Promise<TransitionResult> {
    return this.#enqueue(() => this.#removeThread(threadId));
  }

  async #removeThread(threadId: string): Promise<TransitionResult> {
    const current = this.#state.threads.find(({ id }) => id === threadId);
    if (!current) return { status: "refused", reason: `Unknown thread ${threadId}` };
    if (
      ["starting", "ready"].includes(current.backingAvailability) ||
      ["starting", "busy"].includes(current.lifecycle)
    ) {
      return { status: "refused", reason: `Thread ${threadId} still owns a live process` };
    }

    const threads = this.#state.threads.filter(({ id }) => id !== threadId);
    const candidate = { ...this.#state, threads };
    if (this.#state.active.threadId !== threadId) {
      this.#publish(candidate);
      return { status: "committed" };
    }

    const fallback = threads
      .filter(
        (thread) =>
          thread.projectId === current.projectId && thread.worktreeId === current.worktreeId,
      )
      .sort((left, right) => left.order - right.order)[0];
    const target: WorkbenchContext = {
      ...this.#state.active,
      threadId: fallback?.id ?? null,
    };
    const withFocus: WorkbenchState = {
      ...candidate,
      regions: {
        ...candidate.regions,
        threads: { ...candidate.regions.threads },
        files: { ...candidate.regions.files },
        centre: { ...candidate.regions.centre },
        focus: fallback ? "thread" : candidate.active.fileId ? "file" : "files",
      },
    };
    return this.#commitTransition(withFocus, target);
  }

  setThreadsVisibility(visibility: ThreadsVisibility): Promise<TransitionResult> {
    return this.#enqueue(() => this.#setThreadsVisibility(visibility));
  }

  async #setThreadsVisibility(visibility: ThreadsVisibility): Promise<TransitionResult> {
    if (this.#state.regions.threads.visibility === visibility) return { status: "committed" };
    const focus =
      visibility === "hidden" && this.#state.regions.focus === "threads"
        ? this.#state.active.threadId
          ? "thread"
          : this.#state.active.fileId
            ? "file"
            : "files"
        : this.#state.regions.focus;
    this.#publish({
      ...this.#state,
      regions: {
        ...this.#state.regions,
        threads: { ...this.#state.regions.threads, visibility },
        files: { ...this.#state.regions.files },
        centre: { ...this.#state.regions.centre },
        focus,
      },
    });
    return { status: "committed" };
  }

  acceptProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    return this.#enqueue(() => this.#projectMutations.accept(grant));
  }

  reorderProjects(orderedIds: readonly string[]): Promise<TransitionResult> {
    return this.#enqueue(async () => this.#projectMutations.reorder(orderedIds));
  }

  removeProject(projectId: string, revoke: () => Promise<void>): Promise<TransitionResult> {
    return this.#enqueue(() => this.#projectMutations.remove(projectId, revoke));
  }

  refreshProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    return this.#enqueue(() => this.#projectMutations.refresh(grant));
  }

  applyLaunch(launch: LaunchRequest, grants: readonly ProjectGrant[]): Promise<TransitionResult> {
    return this.#enqueue(() => this.#applyLaunch(launch, grants));
  }

  async #applyLaunch(
    launch: LaunchRequest,
    grants: readonly ProjectGrant[],
  ): Promise<TransitionResult> {
    if (launch.problem && !launch.project) {
      return { status: "refused", reason: launch.problem };
    }
    let candidate = stateWithGrants(this.#state, uniqueGrants(grants, launch));
    const file = launchFile(launch);
    if (file && !candidate.openFiles.some(({ id }) => id === file.id)) {
      candidate = { ...candidate, openFiles: [...candidate.openFiles, file] };
    }
    return this.#commitTransition(candidate, contextForLaunch(candidate, launch));
  }

  activateFile(resource: FileResource): Promise<TransitionResult> {
    return this.#enqueue(() => this.#activateFile(resource));
  }

  async #activateFile(resource: FileResource): Promise<TransitionResult> {
    const id = fileStateId(resource);
    if (this.#state.active.fileId === id) return { status: "committed" };
    const file: OpenFileState = { id, ...resource, bufferId: bufferStateId(resource) };
    let candidate = this.#state.openFiles.some((open) => open.id === id)
      ? this.#state
      : { ...this.#state, openFiles: [...this.#state.openFiles, file] };
    const sameWorkspace =
      this.#state.active.projectId === resource.projectId &&
      this.#state.active.worktreeId === resource.worktreeId;
    if (sameWorkspace && this.#state.active.threadId) {
      candidate = {
        ...candidate,
        threads: candidate.threads.map((thread) =>
          thread.id === this.#state.active.threadId ? { ...thread, fileId: id } : thread,
        ),
      };
    }
    return this.#commitTransition(candidate, {
      projectId: resource.projectId,
      worktreeId: resource.worktreeId,
      threadId: sameWorkspace ? this.#state.active.threadId : null,
      fileId: id,
    });
  }

  async #commitTransition(
    candidate: WorkbenchState,
    target: WorkbenchContext,
  ): Promise<TransitionResult> {
    const problem = contextProblem(candidate, target);
    if (problem) return { status: "refused", reason: problem };

    const change = { from: this.#state.active, to: target };
    const decision = sameContext(change.from, change.to)
      ? ({ status: "ready" } as const)
      : await this.#prepareTransition(change);
    if (decision.status === "refused") return decision;

    this.#rememberContext(this.#state, change.from);
    this.#rememberContext(candidate, target);
    this.#publish({ ...candidate, active: { ...target } });
    return { status: "committed" };
  }

  async #prepareTransition(change: ContextTransition): Promise<TransitionDecision> {
    for (const guard of this.#guards.values()) {
      let decision: TransitionDecision;
      try {
        decision = await guard.prepare(change);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        return { status: "refused", reason: `${guard.id}: ${reason}` };
      }
      if (decision.status === "refused") return decision;
    }
    return { status: "ready" };
  }

  async #prepareProjectRemoval(change: ProjectRemoval): Promise<TransitionDecision> {
    for (const guard of this.#projectRemovalGuards.values()) {
      let decision: TransitionDecision;
      try {
        decision = await guard.prepareRemoval(change);
      } catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause);
        return { status: "refused", reason: `${guard.id}: ${reason}` };
      }
      if (decision.status === "refused") return decision;
    }
    return { status: "ready" };
  }

  #contextForProject(state: WorkbenchState, projectId: string): WorkbenchContext | null {
    const project = state.projects.find(({ id }) => id === projectId);
    if (!project) return null;
    const remembered = this.#projectContexts.get(projectId);
    if (remembered && contextProblem(state, remembered) === null) return { ...remembered };

    const worktree = state.worktrees.find(({ projectId: owner }) => owner === projectId);
    if (!worktree) return null;
    const thread = state.threads.find(
      ({ projectId: owner, worktreeId }) => owner === projectId && worktreeId === worktree.id,
    );
    const file = state.openFiles.find(
      ({ projectId: owner, worktreeId }) => owner === projectId && worktreeId === worktree.id,
    );
    return {
      projectId,
      worktreeId: worktree.id,
      threadId: thread?.id ?? null,
      fileId: file?.id ?? null,
    };
  }

  #threadScopeProblem(thread: ThreadState): string | null {
    const project = this.#state.projects.find(({ id }) => id === thread.projectId);
    if (!project || project.availability !== "available") {
      return `Project ${thread.projectId} is not available for thread ${thread.id}`;
    }
    const worktree = this.#state.worktrees.find(({ id }) => id === thread.worktreeId);
    if (!worktree || worktree.projectId !== project.id || worktree.availability !== "available") {
      return `Worktree ${thread.worktreeId} is not available for thread ${thread.id}`;
    }
    if (!Number.isSafeInteger(thread.order) || thread.order < 0 || !thread.backingId) {
      return `Thread ${thread.id} has invalid durable state`;
    }
    return null;
  }

  #contextForThread(state: WorkbenchState, thread: ThreadState): WorkbenchContext {
    const remembered = state.openFiles.find(
      (file) =>
        file.id === thread.fileId &&
        file.projectId === thread.projectId &&
        file.worktreeId === thread.worktreeId,
    );
    return {
      projectId: thread.projectId,
      worktreeId: thread.worktreeId,
      threadId: thread.id,
      fileId: remembered?.id ?? null,
    };
  }

  #rememberContext(state: WorkbenchState, context: WorkbenchContext): void {
    if (context.projectId !== null && contextProblem(state, context) === null) {
      this.#projectContexts.set(context.projectId, { ...context });
    }
  }

  updateRegions(regions: WorkbenchRegions): void {
    const current = this.#state.regions;
    this.#publish({
      ...this.#state,
      regions: {
        threads: {
          ...regions.threads,
          width: clamp(regions.threads.width, 184, 300, current.threads.width),
        },
        files: {
          ...regions.files,
          width: clamp(regions.files.width, 220, 360, current.files.width),
        },
        centre: {
          ...regions.centre,
          split: clamp(regions.centre.split, 0.3, 0.7, current.centre.split),
        },
        focus: regions.focus,
      },
    });
  }

  setWindowPresentation(presentation: WindowPresentation): void {
    if (this.#state.window.presentation === presentation) return;
    this.#publish({ ...this.#state, window: { presentation } });
  }

  setThemeSelection(selected: string, lastValid: string): void {
    if (!selected || !lastValid) return;
    if (this.#state.theme.selected === selected && this.#state.theme.lastValid === lastValid)
      return;
    this.#publish({ ...this.#state, theme: { selected, lastValid } });
  }

  #publish(next: WorkbenchState): void {
    this.#state = cloneState(next);
    for (const listener of this.#listeners) listener(this.#state);
  }
}

export function createWorkbenchStateOwner(
  initial: WorkbenchState = defaultWorkbenchState(),
): WorkbenchStateOwner {
  return new WorkbenchStateOwner(initial);
}
