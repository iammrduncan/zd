import { normalizeFileTreeEntries, visibleFileTreeRows } from "./model";
import type {
  FileGitState,
  FileTreeActions,
  FileTreeAdapter,
  FileTreeEntry,
  FileTreeLoadState,
  FileTreeMetricsSink,
  FileTreeRefreshReason,
  FileTreeResult,
  FileTreeScope,
  FileTreeScrollState,
  FileTreeViewSnapshot,
  NativeFileTreeEntry,
  VisibleFileTreeRow,
} from "./types";

interface FilterRestore {
  readonly selectedPath: string | null;
  readonly scroll: FileTreeScrollState;
}

interface ScopeMemory {
  readonly scope: FileTreeScope;
  state: FileTreeLoadState;
  refreshing: boolean;
  rawEntries: readonly NativeFileTreeEntry[];
  entries: readonly FileTreeEntry[];
  expandedPaths: Set<string>;
  selectedPath: string | null;
  activePath: string | null;
  filterOpen: boolean;
  filterQuery: string;
  filterRestore: FilterRestore | null;
  scroll: FileTreeScrollState;
  revision: string | null;
  truncated: boolean;
  ignoredTruncated: boolean;
  unreadableDirectories: number;
  treeNotice: string | null;
  watchProblem: string | null;
  notice: string | null;
  refreshPromise: Promise<void> | null;
  refreshQueued: boolean;
}

const inertActions: FileTreeActions = {
  activateFile: async () => ({ status: "refused", reason: "File activation is unavailable" }),
};

const inertMetrics: FileTreeMetricsSink = { record: () => {} };

function scopeKey(scope: FileTreeScope): string {
  return `${scope.projectId}\0${scope.worktreeId}`;
}

function newMemory(scope: FileTreeScope, activePath: string | null): ScopeMemory {
  return {
    scope: { ...scope },
    state: "idle",
    refreshing: false,
    rawEntries: [],
    entries: [],
    expandedPaths: new Set(),
    selectedPath: activePath,
    activePath,
    filterOpen: false,
    filterQuery: "",
    filterRestore: null,
    scroll: { top: 0, left: 0 },
    revision: null,
    truncated: false,
    ignoredTruncated: false,
    unreadableDirectories: 0,
    treeNotice: null,
    watchProblem: null,
    notice: null,
    refreshPromise: null,
    refreshQueued: false,
  };
}

function resultMatchesScope(result: FileTreeResult, scope: FileTreeScope): boolean {
  return result.projectId === scope.projectId && result.worktreeId === scope.worktreeId;
}

export class FileTreeController {
  readonly #memories = new Map<string, ScopeMemory>();
  readonly #listeners = new Set<(snapshot: FileTreeViewSnapshot) => void>();
  readonly #gitStates = new Map<string, ReadonlyMap<string, FileGitState>>();
  #current: ScopeMemory | null = null;
  #dirtyPaths: ReadonlySet<string> = new Set();

  constructor(
    readonly adapter: FileTreeAdapter,
    readonly actions: FileTreeActions = inertActions,
    readonly metrics: FileTreeMetricsSink = inertMetrics,
  ) {}

  snapshot(): FileTreeViewSnapshot {
    const memory = this.#current;
    if (!memory) {
      return {
        scope: null,
        state: "unavailable",
        refreshing: false,
        entries: [],
        expandedPaths: new Set(),
        selectedPath: null,
        activePath: null,
        dirtyPaths: new Set(),
        filterOpen: false,
        filterQuery: "",
        scroll: { top: 0, left: 0 },
        revision: null,
        truncated: false,
        ignoredTruncated: false,
        unreadableDirectories: 0,
        notice: "Choose an available project to browse files.",
      };
    }
    return {
      scope: { ...memory.scope },
      state: memory.state,
      refreshing: memory.refreshing,
      entries: memory.entries,
      expandedPaths: new Set(memory.expandedPaths),
      selectedPath: memory.selectedPath,
      activePath: memory.activePath,
      dirtyPaths: new Set(this.#dirtyPaths),
      filterOpen: memory.filterOpen,
      filterQuery: memory.filterQuery,
      scroll: { ...memory.scroll },
      revision: memory.revision,
      truncated: memory.truncated,
      ignoredTruncated: memory.ignoredTruncated,
      unreadableDirectories: memory.unreadableDirectories,
      notice: memory.notice,
    };
  }

  rows(): readonly VisibleFileTreeRow[] {
    const memory = this.#current;
    return memory
      ? visibleFileTreeRows(memory.entries, memory.expandedPaths, memory.filterQuery)
      : [];
  }

  subscribe(listener: (snapshot: FileTreeViewSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async activate(scope: FileTreeScope, activePath: string | null = null): Promise<void> {
    const key = scopeKey(scope);
    const memory = this.#memories.get(key) ?? newMemory(scope, activePath);
    this.#memories.set(key, memory);
    memory.activePath = activePath;
    if (memory.selectedPath === null && activePath !== null) memory.selectedPath = activePath;
    this.#current = memory;
    this.#publish();
    await this.refresh("activate");
  }

  deactivate(): void {
    this.#current = null;
    this.#dirtyPaths = new Set();
    this.#publish();
  }

  setActivePath(path: string | null): void {
    const memory = this.#current;
    if (!memory) return;
    memory.activePath = path;
    this.#publish();
  }

  setDirtyPaths(paths: ReadonlySet<string>): void {
    if (
      paths.size === this.#dirtyPaths.size &&
      [...paths].every((path) => this.#dirtyPaths.has(path))
    ) {
      return;
    }
    this.#dirtyPaths = new Set(paths);
    this.#publish();
  }

  setWatchProblem(problem: string | null): void {
    const memory = this.#current;
    if (!memory || memory.watchProblem === problem) return;
    const previousPersistentNotice = persistentNotice(memory);
    memory.watchProblem = problem;
    if (memory.notice === null || memory.notice === previousPersistentNotice) {
      memory.notice = persistentNotice(memory);
    }
    this.#publish();
  }

  async refresh(reason: FileTreeRefreshReason = "manual"): Promise<void> {
    const memory = this.#current;
    if (!memory) return;
    if (memory.refreshPromise) {
      memory.refreshQueued = true;
      return memory.refreshPromise;
    }
    const run = async (): Promise<void> => {
      do {
        memory.refreshQueued = false;
        await this.#refreshOnce(memory, reason);
      } while (memory.refreshQueued && this.#current === memory);
    };
    memory.refreshPromise = run().finally(() => {
      memory.refreshPromise = null;
    });
    return memory.refreshPromise;
  }

  select(path: string | null): void {
    const memory = this.#current;
    if (!memory || memory.selectedPath === path) return;
    memory.selectedPath = path;
    this.#publish();
  }

  moveSelection(offset: -1 | 1): string | null {
    const memory = this.#current;
    if (!memory) return null;
    const rows = this.rows();
    if (rows.length === 0) return null;
    const current = rows.findIndex((row) => row.entry.relativePath === memory.selectedPath);
    const next =
      current < 0
        ? offset > 0
          ? 0
          : rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, current + offset));
    const path = rows[next]!.entry.relativePath;
    this.select(path);
    return path;
  }

  selectBoundary(boundary: "first" | "last"): string | null {
    const rows = this.rows();
    const row = boundary === "first" ? rows[0] : rows.at(-1);
    const path = row?.entry.relativePath ?? null;
    if (path) this.select(path);
    return path;
  }

  expand(path: string): void {
    const memory = this.#current;
    const row = this.rows().find((candidate) => candidate.entry.relativePath === path);
    if (!memory || !row?.hasChildren || memory.expandedPaths.has(path)) return;
    const started = performance.now();
    memory.expandedPaths.add(path);
    this.#publish();
    this.#record("expand", "expanded", performance.now() - started);
  }

  collapse(path: string): void {
    const memory = this.#current;
    if (!memory?.expandedPaths.delete(path)) return;
    this.#publish();
  }

  toggle(path: string): void {
    const memory = this.#current;
    if (!memory) return;
    if (memory.expandedPaths.has(path)) {
      this.collapse(path);
    } else {
      this.expand(path);
    }
  }

  selectParent(path: string): string | null {
    const memory = this.#current;
    const row = this.rows().find((candidate) => candidate.entry.relativePath === path);
    if (!memory || !row) return null;
    if (row.expanded) {
      this.collapse(path);
      return path;
    }
    const parent = row.entry.parentPath;
    if (parent) this.select(parent);
    return parent;
  }

  selectChild(path: string): string | null {
    const row = this.rows().find((candidate) => candidate.entry.relativePath === path);
    if (!row?.hasChildren) return null;
    if (!row.expanded) {
      this.expand(path);
      return path;
    }
    const child = this.rows().find((candidate) => candidate.entry.parentPath === path);
    if (child) this.select(child.entry.relativePath);
    return child?.entry.relativePath ?? path;
  }

  async activateSelected(): Promise<void> {
    const memory = this.#current;
    const selected = memory?.selectedPath;
    if (!memory || !selected) return;
    const entry = memory.entries.find((candidate) => candidate.relativePath === selected);
    if (!entry) return;
    if (entry.kind === "directory") {
      this.toggle(selected);
      return;
    }

    const started = performance.now();
    const result = await this.actions.activateFile({
      projectId: memory.scope.projectId,
      worktreeId: memory.scope.worktreeId,
      relativePath: entry.relativePath,
    });
    if (result.status === "committed") {
      memory.activePath = entry.relativePath;
      memory.notice = persistentNotice(memory);
    } else {
      memory.notice = result.reason;
    }
    this.#publish();
    this.#record("activate", result.status, performance.now() - started);
  }

  summonFilter(): void {
    const memory = this.#current;
    if (!memory || memory.filterOpen) return;
    memory.filterOpen = true;
    this.#publish();
  }

  setFilter(query: string): void {
    const memory = this.#current;
    if (!memory || memory.filterQuery === query) return;
    const started = performance.now();
    if (memory.filterQuery.length === 0 && query.length > 0) {
      memory.filterRestore = {
        selectedPath: memory.selectedPath,
        scroll: { ...memory.scroll },
      };
      memory.scroll = { top: 0, left: memory.scroll.left };
    }
    memory.filterQuery = query;
    if (query.length === 0 && memory.filterRestore) {
      memory.selectedPath = memory.filterRestore.selectedPath;
      memory.scroll = memory.filterRestore.scroll;
      memory.filterRestore = null;
    }
    this.#publish();
    this.#record("filter", "applied", performance.now() - started);
  }

  dismissFilter(): void {
    const memory = this.#current;
    if (!memory) return;
    this.setFilter("");
    memory.filterOpen = false;
    this.#publish();
  }

  setScroll(scroll: FileTreeScrollState): void {
    const memory = this.#current;
    if (!memory) return;
    memory.scroll = {
      top: Math.max(0, scroll.top),
      left: Math.max(0, scroll.left),
    };
  }

  reconcileGit(states: ReadonlyMap<string, FileGitState>): void {
    const memory = this.#current;
    if (!memory) return;
    this.#gitStates.set(scopeKey(memory.scope), states);
    memory.entries = entriesWithGitOverlay(memory.rawEntries, states);
    this.#publish();
  }

  async #refreshOnce(memory: ScopeMemory, reason: FileTreeRefreshReason): Promise<void> {
    const started = performance.now();
    memory.refreshing = memory.state !== "idle";
    if (memory.state === "idle") memory.state = "loading";
    this.#publish();
    let result: FileTreeResult;
    try {
      result = await this.adapter.snapshot({
        ...memory.scope,
        previousRevision: memory.revision,
      });
    } catch (cause) {
      memory.refreshing = false;
      memory.state = memory.entries.length > 0 ? "ready" : "error";
      memory.notice = cause instanceof Error ? cause.message : "The file tree could not refresh.";
      this.#publishIfCurrent(memory);
      this.#recordFor(memory, "refresh", "error", performance.now() - started, reason);
      return;
    }
    if (!resultMatchesScope(result, memory.scope)) {
      memory.refreshing = false;
      memory.state = memory.entries.length > 0 ? "ready" : "error";
      memory.notice = "A stale file-tree response was refused.";
      this.#publishIfCurrent(memory);
      this.#recordFor(memory, "refresh", "stale", performance.now() - started, reason);
      return;
    }
    this.#applyResult(memory, result);
    this.#publishIfCurrent(memory);
    this.#recordFor(memory, "refresh", result.status, performance.now() - started, reason);
  }

  #applyResult(memory: ScopeMemory, result: FileTreeResult): void {
    memory.refreshing = false;
    if (result.status === "unchanged") {
      memory.revision = result.revision;
      memory.notice = persistentNotice(memory);
      return;
    }
    if (result.status === "ready") {
      memory.rawEntries = result.entries;
      memory.entries = entriesWithGitOverlay(
        result.entries,
        this.#gitStates.get(scopeKey(memory.scope)),
      );
      memory.revision = result.revision;
      memory.state = "ready";
      memory.truncated = result.truncated;
      memory.ignoredTruncated = result.ignoredTruncated;
      memory.unreadableDirectories = result.unreadableDirectories;
      memory.treeNotice = treeNotice(result);
      memory.notice = persistentNotice(memory);
      return;
    }
    memory.rawEntries = [];
    memory.entries = [];
    memory.truncated = false;
    memory.ignoredTruncated = false;
    memory.unreadableDirectories = 0;
    memory.treeNotice = null;
    memory.notice = persistentNotice(memory);
    if (result.status === "empty") {
      memory.revision = result.revision;
      memory.state = "empty";
      return;
    }
    memory.revision = null;
    memory.state = result.status;
    memory.notice = result.status === "unavailable" ? result.problem : null;
  }

  #publishIfCurrent(memory: ScopeMemory): void {
    if (this.#current === memory) this.#publish();
  }

  #publish(): void {
    const snapshot = this.snapshot();
    this.#listeners.forEach((listener) => listener(snapshot));
  }

  #record(operation: "activate" | "expand" | "filter", outcome: string, durationMs: number): void {
    const memory = this.#current;
    if (memory) this.#recordFor(memory, operation, outcome, durationMs);
  }

  #recordFor(
    memory: ScopeMemory,
    operation: "activate" | "expand" | "filter" | "refresh",
    outcome: string,
    durationMs: number,
    reason?: FileTreeRefreshReason,
  ): void {
    void Promise.resolve(
      this.metrics.record({
        operation,
        projectId: memory.scope.projectId,
        worktreeId: memory.scope.worktreeId,
        outcome,
        durationMs,
        entryCount: memory.entries.length,
        truncated: memory.truncated,
        reason,
      }),
    ).catch(() => {});
  }
}

function entriesWithGitOverlay(
  entries: readonly NativeFileTreeEntry[],
  states: ReadonlyMap<string, FileGitState> = new Map(),
): readonly FileTreeEntry[] {
  const present = new Set(entries.map((entry) => entry.relativePath));
  const deleted: NativeFileTreeEntry[] = [];
  for (const [relativePath, state] of states) {
    if (state !== "deleted" || present.has(relativePath)) continue;
    const name = relativePath.split("/").at(-1) ?? relativePath;
    const slash = relativePath.lastIndexOf("/");
    deleted.push({
      relativePath,
      parentPath: slash < 0 ? null : relativePath.slice(0, slash),
      name,
      kind: "file",
      ignored: false,
      byteLength: null,
      modified: null,
    });
  }
  return normalizeFileTreeEntries([...entries, ...deleted], states);
}

function treeNotice(result: Extract<FileTreeResult, { status: "ready" }>): string | null {
  const notices: string[] = [];
  if (result.truncated) notices.push("The project exceeds the bounded file-tree limit.");
  if (result.ignoredTruncated) notices.push("Additional ignored entries are hidden.");
  if (result.unreadableDirectories > 0) notices.push("Some folders could not be read.");
  return notices.length > 0 ? notices.join(" ") : null;
}

function persistentNotice(memory: Pick<ScopeMemory, "treeNotice" | "watchProblem">): string | null {
  const notices = [memory.treeNotice, memory.watchProblem].filter(
    (notice): notice is string => notice !== null,
  );
  return notices.length > 0 ? notices.join(" ") : null;
}
