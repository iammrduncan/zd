import {
  appendGitHistoryPage,
  type GitAdapter,
  type GitDiffRequest,
  type GitHistoryPage,
  type GitScope,
  type GitStatusSnapshot,
} from "@/git";

import type {
  ChangesMetric,
  ChangesMetricsSink,
  ChangesSnapshot,
  ChangesStatusSource,
} from "./types";

const HISTORY_PAGE_SIZE = 50;

interface ScopeState extends Omit<ChangesSnapshot, "scope"> {
  readonly scope: GitScope;
}

function scopeKey(scope: GitScope): string {
  return `${scope.projectId}\0${scope.worktreeId}`;
}

function sameScope(left: GitScope, right: GitScope): boolean {
  return left.projectId === right.projectId && left.worktreeId === right.worktreeId;
}

function initialState(scope: GitScope): ScopeState {
  return {
    scope: { ...scope },
    filter: "",
    status: null,
    history: null,
    comparison: null,
    selectedCommitIds: [],
    selectedChangeId: null,
    diff: null,
    historyLoading: false,
    comparisonLoading: false,
    diffLoading: false,
    problem: null,
  };
}

const emptySnapshot = (): ChangesSnapshot => ({
  ...initialState({ projectId: "", worktreeId: "" }),
  scope: null,
});

function operationProblem(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export class ChangesController {
  readonly #listeners = new Set<(snapshot: ChangesSnapshot) => void>();
  readonly #states = new Map<string, ScopeState>();
  readonly #stopStatus: () => void;
  #activeKey: string | null = null;
  #disposed = false;

  constructor(
    readonly git: GitAdapter,
    readonly statusSource: ChangesStatusSource,
    readonly metrics?: ChangesMetricsSink,
  ) {
    this.#stopStatus = statusSource.subscribe((snapshot) => this.#applyStatus(snapshot));
  }

  snapshot(): ChangesSnapshot {
    const state = this.#activeState();
    return state
      ? {
          ...state,
          scope: { ...state.scope },
          selectedCommitIds: [...state.selectedCommitIds],
        }
      : emptySnapshot();
  }

  subscribe(listener: (snapshot: ChangesSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  activate(scope: GitScope | null): void {
    if (!scope) {
      this.#activeKey = null;
      this.#publish();
      return;
    }
    const key = scopeKey(scope);
    this.#activeKey = key;
    if (!this.#states.has(key)) this.#states.set(key, initialState(scope));
    const status = this.statusSource.snapshot();
    if (status && sameScope(status.scope, scope)) this.#applyStatus(status, false);
    this.#publish();
  }

  setFilter(filter: string): void {
    this.#updateActive((state) => ({ ...state, filter }));
  }

  async refreshStatus(): Promise<void> {
    const scope = this.#activeState()?.scope;
    if (!scope) return;
    try {
      await this.statusSource.refresh();
      this.#record("status", "ok", scope);
    } catch {
      this.#record("status", "failed", scope);
      this.#setProblem("Git status could not be refreshed.");
    }
  }

  async loadHistory(): Promise<void> {
    const state = this.#activeState();
    if (!state || state.history || state.historyLoading) return;
    await this.#fetchHistory(state, null);
  }

  async reloadHistory(): Promise<void> {
    const state = this.#activeState();
    if (!state || state.historyLoading) return;
    await this.#fetchHistory({ ...state, history: null }, null);
  }

  async loadMoreHistory(): Promise<void> {
    const state = this.#activeState();
    if (!state?.history?.nextCursor || state.historyLoading) return;
    await this.#fetchHistory(state, state.history.nextCursor);
  }

  async #fetchHistory(state: ScopeState, cursor: string | null): Promise<void> {
    const key = scopeKey(state.scope);
    this.#setState(key, { ...state, historyLoading: true, problem: null });
    let page: GitHistoryPage;
    try {
      page = await this.git.history({ scope: state.scope, cursor, pageSize: HISTORY_PAGE_SIZE });
    } catch (cause) {
      this.#finishHistoryFailure(key, state.scope, operationProblem(cause, "Git history failed."));
      return;
    }
    const current = this.#states.get(key);
    if (!current) return;
    if (this.#activeKey !== key) {
      this.#setState(key, { ...current, historyLoading: false }, false);
      this.#record("history", "cancelled", state.scope);
      return;
    }
    if (!sameScope(page.scope, state.scope)) {
      this.#finishHistoryFailure(key, state.scope, "Git history returned another scope.");
      return;
    }
    const history = cursor && current.history ? appendGitHistoryPage(current.history, page) : page;
    this.#setState(key, {
      ...current,
      history,
      historyLoading: false,
      problem: page.problem,
    });
    this.#record("history", page.availability === "available" ? "ok" : "unavailable", state.scope);
  }

  async selectCommit(commitId: string): Promise<void> {
    const state = this.#activeState();
    if (!state?.history?.commits.some(({ id }) => id === commitId)) return;
    const selected = state.selectedCommitIds.includes(commitId)
      ? state.selectedCommitIds.filter((id) => id !== commitId)
      : state.selectedCommitIds.length < 2
        ? [...state.selectedCommitIds, commitId]
        : [commitId];
    const next = {
      ...state,
      selectedCommitIds: selected,
      comparison: null,
      selectedChangeId: null,
      diff: null,
      problem: null,
    };
    this.#setState(scopeKey(state.scope), next);
    if (selected.length !== 2) return;

    const order = new Map(state.history.commits.map((commit, index) => [commit.id, index]));
    const [left, right] = selected;
    if (!left || !right) return;
    const baseCommitId = order.get(left)! > order.get(right)! ? left : right;
    const headCommitId = baseCommitId === left ? right : left;
    await this.#loadComparison(next, baseCommitId, headCommitId);
  }

  async #loadComparison(
    state: ScopeState,
    baseCommitId: string,
    headCommitId: string,
  ): Promise<void> {
    const key = scopeKey(state.scope);
    this.#setState(key, { ...state, comparisonLoading: true });
    try {
      const comparison = await this.git.compare({
        scope: state.scope,
        baseCommitId,
        headCommitId,
      });
      const current = this.#states.get(key);
      if (!current) return;
      if (this.#activeKey !== key) {
        this.#setState(key, { ...current, comparisonLoading: false }, false);
        this.#record("compare", "cancelled", state.scope);
        return;
      }
      if (
        !sameScope(comparison.scope, state.scope) ||
        comparison.baseCommitId !== baseCommitId ||
        comparison.headCommitId !== headCommitId
      ) {
        this.#setState(key, {
          ...current,
          comparisonLoading: false,
          problem: "Git comparison returned another selection.",
        });
        this.#record("compare", "failed", state.scope);
        return;
      }
      this.#setState(key, {
        ...current,
        comparison,
        comparisonLoading: false,
        problem: comparison.problem,
      });
      this.#record(
        "compare",
        comparison.availability === "available" ? "ok" : "unavailable",
        state.scope,
      );
    } catch (cause) {
      const current = this.#states.get(key);
      if (!current) return;
      this.#setState(key, {
        ...current,
        comparisonLoading: false,
        problem: operationProblem(cause, "Git comparison failed."),
      });
      this.#record("compare", "failed", state.scope);
    }
  }

  openWorkingDiff(changeId: string): Promise<void> {
    const state = this.#activeState();
    if (!state?.status?.entries.some(({ id }) => id === changeId)) return Promise.resolve();
    return this.#openDiff(state, {
      scope: state.scope,
      source: { kind: "working-tree", changeId },
    });
  }

  openComparisonDiff(changeId: string): Promise<void> {
    const state = this.#activeState();
    const comparison = state?.comparison;
    if (!state || !comparison?.entries.some(({ id }) => id === changeId)) {
      return Promise.resolve();
    }
    return this.#openDiff(state, {
      scope: state.scope,
      source: {
        kind: "comparison",
        baseCommitId: comparison.baseCommitId,
        headCommitId: comparison.headCommitId,
        changeId,
      },
    });
  }

  async #openDiff(state: ScopeState, request: GitDiffRequest): Promise<void> {
    const key = scopeKey(state.scope);
    this.#setState(key, {
      ...state,
      selectedChangeId: request.source.changeId,
      diff: null,
      diffLoading: true,
      problem: null,
    });
    try {
      const diff = await this.git.diff(request);
      const current = this.#states.get(key);
      if (!current) return;
      if (this.#activeKey !== key) {
        this.#setState(key, { ...current, diffLoading: false }, false);
        this.#record("diff", "cancelled", state.scope);
        return;
      }
      if (!sameScope(diff.scope, state.scope)) {
        this.#setState(key, {
          ...current,
          diffLoading: false,
          problem: "Git diff returned another scope.",
        });
        this.#record("diff", "failed", state.scope);
        return;
      }
      this.#setState(key, {
        ...current,
        diff,
        diffLoading: false,
        problem: diff.problem,
      });
      this.#record("diff", diff.availability === "available" ? "ok" : "unavailable", state.scope);
    } catch (cause) {
      const current = this.#states.get(key);
      if (!current) return;
      this.#setState(key, {
        ...current,
        diffLoading: false,
        problem: operationProblem(cause, "Git diff failed."),
      });
      this.#record("diff", "failed", state.scope);
    }
  }

  closeDiff(): void {
    this.#updateActive((state) => ({
      ...state,
      selectedChangeId: null,
      diff: null,
      diffLoading: false,
    }));
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopStatus();
    this.#listeners.clear();
  }

  #applyStatus(snapshot: GitStatusSnapshot | null, publish = true): void {
    if (!snapshot) {
      const active = this.#activeState();
      if (active) this.#setState(scopeKey(active.scope), { ...active, status: null }, publish);
      return;
    }
    const key = scopeKey(snapshot.scope);
    const current = this.#states.get(key) ?? initialState(snapshot.scope);
    this.#setState(key, { ...current, status: snapshot }, publish && key === this.#activeKey);
  }

  #finishHistoryFailure(key: string, scope: GitScope, problem: string): void {
    const current = this.#states.get(key);
    if (!current) return;
    this.#setState(key, { ...current, historyLoading: false, problem });
    this.#record("history", "failed", scope);
  }

  #setProblem(problem: string): void {
    this.#updateActive((state) => ({ ...state, problem }));
  }

  #activeState(): ScopeState | null {
    return this.#activeKey ? (this.#states.get(this.#activeKey) ?? null) : null;
  }

  #updateActive(change: (state: ScopeState) => ScopeState): void {
    const state = this.#activeState();
    if (!state) return;
    this.#setState(scopeKey(state.scope), change(state));
  }

  #setState(key: string, state: ScopeState, publish = true): void {
    this.#states.set(key, state);
    if (publish && key === this.#activeKey) this.#publish();
  }

  #record(
    operation: ChangesMetric["operation"],
    outcome: ChangesMetric["outcome"],
    scope: GitScope,
  ): void {
    this.metrics?.record({
      operation,
      outcome,
      projectId: scope.projectId,
      worktreeId: scope.worktreeId,
    });
  }

  #publish(): void {
    if (this.#disposed) return;
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
