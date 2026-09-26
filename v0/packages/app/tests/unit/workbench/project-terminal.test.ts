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
  const terminal: TerminalAdapter = {
    start: vi.fn(async (request) => ({
      projectId: request.projectId,
      worktreeId: request.worktreeId,
      sessionId: request.terminalId,
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

function mountHeadlessSurface(surfaceHost: HTMLElement): TerminalThreadSurface {
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
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("the runtime-only project terminal", () => {
  it("detaches its surface without closing the shell when the workbench unloads", async () => {
    const { context, state, terminal } = fixture();
    await state.activateProject(grant.id);
    const host = document.createElement("section");
    const unmount = mountProjectTerminal(host, context, {
      mountSurface: mountHeadlessSurface,
    });

    expect(runCommandTarget("projectTerminal.toggle")).toBe(true);
    await vi.waitFor(() => expect(terminal.start).toHaveBeenCalledOnce());
    unmount();

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(terminal.terminate).not.toHaveBeenCalled();
    expect(terminal.dispose).not.toHaveBeenCalled();
  });

  it("reconstructs every retained split pane in the active project scope", async () => {
    const { context, state, terminal } = fixture();
    const retained = [1, 2, 4].map((sequence) => ({
      projectId: grant.id,
      worktreeId: grant.worktrees[0]!.id,
      sessionId: `project-terminal:${grant.id}:${grant.worktrees[0]!.id}:${sequence}`,
    }));
    terminal.list = vi.fn(async () => retained);
    terminal.reattach = vi.fn(
      async (request) => retained.find(({ sessionId }) => sessionId === request.terminalId) ?? null,
    );
    await state.activateProject(grant.id);
    const host = document.createElement("section");
    const mountSurface = vi.fn(mountHeadlessSurface);
    const unmount = mountProjectTerminal(host, context, { mountSurface });

    expect(runCommandTarget("projectTerminal.toggle")).toBe(true);
    await vi.waitFor(() => expect(mountSurface).toHaveBeenCalledTimes(3));

    expect(terminal.list).toHaveBeenCalledWith({
      projectId: grant.id,
      worktreeId: grant.worktrees[0]!.id,
      projectName: grant.name,
      worktreeLabel: grant.worktrees[0]!.name,
    });
    expect(
      vi
        .mocked(terminal.reattach!)
        .mock.calls.map(([request]) => request.terminalId)
        .sort(),
    ).toEqual(retained.map(({ sessionId }) => sessionId).sort());
    expect(terminal.start).not.toHaveBeenCalled();
    expect(host.querySelectorAll("[data-project-terminal-pane]")).toHaveLength(3);

    unmount();
  });

  it("does not create thread state and guards project removal until its processes stop", async () => {
    const { context, state, terminal } = fixture();
    await state.activateProject(grant.id);
    const host = document.createElement("section");
    document.body.append(host);
    const mountSurface = vi.fn(mountHeadlessSurface);
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
