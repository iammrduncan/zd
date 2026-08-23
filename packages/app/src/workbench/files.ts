import {
  FileTreeController,
  type FileTreeCreationKind,
  type FileGitState,
  type FilePathPresentation,
  type FileTreeAdapter,
  type FileTreeMetric,
  type FileTreeMutationRequest,
  type FileTreeRefreshReason,
  type FileTreeScope,
  type FileTreeWatchEvent,
} from "@/files";
import { reconcileGitStatus, type GitAdapter, type GitStatusSnapshot } from "@/git";
import type { DiagnosticOutcome, InstrumentationClient } from "@/instrumentation";
import { registerCommandTarget } from "./shortcuts";
import type { Unmount } from "./runtime";
import type { FileResource } from "./resources";
import type { WorkbenchState, WorkbenchStateOwner } from "./state";
import { FileDraftStore } from "./current-file/drafts";

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

function defaultClipboardWrite(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error("The clipboard is unavailable."));
  }
  return navigator.clipboard.writeText(text);
}

function fullPath(root: string, relativePath: string): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const cleanRoot = root.replace(/[\\/]+$/u, "");
  const cleanRelative = separator === "\\" ? relativePath.replaceAll("/", "\\") : relativePath;
  return `${cleanRoot}${separator}${cleanRelative}`;
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
  readonly #listeners = new Set<(snapshot: GitStatusSnapshot | null) => void>();
  readonly #fileTree: FileTreeAdapter;
  #activeKey: string | null = null;
  #attached = false;
  #generation = 0;
  #stopDiskWatch: Unmount = () => {};

  constructor(
    readonly owner: WorkbenchStateOwner,
    readonly git: GitAdapter,
    readonly instrumentation: InstrumentationClient,
    fileTree: FileTreeAdapter,
    readonly drafts: FileDraftStore = new FileDraftStore(),
    readonly copyText: (text: string) => Promise<void> = defaultClipboardWrite,
  ) {
    this.#fileTree = fileTree;
    this.controller = new FileTreeController(
      fileTree,
      {
        activateFile: (resource) => owner.activateFile(resource),
        copyPath: (resource, presentation) => this.#copyPath(resource, presentation),
        createEntry: (resource, kind) => this.#createEntry(resource, kind),
        renameEntry: (resource, newName) => this.#renameEntry(resource, newName),
        trashEntry: (resource) => this.#trashEntry(resource),
      },
      { record: (metric) => this.#recordFileMetric(metric) },
    );
  }

  attach(): Unmount {
    if (this.#attached) throw new Error("Files runtime is already attached");
    this.#attached = true;
    const stopState = this.owner.subscribe((state) => this.#synchronize(state));
    const stopDrafts = this.drafts.subscribe(() => this.#synchronizeDrafts());
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
      this.#stopWatching();
      this.#activeKey = null;
      stopDismissFilter();
      stopFilter();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      stopState();
      stopDrafts();
    };
  }

  snapshot(): GitStatusSnapshot | null {
    return this.#activeKey ? (this.#gitSnapshots.get(this.#activeKey) ?? null) : null;
  }

  subscribe(listener: (snapshot: GitStatusSnapshot | null) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
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
        this.#stopWatching();
        this.#activeKey = null;
        this.controller.deactivate();
        this.#publishGit(null);
      }
      return;
    }

    const key = scopeKey(scope);
    if (key === this.#activeKey) {
      this.controller.setActivePath(activePath(state));
      this.#synchronizeDrafts();
      return;
    }

    this.#generation += 1;
    const generation = this.#generation;
    this.#stopWatching();
    this.#activeKey = key;
    this.#publishGit(this.#gitSnapshots.get(key) ?? null);
    void this.controller.activate(scope, activePath(state));
    this.#synchronizeDrafts();
    this.#startWatching(scope, generation);
    void this.#refreshGit(scope, generation);
  }

  #synchronizeDrafts(): void {
    const scope = activeScope(this.owner.snapshot());
    this.controller.setDirtyPaths(scope ? this.drafts.dirtyPaths(scope) : new Set());
  }

  async #copyPath(resource: FileResource, presentation: FilePathPresentation): Promise<void> {
    const worktree = this.owner
      .snapshot()
      .worktrees.find(
        ({ id, projectId, availability }) =>
          id === resource.worktreeId &&
          projectId === resource.projectId &&
          availability === "available",
      );
    if (!worktree) throw new Error("The worktree path is unavailable.");
    await this.copyText(
      presentation === "relative"
        ? resource.relativePath
        : fullPath(worktree.root, resource.relativePath),
    );
  }

  async #mutate(request: FileTreeMutationRequest): Promise<void> {
    if (!this.#fileTree.mutate) throw new Error("File operations are unavailable.");
    const result = await this.#fileTree.mutate(request);
    if (result.status === "refused") throw new Error(result.reason);
  }

  async #createEntry(resource: FileResource, kind: FileTreeCreationKind): Promise<void> {
    await this.#mutate({ ...resource, operation: "create", kind });
    await this.controller.refresh("manual");
    if (kind === "file") await this.owner.activateFile(resource);
  }

  async #renameEntry(resource: FileResource, newName: string): Promise<void> {
    const slash = resource.relativePath.lastIndexOf("/");
    const nextPath = slash < 0 ? newName : `${resource.relativePath.slice(0, slash)}/${newName}`;
    await this.#mutate({ ...resource, operation: "rename", newName });
    this.drafts.movePath(resource, nextPath);
    this.owner.renameFilePath(resource, nextPath);
    await this.controller.refresh("manual");
  }

  async #trashEntry(resource: FileResource): Promise<void> {
    if (this.drafts.hasPath(resource)) {
      throw new Error("Save or discard unsaved changes before moving this item to Trash.");
    }
    await this.#mutate({ ...resource, operation: "trash" });
    this.owner.removeFilePath(resource);
    await this.controller.refresh("manual");
  }

  #startWatching(scope: FileTreeScope, generation: number): void {
    const handle = (event: FileTreeWatchEvent) => {
      if (
        !this.#attached ||
        generation !== this.#generation ||
        scopeKey(scope) !== this.#activeKey
      ) {
        return;
      }
      if (event.status === "ready") {
        this.controller.setWatchProblem(null);
        // Close the one-time gap between the activation snapshot and native
        // watcher installation. Revision matching makes this a cheap no-op
        // when the tree stayed unchanged.
        void this.controller.refresh("disk");
      } else if (event.status === "changed") {
        void this.refresh("disk");
      } else {
        this.controller.setWatchProblem(event.problem);
      }
    };

    try {
      this.#stopDiskWatch = this.#fileTree.watch(scope, handle);
    } catch {
      handle({
        status: "unavailable",
        problem: "Automatic file-tree updates are unavailable.",
      });
    }
  }

  #stopWatching(): void {
    this.#stopDiskWatch();
    this.#stopDiskWatch = () => {};
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
    this.#publishGit(reconciled);
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

  #publishGit(snapshot: GitStatusSnapshot | null): void {
    for (const listener of this.#listeners) listener(snapshot);
  }
}

export function createWorkbenchFilesRuntime(
  owner: WorkbenchStateOwner,
  fileTree: FileTreeAdapter,
  git: GitAdapter,
  instrumentation: InstrumentationClient,
  drafts?: FileDraftStore,
  copyText?: (text: string) => Promise<void>,
): WorkbenchFilesRuntime {
  return new WorkbenchFilesRuntime(owner, git, instrumentation, fileTree, drafts, copyText);
}
