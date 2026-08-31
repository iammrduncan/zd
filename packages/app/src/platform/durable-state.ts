export interface DurableStateRevision {
  readonly preferences: number;
  readonly project: number;
}

export interface DurableFileDraft {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly relativePath: string;
  readonly text: string;
  readonly updatedAt: number;
}

export interface DurableReviewComment {
  readonly id: string;
  readonly relative: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly selected: string;
  readonly comment: string;
}

export interface DurableReviewLedger {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly comments: readonly DurableReviewComment[];
}

export interface DurableStateBundle {
  readonly revision: DurableStateRevision;
  readonly preferences: Readonly<Record<string, unknown>> | null;
  readonly workbench: Readonly<Record<string, unknown>> | null;
  readonly drafts: readonly DurableFileDraft[];
  readonly reviewLedgers: readonly DurableReviewLedger[];
}

export type DurableVersionedRecord = Readonly<object>;

export type DurableStateMutation =
  | {
      readonly kind: "replace-preferences";
      readonly record: DurableVersionedRecord;
    }
  | {
      readonly kind: "replace-workbench";
      readonly record: DurableVersionedRecord;
    }
  | { readonly kind: "put-draft"; readonly draft: DurableFileDraft }
  | {
      readonly kind: "remove-draft";
      readonly projectId: string;
      readonly worktreeId: string;
      readonly relativePath: string;
    }
  | { readonly kind: "replace-review-ledger"; readonly ledger: DurableReviewLedger };

export interface DurableStateApply {
  readonly expectedRevision: DurableStateRevision;
  readonly mutation: DurableStateMutation;
}

export interface DurableStateTransport {
  describe(): Promise<unknown>;
  apply(request: DurableStateApply): Promise<unknown>;
}

export interface DurableStateAdapter {
  load(): Promise<DurableStateBundle>;
  snapshot(): DurableStateBundle;
  mutate(mutation: DurableStateMutation): Promise<boolean>;
  flush(): Promise<void>;
  onProblem(listener: (notice: string) => void): () => void;
}

type PendingMutation = {
  mutation: DurableStateMutation;
  waiters: Array<(stored: boolean) => void>;
};

const MAX_PENDING_MUTATIONS = 514;
const MAX_DRAFTS = 256;
const MAX_REVIEW_LEDGERS = 256;
const CONFLICT_NOTICE =
  "Changes remain active in this session but could not be stored because durable state changed elsewhere.";
const FAILURE_NOTICE = "Changes remain active in this session but could not be stored.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeRevision(value: unknown): DurableStateRevision | null {
  if (!isRecord(value)) return null;
  const { preferences, project } = value;
  return Number.isSafeInteger(preferences) &&
    Number(preferences) >= 0 &&
    Number.isSafeInteger(project) &&
    Number(project) >= 0
    ? { preferences: Number(preferences), project: Number(project) }
    : null;
}

function versionedRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return isRecord(value) && Number.isSafeInteger(value.schemaVersion) ? { ...value } : null;
}

function durableDraft(value: unknown): DurableFileDraft | null {
  if (!isRecord(value)) return null;
  return value.schemaVersion === 1 &&
    typeof value.projectId === "string" &&
    typeof value.worktreeId === "string" &&
    typeof value.relativePath === "string" &&
    typeof value.text === "string" &&
    Number.isSafeInteger(value.updatedAt) &&
    Number(value.updatedAt) >= 0
    ? {
        schemaVersion: 1,
        projectId: value.projectId,
        worktreeId: value.worktreeId,
        relativePath: value.relativePath,
        text: value.text,
        updatedAt: Number(value.updatedAt),
      }
    : null;
}

function reviewComment(value: unknown): DurableReviewComment | null {
  if (!isRecord(value)) return null;
  return typeof value.id === "string" &&
    typeof value.relative === "string" &&
    Number.isSafeInteger(value.startLine) &&
    Number(value.startLine) > 0 &&
    Number.isSafeInteger(value.endLine) &&
    Number(value.endLine) >= Number(value.startLine) &&
    typeof value.selected === "string" &&
    typeof value.comment === "string"
    ? {
        id: value.id,
        relative: value.relative,
        startLine: Number(value.startLine),
        endLine: Number(value.endLine),
        selected: value.selected,
        comment: value.comment,
      }
    : null;
}

function reviewLedger(value: unknown): DurableReviewLedger | null {
  if (!isRecord(value) || !Array.isArray(value.comments)) return null;
  const comments = value.comments.map(reviewComment);
  return value.schemaVersion === 1 &&
    typeof value.projectId === "string" &&
    typeof value.worktreeId === "string" &&
    comments.every((comment) => comment !== null)
    ? {
        schemaVersion: 1,
        projectId: value.projectId,
        worktreeId: value.worktreeId,
        comments: comments as DurableReviewComment[],
      }
    : null;
}

function parseBundle(value: unknown): DurableStateBundle {
  if (!isRecord(value)) throw new Error("the durable-state bundle is invalid");
  const revision = safeRevision(value.revision);
  const preferences = value.preferences === null ? null : versionedRecord(value.preferences);
  const workbench = value.workbench === null ? null : versionedRecord(value.workbench);
  const drafts = Array.isArray(value.drafts) ? value.drafts.map(durableDraft) : [];
  const ledgers = Array.isArray(value.reviewLedgers) ? value.reviewLedgers.map(reviewLedger) : [];
  if (
    !revision ||
    (value.preferences !== null && !preferences) ||
    (value.workbench !== null && !workbench) ||
    !Array.isArray(value.drafts) ||
    drafts.length > MAX_DRAFTS ||
    drafts.some((draft) => draft === null) ||
    !Array.isArray(value.reviewLedgers) ||
    ledgers.length > MAX_REVIEW_LEDGERS ||
    ledgers.some((ledger) => ledger === null)
  ) {
    throw new Error("the durable-state bundle is invalid");
  }
  return {
    revision,
    preferences,
    workbench,
    drafts: drafts as DurableFileDraft[],
    reviewLedgers: ledgers as DurableReviewLedger[],
  };
}

function parseApplyResult(
  value: unknown,
):
  | { status: "applied"; revision: DurableStateRevision }
  | { status: "reload-required"; currentRevision: DurableStateRevision } {
  if (!isRecord(value)) throw new Error("the durable-state result is invalid");
  if (value.status === "applied") {
    const revision = safeRevision(value.revision);
    if (revision) return { status: "applied", revision };
  }
  if (value.status === "reload-required") {
    const currentRevision = safeRevision(value.currentRevision);
    if (currentRevision) return { status: "reload-required", currentRevision };
  }
  throw new Error("the durable-state result is invalid");
}

function emptyBundle(): DurableStateBundle {
  return {
    revision: { preferences: 0, project: 0 },
    preferences: null,
    workbench: null,
    drafts: [],
    reviewLedgers: [],
  };
}

function mutationKey(mutation: DurableStateMutation): string {
  switch (mutation.kind) {
    case "replace-preferences":
      return "preferences";
    case "replace-workbench":
      return "workbench";
    case "put-draft":
      return `draft\0${mutation.draft.projectId}\0${mutation.draft.worktreeId}\0${mutation.draft.relativePath}`;
    case "remove-draft":
      return `draft\0${mutation.projectId}\0${mutation.worktreeId}\0${mutation.relativePath}`;
    case "replace-review-ledger":
      return `review\0${mutation.ledger.projectId}\0${mutation.ledger.worktreeId}`;
  }
}

function sameDraft(
  draft: DurableFileDraft,
  scope: { projectId: string; worktreeId: string; relativePath: string },
): boolean {
  return (
    draft.projectId === scope.projectId &&
    draft.worktreeId === scope.worktreeId &&
    draft.relativePath === scope.relativePath
  );
}

export function createDurableStateAdapter(transport: DurableStateTransport): DurableStateAdapter {
  let bundle = emptyBundle();
  let revision = bundle.revision;
  let loaded = false;
  let loading: Promise<DurableStateBundle> | null = null;
  let flushing: Promise<void> | null = null;
  let flushQueued = false;
  const pending = new Map<string, PendingMutation>();
  const listeners = new Set<(notice: string) => void>();

  const publish = (notice: string) => {
    for (const listener of listeners) listener(notice);
  };
  const updateRevision = (next: DurableStateRevision) => {
    revision = next;
    bundle = { ...bundle, revision: next };
  };
  const applyLocally = (mutation: DurableStateMutation) => {
    switch (mutation.kind) {
      case "replace-preferences":
        bundle = {
          ...bundle,
          preferences: { ...mutation.record } as Readonly<Record<string, unknown>>,
        };
        break;
      case "replace-workbench":
        bundle = {
          ...bundle,
          workbench: { ...mutation.record } as Readonly<Record<string, unknown>>,
        };
        break;
      case "put-draft":
        bundle = {
          ...bundle,
          drafts: [
            ...bundle.drafts.filter((draft) => !sameDraft(draft, mutation.draft)),
            { ...mutation.draft },
          ],
        };
        break;
      case "remove-draft":
        bundle = {
          ...bundle,
          drafts: bundle.drafts.filter((draft) => !sameDraft(draft, mutation)),
        };
        break;
      case "replace-review-ledger":
        bundle = {
          ...bundle,
          reviewLedgers: [
            ...bundle.reviewLedgers.filter(
              (ledger) =>
                ledger.projectId !== mutation.ledger.projectId ||
                ledger.worktreeId !== mutation.ledger.worktreeId,
            ),
            { ...mutation.ledger, comments: [...mutation.ledger.comments] },
          ],
        };
        break;
    }
  };

  const drain = async (): Promise<void> => {
    const batch = [...pending.values()];
    pending.clear();
    for (const item of batch) {
      let stored = false;
      try {
        const result = parseApplyResult(
          await transport.apply({ expectedRevision: revision, mutation: item.mutation }),
        );
        if (result.status === "applied") {
          updateRevision(result.revision);
          stored = true;
        } else {
          updateRevision(result.currentRevision);
          publish(CONFLICT_NOTICE);
        }
      } catch {
        publish(FAILURE_NOTICE);
        try {
          updateRevision(parseBundle(await transport.describe()).revision);
        } catch {
          // The next explicit change can try again; live state remains authoritative in memory.
        }
      }
      for (const resolve of item.waiters) resolve(stored);
    }
  };

  const flush = async (): Promise<void> => {
    flushQueued = false;
    if (flushing) await flushing;
    if (pending.size === 0) return;
    flushing = drain().finally(() => {
      flushing = null;
    });
    await flushing;
    if (pending.size > 0) await flush();
  };

  return {
    load: () => {
      if (loaded) return Promise.resolve(bundle);
      loading ??= transport.describe().then((value) => {
        bundle = parseBundle(value);
        revision = bundle.revision;
        loaded = true;
        return bundle;
      });
      return loading;
    },
    snapshot: () => bundle,
    mutate: (mutation) => {
      applyLocally(mutation);
      if (!loaded) {
        publish(FAILURE_NOTICE);
        return Promise.resolve(false);
      }
      const key = mutationKey(mutation);
      if (!pending.has(key) && pending.size >= MAX_PENDING_MUTATIONS) {
        publish(FAILURE_NOTICE);
        return Promise.resolve(false);
      }
      const stored = new Promise<boolean>((resolve) => {
        const existing = pending.get(key);
        if (existing) {
          existing.mutation = mutation;
          existing.waiters.push(resolve);
        } else {
          pending.set(key, { mutation, waiters: [resolve] });
        }
      });
      if (!flushQueued) {
        flushQueued = true;
        queueMicrotask(() => void flush());
      }
      return stored;
    },
    flush,
    onProblem: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function createMemoryDurableStateAdapter(): DurableStateAdapter {
  let revision: DurableStateRevision = { preferences: 0, project: 0 };
  return createDurableStateAdapter({
    describe: async () => ({ ...emptyBundle(), revision }),
    apply: async ({ mutation }) => {
      revision = {
        preferences: revision.preferences + (mutation.kind === "replace-preferences" ? 1 : 0),
        project: revision.project + (mutation.kind === "replace-preferences" ? 0 : 1),
      };
      return { status: "applied", revision };
    },
  });
}
