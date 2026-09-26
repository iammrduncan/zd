import { normalizeFileTreeEntries } from "./model";
import type { FileGitState, FileTreeEntry, FileTreeResult, NativeFileTreeEntry } from "./types";

export function entriesWithGitOverlay(
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

export function fileTreeResultNotice(
  result: Extract<FileTreeResult, { status: "ready" }>,
): string | null {
  const notices: string[] = [];
  if (result.truncated) notices.push("The project exceeds the bounded file-tree limit.");
  if (result.unreadableDirectories > 0) notices.push("Some folders could not be read.");
  return notices.length > 0 ? notices.join(" ") : null;
}

export function persistentFileTreeNotice(memory: {
  readonly treeNotice: string | null;
  readonly watchProblem: string | null;
}): string | null {
  const notices = [memory.treeNotice, memory.watchProblem].filter(
    (notice): notice is string => notice !== null,
  );
  return notices.length > 0 ? notices.join(" ") : null;
}
