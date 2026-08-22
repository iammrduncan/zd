export { createTauriGitAdapter, unavailableGitAdapter, type NativeGitInvoke } from "./adapter";
export { appendGitHistoryPage, reconcileGitStatus } from "./model";
export type {
  GitAdapter,
  GitAvailability,
  GitChangeEntry,
  GitChangeState,
  GitCommit,
  GitCompareRequest,
  GitComparison,
  GitComparisonEntry,
  GitDelta,
  GitHistoryPage,
  GitHistoryRequest,
  GitScope,
  GitStatusSnapshot,
} from "./types";
