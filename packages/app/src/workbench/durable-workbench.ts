import type { DurableStateAdapter } from "@/platform";
import type { LaunchRequest, ProjectGrant } from "./resources";
import { parseWorkbenchState } from "./state-codec";
import {
  contextForLaunch,
  contextProblem,
  launchFile,
  stateWithGrants,
  uniqueGrants,
  workbenchStateFromGrants,
  type WorkbenchState,
} from "./state-core";
import type { WorkbenchStateOwner } from "./state-owner";

export function restoreDurableWorkbench(
  value: unknown,
  grants: readonly ProjectGrant[],
  launch: LaunchRequest,
): WorkbenchState {
  if (value === null) return workbenchStateFromGrants(grants, launch);

  let restored = stateWithGrants(parseWorkbenchState(value), uniqueGrants(grants, launch));
  const opened = launchFile(launch);
  if (opened && !restored.openFiles.some(({ id }) => id === opened.id)) {
    restored = { ...restored, openFiles: [...restored.openFiles, opened] };
  }
  const restoredContextIsValid = contextProblem(restored, restored.active) === null;
  if (
    launch.project &&
    (launch.relativePath !== null || restored.active.projectId === null || !restoredContextIsValid)
  ) {
    restored = { ...restored, active: contextForLaunch(restored, launch) };
  } else if (!restoredContextIsValid) {
    restored = { ...restored, active: contextForLaunch(restored, launch) };
  }
  return restored;
}

export function attachDurableWorkbench(
  owner: WorkbenchStateOwner,
  durableState: DurableStateAdapter,
): () => void {
  return owner.subscribe((record) => {
    void durableState.mutate({ kind: "replace-workbench", record });
  });
}
