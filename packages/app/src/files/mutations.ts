import type { FileTreeActions, FileTreeCreationKind, FileTreeEntry, FileTreeScope } from "./types";

export interface FileTreeMutationMemory {
  readonly scope: FileTreeScope;
  readonly entries: readonly FileTreeEntry[];
  readonly expandedPaths: Set<string>;
  selectedPath: string | null;
  selectedPaths: Set<string>;
  selectionAnchorPath: string | null;
  notice: string | null;
}

function fileNameProblem(name: string): string | null {
  if (name.length === 0) return "Enter a name.";
  if (name === "." || name === "..") return "That name is reserved.";
  if (/[\\/]/u.test(name)) return "Enter one file or folder name, without a path.";
  if ([...name].some((character) => character.codePointAt(0)! <= 31)) {
    return "Names cannot contain control characters.";
  }
  return null;
}

function childPath(parentPath: string | null, name: string): string {
  return parentPath ? `${parentPath}/${name}` : name;
}

export async function createFileTreeEntry(
  memory: FileTreeMutationMemory,
  actions: FileTreeActions,
  isCurrent: () => boolean,
  publish: () => void,
  parentPath: string | null,
  name: string,
  kind: FileTreeCreationKind,
): Promise<boolean> {
  const problem = fileNameProblem(name);
  const parent = parentPath
    ? memory.entries.find((entry) => entry.relativePath === parentPath)
    : null;
  if (problem || (parentPath !== null && parent?.kind !== "directory")) {
    memory.notice = problem ?? "The destination folder is unavailable.";
    publish();
    return false;
  }
  if (!actions.createEntry) {
    memory.notice = "Creating files and folders is unavailable.";
    publish();
    return false;
  }
  const relativePath = childPath(parentPath, name);
  try {
    await actions.createEntry({ ...memory.scope, relativePath }, kind);
    if (!isCurrent()) return false;
    if (parentPath) memory.expandedPaths.add(parentPath);
    memory.selectedPath = relativePath;
    memory.selectedPaths = new Set([relativePath]);
    memory.selectionAnchorPath = relativePath;
    memory.notice = `Created ${relativePath}.`;
    publish();
    return true;
  } catch (cause) {
    if (!isCurrent()) return false;
    memory.notice = cause instanceof Error ? cause.message : `Could not create ${relativePath}.`;
    publish();
    return false;
  }
}

export async function renameFileTreeEntry(
  memory: FileTreeMutationMemory,
  actions: FileTreeActions,
  isCurrent: () => boolean,
  publish: () => void,
  path: string,
  newName: string,
): Promise<boolean> {
  const entry = memory.entries.find((candidate) => candidate.relativePath === path);
  if (!entry) return false;
  const problem = fileNameProblem(newName);
  if (problem || entry.kind === "symlink" || path === ".git" || path.startsWith(".git/")) {
    memory.notice =
      problem ??
      (entry.kind === "symlink"
        ? "Symbolic links cannot be renamed here."
        : "Repository metadata is protected.");
    publish();
    return false;
  }
  if (!actions.renameEntry) {
    memory.notice = "Renaming files and folders is unavailable.";
    publish();
    return false;
  }
  try {
    await actions.renameEntry({ ...memory.scope, relativePath: path }, newName);
    if (!isCurrent()) return false;
    const nextPath = childPath(entry.parentPath, newName);
    memory.selectedPath = nextPath;
    memory.selectedPaths = new Set([nextPath]);
    memory.selectionAnchorPath = nextPath;
    memory.notice = `Renamed ${path} to ${nextPath}.`;
    publish();
    return true;
  } catch (cause) {
    if (!isCurrent()) return false;
    memory.notice = cause instanceof Error ? cause.message : `Could not rename ${path}.`;
    publish();
    return false;
  }
}

export async function trashFileTreeEntry(
  memory: FileTreeMutationMemory,
  actions: FileTreeActions,
  isCurrent: () => boolean,
  publish: () => void,
  path: string,
): Promise<boolean> {
  const entry = memory.entries.find((candidate) => candidate.relativePath === path);
  if (!entry) return false;
  if (entry.kind === "symlink" || path === ".git" || path.startsWith(".git/")) {
    memory.notice =
      entry.kind === "symlink"
        ? "Symbolic links cannot be moved to Trash here."
        : "Repository metadata is protected.";
    publish();
    return false;
  }
  if (!actions.trashEntry) {
    memory.notice = "Moving files and folders to Trash is unavailable.";
    publish();
    return false;
  }
  try {
    await actions.trashEntry({ ...memory.scope, relativePath: path });
    if (!isCurrent()) return false;
    memory.selectedPath = entry.parentPath;
    memory.selectedPaths = new Set(entry.parentPath ? [entry.parentPath] : []);
    memory.selectionAnchorPath = entry.parentPath;
    memory.notice = `Moved ${path} to Trash.`;
    publish();
    return true;
  } catch (cause) {
    if (!isCurrent()) return false;
    memory.notice = cause instanceof Error ? cause.message : `Could not move ${path} to Trash.`;
    publish();
    return false;
  }
}
