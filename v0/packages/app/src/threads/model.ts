import {
  THREAD_ATTENTION_EVENT_VERSION,
  type ThreadAttentionEventV1,
  type ThreadLifecycleApplication,
  type ThreadLifecycleSignal,
  type ThreadRecord,
} from "./types";

function validRevision(revision: number): boolean {
  return Number.isSafeInteger(revision) && revision >= 0;
}

/** Apply one ordered observation without inferring agent completion from terminal output. */
export function applyThreadLifecycle(
  current: ThreadRecord,
  signal: ThreadLifecycleSignal,
): ThreadLifecycleApplication {
  if (!validRevision(signal.revision) || signal.revision <= current.lifecycleRevision) {
    return { thread: current, event: null };
  }

  const unsupportedWaiting = signal.lifecycle === "waiting" && signal.source !== "supported-agent";
  const lifecycle = unsupportedWaiting ? current.lifecycle : signal.lifecycle;
  const enteredSupportedWaiting =
    lifecycle === "waiting" &&
    current.lifecycle === "busy" &&
    current.lifecycleSource === "supported-agent" &&
    signal.source === "supported-agent";

  const attentionVersion = enteredSupportedWaiting
    ? current.attention.version + 1
    : current.attention.version;
  const thread: ThreadRecord = {
    ...current,
    lifecycle,
    lifecycleSource: signal.source,
    lifecycleRevision: signal.revision,
    attention: enteredSupportedWaiting
      ? { unread: true, version: attentionVersion }
      : current.attention,
  };
  const event: ThreadAttentionEventV1 | null = enteredSupportedWaiting
    ? {
        schemaVersion: THREAD_ATTENTION_EVENT_VERSION,
        eventId: `${current.id}:${attentionVersion}`,
        kind: "waiting",
        projectId: current.projectId,
        worktreeId: current.worktree.id,
        threadId: current.id,
        threadType: current.type.kind,
        agent: current.type.agent,
        attentionVersion,
      }
    : null;
  return { thread, event };
}

export function acknowledgeThreadAttention(
  current: ThreadRecord,
  observedVersion: number,
): ThreadRecord {
  if (!current.attention.unread || observedVersion !== current.attention.version) return current;
  return { ...current, attention: { ...current.attention, unread: false } };
}

/** Consumer-side protection for replayed or out-of-order versioned events. */
export class ThreadAttentionDeduplicator {
  readonly #versions = new Map<string, number>();

  accept(event: ThreadAttentionEventV1): boolean {
    const previous = this.#versions.get(event.threadId) ?? 0;
    if (event.attentionVersion <= previous) return false;
    this.#versions.set(event.threadId, event.attentionVersion);
    return true;
  }
}

export function orderedProjectThreads(
  threads: readonly ThreadRecord[],
  projectId: string,
): readonly ThreadRecord[] {
  return threads
    .map((thread, index) => ({ thread, index }))
    .filter(({ thread }) => thread.projectId === projectId)
    .sort((left, right) => left.thread.order - right.thread.order || left.index - right.index)
    .map(({ thread }) => thread);
}

export function threadOrderAfterInsertion(
  threads: readonly ThreadRecord[],
  projectId: string,
  movedId: string,
  insertionIndex: number,
): readonly string[] | null {
  const ids = orderedProjectThreads(threads, projectId).map(({ id }) => id);
  const sourceIndex = ids.indexOf(movedId);
  if (sourceIndex < 0 || !Number.isFinite(insertionIndex)) return null;

  const requestedGap = Math.min(ids.length, Math.max(0, Math.trunc(insertionIndex)));
  ids.splice(sourceIndex, 1);
  const adjustedGap = sourceIndex < requestedGap ? requestedGap - 1 : requestedGap;
  ids.splice(Math.min(ids.length, Math.max(0, adjustedGap)), 0, movedId);
  return ids;
}
