import type { FileResource } from "@/workbench/resources";
import type { TransitionResult } from "@/workbench/state";

export interface FileTreeScope {
  readonly projectId: string;
  readonly worktreeId: string;
}

export type FileTreeEntryKind = "directory" | "file" | "symlink";

export type FileCategory =
  "directory" | "markdown" | "code" | "config" | "data" | "image" | "text" | "binary" | "unknown";

export type FileGitState =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "conflicted"
  | "untracked"
  | "ignored"
  | "submodule";

/** Exact native entry shape. Git state is reconciled later by the scoped Git service. */
export interface NativeFileTreeEntry {
  readonly relativePath: string;
  readonly parentPath: string | null;
  readonly name: string;
  readonly kind: FileTreeEntryKind;
  readonly ignored: boolean;
  readonly byteLength: number | null;
  readonly modified: number | null;
}

export interface FileTreeEntry extends NativeFileTreeEntry {
  readonly category: FileCategory;
  readonly gitState: FileGitState | null;
}

interface ScopedResult extends FileTreeScope {
  readonly status:
    "ready" | "unchanged" | "empty" | "missing" | "denied" | "not-directory" | "unavailable";
}

export type FileTreeResult =
  | (ScopedResult & {
      readonly status: "ready";
      readonly revision: string;
      readonly entries: readonly NativeFileTreeEntry[];
      readonly truncated: boolean;
      readonly ignoredTruncated: boolean;
      readonly unreadableDirectories: number;
      readonly elapsedMicros: number;
    })
  | (ScopedResult & {
      readonly status: "unchanged" | "empty";
      readonly revision: string;
      readonly elapsedMicros: number;
    })
  | (ScopedResult & { readonly status: "missing" | "denied" | "not-directory" })
  | (ScopedResult & { readonly status: "unavailable"; readonly problem: string });

export interface FileTreeRequest extends FileTreeScope {
  readonly previousRevision: string | null;
}

/** Narrow platform seam. The Tauri implementation invokes `file_tree_snapshot`. */
export interface FileTreeAdapter {
  snapshot(request: FileTreeRequest): Promise<FileTreeResult>;
}

/** Honest inert adapter for browser fixtures and surfaces without native file authority. */
export const unavailableFileTreeAdapter: FileTreeAdapter = {
  snapshot: async (request) => ({
    status: "unavailable",
    projectId: request.projectId,
    worktreeId: request.worktreeId,
    problem: "file trees require the desktop shell",
  }),
};

/** Root-owned context transition. The Files feature never sets active file state itself. */
export interface FileTreeActions {
  activateFile(resource: FileResource): Promise<TransitionResult>;
}

export type FileTreeRefreshReason = "activate" | "disk" | "focus" | "manual";

export interface FileTreeMetric {
  readonly operation: "activate" | "expand" | "filter" | "refresh";
  readonly projectId: string;
  readonly worktreeId: string;
  readonly outcome: string;
  readonly durationMs: number;
  readonly entryCount: number;
  readonly truncated?: boolean;
  readonly reason?: FileTreeRefreshReason;
}

/** No paths or filenames cross this diagnostic seam. */
export interface FileTreeMetricsSink {
  record(metric: FileTreeMetric): void | Promise<void>;
}

export type FileTreeLoadState =
  | "idle"
  | "loading"
  | "ready"
  | "empty"
  | "missing"
  | "denied"
  | "not-directory"
  | "unavailable"
  | "error";

export interface FileTreeScrollState {
  readonly top: number;
  readonly left: number;
}

export interface FileTreeViewSnapshot {
  readonly scope: FileTreeScope | null;
  readonly state: FileTreeLoadState;
  readonly refreshing: boolean;
  readonly entries: readonly FileTreeEntry[];
  readonly expandedPaths: ReadonlySet<string>;
  readonly selectedPath: string | null;
  readonly activePath: string | null;
  readonly filterOpen: boolean;
  readonly filterQuery: string;
  readonly scroll: FileTreeScrollState;
  readonly revision: string | null;
  readonly truncated: boolean;
  readonly ignoredTruncated: boolean;
  readonly unreadableDirectories: number;
  readonly notice: string | null;
}

export interface VisibleFileTreeRow {
  readonly entry: FileTreeEntry;
  readonly depth: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly matched: boolean;
  readonly positionInSet: number;
  readonly setSize: number;
}
