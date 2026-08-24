import type { FileTreeSelectionMode, VisibleFileTreeRow } from "./types";

export interface FileTreeSelectionState {
  readonly selectedPath: string | null;
  readonly selectedPaths: ReadonlySet<string>;
  readonly anchorPath: string | null;
}

/** Apply ordinary, additive, or contiguous visible-row selection without touching activation. */
export function selectFileTreePaths(
  rows: readonly VisibleFileTreeRow[],
  current: FileTreeSelectionState,
  path: string | null,
  mode: FileTreeSelectionMode,
): FileTreeSelectionState {
  if (path === null) return { selectedPath: null, selectedPaths: new Set(), anchorPath: null };
  if (!rows.some((row) => row.entry.relativePath === path)) return current;

  if (mode === "range") {
    const anchor = current.anchorPath ?? current.selectedPath ?? path;
    const anchorIndex = rows.findIndex((row) => row.entry.relativePath === anchor);
    const pathIndex = rows.findIndex((row) => row.entry.relativePath === path);
    if (anchorIndex >= 0 && pathIndex >= 0) {
      const from = Math.min(anchorIndex, pathIndex);
      const to = Math.max(anchorIndex, pathIndex);
      return {
        selectedPath: path,
        selectedPaths: new Set(rows.slice(from, to + 1).map((row) => row.entry.relativePath)),
        anchorPath: anchor,
      };
    }
  }

  if (mode === "toggle") {
    const selectedPaths = new Set(current.selectedPaths);
    if (selectedPaths.has(path)) selectedPaths.delete(path);
    else selectedPaths.add(path);
    return { selectedPath: path, selectedPaths, anchorPath: path };
  }

  return { selectedPath: path, selectedPaths: new Set([path]), anchorPath: path };
}

/** Remove selection identities that no longer exist after a disk refresh. */
export function reconcileFileTreeSelection(
  entries: ReadonlySet<string>,
  current: FileTreeSelectionState,
): FileTreeSelectionState {
  const selectedPaths = new Set([...current.selectedPaths].filter((path) => entries.has(path)));
  const selectedPath =
    current.selectedPath && entries.has(current.selectedPath)
      ? current.selectedPath
      : (selectedPaths.values().next().value ?? null);
  const anchorPath =
    current.anchorPath && entries.has(current.anchorPath) ? current.anchorPath : selectedPath;
  return { selectedPath, selectedPaths, anchorPath };
}
