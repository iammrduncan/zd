import { projectSnapshotFromWorkbench } from "@/projects";
import type { ProjectWorkbenchAdapter } from "@/projects";
import type { ProjectGrant } from "./resources";
import type { TransitionResult, WorkbenchStateOwner } from "./state";

/** Native-only project authority used by the root Projects adapter. */
export interface ProjectGrantPlatform {
  chooseProject(): Promise<ProjectGrant | null>;
  removeProjectGrant(projectId: string): Promise<ProjectGrant>;
  recoverProjectGrant(projectId: string): Promise<ProjectGrant | null>;
}

function refused(cause: unknown): TransitionResult {
  return {
    status: "refused",
    reason: cause instanceof Error ? cause.message : String(cause),
  };
}

/**
 * Adapt the single root state owner and native grant boundary without creating a
 * second project store in the Projects feature.
 */
export function createProjectWorkbenchAdapter(
  owner: WorkbenchStateOwner,
  platform: ProjectGrantPlatform,
): ProjectWorkbenchAdapter {
  return {
    snapshot: () => projectSnapshotFromWorkbench(owner.snapshot()),
    subscribe: (listener) =>
      owner.subscribe((state) => {
        listener(projectSnapshotFromWorkbench(state));
      }),
    chooseProject: () => platform.chooseProject(),
    acceptChosenProject: (grant) => owner.acceptProjectGrant(grant),
    activateProject: (projectId) => owner.activateProject(projectId),
    reorderProjects: (orderedIds) => owner.reorderProjects(orderedIds),
    removeProject: (projectId) =>
      owner.removeProject(projectId, async () => {
        const removed = await platform.removeProjectGrant(projectId);
        if (removed.id !== projectId) {
          throw new Error(`Native grant removal returned the wrong project identity`);
        }
      }),
    recoverProject: async (projectId) => {
      try {
        const recovered = await platform.recoverProjectGrant(projectId);
        return recovered
          ? owner.refreshProjectGrant(recovered)
          : { status: "refused", reason: "Project recovery was cancelled" };
      } catch (cause) {
        return refused(cause);
      }
    },
  };
}
