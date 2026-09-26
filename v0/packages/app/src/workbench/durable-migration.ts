import type {
  DurableFileDraft,
  DurableReviewComment,
  DurableReviewLedger,
  DurableStateAdapter,
} from "@/platform";
import { isCompletionSound } from "@/notifications";
import {
  ATTENTION_DESKTOP,
  ATTENTION_MUTED,
  ATTENTION_SOUND,
  ATTENTION_VOLUME,
  DIAGNOSTICS_ENABLED,
  LEGACY_PREFERENCE_KEYS,
  PROJECT_DISCLOSURE,
  SHORTCUT_BINDINGS,
  SURFACE_THEMES,
  THEME_SELECTION,
  THREAD_SECONDARY_LINE,
  WORD_WRAP,
  WORKBENCH_SETTINGS,
  type DurablePreferencesRecord,
} from "./preference-store";
import { parseWorkbenchSettings } from "./settings-preferences";

const DRAFT_PREFIX = "zd.fileDraft.v1:";
const REVIEW_PREFIX = "zd.review.v2:";
const MAX_STORAGE_KEYS = 2_048;
const MAX_DRAFTS = 256;
const MAX_REVIEWS = 256;
const MAX_DRAFT_BYTES = 8 * 1024 * 1024;
const MAX_RECORD_BYTES = 1024 * 1024;
const MAX_PATH_BYTES = 32 * 1024;
const LEGACY_PROJECT_ID = /^project-[0-9a-f]{16}$/;
const LEGACY_WORKTREE_ID = /^worktree-[0-9a-f]{16}$/;

export interface DurableMigrationScope {
  readonly projectId: string;
  readonly worktreeId: string;
}

function json(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function validTheme(raw: string): string | null {
  const value = record(json(raw));
  return value &&
    typeof value.selected === "string" &&
    value.selected.length > 0 &&
    value.selected.length <= 64 &&
    typeof value.lastValid === "string" &&
    value.lastValid.length > 0 &&
    value.lastValid.length <= 64
    ? JSON.stringify({ selected: value.selected, lastValid: value.lastValid })
    : null;
}

function validChord(value: unknown): boolean {
  const chord = record(value);
  return Boolean(
    chord &&
    typeof chord.key === "string" &&
    chord.key.length > 0 &&
    chord.key.length <= 32 &&
    [chord.mod, chord.shift, chord.alt].every(
      (modifier) => modifier === undefined || typeof modifier === "boolean",
    ),
  );
}

function validJsonMap(raw: string, entry: (key: string, value: unknown) => boolean): string | null {
  const value = record(json(raw));
  if (!value || Object.keys(value).length > 4_096) return null;
  return Object.entries(value).every(([key, stored]) => entry(key, stored))
    ? JSON.stringify(value)
    : null;
}

function normalizedPreference(key: string, raw: string): string | null {
  if (raw.length > MAX_RECORD_BYTES) return null;
  if (
    [WORD_WRAP, DIAGNOSTICS_ENABLED, ATTENTION_DESKTOP, ATTENTION_SOUND, ATTENTION_MUTED].includes(
      key as never,
    )
  ) {
    return raw === "true" || raw === "false" ? raw : null;
  }
  if (key === ATTENTION_VOLUME) {
    const volume = Number(raw);
    return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? String(volume) : null;
  }
  if (key.startsWith("zd.attentionSound.")) return isCompletionSound(raw) ? raw : null;
  if (key === THREAD_SECONDARY_LINE) {
    return ["app", "directory", "worktree"].includes(raw) ? raw : null;
  }
  if (key === THEME_SELECTION) return validTheme(raw);
  if (key === SHORTCUT_BINDINGS) {
    return validJsonMap(
      raw,
      (commandId, chord) => commandId.length > 0 && commandId.length <= 128 && validChord(chord),
    );
  }
  if (key === SURFACE_THEMES) {
    const surfaces = new Set(["threads", "panels", "code", "markdown", "filePanel", "meta"]);
    const theme = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
    return validJsonMap(
      raw,
      (surface, selected) =>
        surfaces.has(surface) && typeof selected === "string" && theme.test(selected),
    );
  }
  if (key === PROJECT_DISCLOSURE) {
    return validJsonMap(
      raw,
      (projectId, expanded) =>
        projectId.length > 0 && projectId.length <= 128 && typeof expanded === "boolean",
    );
  }
  if (key === WORKBENCH_SETTINGS) {
    const value = record(json(raw));
    return value?.schemaVersion === 1 ? JSON.stringify(parseWorkbenchSettings(value)) : null;
  }
  return null;
}

function removeConfirmed(storage: Storage, keys: readonly string[]): boolean {
  try {
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export async function migrateLegacyPreferences(
  durable: DurableStateAdapter,
  storage: Storage,
): Promise<readonly string[]> {
  if (durable.snapshot().preferences !== null) return [];
  const values: Record<string, string> = {};
  const keys: string[] = [];
  let malformed = 0;
  for (const key of LEGACY_PREFERENCE_KEYS) {
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      return ["Legacy preferences could not be read and remain available for recovery."];
    }
    if (raw === null) continue;
    const normalized = normalizedPreference(key, raw);
    if (normalized === null) {
      malformed += 1;
      continue;
    }
    values[key] = normalized;
    keys.push(key);
  }

  const notices: string[] = [];
  if (malformed > 0) {
    notices.push("Some legacy preferences were invalid and remain available for recovery.");
  }
  if (keys.length === 0) return notices;
  const preferenceRecord: DurablePreferencesRecord = { schemaVersion: 1, values };
  const stored = await durable.mutate({
    kind: "replace-preferences",
    record: preferenceRecord,
  });
  if (!stored) {
    notices.push("Legacy preferences could not be imported and remain available for recovery.");
  } else if (!removeConfirmed(storage, keys)) {
    notices.push("Imported legacy preferences could not be removed from origin storage.");
  }
  return notices;
}

function validRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_PATH_BYTES) {
    return false;
  }
  if (/^(?:[a-z]:[\\/]|[\\/])/i.test(value)) return false;
  return !value.split(/[\\/]/).includes("..");
}

function migratedScope(
  projectId: string,
  worktreeId: string,
  scope: DurableMigrationScope | null,
): DurableMigrationScope {
  return scope && LEGACY_PROJECT_ID.test(projectId) && LEGACY_WORKTREE_ID.test(worktreeId)
    ? scope
    : { projectId, worktreeId };
}

function draftRecord(value: unknown, scope: DurableMigrationScope | null): DurableFileDraft | null {
  const draft = record(value);
  if (!draft) return null;
  const scoped =
    typeof draft.projectId === "string" && typeof draft.worktreeId === "string"
      ? migratedScope(draft.projectId, draft.worktreeId, scope)
      : null;
  return draft.schemaVersion === 1 &&
    scoped &&
    validRelativePath(draft.relativePath) &&
    typeof draft.text === "string" &&
    draft.text.length <= MAX_DRAFT_BYTES &&
    Number.isSafeInteger(draft.updatedAt) &&
    Number(draft.updatedAt) >= 0
    ? {
        schemaVersion: 1,
        ...scoped,
        relativePath: draft.relativePath,
        text: draft.text,
        updatedAt: Number(draft.updatedAt),
      }
    : null;
}

function commentRecord(value: unknown): DurableReviewComment | null {
  const comment = record(value);
  return comment &&
    typeof comment.id === "string" &&
    comment.id.length > 0 &&
    comment.id.length <= 128 &&
    validRelativePath(comment.relative) &&
    Number.isSafeInteger(comment.startLine) &&
    Number(comment.startLine) > 0 &&
    Number.isSafeInteger(comment.endLine) &&
    Number(comment.endLine) >= Number(comment.startLine) &&
    typeof comment.selected === "string" &&
    typeof comment.comment === "string"
    ? {
        id: comment.id,
        relative: comment.relative,
        startLine: Number(comment.startLine),
        endLine: Number(comment.endLine),
        selected: comment.selected,
        comment: comment.comment,
      }
    : null;
}

function reviewRecord(
  key: string,
  value: unknown,
  scope: DurableMigrationScope | null,
): DurableReviewLedger | null {
  if (!Array.isArray(value) || value.length > 4_096) return null;
  const rawScope = key.slice(REVIEW_PREFIX.length).split("\0");
  if (rawScope.length !== 2 || !rawScope[0] || !rawScope[1]) return null;
  const scoped = migratedScope(rawScope[0], rawScope[1], scope);
  const comments = value.map(commentRecord);
  return comments.every((comment) => comment !== null)
    ? {
        schemaVersion: 1,
        ...scoped,
        comments: comments as DurableReviewComment[],
      }
    : null;
}

function storageKeys(storage: Storage): { keys: string[]; truncated: boolean } {
  const keys: string[] = [];
  const count = Math.min(storage.length, MAX_STORAGE_KEYS);
  for (let index = 0; index < count; index += 1) {
    const key = storage.key(index);
    if (key) keys.push(key);
  }
  return { keys, truncated: storage.length > MAX_STORAGE_KEYS };
}

export async function migrateLegacyProjectState(
  durable: DurableStateAdapter,
  storage: Storage,
  scope: DurableMigrationScope | null = null,
): Promise<readonly string[]> {
  const notices: string[] = [];
  let listed: { keys: string[]; truncated: boolean };
  try {
    listed = storageKeys(storage);
  } catch {
    return ["Legacy recovery records could not be read and remain in origin storage."];
  }
  if (listed.truncated) notices.push("Legacy recovery record discovery reached its limit.");

  let drafts = 0;
  let reviews = 0;
  let malformedDrafts = 0;
  let malformedReviews = 0;
  let refusedDrafts = 0;
  let refusedReviews = 0;
  for (const key of listed.keys) {
    const isDraft = key.startsWith(DRAFT_PREFIX);
    const isReview = key.startsWith(REVIEW_PREFIX);
    if (
      (!isDraft && !isReview) ||
      (isDraft && drafts >= MAX_DRAFTS) ||
      (isReview && reviews >= MAX_REVIEWS)
    ) {
      continue;
    }
    let raw: string | null;
    try {
      raw = storage.getItem(key);
    } catch {
      raw = null;
    }
    if (isDraft) {
      drafts += 1;
      const draft =
        raw && raw.length <= MAX_DRAFT_BYTES + 64 * 1024 ? draftRecord(json(raw), scope) : null;
      if (!draft) {
        malformedDrafts += 1;
        continue;
      }
      if (await durable.mutate({ kind: "put-draft", draft })) {
        if (!removeConfirmed(storage, [key])) refusedDrafts += 1;
      } else {
        refusedDrafts += 1;
      }
    } else {
      reviews += 1;
      const ledger =
        raw && raw.length <= MAX_RECORD_BYTES ? reviewRecord(key, json(raw), scope) : null;
      if (!ledger) {
        malformedReviews += 1;
        continue;
      }
      if (await durable.mutate({ kind: "replace-review-ledger", ledger })) {
        if (!removeConfirmed(storage, [key])) refusedReviews += 1;
      } else {
        refusedReviews += 1;
      }
    }
  }
  if (malformedDrafts > 0)
    notices.push("Some legacy drafts were invalid and remain available for recovery.");
  if (refusedDrafts > 0)
    notices.push("Some legacy drafts could not be imported and remain available for recovery.");
  if (malformedReviews > 0)
    notices.push("Some legacy reviews were invalid and remain available for recovery.");
  if (refusedReviews > 0)
    notices.push("Some legacy reviews could not be imported and remain available for recovery.");
  return notices.slice(0, 5);
}

export async function migrateLegacyDurableState(
  durable: DurableStateAdapter,
  storage: Storage,
  scope: DurableMigrationScope | null = null,
): Promise<readonly string[]> {
  return [
    ...(await migrateLegacyPreferences(durable, storage)),
    ...(await migrateLegacyProjectState(durable, storage, scope)),
  ].slice(0, 8);
}
