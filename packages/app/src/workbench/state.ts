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

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}

export class WorkbenchStateOwner {
  readonly #guards = new Map<string, TransitionGuard>();
  readonly #listeners = new Set<(state: WorkbenchState) => void>();
  #state: WorkbenchState;
  #transitionTail: Promise<void> = Promise.resolve();

  constructor(initial: WorkbenchState = defaultWorkbenchState()) {
    this.#state = parseWorkbenchState(initial);
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

  activateContext(target: WorkbenchContext): Promise<TransitionResult> {
    const work = this.#transitionTail.then(() => this.#activateContext(target));
    this.#transitionTail = work.then(
      () => undefined,
      () => undefined,
    );
    return work;
  }

  async #activateContext(target: WorkbenchContext): Promise<TransitionResult> {
    const problem = contextProblem(this.#state, target);
    if (problem) return { status: "refused", reason: problem };

    const change = { from: this.#state.active, to: target };
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

    this.#publish({ ...this.#state, active: { ...target } });
    return { status: "committed" };
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
    this.#publish({ ...this.#state, window: { presentation } });
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
