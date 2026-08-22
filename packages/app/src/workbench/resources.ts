export type GrantAvailability =
  "available" | "missing" | "denied" | "not-directory" | "unavailable";

export interface WorktreeGrant {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly availability: GrantAvailability;
}

export interface ProjectGrant {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly availability: GrantAvailability;
  readonly worktrees: readonly WorktreeGrant[];
}

/** The only file identity accepted by ordinary native file commands. */
export interface FileResource {
  readonly projectId: string;
  readonly worktreeId: string;
  readonly relativePath: string;
}

export interface LaunchRequest {
  readonly project: ProjectGrant | null;
  readonly worktreeId: string | null;
  readonly relativePath: string | null;
  readonly problem: string | null;
}

export function homeLaunch(): LaunchRequest {
  return { project: null, worktreeId: null, relativePath: null, problem: null };
}

export function launchResource(launch: LaunchRequest): FileResource | null {
  if (!launch.project || !launch.worktreeId || launch.relativePath === null) return null;
  return {
    projectId: launch.project.id,
    worktreeId: launch.worktreeId,
    relativePath: launch.relativePath,
  };
}

export function resourceKey(resource: FileResource): string {
  return `${resource.projectId}\0${resource.worktreeId}\0${resource.relativePath}`;
}
