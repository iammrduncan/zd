import type { FileResource } from "../resources";
import type { WorkbenchState } from "../state";

/** The resource identity selected by the root state owner, if one is selected. */
export function activeResource(state: WorkbenchState): FileResource | null {
  const file = state.openFiles.find(({ id }) => id === state.active.fileId);
  return file
    ? {
        projectId: file.projectId,
        worktreeId: file.worktreeId,
        relativePath: file.relativePath,
      }
    : null;
}
