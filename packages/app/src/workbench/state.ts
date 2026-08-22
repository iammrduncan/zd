import type { FileResource, LaunchRequest, ProjectGrant } from "./resources";

export const WORKBENCH_STATE_VERSION = 1 as const;

export type ProjectAvailability = "available" | "missing" | "denied" | "unavailable";
export type ThreadsVisibility = "full" | "collapsed" | "hidden";
export type FilesVisibility = "visible" | "hidden";
export type FilesTab = "files" | "changes";
export type CentreMode = "overlap" | "side-by-side";
export type WorkbenchFocus = "threads" | "thread" | "file" | "files";
export type WindowPresentation = "ordinary" | "quick-access";

export interface ProjectState {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly availability: ProjectAvailability;
}

export interface WorktreeState {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly root: string;
  readonly availability: ProjectAvailability;
}

export interface ThreadState {
  readonly id: string;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly name: string;
  readonly sessionId: string | null;
}

export interface OpenFileState {
  readonly id: string;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly relativePath: string;
  readonly bufferId: string;
}

export interface WorkbenchContext {
  readonly projectId: string | null;
  readonly worktreeId: string | null;
  readonly threadId: string | null;
  readonly fileId: string | null;
}

export interface WorkbenchRegions {
  readonly threads: { readonly visibility: ThreadsVisibility; readonly width: number };
  readonly files: {
    readonly visibility: FilesVisibility;
    readonly width: number;
    readonly tab: FilesTab;
  };
  readonly centre: { readonly mode: CentreMode; readonly split: number };
  readonly focus: WorkbenchFocus;
}

export interface WorkbenchState {
  readonly schemaVersion: typeof WORKBENCH_STATE_VERSION;
  readonly projects: readonly ProjectState[];
  readonly worktrees: readonly WorktreeState[];
  readonly threads: readonly ThreadState[];
  readonly openFiles: readonly OpenFileState[];
  readonly active: WorkbenchContext;
  readonly regions: WorkbenchRegions;
  readonly window: { readonly presentation: WindowPresentation };
  readonly theme: { readonly selected: string; readonly lastValid: string };
}

export interface TransitionRecovery {
  readonly label: string;
  readonly run: () => void | Promise<void>;
}

export type TransitionDecision =
  | { readonly status: "ready" }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly recovery?: TransitionRecovery;
    };

export interface ContextTransition {
  readonly from: WorkbenchContext;
  readonly to: WorkbenchContext;
}

export interface TransitionGuard {
  readonly id: string;
  prepare(change: ContextTransition): TransitionDecision | Promise<TransitionDecision>;
}

export interface ProjectRemoval {
  readonly projectId: string;
  readonly wasActive: boolean;
  readonly fallback: WorkbenchContext;
}

export interface ProjectRemovalGuard {
  readonly id: string;
  prepareRemoval(change: ProjectRemoval): TransitionDecision | Promise<TransitionDecision>;
}

export type TransitionResult =
  | { readonly status: "committed" }
  | {
      readonly status: "refused";
      readonly reason: string;
      readonly recovery?: TransitionRecovery;
    };

export function defaultWorkbenchState(): WorkbenchState {
  return {
    schemaVersion: WORKBENCH_STATE_VERSION,
    projects: [],
    worktrees: [],
    threads: [],
    openFiles: [],
    active: { projectId: null, worktreeId: null, threadId: null, fileId: null },
    regions: {
      threads: { visibility: "full", width: 236 },
      files: { visibility: "visible", width: 280, tab: "files" },
      centre: { mode: "overlap", split: 0.42 },
      focus: "file",
    },
    window: { presentation: "ordinary" },
    theme: { selected: "system", lastValid: "current-light" },
  };
}

export function fileStateId(resource: FileResource): string {
  return `file:${resource.projectId}\0${resource.worktreeId}\0${resource.relativePath}`;
}

function bufferStateId(resource: FileResource): string {
  return `buffer:${resource.projectId}\0${resource.worktreeId}\0${resource.relativePath}`;
}

function launchFile(launch: LaunchRequest): OpenFileState | null {
  if (!launch.project || !launch.worktreeId || launch.relativePath === null) return null;
  const resource = {
    projectId: launch.project.id,
    worktreeId: launch.worktreeId,
    relativePath: launch.relativePath,
  };
  return {
    id: fileStateId(resource),
    ...resource,
    bufferId: bufferStateId(resource),
  };
}

function uniqueGrants(
  grants: readonly ProjectGrant[],
  launch: LaunchRequest,
): readonly ProjectGrant[] {
  const byId = new Map(grants.map((grant) => [grant.id, grant]));
  if (launch.project) byId.set(launch.project.id, launch.project);
  return [...byId.values()];
}

function stateWithGrants(current: WorkbenchState, grants: readonly ProjectGrant[]): WorkbenchState {
  const projects = grants.map(({ id, name, root, availability }) => ({
    id,
    name,
    root,
    availability,
  }));
  const worktrees = grants.flatMap((project) =>
    project.worktrees.map(({ id, name, root, availability }) => ({
      id,
      projectId: project.id,
      name,
      root,
      availability,
    })),
  );
  const projectIds = new Set(projects.map(({ id }) => id));
  const worktreeIds = new Set(worktrees.map(({ id }) => id));
  return {
    ...current,
    projects,
    worktrees,
    threads: current.threads.filter(
      ({ projectId, worktreeId }) => projectIds.has(projectId) && worktreeIds.has(worktreeId),
    ),
    openFiles: current.openFiles.filter(
      ({ projectId, worktreeId }) => projectIds.has(projectId) && worktreeIds.has(worktreeId),
    ),
  };
}

function contextForLaunch(state: WorkbenchState, launch: LaunchRequest): WorkbenchContext {
  if (!launch.project || !launch.worktreeId) {
    return { projectId: null, worktreeId: null, threadId: null, fileId: null };
  }
  const file = launchFile(launch);
  return {
    projectId: launch.project.id,
    worktreeId: launch.worktreeId,
    threadId:
      state.active.projectId === launch.project.id && state.active.worktreeId === launch.worktreeId
        ? state.active.threadId
        : null,
    fileId: file?.id ?? null,
  };
}

export function workbenchStateFromGrants(
  grants: readonly ProjectGrant[],
  launch: LaunchRequest,
): WorkbenchState {
  let state = stateWithGrants(defaultWorkbenchState(), uniqueGrants(grants, launch));
  const file = launchFile(launch);
  if (file) state = { ...state, openFiles: [file] };
  const active = contextForLaunch(state, launch);
  return contextProblem(state, active) === null ? { ...state, active } : defaultWorkbenchState();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function hasStrings(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof record[key] === "string");
}

function validProject(value: unknown): value is ProjectState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "name", "root", "availability"]) &&
    ["available", "missing", "denied", "unavailable"].includes(value.availability as string)
  );
}

function validWorktree(value: unknown): value is WorktreeState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "name", "root", "availability"]) &&
    ["available", "missing", "denied", "unavailable"].includes(value.availability as string)
  );
}

function validThread(value: unknown): value is ThreadState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "worktreeId", "name"]) &&
    isNullableString(value.sessionId)
  );
}

function validFile(value: unknown): value is OpenFileState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "worktreeId", "relativePath", "bufferId"])
  );
}

function validContext(value: unknown): value is WorkbenchContext {
  return (
    isRecord(value) &&
    isNullableString(value.projectId) &&
    isNullableString(value.worktreeId) &&
    isNullableString(value.threadId) &&
    isNullableString(value.fileId)
  );
}

function validRegions(value: unknown): value is WorkbenchRegions {
  if (!isRecord(value) || !isRecord(value.threads) || !isRecord(value.files)) return false;
  if (!isRecord(value.centre)) return false;

  return (
    ["full", "collapsed", "hidden"].includes(value.threads.visibility as string) &&
    typeof value.threads.width === "number" &&
    ["visible", "hidden"].includes(value.files.visibility as string) &&
    typeof value.files.width === "number" &&
    ["files", "changes"].includes(value.files.tab as string) &&
    ["overlap", "side-by-side"].includes(value.centre.mode as string) &&
    typeof value.centre.split === "number" &&
    ["threads", "thread", "file", "files"].includes(value.focus as string)
  );
}

function stateShape(value: unknown): value is WorkbenchState {
  if (!isRecord(value) || value.schemaVersion !== WORKBENCH_STATE_VERSION) return false;
  if (!Array.isArray(value.projects) || !value.projects.every(validProject)) return false;
  if (!Array.isArray(value.worktrees) || !value.worktrees.every(validWorktree)) return false;
  if (!Array.isArray(value.threads) || !value.threads.every(validThread)) return false;
  if (!Array.isArray(value.openFiles) || !value.openFiles.every(validFile)) return false;
  if (!validContext(value.active) || !validRegions(value.regions)) return false;
  if (
    !isRecord(value.window) ||
    !["ordinary", "quick-access"].includes(String(value.window.presentation))
  ) {
    return false;
  }
  if (!isRecord(value.theme) || !hasStrings(value.theme, ["selected", "lastValid"])) return false;
  return contextProblem(value as unknown as WorkbenchState, value.active) === null;
}

function cloneState(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    projects: state.projects.map((project) => ({ ...project })),
    worktrees: state.worktrees.map((worktree) => ({ ...worktree })),
    threads: state.threads.map((thread) => ({ ...thread })),
    openFiles: state.openFiles.map((file) => ({ ...file })),
    active: { ...state.active },
    regions: {
      threads: { ...state.regions.threads },
      files: { ...state.regions.files },
      centre: { ...state.regions.centre },
      focus: state.regions.focus,
    },
    window: { ...state.window },
    theme: { ...state.theme },
  };
}

export function parseWorkbenchState(value: unknown): WorkbenchState {
  return stateShape(value) ? cloneState(value) : defaultWorkbenchState();
}

function contextProblem(state: WorkbenchState, context: WorkbenchContext): string | null {
  if (context.projectId === null) {
    return context.worktreeId || context.threadId || context.fileId
      ? "A context without a project cannot activate project-owned work"
      : null;
  }

  const project = state.projects.find(({ id }) => id === context.projectId);
  if (!project) return `Unknown project ${context.projectId}`;

  const worktree = state.worktrees.find(({ id }) => id === context.worktreeId);
  if (!worktree || worktree.projectId !== project.id) {
    return `Worktree ${String(context.worktreeId)} does not belong to ${project.id}`;
  }

  const thread = state.threads.find(({ id }) => id === context.threadId);
  if (
    context.threadId !== null &&
    (!thread || thread.projectId !== project.id || thread.worktreeId !== worktree.id)
  ) {
    return `Thread ${context.threadId} does not belong to ${project.id}/${worktree.id}`;
  }

  const file = state.openFiles.find(({ id }) => id === context.fileId);
  if (
    context.fileId !== null &&
    (!file || file.projectId !== project.id || file.worktreeId !== worktree.id)
  ) {
    return `File ${context.fileId} does not belong to ${project.id}/${worktree.id}`;
  }

  return null;
}

function emptyContext(): WorkbenchContext {
  return { projectId: null, worktreeId: null, threadId: null, fileId: null };
}

function sameContext(left: WorkbenchContext, right: WorkbenchContext): boolean {
  return (
    left.projectId === right.projectId &&
    left.worktreeId === right.worktreeId &&
    left.threadId === right.threadId &&
    left.fileId === right.fileId
  );
}

function projectFromGrant(grant: ProjectGrant): ProjectState {
  const { id, name, root, availability } = grant;
  return { id, name, root, availability };
}

function worktreesFromGrant(grant: ProjectGrant): readonly WorktreeState[] {
  return grant.worktrees.map(({ id, name, root, availability }) => ({
    id,
    projectId: grant.id,
    name,
    root,
    availability,
  }));
}

function grantProblem(
  state: WorkbenchState,
  grant: ProjectGrant,
  replacingId?: string,
): string | null {
  if (!grant.id || !grant.name || !grant.root) return "The native project grant is incomplete";
  if (grant.worktrees.length === 0) return `Project ${grant.id} has no approved worktree`;
  if (new Set(grant.worktrees.map(({ id }) => id)).size !== grant.worktrees.length) {
    return `Project ${grant.id} contains duplicate worktree identities`;
  }

  const competingProject = state.projects.find(
    (project) =>
      project.id !== replacingId && (project.id === grant.id || project.root === grant.root),
  );
  if (competingProject) return `Project grant conflicts with ${competingProject.id}`;

  const proposedWorktreeIds = new Set(grant.worktrees.map(({ id }) => id));
  const competingWorktree = state.worktrees.find(
    (worktree) => worktree.projectId !== replacingId && proposedWorktreeIds.has(worktree.id),
  );
  return competingWorktree ? `Worktree grant conflicts with ${competingWorktree.id}` : null;
}

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export class WorkbenchStateOwner {
  readonly #guards = new Map<string, TransitionGuard>();
  readonly #listeners = new Set<(state: WorkbenchState) => void>();
  readonly #projectContexts = new Map<string, WorkbenchContext>();
  readonly #projectRemovalGuards = new Map<string, ProjectRemovalGuard>();
  #state: WorkbenchState;
  #transitionTail: Promise<void> = Promise.resolve();

  constructor(initial: WorkbenchState = defaultWorkbenchState()) {
    this.#state = parseWorkbenchState(initial);
    this.#rememberContext(this.#state, this.#state.active);
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
    const work = this.#transitionTail.then(() => this.#activateContext(target));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #activateContext(target: WorkbenchContext): Promise<TransitionResult> {
    return this.#commitTransition(this.#state, target);
  }

  activateProject(projectId: string): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#activateProject(projectId));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #activateProject(projectId: string): Promise<TransitionResult> {
    const target = this.#contextForProject(this.#state, projectId);
    return target
      ? this.#commitTransition(this.#state, target)
      : { status: "refused", reason: `Unknown project or approved worktree ${projectId}` };
  }

  acceptProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#acceptProjectGrant(grant));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #acceptProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    const existing = this.#state.projects.find(({ root }) => root === grant.root);
    if (existing) return this.#activateProject(existing.id);

    const problem = grantProblem(this.#state, grant);
    if (problem) return { status: "refused", reason: problem };
    const candidate: WorkbenchState = {
      ...this.#state,
      projects: [...this.#state.projects, projectFromGrant(grant)],
      worktrees: [...this.#state.worktrees, ...worktreesFromGrant(grant)],
    };
    const target = this.#contextForProject(candidate, grant.id);
    return target
      ? this.#commitTransition(candidate, target)
      : { status: "refused", reason: `Project ${grant.id} has no approved worktree` };
  }

  reorderProjects(orderedIds: readonly string[]): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#reorderProjects(orderedIds));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #reorderProjects(orderedIds: readonly string[]): Promise<TransitionResult> {
    const currentIds = this.#state.projects.map(({ id }) => id);
    const exact =
      orderedIds.length === currentIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      currentIds.every((id) => orderedIds.includes(id));
    if (!exact)
      return { status: "refused", reason: "Project order must contain the complete identity set" };
    if (currentIds.every((id, index) => id === orderedIds[index])) return { status: "committed" };

    const projects = new Map(this.#state.projects.map((project) => [project.id, project]));
    this.#publish({
      ...this.#state,
      projects: orderedIds.map((id) => projects.get(id)!),
    });
    return { status: "committed" };
  }

  removeProject(projectId: string, revoke: () => Promise<void>): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#removeProject(projectId, revoke));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #removeProject(projectId: string, revoke: () => Promise<void>): Promise<TransitionResult> {
    const projectIndex = this.#state.projects.findIndex(({ id }) => id === projectId);
    if (projectIndex < 0) return { status: "refused", reason: `Unknown project ${projectId}` };

    this.#rememberContext(this.#state, this.#state.active);
    const projects = this.#state.projects.filter(({ id }) => id !== projectId);
    const worktrees = this.#state.worktrees.filter(({ projectId: owner }) => owner !== projectId);
    const threads = this.#state.threads.filter(({ projectId: owner }) => owner !== projectId);
    const openFiles = this.#state.openFiles.filter(({ projectId: owner }) => owner !== projectId);
    const candidate: WorkbenchState = {
      ...this.#state,
      projects,
      worktrees,
      threads,
      openFiles,
    };
    const wasActive = this.#state.active.projectId === projectId;
    const fallbackProject = projects[Math.min(projectIndex, projects.length - 1)];
    const fallback = wasActive
      ? fallbackProject
        ? (this.#contextForProject(candidate, fallbackProject.id) ?? emptyContext())
        : emptyContext()
      : this.#state.active;
    const contextIssue = contextProblem(candidate, fallback);
    if (contextIssue) return { status: "refused", reason: contextIssue };

    const removal: ProjectRemoval = { projectId, wasActive, fallback };
    const removalDecision = await this.#prepareProjectRemoval(removal);
    if (removalDecision.status === "refused") return removalDecision;
    if (wasActive) {
      const transitionDecision = await this.#prepareTransition({
        from: this.#state.active,
        to: fallback,
      });
      if (transitionDecision.status === "refused") return transitionDecision;
    }

    try {
      await revoke();
    } catch (cause) {
      return { status: "refused", reason: cause instanceof Error ? cause.message : String(cause) };
    }

    this.#projectContexts.delete(projectId);
    this.#rememberContext(candidate, fallback);
    this.#publish({ ...candidate, active: { ...fallback } });
    return { status: "committed" };
  }

  refreshProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#refreshProjectGrant(grant));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #refreshProjectGrant(grant: ProjectGrant): Promise<TransitionResult> {
    const projectIndex = this.#state.projects.findIndex(({ id }) => id === grant.id);
    if (projectIndex < 0) return { status: "refused", reason: `Unknown project ${grant.id}` };
    const problem = grantProblem(this.#state, grant, grant.id);
    if (problem) return { status: "refused", reason: problem };

    const projects = [...this.#state.projects];
    projects[projectIndex] = projectFromGrant(grant);
    const grantedWorktrees = worktreesFromGrant(grant);
    const grantedIds = new Set(grantedWorktrees.map(({ id }) => id));
    const candidate: WorkbenchState = {
      ...this.#state,
      projects,
      worktrees: [
        ...this.#state.worktrees.filter(({ projectId }) => projectId !== grant.id),
        ...grantedWorktrees,
      ],
      threads: this.#state.threads.filter(
        ({ projectId, worktreeId }) => projectId !== grant.id || grantedIds.has(worktreeId),
      ),
      openFiles: this.#state.openFiles.filter(
        ({ projectId, worktreeId }) => projectId !== grant.id || grantedIds.has(worktreeId),
      ),
    };
    const target =
      this.#state.active.projectId === grant.id
        ? (this.#contextForProject(candidate, grant.id) ?? emptyContext())
        : this.#state.active;
    return this.#commitTransition(candidate, target);
  }

  applyLaunch(launch: LaunchRequest, grants: readonly ProjectGrant[]): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#applyLaunch(launch, grants));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
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
    const work = this.#transitionTail.then(() => this.#activateFile(resource));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #activateFile(resource: FileResource): Promise<TransitionResult> {
    const id = fileStateId(resource);
    if (this.#state.active.fileId === id) return { status: "committed" };
    const file: OpenFileState = { id, ...resource, bufferId: bufferStateId(resource) };
    const candidate = this.#state.openFiles.some((open) => open.id === id)
      ? this.#state
      : { ...this.#state, openFiles: [...this.#state.openFiles, file] };
    const sameWorkspace =
      this.#state.active.projectId === resource.projectId &&
      this.#state.active.worktreeId === resource.worktreeId;
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
