import type { FileResource } from "./resources";
import {
  bufferStateId,
  fileStateId,
  stateWithFocus,
  type OpenFileState,
  type WorkbenchContext,
  type WorkbenchState,
} from "./state-core";

function pathIsWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function movedPath(candidate: string, from: string, to: string): string {
  return candidate === from ? to : `${to}${candidate.slice(from.length)}`;
}

/** Reconcile open-file identities after one already-committed native rename. */
export function stateAfterFileRename(
  state: WorkbenchState,
  contexts: Map<string, WorkbenchContext>,
  resource: FileResource,
  nextPath: string,
): WorkbenchState | null {
  const replacements = new Map<string, OpenFileState>();
  for (const file of state.openFiles) {
    if (
      file.projectId !== resource.projectId ||
      file.worktreeId !== resource.worktreeId ||
      !pathIsWithin(file.relativePath, resource.relativePath)
    ) {
      continue;
    }
    const relativePath = movedPath(file.relativePath, resource.relativePath, nextPath);
    const movedResource = { ...resource, relativePath };
    replacements.set(file.id, {
      ...movedResource,
      id: fileStateId(movedResource),
      bufferId: bufferStateId(movedResource),
    });
  }
  if (replacements.size === 0) return null;
  const fileId = (id: string | null): string | null =>
    id === null ? null : (replacements.get(id)?.id ?? id);
  const openFiles = state.openFiles.map((file) => replacements.get(file.id) ?? file);
  const threads = state.threads.map((thread) => ({ ...thread, fileId: fileId(thread.fileId) }));
  const active = { ...state.active, fileId: fileId(state.active.fileId) };
  for (const [projectId, context] of contexts) {
    contexts.set(projectId, { ...context, fileId: fileId(context.fileId) });
  }
  return { ...state, openFiles, threads, active };
}

/** Close one open file without treating another open file as its replacement. */
export function stateAfterFileClose(
  state: WorkbenchState,
  contexts: Map<string, WorkbenchContext>,
  resource: FileResource,
): WorkbenchState | null {
  const closingId = state.openFiles.find(
    (file) =>
      file.projectId === resource.projectId &&
      file.worktreeId === resource.worktreeId &&
      file.relativePath === resource.relativePath,
  )?.id;
  if (!closingId) return null;

  const openFiles = state.openFiles.filter(({ id }) => id !== closingId);
  const threads = state.threads.map((thread) => ({
    ...thread,
    fileId: thread.fileId === closingId ? null : thread.fileId,
  }));
  const activeFileClosed = state.active.fileId === closingId;
  const active = {
    ...state.active,
    fileId: activeFileClosed ? null : state.active.fileId,
  };
  const candidate = { ...state, openFiles, threads, active };
  const regions = activeFileClosed
    ? stateWithFocus(candidate, active.threadId ? "thread" : "files").regions
    : state.regions;
  for (const [projectId, context] of contexts) {
    contexts.set(projectId, {
      ...context,
      fileId: context.fileId === closingId ? null : context.fileId,
    });
  }
  return { ...candidate, regions };
}

/** Reconcile open-file identities after one already-committed move to system Trash. */
export function stateAfterFileRemoval(
  state: WorkbenchState,
  contexts: Map<string, WorkbenchContext>,
  resource: FileResource,
): WorkbenchState | null {
  const removedIds = new Set(
    state.openFiles
      .filter(
        (file) =>
          file.projectId === resource.projectId &&
          file.worktreeId === resource.worktreeId &&
          pathIsWithin(file.relativePath, resource.relativePath),
      )
      .map(({ id }) => id),
  );
  if (removedIds.size === 0) return null;
  const openFiles = state.openFiles.filter(({ id }) => !removedIds.has(id));
  const threads = state.threads.map((thread) => ({
    ...thread,
    fileId: thread.fileId && removedIds.has(thread.fileId) ? null : thread.fileId,
  }));
  const activeFileRemoved = state.active.fileId !== null && removedIds.has(state.active.fileId);
  const fallback = activeFileRemoved
    ? openFiles.find(
        (file) => file.projectId === resource.projectId && file.worktreeId === resource.worktreeId,
      )
    : null;
  const active = {
    ...state.active,
    fileId: activeFileRemoved ? (fallback?.id ?? null) : state.active.fileId,
  };
  const candidate = { ...state, openFiles, threads, active };
  const regions = activeFileRemoved
    ? stateWithFocus(candidate, fallback ? "file" : active.threadId ? "thread" : "files").regions
    : state.regions;
  for (const [projectId, context] of contexts) {
    const rememberedRemoved = context.fileId !== null && removedIds.has(context.fileId);
    contexts.set(projectId, { ...context, fileId: rememberedRemoved ? null : context.fileId });
  }
  return { ...candidate, regions };
}
