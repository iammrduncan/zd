import type {
  GitAdapter,
  GitCompareRequest,
  GitComparison,
  GitDiff,
  GitDiffRequest,
  GitHistoryPage,
  GitHistoryRequest,
  GitScope,
  GitStatusSnapshot,
} from "./types";

const MAX_HISTORY_PAGE_SIZE = 200;

export type NativeGitInvoke = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

function normalizedHistoryRequest(request: GitHistoryRequest): GitHistoryRequest {
  const requested = request.pageSize;
  const pageSize =
    requested === null || !Number.isFinite(requested)
      ? null
      : Math.min(MAX_HISTORY_PAGE_SIZE, Math.max(1, Math.trunc(requested)));
  return { ...request, pageSize };
}

/**
 * The only frontend code that knows the exact native Git command names.
 * The injected function lets Platform own Tauri while this module owns Git.
 */
export function createTauriGitAdapter(invoke: NativeGitInvoke): GitAdapter {
  return {
    status: (scope) => invoke("git_status", { scope }) as Promise<GitStatusSnapshot>,
    history: (request) =>
      invoke("git_history_page", {
        request: normalizedHistoryRequest(request),
      }) as Promise<GitHistoryPage>,
    compare: (request) => invoke("git_compare", { request }) as Promise<GitComparison>,
    diff: (request) => invoke("git_diff", { request }) as Promise<GitDiff>,
  };
}

const unavailableProblem = "Git inspection requires the desktop shell";

function unavailableStatus(scope: GitScope): GitStatusSnapshot {
  return {
    scope,
    availability: "unavailable",
    entries: [],
    truncated: false,
    problem: unavailableProblem,
  };
}

function unavailableHistory(request: GitHistoryRequest): GitHistoryPage {
  return {
    scope: request.scope,
    availability: "unavailable",
    commits: [],
    nextCursor: null,
    truncated: false,
    problem: unavailableProblem,
  };
}

function unavailableComparison(request: GitCompareRequest): GitComparison {
  return {
    scope: request.scope,
    availability: "unavailable",
    baseCommitId: request.baseCommitId,
    headCommitId: request.headCommitId,
    entries: [],
    truncated: false,
    problem: unavailableProblem,
  };
}

function unavailableDiff(request: GitDiffRequest): GitDiff {
  const changeId = request.source.changeId;
  const buffer = (revision: string) => ({
    status: "unavailable" as const,
    identity: `unavailable:${changeId}:${revision}`,
    path: "",
    revision,
    problem: unavailableProblem,
  });
  return {
    scope: request.scope,
    availability: "unavailable",
    base: buffer("base"),
    head: buffer("head"),
    problem: unavailableProblem,
  };
}

/** Honest inert adapter for browser fixtures, without a pretend repository. */
export const unavailableGitAdapter: GitAdapter = {
  status: async (scope) => unavailableStatus(scope),
  history: async (request) => unavailableHistory(request),
  compare: async (request) => unavailableComparison(request),
  diff: async (request) => unavailableDiff(request),
};
