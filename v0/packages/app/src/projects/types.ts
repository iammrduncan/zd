import type { ProjectGrant, GrantAvailability } from "@/workbench/resources";
import type { TransitionResult } from "@/workbench/state";

export type ProjectRecoveryKind = "missing" | "moved" | "denied" | "not-directory" | "unavailable";

export interface ProjectRecoveryState {
  readonly kind: ProjectRecoveryKind;
  readonly summary: string;
  readonly actionLabel: string;
}

export interface ProjectWorktree {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly availability: GrantAvailability;
}

/** One ordered, presentation-ready view of a root-owned project. */
export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly order: number;
  readonly availability: GrantAvailability;
  readonly worktrees: readonly ProjectWorktree[];
  readonly recovery: ProjectRecoveryState | null;
}

/**
 * Project and worktree roots are both explicit so downstream features never
 * infer a worktree by treating it as another top-level project.
 */
export interface ActiveProjectWorkspace {
  readonly projectId: string;
  readonly projectRoot: string;
  readonly worktreeId: string;
  readonly worktreeRoot: string;
  readonly threadId: string | null;
  readonly fileId: string | null;
}

export interface ProjectWorkbenchSnapshot {
  readonly projects: readonly ProjectListItem[];
  readonly active: ActiveProjectWorkspace | null;
}

export type ProjectActionResult = TransitionResult;

/**
 * The root integration implements this interface over WorkbenchStateOwner and
 * the native grant boundary. Projects never accepts a raw frontend path.
 */
export interface ProjectWorkbenchAdapter {
  snapshot(): ProjectWorkbenchSnapshot;
  subscribe(listener: (snapshot: ProjectWorkbenchSnapshot) => void): () => void;
  chooseProject(): Promise<ProjectGrant | null>;
  acceptChosenProject(grant: ProjectGrant): Promise<ProjectActionResult>;
  activateProject(projectId: string): Promise<ProjectActionResult>;
  reorderProjects(orderedIds: readonly string[]): Promise<ProjectActionResult>;
  removeProject(projectId: string): Promise<ProjectActionResult>;
  recoverProject(projectId: string): Promise<ProjectActionResult>;
}
