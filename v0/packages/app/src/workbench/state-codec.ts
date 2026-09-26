import {
  WORKBENCH_STATE_VERSION,
  contextProblem,
  defaultWorkbenchState,
  type OpenFileState,
  type ProjectState,
  type ThreadRecoveryState,
  type ThreadState,
  type WorkbenchContext,
  type WorkbenchRegions,
  type WorkbenchState,
  type WorktreeState,
} from "./state-core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function hasStrings(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof record[key] === "string");
}

function validProject(value: unknown): value is ProjectState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "name", "root", "availability"]) &&
    ["available", "missing", "denied", "not-directory", "unavailable"].includes(
      value.availability as string,
    )
  );
}

function validWorktree(value: unknown): value is WorktreeState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "name", "root", "availability"]) &&
    ["available", "missing", "denied", "not-directory", "unavailable"].includes(
      value.availability as string,
    )
  );
}

function validThreadRecovery(value: unknown): value is ThreadRecoveryState | null {
  return (
    value === null ||
    (isRecord(value) &&
      [
        "missing-project",
        "missing-worktree",
        "missing-session",
        "worktree-collision",
        "worktree-locked",
        "failed",
      ].includes(value.kind as string) &&
      hasStrings(value, ["summary", "actionLabel"]))
  );
}

function validThread(value: unknown): value is ThreadState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "worktreeId", "name", "type", "agent"]) &&
    value.type === "terminal" &&
    ["shell", "codex", "claude-code", "opencode", "unknown"].includes(value.agent as string) &&
    ["starting", "idle", "busy", "waiting", "exited", "failed", "unknown"].includes(
      value.lifecycle as string,
    ) &&
    ["process", "supported-agent", "terminal-output"].includes(value.lifecycleSource as string) &&
    Number.isSafeInteger(value.order) &&
    (value.order as number) >= 0 &&
    Number.isSafeInteger(value.lifecycleRevision) &&
    (value.lifecycleRevision as number) >= 0 &&
    typeof value.attentionUnread === "boolean" &&
    Number.isSafeInteger(value.attentionVersion) &&
    (value.attentionVersion as number) >= 0 &&
    typeof value.backingId === "string" &&
    value.backingId.length > 0 &&
    ["not-started", "starting", "ready", "missing", "closed"].includes(
      value.backingAvailability as string,
    ) &&
    validThreadRecovery(value.recovery) &&
    isNullableString(value.fileId)
  );
}

interface LegacyThreadState {
  readonly id: string;
  readonly projectId: string;
  readonly worktreeId: string;
  readonly name: string;
  readonly sessionId: string | null;
}

function validLegacyThread(value: unknown): value is LegacyThreadState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "worktreeId", "name"]) &&
    isNullableString(value.sessionId)
  );
}

function validFile(value: unknown): value is OpenFileState {
  return (
    isRecord(value) &&
    hasStrings(value, ["id", "projectId", "worktreeId", "relativePath", "bufferId"])
  );
}

function validContext(value: unknown): value is WorkbenchContext {
  return (
    isRecord(value) &&
    isNullableString(value.projectId) &&
    isNullableString(value.worktreeId) &&
    isNullableString(value.threadId) &&
    isNullableString(value.fileId)
  );
}

function validRegions(value: unknown): value is WorkbenchRegions {
  if (!isRecord(value) || !isRecord(value.threads) || !isRecord(value.files)) return false;
  if (!isRecord(value.centre)) return false;

  return (
    ["full", "collapsed", "hidden"].includes(value.threads.visibility as string) &&
    typeof value.threads.width === "number" &&
    ["visible", "hidden"].includes(value.files.visibility as string) &&
    typeof value.files.width === "number" &&
    ["files", "changes"].includes(value.files.tab as string) &&
    ["overlap", "side-by-side"].includes(value.centre.mode as string) &&
    typeof value.centre.split === "number" &&
    ["threads", "thread", "file", "files"].includes(value.focus as string)
  );
}

function validStateEnvelope(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.projects) || !value.projects.every(validProject)) return false;
  if (!Array.isArray(value.worktrees) || !value.worktrees.every(validWorktree)) return false;
  if (!Array.isArray(value.openFiles) || !value.openFiles.every(validFile)) return false;
  if (!validContext(value.active) || !validRegions(value.regions)) return false;
  if (
    !isRecord(value.window) ||
    !["ordinary", "quick-access"].includes(String(value.window.presentation))
  ) {
    return false;
  }
  if (!isRecord(value.theme) || !hasStrings(value.theme, ["selected", "lastValid"])) return false;
  return true;
}

function stateShape(value: unknown): value is WorkbenchState {
  if (!isRecord(value) || value.schemaVersion !== WORKBENCH_STATE_VERSION) return false;
  if (!validStateEnvelope(value)) return false;
  if (!Array.isArray(value.threads) || !value.threads.every(validThread)) return false;
  return (
    contextProblem(
      value as unknown as WorkbenchState,
      value.active as unknown as WorkbenchContext,
    ) === null
  );
}

export function cloneState(state: WorkbenchState): WorkbenchState {
  return {
    ...state,
    projects: state.projects.map((project) => ({ ...project })),
    worktrees: state.worktrees.map((worktree) => ({ ...worktree })),
    threads: state.threads.map((thread) => ({
      ...thread,
      recovery: thread.recovery ? { ...thread.recovery } : null,
    })),
    openFiles: state.openFiles.map((file) => ({ ...file })),
    active: { ...state.active },
    regions: {
      threads: { ...state.regions.threads },
      files: { ...state.regions.files },
      centre: { ...state.regions.centre },
      focus: state.regions.focus,
    },
    window: { ...state.window },
    theme: { ...state.theme },
  };
}

export function parseWorkbenchState(value: unknown): WorkbenchState {
  if (stateShape(value)) return cloneState(value);
  const migrated = migrateVersionOneState(value);
  return migrated && stateShape(migrated) ? cloneState(migrated) : defaultWorkbenchState();
}

function migrateVersionOneState(value: unknown): WorkbenchState | null {
  if (!isRecord(value) || value.schemaVersion !== 1 || !validStateEnvelope(value)) return null;
  if (!Array.isArray(value.threads) || !value.threads.every(validLegacyThread)) return null;

  const active = value.active as unknown as WorkbenchContext;
  const files = value.openFiles as unknown as readonly OpenFileState[];
  const projectOrders = new Map<string, number>();
  const threads = value.threads.map((legacy): ThreadState => {
    const order = projectOrders.get(legacy.projectId) ?? 0;
    projectOrders.set(legacy.projectId, order + 1);
    const rememberedFile =
      (active.threadId === legacy.id ? active.fileId : null) ??
      files.find(
        (file) => file.projectId === legacy.projectId && file.worktreeId === legacy.worktreeId,
      )?.id ??
      null;
    const hadSession = legacy.sessionId !== null && legacy.sessionId.length > 0;
    return {
      id: legacy.id,
      projectId: legacy.projectId,
      worktreeId: legacy.worktreeId,
      name: legacy.name,
      order,
      type: "terminal",
      agent: "shell",
      lifecycle: "unknown",
      lifecycleSource: "process",
      lifecycleRevision: 0,
      attentionUnread: false,
      attentionVersion: 0,
      backingId: hadSession ? legacy.sessionId! : `terminal:${legacy.id}`,
      backingAvailability: hadSession ? "missing" : "not-started",
      recovery: hadSession
        ? {
            kind: "missing-session",
            summary: "The previous terminal process is no longer attached.",
            actionLabel: "Restart terminal",
          }
        : null,
      fileId: rememberedFile,
    };
  });

  return {
    ...(value as unknown as Omit<WorkbenchState, "schemaVersion" | "threads">),
    schemaVersion: WORKBENCH_STATE_VERSION,
    threads,
  };
}
