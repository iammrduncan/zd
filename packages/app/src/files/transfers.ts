import type {
  FileTreeEntry,
  FileTreeScope,
  FileTreeTransfer,
  FileTreeTransferOperation,
} from "./types";

export interface FileTreeClipboard {
  readonly operation: FileTreeTransferOperation;
  readonly scope: FileTreeScope;
  readonly paths: readonly string[];
}

function pathIsWithin(candidate: string, parent: string): boolean {
  return candidate === parent || candidate.startsWith(`${parent}/`);
}

export function selectionRoots(paths: Iterable<string>): readonly string[] {
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .filter(
      (path, _index, all) => !all.some((other) => other !== path && pathIsWithin(path, other)),
    );
}

function copyName(name: string, copy: number): string {
  const dot = name.lastIndexOf(".");
  const suffix = copy === 1 ? " copy" : ` copy ${copy}`;
  return dot > 0 ? `${name.slice(0, dot)}${suffix}${name.slice(dot)}` : `${name}${suffix}`;
}

function destinationPath(directory: string | null, name: string): string {
  return directory ? `${directory}/${name}` : name;
}

/** Build exact project-relative transfers, including stable collision-safe copy names. */
export function fileTreeTransferPlan(
  entries: readonly FileTreeEntry[],
  clipboard: FileTreeClipboard,
  destinationDirectory: string | null,
  currentScope: FileTreeScope,
): { readonly transfers: readonly FileTreeTransfer[]; readonly problem: string | null } {
  if (
    clipboard.scope.projectId !== currentScope.projectId ||
    clipboard.scope.worktreeId !== currentScope.worktreeId
  ) {
    return { transfers: [], problem: "Files cannot be transferred between approved worktrees." };
  }
  const materialEntries = entries.filter((entry) => entry.gitState !== "deleted");
  const destination = destinationDirectory
    ? materialEntries.find((entry) => entry.relativePath === destinationDirectory)
    : null;
  if (destinationDirectory !== null && destination?.kind !== "directory") {
    return { transfers: [], problem: "Choose a destination folder." };
  }

  const byPath = new Map(materialEntries.map((entry) => [entry.relativePath, entry]));
  const occupied = new Set(materialEntries.map((entry) => entry.relativePath));
  const transfers: FileTreeTransfer[] = [];
  for (const path of selectionRoots(new Set(clipboard.paths))) {
    const source = byPath.get(path);
    if (!source || source.kind === "symlink" || path === ".git" || path.startsWith(".git/")) {
      return { transfers: [], problem: "The selection contains a protected or unavailable item." };
    }
    if (destinationDirectory && pathIsWithin(destinationDirectory, path)) {
      return { transfers: [], problem: "A folder cannot be transferred into itself." };
    }
    let next = destinationPath(destinationDirectory, source.name);
    if (clipboard.operation === "move" && next === path) continue;
    if (clipboard.operation === "copy") {
      let copy = 1;
      while (occupied.has(next))
        next = destinationPath(destinationDirectory, copyName(source.name, copy++));
    } else if (occupied.has(next)) {
      return { transfers: [], problem: `${next} already exists.` };
    }
    occupied.add(next);
    transfers.push({
      source: { ...currentScope, relativePath: path },
      destinationPath: next,
    });
  }
  return { transfers, problem: null };
}
