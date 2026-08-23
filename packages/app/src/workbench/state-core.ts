import type { FileResource, LaunchRequest, ProjectGrant } from "./resources";

export const WORKBENCH_STATE_VERSION = 2 as const;

export type ProjectAvailability =
  "available" | "missing" | "denied" | "not-directory" | "unavailable";
export type ThreadsVisibility = "full" | "collapsed" | "hidden";
export type FilesVisibility = "visible" | "hidden";
export type FilesTab = "files" | "changes";
export type CentreMode = "overlap" | "side-by-side";
export type WorkbenchFocus = "threads" | "thread" | "file" | "files";
export type WindowPresentation = "ordinary" | "quick-access";
export type ThreadType = "terminal";
export type ThreadAgent = "shell" | "codex" | "claude-code" | "opencode" | "unknown";
export type ThreadLifecycle =
  "starting" | "idle" | "busy" | "waiting" | "exited" | "failed" | "unknown";
export type ThreadLifecycleSource = "process" | "supported-agent" | "terminal-output";
export type ThreadBackingAvailability = "not-started" | "starting" | "ready" | "missing" | "closed";
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
  readonly order: number;
  readonly type: ThreadType;
  readonly agent: ThreadAgent;
  readonly lifecycle: ThreadLifecycle;
  readonly lifecycleSource: ThreadLifecycleSource;
  readonly lifecycleRevision: number;
  readonly attentionUnread: boolean;
  readonly attentionVersion: number;
  /** Stable logical identity only. Native process handles remain runtime-only. */
  readonly backingId: string;
  readonly backingAvailability: ThreadBackingAvailability;
  readonly recovery: ThreadRecoveryState | null;
  readonly fileId: string | null;
}

export interface ThreadRuntimeUpdate {
  readonly lifecycle: ThreadLifecycle;
  readonly lifecycleSource: ThreadLifecycleSource;
  readonly lifecycleRevision: number;
  readonly attentionUnread: boolean;
  readonly attentionVersion: number;
  readonly backingAvailability: ThreadBackingAvailability;
  readonly recovery: ThreadRecoveryState | null;
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

export interface TransitionRefusal {
  readonly status: "refused";
  readonly reason: string;
  readonly recovery?: TransitionRecovery;
  /** The guard's owning surface already rendered this problem and recovery. */
  readonly presentation?: "owner";
}

export type TransitionDecision = { readonly status: "ready" } | TransitionRefusal;

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

export type TransitionResult = { readonly status: "committed" } | TransitionRefusal;

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

export function stateWithFocus(state: WorkbenchState, focus: WorkbenchFocus): WorkbenchState {
  return {
    ...state,
    regions: {
      ...state.regions,
      threads: { ...state.regions.threads },
      files: { ...state.regions.files },
      centre: { ...state.regions.centre },
      focus,
    },
  };
}

export function fileStateId(resource: FileResource): string {
  return `file:${resource.projectId}\0${resource.worktreeId}\0${resource.relativePath}`;
}
export function bufferStateId(resource: FileResource): string {
  return `buffer:${resource.projectId}\0${resource.worktreeId}\0${resource.relativePath}`;
}
export function launchFile(launch: LaunchRequest): OpenFileState | null {
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
export function uniqueGrants(
  grants: readonly ProjectGrant[],
  launch: LaunchRequest,
): readonly ProjectGrant[] {
  const byId = new Map(grants.map((grant) => [grant.id, grant]));
  if (launch.project) byId.set(launch.project.id, launch.project);
  return [...byId.values()];
}
export function stateWithGrants(
  current: WorkbenchState,
  grants: readonly ProjectGrant[],
): WorkbenchState {
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
    // A temporarily absent worktree must not erase its durable thread record.
    // The Threads adapter presents recovery while active context remains valid.
    threads: current.threads.filter(({ projectId }) => projectIds.has(projectId)),
    openFiles: current.openFiles.filter(
      ({ projectId, worktreeId }) => projectIds.has(projectId) && worktreeIds.has(worktreeId),
    ),
  };
}
export function contextForLaunch(state: WorkbenchState, launch: LaunchRequest): WorkbenchContext {
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

export function contextProblem(state: WorkbenchState, context: WorkbenchContext): string | null {
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
export function emptyContext(): WorkbenchContext {
  return { projectId: null, worktreeId: null, threadId: null, fileId: null };
}
export function sameContext(left: WorkbenchContext, right: WorkbenchContext): boolean {
  return (
    left.projectId === right.projectId &&
    left.worktreeId === right.worktreeId &&
    left.threadId === right.threadId &&
    left.fileId === right.fileId
  );
}
export function projectFromGrant(grant: ProjectGrant): ProjectState {
  const { id, name, root, availability } = grant;
  return { id, name, root, availability };
}
export function worktreesFromGrant(grant: ProjectGrant): readonly WorktreeState[] {
  return grant.worktrees.map(({ id, name, root, availability }) => ({
    id,
    projectId: grant.id,
    name,
    root,
    availability,
  }));
}
export function grantProblem(
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
export function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
}
