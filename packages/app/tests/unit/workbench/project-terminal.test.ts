import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { TerminalThreadSurface } from "@/threads";
import type { TerminalAdapter } from "@/terminal";
import { mountProjectTerminal } from "@/workbench/project-terminal";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";
import { clearCommands, runCommandTarget } from "@/workbench/shortcuts";

const grant: ProjectGrant = {
  id: "project-alpha",
  name: "Alpha",
  root: "/alpha",
  availability: "available",
  worktrees: [
    {
      id: "worktree-alpha",
      name: "Alpha",
      root: "/alpha",
      availability: "available",
    },
  ],
};

function fixture() {
  let sequence = 0;
  const terminal: TerminalAdapter = {
    start: vi.fn(async (request) => ({
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      sessionId: `project-terminal-${++sequence}`,
    })),
    onOutputReady: () => () => {},
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
    terminate: vi.fn(async () => ({
      reason: "terminated" as const,
      code: null,
      signal: null,
    })),
    dispose: vi.fn(async () => undefined),
  };
  const state = createWorkbenchStateOwner(workbenchStateFromGrants([grant], homeLaunch()));
  const context = {
    launch: homeLaunch(),
    platform: { terminal },
    state,
    instrumentation: createUnavailableInstrumentationClient(),
  } as unknown as WorkbenchRuntimeContext;
  return { context, state, terminal };
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("the runtime-only project terminal", () => {
  it("does not create thread state and guards project removal until its processes stop", async () => {
    const { context, state, terminal } = fixture();
    await state.activateProject(grant.id);
    const host = document.createElement("section");
    document.body.append(host);
    const mountSurface = vi.fn((surfaceHost: HTMLElement): TerminalThreadSurface => {
      const element = document.createElement("section");
      surfaceHost.append(element);
      return {
        element,
        viewportElement: element,
        closeSearch: () => false,
        copySelection: async () => false,
        dispose: () => element.remove(),
        fit: () => {},
        focus: () => {},
        isSearchOpen: () => false,
        openSearch: () => {},
        paste: () => {},
        refreshTheme: () => {},
        setVisible: (visible) => {
          element.hidden = !visible;
        },
        selectAll: () => {},
        updateMetadata: () => {},
      };
    });
    const unmount = mountProjectTerminal(host, context, { mountSurface });

    expect(runCommandTarget("projectTerminal.toggle")).toBe(true);
    await vi.waitFor(() => expect(terminal.start).toHaveBeenCalledOnce());
    expect(state.snapshot().threads).toEqual([]);

    expect(runCommandTarget("projectTerminal.split")).toBe(true);
    await vi.waitFor(() => expect(terminal.start).toHaveBeenCalledTimes(2));
    expect(runCommandTarget("projectTerminal.unsplit")).toBe(true);
    await vi.waitFor(() => expect(terminal.terminate).toHaveBeenCalledOnce());

    const revoke = vi.fn(async () => undefined);
    const refused = await state.removeProject(grant.id, revoke);
    expect(refused).toMatchObject({
      status: "refused",
      recovery: { label: "Terminate project terminal" },
    });
    expect(revoke).not.toHaveBeenCalled();
    if (refused.status === "refused") await refused.recovery?.run();

    await expect(state.removeProject(grant.id, revoke)).resolves.toEqual({ status: "committed" });
    expect(revoke).toHaveBeenCalledOnce();
    expect(terminal.terminate).toHaveBeenCalledTimes(2);
    unmount();
    host.remove();
  });
});
