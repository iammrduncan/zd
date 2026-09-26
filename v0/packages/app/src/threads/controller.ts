import { threadOrderAfterInsertion } from "./model";
import type {
  CreateThreadRequest,
  ThreadActionResult,
  ThreadInstrumentation,
  ThreadInstrumentationEvent,
  ThreadInstrumentationOperation,
  ThreadWorkbenchAdapter,
  ThreadWorkbenchSnapshot,
} from "./types";
import type { ThreadsVisibility } from "@/workbench/state";

const MAX_NAME_LENGTH = 160;
const MAX_REF_LENGTH = 512;

function boundedText(value: string, maximum: number): boolean {
  const hasControlCharacter = [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 31 || codePoint === 127;
  });
  return value.length > 0 && value.length <= maximum && !hasControlCharacter;
}

function creationProblem(request: CreateThreadRequest): string | null {
  const name = request.name.trim();
  if (!boundedText(name, MAX_NAME_LENGTH)) return "Thread name must be non-empty and bounded";
  if (!boundedText(request.workspace.projectId, MAX_NAME_LENGTH)) {
    return "Project identity must be a bounded native-approved token";
  }

  if (request.workspace.kind !== "new-worktree") {
    return boundedText(request.workspace.worktreeId, MAX_NAME_LENGTH)
      ? null
      : "Worktree identity must be a bounded native-approved token";
  }

  const worktreeName = request.workspace.name.trim();
  if (
    !boundedText(worktreeName, MAX_NAME_LENGTH) ||
    worktreeName === "." ||
    worktreeName === ".." ||
    worktreeName.includes("/") ||
    worktreeName.includes("\\")
  ) {
    return "New worktree name must be one bounded path-free label";
  }
  if (!boundedText(request.workspace.branch.trim(), MAX_REF_LENGTH)) {
    return "New worktree branch must be one bounded Git revision name";
  }
  if (
    request.workspace.baseRevision !== null &&
    !boundedText(request.workspace.baseRevision.trim(), MAX_REF_LENGTH)
  ) {
    return "Base revision must be null or one bounded Git revision";
  }
  return null;
}

function resultOutcome(result: ThreadActionResult): ThreadInstrumentationEvent["outcome"] {
  return result.status === "committed" ? "ok" : "refused";
}

/** Commands delegate every mutation to the root-owned workbench transaction boundary. */
export class ThreadsController {
  constructor(
    readonly adapter: ThreadWorkbenchAdapter,
    readonly instrumentation?: ThreadInstrumentation,
  ) {}

  snapshot(): ThreadWorkbenchSnapshot {
    return this.adapter.snapshot();
  }

  subscribe(listener: (snapshot: ThreadWorkbenchSnapshot) => void): () => void {
    return this.adapter.subscribe(listener);
  }

  async #perform(
    operation: ThreadInstrumentationOperation,
    context: Omit<ThreadInstrumentationEvent, "operation" | "outcome">,
    work: () => Promise<ThreadActionResult>,
  ): Promise<ThreadActionResult> {
    try {
      const result = await work();
      this.#record({ operation, outcome: resultOutcome(result), ...context });
      return result;
    } catch (cause) {
      this.#record({ operation, outcome: "failed", ...context });
      throw cause;
    }
  }

  #record(event: ThreadInstrumentationEvent): void {
    if (!this.instrumentation) return;
    void Promise.resolve(this.instrumentation(event)).catch(() => undefined);
  }

  createThread(request: CreateThreadRequest): Promise<ThreadActionResult> {
    const problem = creationProblem(request);
    if (problem) return Promise.resolve({ status: "refused", reason: problem });
    return this.#perform(
      "thread.create",
      {
        projectId: request.workspace.projectId,
        ...(request.workspace.kind === "new-worktree"
          ? {}
          : { worktreeId: request.workspace.worktreeId }),
      },
      () => this.adapter.createThread(request),
    );
  }

  renameThread(threadId: string, name: string): Promise<ThreadActionResult> {
    const trimmed = name.trim();
    if (!boundedText(trimmed, MAX_NAME_LENGTH)) {
      return Promise.resolve({
        status: "refused",
        reason: "Thread name must be non-empty and bounded",
      });
    }
    return this.#perform("thread.rename", { threadId }, () =>
      this.adapter.renameThread(threadId, trimmed),
    );
  }

  moveThread(
    projectId: string,
    threadId: string,
    insertionIndex: number,
  ): Promise<ThreadActionResult | null> {
    const orderedIds = threadOrderAfterInsertion(
      this.snapshot().threads,
      projectId,
      threadId,
      insertionIndex,
    );
    return orderedIds
      ? this.#perform("thread.reorder", { projectId, threadId }, () =>
          this.adapter.reorderThreads(projectId, orderedIds),
        )
      : Promise.resolve(null);
  }

  activateThread(threadId: string): Promise<ThreadActionResult> {
    return this.#perform("thread.activate", { threadId }, () =>
      this.adapter.activateThread(threadId),
    );
  }

  closeThread(threadId: string): Promise<ThreadActionResult> {
    return this.#perform("thread.close", { threadId }, () => this.adapter.closeThread(threadId));
  }

  removeThread(threadId: string): Promise<ThreadActionResult> {
    return this.#perform("thread.remove", { threadId }, () => this.adapter.removeThread(threadId));
  }

  recoverThread(threadId: string): Promise<ThreadActionResult> {
    return this.#perform("thread.recover", { threadId }, () =>
      this.adapter.recoverThread(threadId),
    );
  }

  setVisibility(visibility: ThreadsVisibility): Promise<ThreadActionResult> {
    return this.#perform("thread.visibility", {}, () =>
      this.adapter.setThreadsVisibility(visibility),
    );
  }

  acknowledgeAttention(threadId: string, version: number): Promise<ThreadActionResult> {
    return this.#perform("thread.attention.acknowledge", { threadId }, () =>
      this.adapter.acknowledgeAttention(threadId, version),
    );
  }
}
