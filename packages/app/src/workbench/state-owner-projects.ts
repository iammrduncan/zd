import type { ProjectGrant } from "./resources";
import {
  contextProblem,
  emptyContext,
  grantProblem,
  projectFromGrant,
  worktreesFromGrant,
  type ContextTransition,
  type ProjectRemoval,
  type TransitionDecision,
  type TransitionResult,
  type WorkbenchContext,
  type WorkbenchState,
} from "./state-core";

export interface ProjectStateMutationsHost {
  snapshot(): WorkbenchState;
  commitTransition(candidate: WorkbenchState, target: WorkbenchContext): Promise<TransitionResult>;
  contextForProject(state: WorkbenchState, projectId: string): WorkbenchContext | null;
  forgetContext(projectId: string): void;
  prepareProjectRemoval(change: ProjectRemoval): Promise<TransitionDecision>;
  prepareTransition(change: ContextTransition): Promise<TransitionDecision>;
  publish(next: WorkbenchState): void;
  rememberContext(state: WorkbenchState, context: WorkbenchContext): void;
}

/** Project-list mutations share the owner's serialized transition and guard boundary. */
export class ProjectStateMutations {
  constructor(readonly host: ProjectStateMutationsHost) {}

  async accept(grant: ProjectGrant): Promise<TransitionResult> {
    const state = this.host.snapshot();
    const existing = state.projects.find(({ root }) => root === grant.root);
    if (existing) {
      const target = this.host.contextForProject(state, existing.id);
      return target
        ? this.host.commitTransition(state, target)
        : { status: "refused", reason: `Unknown project or approved worktree ${existing.id}` };
    }

    const problem = grantProblem(state, grant);
    if (problem) return { status: "refused", reason: problem };
    const candidate: WorkbenchState = {
      ...state,
      projects: [...state.projects, projectFromGrant(grant)],
      worktrees: [...state.worktrees, ...worktreesFromGrant(grant)],
    };
    const target = this.host.contextForProject(candidate, grant.id);
    return target
      ? this.host.commitTransition(candidate, target)
      : { status: "refused", reason: `Project ${grant.id} has no approved worktree` };
  }

  reorder(orderedIds: readonly string[]): TransitionResult {
    const state = this.host.snapshot();
    const currentIds = state.projects.map(({ id }) => id);
    const exact =
      orderedIds.length === currentIds.length &&
      new Set(orderedIds).size === orderedIds.length &&
      currentIds.every((id) => orderedIds.includes(id));
    if (!exact)
      return { status: "refused", reason: "Project order must contain the complete identity set" };
    if (currentIds.every((id, index) => id === orderedIds[index])) return { status: "committed" };

    const projects = new Map(state.projects.map((project) => [project.id, project]));
    this.host.publish({
      ...state,
      projects: orderedIds.map((id) => projects.get(id)!),
    });
    return { status: "committed" };
  }

  async remove(projectId: string, revoke: () => Promise<void>): Promise<TransitionResult> {
    const state = this.host.snapshot();
    const projectIndex = state.projects.findIndex(({ id }) => id === projectId);
    if (projectIndex < 0) return { status: "refused", reason: `Unknown project ${projectId}` };

    this.host.rememberContext(state, state.active);
    const projects = state.projects.filter(({ id }) => id !== projectId);
    const worktrees = state.worktrees.filter(({ projectId: owner }) => owner !== projectId);
    const threads = state.threads.filter(({ projectId: owner }) => owner !== projectId);
    const openFiles = state.openFiles.filter(({ projectId: owner }) => owner !== projectId);
    const candidate: WorkbenchState = { ...state, projects, worktrees, threads, openFiles };
    const wasActive = state.active.projectId === projectId;
    const fallbackProject = projects[Math.min(projectIndex, projects.length - 1)];
    const fallback = wasActive
      ? fallbackProject
        ? (this.host.contextForProject(candidate, fallbackProject.id) ?? emptyContext())
        : emptyContext()
      : state.active;
    const contextIssue = contextProblem(candidate, fallback);
    if (contextIssue) return { status: "refused", reason: contextIssue };

    const removal: ProjectRemoval = { projectId, wasActive, fallback };
    const removalDecision = await this.host.prepareProjectRemoval(removal);
    if (removalDecision.status === "refused") return removalDecision;
    if (wasActive) {
      const transitionDecision = await this.host.prepareTransition({
        from: state.active,
        to: fallback,
      });
      if (transitionDecision.status === "refused") return transitionDecision;
    }

    try {
      await revoke();
    } catch (cause) {
      return { status: "refused", reason: cause instanceof Error ? cause.message : String(cause) };
    }

    this.host.forgetContext(projectId);
    this.host.rememberContext(candidate, fallback);
    this.host.publish({ ...candidate, active: { ...fallback } });
    return { status: "committed" };
  }

  async refresh(grant: ProjectGrant): Promise<TransitionResult> {
    const state = this.host.snapshot();
    const projectIndex = state.projects.findIndex(({ id }) => id === grant.id);
    if (projectIndex < 0) return { status: "refused", reason: `Unknown project ${grant.id}` };
    const problem = grantProblem(state, grant, grant.id);
    if (problem) return { status: "refused", reason: problem };

    const projects = [...state.projects];
    projects[projectIndex] = projectFromGrant(grant);
    const grantedWorktrees = worktreesFromGrant(grant);
    const grantedIds = new Set(grantedWorktrees.map(({ id }) => id));
    const candidate: WorkbenchState = {
      ...state,
      projects,
      worktrees: [
        ...state.worktrees.filter(({ projectId }) => projectId !== grant.id),
        ...grantedWorktrees,
      ],
      // Keep durable threads so an absent worktree remains explicitly recoverable.
      threads: state.threads,
      openFiles: state.openFiles.filter(
        ({ projectId, worktreeId }) => projectId !== grant.id || grantedIds.has(worktreeId),
      ),
    };
    const target =
      state.active.projectId === grant.id
        ? (this.host.contextForProject(candidate, grant.id) ?? emptyContext())
        : state.active;
    return this.host.commitTransition(candidate, target);
  }
}
