import type { GitComparison, GitDiff, GitHistoryPage, GitScope, GitStatusSnapshot } from "@/git";

export interface ChangesStatusSource {
  snapshot(): GitStatusSnapshot | null;
  subscribe(listener: (snapshot: GitStatusSnapshot | null) => void): () => void;
  refresh(): Promise<void>;
}

export type ChangesOperation = "status" | "history" | "compare" | "diff";

export interface ChangesMetric {
  readonly operation: ChangesOperation;
  readonly outcome: "ok" | "unavailable" | "failed" | "cancelled";
  readonly projectId: string;
  readonly worktreeId: string;
}

export interface ChangesMetricsSink {
  record(metric: ChangesMetric): void;
}

export interface ChangesSnapshot {
  readonly scope: GitScope | null;
  readonly filter: string;
  readonly status: GitStatusSnapshot | null;
  readonly history: GitHistoryPage | null;
  readonly comparison: GitComparison | null;
  readonly selectedCommitIds: readonly string[];
  readonly selectedChangeId: string | null;
  readonly diff: GitDiff | null;
  readonly historyLoading: boolean;
  readonly comparisonLoading: boolean;
  readonly diffLoading: boolean;
  readonly problem: string | null;
}
