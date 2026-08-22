import type { CreateThreadWorktreeRequest, CreateThreadWorktreeResult } from "@/platform";
import type { TerminalScope } from "@/terminal";
import type { CreateThreadRequest } from "@/threads";

import type { ProjectGrant } from "./resources";
import type { ThreadState, TransitionResult, WorkbenchStateOwner } from "./state";

export interface ThreadScopePlatform {
  projectGrants(): Promise<readonly ProjectGrant[]>;
  createThreadWorktree(request: CreateThreadWorktreeRequest): Promise<CreateThreadWorktreeResult>;
}

function refused(cause: unknown): TransitionResult {
  return { status: "refused", reason: cause instanceof Error ? cause.message : String(cause) };
}

/** Resolves only native-approved project/worktree identities for terminal threads. */
export class ThreadScopeResolver {
  constructor(
    readonly owner: WorkbenchStateOwner,
    readonly platform: ThreadScopePlatform,
  ) {}

  async resolve(request: CreateThreadRequest): Promise<TerminalScope | TransitionResult> {
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

  async refresh(thread: ThreadState): Promise<TransitionResult> {
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
}
