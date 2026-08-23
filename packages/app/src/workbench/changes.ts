import { ChangesController, mountChangesDiff, type ChangesStatusSource } from "@/changes";
import type { GitAdapter, GitScope } from "@/git";
import type { InstrumentationClient } from "@/instrumentation";

import { mountCurrentFile } from "./current-file";
import type { FileDraftStore } from "./current-file/drafts";
import type { Unmount, WorkbenchRuntimeContext } from "./runtime";
import type { WorkbenchState, WorkbenchStateOwner } from "./state";
import "./changes.css";

function activeScope(state: WorkbenchState): GitScope | null {
  const { projectId, worktreeId } = state.active;
  if (!projectId || !worktreeId) return null;
  const project = state.projects.find(({ id }) => id === projectId);
  const worktree = state.worktrees.find(
    ({ id, projectId: owner }) => id === worktreeId && owner === projectId,
  );
  return project?.availability === "available" && worktree?.availability === "available"
    ? { projectId, worktreeId }
    : null;
}

function scopeKey(scope: GitScope): string {
  return `${scope.projectId}\0${scope.worktreeId}`;
}

/** Root coordinator that activates one persistent Changes state per native-approved scope. */
export class WorkbenchChangesRuntime {
  readonly controller: ChangesController;
  #activeKey: string | null = null;
  #attached = false;
  #disposed = false;

  constructor(
    readonly owner: WorkbenchStateOwner,
    git: GitAdapter,
    statusSource: ChangesStatusSource,
    instrumentation: InstrumentationClient,
  ) {
    this.controller = new ChangesController(git, statusSource, {
      record: (metric) => {
        void instrumentation.record({
          recordType: "event",
          operation: `git.${metric.operation}`,
          outcome: metric.outcome,
          context: { projectId: metric.projectId, worktreeId: metric.worktreeId },
        });
      },
    });
  }

  attach(): Unmount {
    if (this.#disposed) throw new Error("Changes runtime is disposed");
    if (this.#attached) throw new Error("Changes runtime is already attached");
    this.#attached = true;
    const synchronize = (state: WorkbenchState) => {
      const scope = activeScope(state);
      const key = scope ? scopeKey(scope) : null;
      if (key === this.#activeKey) return;
      this.#activeKey = key;
      this.controller.activate(scope);
      if (scope) void this.controller.loadHistory();
    };
    const stopState = this.owner.subscribe(synchronize);
    synchronize(this.owner.snapshot());

    return () => {
      if (!this.#attached) return;
      this.#attached = false;
      this.#disposed = true;
      stopState();
      this.controller.dispose();
    };
  }
}

export function createWorkbenchChangesRuntime(
  owner: WorkbenchStateOwner,
  git: GitAdapter,
  statusSource: ChangesStatusSource,
  instrumentation: InstrumentationClient,
): WorkbenchChangesRuntime {
  return new WorkbenchChangesRuntime(owner, git, statusSource, instrumentation);
}

/** Keep the editable file alive while a transient comparison owns the visible file region. */
export async function mountCurrentFileWithChanges(
  host: HTMLElement,
  context: WorkbenchRuntimeContext,
  controller: ChangesController,
  drafts?: FileDraftStore,
): Promise<Unmount> {
  const root = document.createElement("div");
  root.className = "zd-file-context current-file";
  const live = document.createElement("div");
  live.className = "zd-file-context-surface";
  live.dataset.changesSurface = "live";
  const comparison = document.createElement("div");
  comparison.className = "zd-file-context-surface";
  comparison.dataset.changesSurface = "comparison";
  root.append(live, comparison);
  host.replaceChildren(root);
  let comparisonActive = false;

  const reflect = () => {
    const snapshot = controller.snapshot();
    comparisonActive =
      snapshot.selectedChangeId !== null || snapshot.diffLoading || snapshot.diff !== null;
    live.hidden = comparisonActive;
    comparison.hidden = !comparisonActive;
  };
  const stopChanges = controller.subscribe(reflect);
  reflect();
  let stopLive: Unmount;
  try {
    stopLive = await mountCurrentFile(live, context, {
      isActive: () => !comparisonActive,
      drafts,
    });
  } catch (cause) {
    stopChanges();
    root.remove();
    throw cause;
  }
  const stopComparison = mountChangesDiff(comparison, controller, {
    isActive: () => comparisonActive,
  });
  reflect();

  return () => {
    stopComparison();
    stopLive();
    stopChanges();
    root.remove();
  };
}
