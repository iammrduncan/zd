import {
  FileTreeController,
  type FileGitState,
  type FileTreeAdapter,
  type FileTreeMetric,
  type FileTreeRefreshReason,
  type FileTreeScope,
} from "@/files";
import { reconcileGitStatus, type GitAdapter, type GitStatusSnapshot } from "@/git";
import type { DiagnosticOutcome, InstrumentationClient } from "@/instrumentation";
import { registerCommandTarget } from "./shortcuts";
import type { Unmount } from "./runtime";
import type { WorkbenchState, WorkbenchStateOwner } from "./state";

function scopeKey(scope: FileTreeScope): string {
  return `${scope.projectId}\0${scope.worktreeId}`;
}

function activeScope(state: WorkbenchState): FileTreeScope | null {
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

function activePath(state: WorkbenchState): string | null {
  return state.openFiles.find(({ id }) => id === state.active.fileId)?.relativePath ?? null;
}

function gitOutcome(snapshot: GitStatusSnapshot): DiagnosticOutcome {
  switch (snapshot.availability) {
    case "available":
      return "ok";
    case "non-repository":
    case "unavailable":
      return "unavailable";
    case "denied":
      return "refused";
  }
}

function gitStates(snapshot: GitStatusSnapshot): ReadonlyMap<string, FileGitState> {
  return new Map(
    snapshot.entries.map((entry) => [
      entry.path,
      entry.submodule ? ("submodule" as const) : entry.state,
    ]),
  );
}

export class WorkbenchFilesRuntime {
  readonly controller: FileTreeController;
  readonly #gitSnapshots = new Map<string, GitStatusSnapshot>();
  #activeKey: string | null = null;
  #attached = false;
  #generation = 0;

  constructor(
    readonly owner: WorkbenchStateOwner,
    readonly git: GitAdapter,
    readonly instrumentation: InstrumentationClient,
    fileTree: FileTreeAdapter,
  ) {
    this.controller = new FileTreeController(
      fileTree,
      { activateFile: (resource) => owner.activateFile(resource) },
      { record: (metric) => this.#recordFileMetric(metric) },
    );
  }

  attach(): Unmount {
    if (this.#attached) throw new Error("Files runtime is already attached");
    this.#attached = true;
    const stopState = this.owner.subscribe((state) => this.#synchronize(state));
    const onFocus = () => {
      void this.refresh("focus");
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void this.refresh("focus");
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const stopFilter = registerCommandTarget({
      id: "workbench.files.filter",
      commandId: "files.filter",
      priority: 100,
      available: () => this.controller.snapshot().scope !== null,
      run: () => {
        if (!this.controller.snapshot().scope) return false;
        this.controller.summonFilter();
        return true;
      },
    });
    const stopDismissFilter = registerCommandTarget({
      id: "workbench.files.dismiss-filter",
      commandId: "workbench.escape",
      priority: 250,
      available: () => this.controller.snapshot().filterOpen,
      run: () => {
        if (!this.controller.snapshot().filterOpen) return false;
        this.controller.dismissFilter();
        return true;
      },
    });
    this.#synchronize(this.owner.snapshot());

    return () => {
      if (!this.#attached) return;
      this.#attached = false;
      this.#generation += 1;
      stopDismissFilter();
      stopFilter();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      stopState();
    };
  }

  async refresh(reason: FileTreeRefreshReason = "manual"): Promise<void> {
    const scope = activeScope(this.owner.snapshot());
    if (!scope || scopeKey(scope) !== this.#activeKey) return;
    const generation = this.#generation;
    await Promise.all([this.controller.refresh(reason), this.#refreshGit(scope, generation)]);
  }

  #synchronize(state: WorkbenchState): void {
    const scope = activeScope(state);
    if (!scope) {
      if (this.#activeKey !== null) {
        this.#generation += 1;
        this.#activeKey = null;
        this.controller.deactivate();
      }
      return;
    }

    const key = scopeKey(scope);
    if (key === this.#activeKey) {
      this.controller.setActivePath(activePath(state));
      return;
    }

    this.#generation += 1;
    const generation = this.#generation;
    this.#activeKey = key;
    void this.controller.activate(scope, activePath(state));
    void this.#refreshGit(scope, generation);
  }

  async #refreshGit(scope: FileTreeScope, generation: number): Promise<void> {
    const span = this.instrumentation.startSpan("git.status", scope);
    let next: GitStatusSnapshot;
    try {
      next = await this.git.status(scope);
    } catch {
      await span?.end("failed");
      return;
    }
    if (
      !this.#attached ||
      generation !== this.#generation ||
      scopeKey(scope) !== this.#activeKey ||
      next.scope.projectId !== scope.projectId ||
      next.scope.worktreeId !== scope.worktreeId
    ) {
      await span?.end("cancelled");
      return;
    }
    const key = scopeKey(scope);
    const previous = this.#gitSnapshots.get(key);
    const reconciled = previous ? reconcileGitStatus(previous, next) : next;
    this.#gitSnapshots.set(key, reconciled);
    this.controller.reconcileGit(gitStates(reconciled));
    await span?.end(gitOutcome(reconciled));
  }

  #recordFileMetric(metric: FileTreeMetric): void {
    const outcomes = new Set(["ready", "unchanged", "empty", "expanded", "applied", "committed"]);
    void this.instrumentation.record({
      recordType: "event",
      operation: `file-tree.${metric.operation}`,
      outcome: outcomes.has(metric.outcome) ? "ok" : "unavailable",
      context: { projectId: metric.projectId, worktreeId: metric.worktreeId },
    });
  }
}

export function createWorkbenchFilesRuntime(
  owner: WorkbenchStateOwner,
  fileTree: FileTreeAdapter,
  git: GitAdapter,
  instrumentation: InstrumentationClient,
): WorkbenchFilesRuntime {
  return new WorkbenchFilesRuntime(owner, git, instrumentation, fileTree);
}
