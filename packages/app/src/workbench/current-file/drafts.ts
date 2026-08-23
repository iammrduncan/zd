import type { FileResource } from "../resources";

const DRAFT_KEY_PREFIX = "zd.fileDraft.v1:";
const DRAFT_SCHEMA_VERSION = 1 as const;

export interface FileDraft {
  readonly schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly relativePath: string;
  readonly text: string;
  readonly updatedAt: number;
}

export interface FileDraftScope {
  readonly projectId: string;
  readonly worktreeId: string;
}

function identity(resource: FileResource): string {
  return JSON.stringify([resource.projectId, resource.worktreeId, resource.relativePath]);
}

function storageKey(resource: FileResource): string {
  return `${DRAFT_KEY_PREFIX}${encodeURIComponent(identity(resource))}`;
}

function pathIsWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function movedPath(candidate: string, from: string, to: string): string {
  return candidate === from ? to : `${to}${candidate.slice(from.length)}`;
}

function validDraft(value: unknown): value is FileDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === DRAFT_SCHEMA_VERSION &&
    typeof record.projectId === "string" &&
    typeof record.worktreeId === "string" &&
    typeof record.relativePath === "string" &&
    typeof record.text === "string" &&
    typeof record.updatedAt === "number" &&
    Number.isFinite(record.updatedAt)
  );
}

/** Durable, file-scoped recovery state shared by the editor and Files tree. */
export class FileDraftStore {
  readonly #drafts = new Map<string, FileDraft>();
  readonly #listeners = new Set<() => void>();
  readonly #pending = new Map<string, FileDraft | null>();
  #flushQueued = false;

  constructor(readonly storage: Storage | null = availableStorage()) {
    if (!storage) return;
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith(DRAFT_KEY_PREFIX)) continue;
        const raw = storage.getItem(key);
        if (!raw) continue;
        const draft: unknown = JSON.parse(raw);
        if (validDraft(draft)) this.#drafts.set(identity(draft), draft);
      }
    } catch {
      // The in-session map remains a complete fallback when webview storage is blocked.
    }
  }

  get(resource: FileResource): FileDraft | null {
    const draft = this.#drafts.get(identity(resource));
    return draft ? { ...draft } : null;
  }

  save(resource: FileResource, text: string): void {
    const draft: FileDraft = {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      ...resource,
      text,
      updatedAt: Date.now(),
    };
    this.#drafts.set(identity(resource), draft);
    this.#pending.set(storageKey(resource), draft);
    this.#queueFlush();
    this.#publish();
  }

  clear(resource: FileResource): void {
    if (!this.#drafts.delete(identity(resource))) return;
    this.#pending.set(storageKey(resource), null);
    this.#queueFlush();
    this.#publish();
  }

  hasPath(resource: FileResource): boolean {
    return [...this.#drafts.values()].some(
      (draft) =>
        draft.projectId === resource.projectId &&
        draft.worktreeId === resource.worktreeId &&
        pathIsWithin(draft.relativePath, resource.relativePath),
    );
  }

  movePath(resource: FileResource, nextPath: string): void {
    const moving = [...this.#drafts.values()].filter(
      (draft) =>
        draft.projectId === resource.projectId &&
        draft.worktreeId === resource.worktreeId &&
        pathIsWithin(draft.relativePath, resource.relativePath),
    );
    if (moving.length === 0) return;
    for (const draft of moving) {
      this.clear(draft);
      this.save(
        { ...draft, relativePath: movedPath(draft.relativePath, resource.relativePath, nextPath) },
        draft.text,
      );
    }
  }

  dirtyPaths(scope: FileDraftScope): ReadonlySet<string> {
    return new Set(
      [...this.#drafts.values()]
        .filter(
          (draft) => draft.projectId === scope.projectId && draft.worktreeId === scope.worktreeId,
        )
        .map(({ relativePath }) => relativePath),
    );
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  flush(): void {
    this.#flushQueued = false;
    if (!this.storage || this.#pending.size === 0) return;
    const pending = [...this.#pending];
    this.#pending.clear();
    try {
      for (const [key, draft] of pending) {
        if (draft) this.storage.setItem(key, JSON.stringify(draft));
        else this.storage.removeItem(key);
      }
    } catch {
      // The authoritative in-session copy remains available for later switching and saving.
    }
  }

  #queueFlush(): void {
    if (this.#flushQueued) return;
    this.#flushQueued = true;
    queueMicrotask(() => this.flush());
  }

  #publish(): void {
    for (const listener of this.#listeners) listener();
  }
}

function availableStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
