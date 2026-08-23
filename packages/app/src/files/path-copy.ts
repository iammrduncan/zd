import type { FilePathPresentation, FileTreeActions, FileTreeEntry, FileTreeScope } from "./types";

/** Resolve one tree identity through the root-owned clipboard action. */
export async function copyFilePath(
  actions: FileTreeActions,
  scope: FileTreeScope,
  entry: FileTreeEntry,
  presentation: FilePathPresentation,
): Promise<string | null> {
  if (entry.kind === "directory") return null;
  if (!actions.copyPath) return "Path copying is unavailable.";
  try {
    await actions.copyPath({ ...scope, relativePath: entry.relativePath }, presentation);
    return presentation === "relative" ? "Copied relative path." : "Copied full path.";
  } catch (cause) {
    return cause instanceof Error ? cause.message : "The path could not be copied.";
  }
}
