import type { ProjectGrant } from "@/workbench/resources";
import type { ProjectAvailability, WorkbenchState } from "@/workbench/state";
import type { ProjectListItem, ProjectRecoveryState, ProjectWorkbenchSnapshot } from "./types";

export type ProjectRecoveryOverrides = Readonly<Record<string, ProjectRecoveryState | undefined>>;

function defaultRecovery(availability: ProjectAvailability): ProjectRecoveryState | null {
  switch (availability) {
    case "available":
      return null;
    case "missing":
      return {
        kind: "missing",
        summary: "Folder is missing.",
        actionLabel: "Locate folder",
      };
    case "denied":
      return {
        kind: "denied",
        summary: "Folder access was denied.",
        actionLabel: "Restore access",
      };
    case "not-directory":
      return {
        kind: "not-directory",
        summary: "The approved root is no longer a folder.",
        actionLabel: "Choose folder",
      };
    case "unavailable":
      return {
        kind: "unavailable",
        summary: "Folder is unavailable.",
        actionLabel: "Try again",
      };
  }
}

/** Adapt one immutable root snapshot without introducing a second state owner. */
export function projectSnapshotFromWorkbench(
  state: WorkbenchState,
  recoveryOverrides: ProjectRecoveryOverrides = {},
): ProjectWorkbenchSnapshot {
  const projects = state.projects.map<ProjectListItem>((project, order) => ({
    ...project,
    order,
    worktrees: state.worktrees
      .filter(({ projectId }) => projectId === project.id)
      .map(({ id, name, root, availability }) => ({ id, name, root, availability })),
    recovery:
      project.availability === "available"
        ? null
        : (recoveryOverrides[project.id] ?? defaultRecovery(project.availability)),
  }));

  if (state.active.projectId === null || state.active.worktreeId === null) {
    return { projects, active: null };
  }

  const project = state.projects.find(({ id }) => id === state.active.projectId);
  const worktree = state.worktrees.find(
    ({ id, projectId }) => id === state.active.worktreeId && projectId === state.active.projectId,
  );
  const active =
    project && worktree
      ? {
          projectId: project.id,
          projectRoot: project.root,
          worktreeId: worktree.id,
          worktreeRoot: worktree.root,
          threadId: state.active.threadId,
          fileId: state.active.fileId,
        }
      : null;

  return { projects, active };
}

export function orderedProjects(projects: readonly ProjectListItem[]): readonly ProjectListItem[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => left.project.order - right.project.order || left.index - right.index)
    .map(({ project }) => project);
}

/** Project roots have already been canonicalized and approved by native code. */
export function findProjectByCanonicalRoot(
  projects: readonly ProjectListItem[],
  canonicalRoot: string,
): ProjectListItem | null {
  return projects.find(({ root }) => root === canonicalRoot) ?? null;
}

/**
 * Return one complete order for the adapter. `insertionIndex` identifies a gap
 * in the original list, from zero through the list length.
 */
export function projectOrderAfterInsertion(
  projects: readonly ProjectListItem[],
  movedId: string,
  insertionIndex: number,
): readonly string[] | null {
  const ids = orderedProjects(projects).map(({ id }) => id);
  const sourceIndex = ids.indexOf(movedId);
  if (sourceIndex < 0 || !Number.isFinite(insertionIndex)) return null;

  const requestedGap = Math.min(ids.length, Math.max(0, Math.trunc(insertionIndex)));
  ids.splice(sourceIndex, 1);
  const adjustedGap = sourceIndex < requestedGap ? requestedGap - 1 : requestedGap;
  ids.splice(Math.min(ids.length, Math.max(0, adjustedGap)), 0, movedId);
  return ids;
}

export function shortcutProject(
  projects: readonly ProjectListItem[],
  slot: number,
): ProjectListItem | null {
  if (!Number.isInteger(slot) || slot < 1 || slot > 9) return null;
  return orderedProjects(projects)[slot - 1] ?? null;
}

export function projectForGrant(
  projects: readonly ProjectListItem[],
  grant: ProjectGrant,
): ProjectListItem | null {
  return findProjectByCanonicalRoot(projects, grant.root);
}
