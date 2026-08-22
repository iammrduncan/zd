export { ProjectsController } from "./controller";
export {
  findProjectByCanonicalRoot,
  orderedProjects,
  projectOrderAfterInsertion,
  projectSnapshotFromWorkbench,
  shortcutProject,
  type ProjectRecoveryOverrides,
} from "./model";
export type {
  ActiveProjectWorkspace,
  ProjectActionResult,
  ProjectListItem,
  ProjectRecoveryKind,
  ProjectRecoveryState,
  ProjectWorkbenchAdapter,
  ProjectWorkbenchSnapshot,
  ProjectWorktree,
} from "./types";
