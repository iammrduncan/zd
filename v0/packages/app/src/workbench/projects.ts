import { projectSnapshotFromWorkbench } from "@/projects";
import type { ProjectWorkbenchAdapter } from "@/projects";
import type { DiagnosticOutcome, InstrumentationClient } from "@/instrumentation";
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
  instrumentation?: InstrumentationClient,
): ProjectWorkbenchAdapter {
  const evidence = (operation: string, outcome: DiagnosticOutcome, projectId?: string) => {
    void instrumentation?.record({
      recordType: "event",
      operation,
      outcome,
      ...(projectId ? { context: { projectId } } : {}),
    });
  };
  const transition = async (
    operation: string,
    projectId: string | undefined,
    work: () => Promise<TransitionResult>,
  ): Promise<TransitionResult> => {
    try {
      const result = await work();
      evidence(operation, result.status === "committed" ? "ok" : "refused", projectId);
      return result;
    } catch (cause) {
      evidence(operation, "failed", projectId);
      throw cause;
    }
  };

  return {
    snapshot: () => projectSnapshotFromWorkbench(owner.snapshot()),
    subscribe: (listener) =>
      owner.subscribe((state) => {
        listener(projectSnapshotFromWorkbench(state));
      }),
    chooseProject: async () => {
      try {
        const grant = await platform.chooseProject();
        evidence("project.choose", grant ? "ok" : "cancelled", grant?.id);
        return grant;
      } catch (cause) {
        evidence("project.choose", "failed");
        throw cause;
      }
    },
    acceptChosenProject: (grant) =>
      transition("project.accept", grant.id, () => owner.acceptProjectGrant(grant)),
    activateProject: (projectId) =>
      transition("project.activate", projectId, () => owner.activateProject(projectId)),
    reorderProjects: (orderedIds) =>
      transition("project.reorder", owner.snapshot().active.projectId ?? undefined, () =>
        owner.reorderProjects(orderedIds),
      ),
    removeProject: (projectId) =>
      transition("project.remove", projectId, () =>
        owner.removeProject(projectId, async () => {
          const removed = await platform.removeProjectGrant(projectId);
          if (removed.id !== projectId) {
            throw new Error(`Native grant removal returned the wrong project identity`);
          }
        }),
      ),
    recoverProject: (projectId) =>
      transition("project.recover", projectId, async () => {
        try {
          const recovered = await platform.recoverProjectGrant(projectId);
          return recovered
            ? owner.refreshProjectGrant(recovered)
            : { status: "refused", reason: "Project recovery was cancelled" };
        } catch (cause) {
          return refused(cause);
        }
      }),
  };
}
