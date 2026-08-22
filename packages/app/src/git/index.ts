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
  GitDiff,
  GitDiffBuffer,
  GitDiffRequest,
  GitDiffSource,
  GitHistoryPage,
  GitHistoryRequest,
  GitScope,
  GitStatusSnapshot,
} from "./types";
