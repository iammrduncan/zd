export interface GitScope {
  readonly projectId: string;
  readonly worktreeId: string;
}

export type GitAvailability = "available" | "non-repository" | "denied" | "unavailable";

export type GitChangeState =
  "added" | "modified" | "deleted" | "renamed" | "conflicted" | "untracked" | "ignored";

export type GitDelta =
  "added" | "modified" | "deleted" | "renamed" | "copied" | "type-changed" | "unmerged";

export interface GitChangeEntry {
  readonly id: string;
  readonly path: string;
  readonly previousPath: string | null;
  readonly state: GitChangeState;
  readonly indexState: GitDelta | null;
  readonly worktreeState: GitDelta | null;
  readonly submodule: boolean;
}

export interface GitStatusSnapshot {
  readonly scope: GitScope;
  readonly availability: GitAvailability;
  readonly entries: readonly GitChangeEntry[];
  readonly truncated: boolean;
  readonly problem: string | null;
}

export interface GitHistoryRequest {
  readonly scope: GitScope;
  readonly cursor: string | null;
  readonly pageSize: number | null;
}

export interface GitCommit {
  readonly id: string;
  readonly parentIds: readonly string[];
  readonly authorName: string;
  /** Unix seconds from the commit's author timestamp. */
  readonly authoredAt: number;
  readonly subject: string;
}

export interface GitHistoryPage {
  readonly scope: GitScope;
  readonly availability: GitAvailability;
  readonly commits: readonly GitCommit[];
  readonly nextCursor: string | null;
  readonly truncated: boolean;
  readonly problem: string | null;
}

export interface GitCompareRequest {
  readonly scope: GitScope;
  readonly baseCommitId: string;
  readonly headCommitId: string;
}

export interface GitComparisonEntry {
  readonly id: string;
  readonly path: string;
  readonly previousPath: string | null;
  readonly state: GitChangeState;
  readonly submodule: boolean;
}

export interface GitComparison {
  readonly scope: GitScope;
  readonly availability: GitAvailability;
  readonly baseCommitId: string;
  readonly headCommitId: string;
  readonly entries: readonly GitComparisonEntry[];
  readonly truncated: boolean;
  readonly problem: string | null;
}

export type GitDiffSource =
  | { readonly kind: "working-tree"; readonly changeId: string }
  | {
      readonly kind: "comparison";
      readonly baseCommitId: string;
      readonly headCommitId: string;
      readonly changeId: string;
    };

export interface GitDiffRequest {
  readonly scope: GitScope;
  readonly source: GitDiffSource;
}

interface GitDiffBufferIdentity {
  readonly identity: string;
  readonly path: string;
  readonly revision: string;
}

export type GitDiffBuffer = GitDiffBufferIdentity &
  (
    | { readonly status: "text"; readonly text: string; readonly byteLength: number }
    | { readonly status: "binary"; readonly byteLength: number }
    | { readonly status: "undecodable"; readonly byteLength: number }
    | { readonly status: "missing" }
    | { readonly status: "denied" }
    | {
        readonly status: "over-limit";
        readonly byteLength: number;
        readonly limit: number;
        readonly preview: string | null;
      }
    | { readonly status: "unavailable"; readonly problem: string }
  );

export interface GitDiff {
  readonly scope: GitScope;
  readonly availability: GitAvailability;
  readonly base: GitDiffBuffer;
  readonly head: GitDiffBuffer;
  readonly problem: string | null;
}

export interface GitAdapter {
  status(scope: GitScope): Promise<GitStatusSnapshot>;
  history(request: GitHistoryRequest): Promise<GitHistoryPage>;
  compare(request: GitCompareRequest): Promise<GitComparison>;
  diff(request: GitDiffRequest): Promise<GitDiff>;
}
