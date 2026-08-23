import { vi } from "vitest";

import type { CreateThreadWorktreeRequest, CreateThreadWorktreeResult } from "@/platform";
import type { TerminalAdapter, TerminalExitStatus, TerminalSessionHandle } from "@/terminal";
import type { CreateThreadRequest, TerminalEmulator } from "@/threads";
import type { ProjectGrant } from "@/workbench/resources";
import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  type ThreadState,
} from "@/workbench/state";

export const project: ProjectGrant = {
  id: "project-alpha",
  name: "Alpha",
  root: "/work/alpha",
  availability: "available",
  worktrees: [
    {
      id: "worktree-alpha",
      name: "main",
      root: "/work/alpha",
      availability: "available",
    },
  ],
};

export function owner() {
  return createWorkbenchStateOwner({
    ...defaultWorkbenchState(),
    projects: [
      {
        id: project.id,
        name: project.name,
        root: project.root,
        availability: project.availability,
      },
    ],
    worktrees: project.worktrees.map((worktree) => ({
      ...worktree,
      projectId: project.id,
    })),
    active: {
      projectId: project.id,
      worktreeId: project.worktrees[0]!.id,
      threadId: null,
      fileId: null,
    },
  });
}

export function durableThread(overrides: Partial<ThreadState> = {}): ThreadState {
  return {
    id: "thread-existing",
    projectId: project.id,
    worktreeId: project.worktrees[0]!.id,
    name: "Existing",
    order: 0,
    type: "terminal",
    agent: "codex",
    lifecycle: "unknown",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attentionUnread: false,
    attentionVersion: 0,
    backingId: "terminal-thread-existing",
    backingAvailability: "missing",
    recovery: null,
    fileId: null,
    ...overrides,
  };
}

export function terminalAdapter() {
  const exit: TerminalExitStatus = { reason: "terminated", code: null, signal: "TERM" };
  const adapter: TerminalAdapter & {
    start: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    pollExit: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  } = {
    start: vi.fn(async (request): Promise<TerminalSessionHandle> => ({
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      sessionId: "native-session-secret",
    })),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    read: vi.fn(async (session) => ({
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [],
      readError: null,
    })),
    pollExit: vi.fn(async () => null),
    terminate: vi.fn(async () => exit),
    dispose: vi.fn(async () => undefined),
  };
  return adapter;
}

export function platform(
  terminal = terminalAdapter(),
  grants: readonly ProjectGrant[] = [project],
  createThreadWorktree: CreateThreadWorktreeResult = {
    status: "refused",
    kind: "git-failed",
    reason: "unused",
  },
) {
  return {
    terminal,
    projectGrants: vi.fn(async () => grants),
    createThreadWorktree: vi.fn(async (request: CreateThreadWorktreeRequest) => {
      void request;
      return createThreadWorktree;
    }),
  };
}

export function existingRequest(): CreateThreadRequest {
  return {
    name: "Review",
    type: { kind: "terminal", agent: "codex" },
    workspace: {
      kind: "project-root",
      projectId: project.id,
      worktreeId: project.worktrees[0]!.id,
    },
  };
}

export function headlessEmulator(): TerminalEmulator {
  let host: HTMLElement | null = null;
  return {
    columns: 80,
    rows: 24,
    open: (nextHost, label) => {
      host = nextHost;
      const input = document.createElement("textarea");
      input.setAttribute("aria-label", label);
      host.append(input);
    },
    write: () => undefined,
    onData: () => () => undefined,
    onBinary: () => () => undefined,
    onSearchResults: () => () => undefined,
    onTitleChange: () => () => undefined,
    attachCustomKeyEventHandler: () => undefined,
    setLabel: (label) => host?.querySelector("textarea")?.setAttribute("aria-label", label),
    focus: () => host?.querySelector("textarea")?.focus(),
    fit: () => ({ columns: 80, rows: 24 }),
    hasSelection: () => false,
    getSelection: () => "",
    paste: () => undefined,
    selectAll: () => undefined,
    findNext: () => false,
    findPrevious: () => false,
    clearSearch: () => undefined,
    refreshTheme: () => undefined,
    dispose: () => undefined,
  };
}
