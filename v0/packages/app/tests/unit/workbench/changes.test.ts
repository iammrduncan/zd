import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorView } from "@codemirror/view";
import { ChangesController, type ChangesStatusSource } from "@/changes";
import type {
  GitAdapter,
  GitComparison,
  GitDiff,
  GitHistoryPage,
  GitScope,
  GitStatusSnapshot,
} from "@/git";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { Platform } from "@/platform";
import { createWorkbenchChangesRuntime, mountCurrentFileWithChanges } from "@/workbench/changes";
import type { ProjectGrant } from "@/workbench/resources";
import {
  clearCommands,
  commands,
  commandTargetAvailable,
  runCommandTarget,
} from "@/workbench/shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

const alpha: ProjectGrant = {
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

const beta: ProjectGrant = {
  id: "project-beta",
  name: "Beta",
  root: "/work/beta",
  availability: "available",
  worktrees: [
    {
      id: "worktree-beta",
      name: "main",
      root: "/work/beta",
      availability: "available",
    },
  ],
};

function launch(project: ProjectGrant) {
  return {
    project,
    worktreeId: project.worktrees[0]!.id,
    relativePath: "src/main.ts",
    problem: null,
  };
}

function scope(project = alpha): GitScope {
  return { projectId: project.id, worktreeId: project.worktrees[0]!.id };
}

function status(project = alpha): GitStatusSnapshot {
  return {
    scope: scope(project),
    availability: "available",
    entries: [
      {
        id: `change-${project.id}`,
        path: "src/main.ts",
        previousPath: null,
        state: "modified",
        indexState: null,
        worktreeState: "modified",
        submodule: false,
      },
    ],
    truncated: false,
    problem: null,
  };
}

function source(initial = status()): ChangesStatusSource {
  const snapshot: GitStatusSnapshot | null = initial;
  const listeners = new Set<(value: GitStatusSnapshot | null) => void>();
  return {
    snapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh: vi.fn(async () => undefined),
  };
}

function diff(): GitDiff {
  return {
    scope: scope(),
    availability: "available",
    base: {
      status: "text",
      identity: "base-buffer",
      path: "src/main.ts",
      revision: "a".repeat(40),
      text: "const value = 0;\n",
      byteLength: 17,
    },
    head: {
      status: "text",
      identity: "head-buffer",
      path: "src/main.ts",
      revision: "working-tree",
      text: "const value = 1;\n",
      byteLength: 17,
    },
    problem: null,
  };
}

function git(): GitAdapter {
  return {
    status: vi.fn(async (requested) => status(requested.projectId === beta.id ? beta : alpha)),
    history: vi.fn(async (request): Promise<GitHistoryPage> => ({
      scope: request.scope,
      availability: "available",
      commits: [],
      nextCursor: null,
      truncated: false,
      problem: null,
    })),
    compare: vi.fn(async (request): Promise<GitComparison> => ({
      scope: request.scope,
      availability: "available",
      baseCommitId: request.baseCommitId,
      headCommitId: request.headCommitId,
      entries: [],
      truncated: false,
      problem: null,
    })),
    diff: vi.fn(async () => diff()),
  };
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("the root Changes coordinator", () => {
  it("loads bounded history once for each root-owned project/worktree activation", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha, beta], launch(alpha)));
    const adapter = git();
    const runtime = createWorkbenchChangesRuntime(
      owner,
      adapter,
      source(),
      createUnavailableInstrumentationClient(),
    );
    const detach = runtime.attach();

    await vi.waitFor(() => expect(adapter.history).toHaveBeenCalledOnce());
    expect(adapter.history).toHaveBeenLastCalledWith({
      scope: scope(alpha),
      cursor: null,
      pageSize: 50,
    });
    await owner.activateProject(beta.id);
    await vi.waitFor(() => expect(adapter.history).toHaveBeenCalledTimes(2));
    expect(adapter.history).toHaveBeenLastCalledWith({
      scope: scope(beta),
      cursor: null,
      pageSize: 50,
    });

    detach();
  });

  it("preserves the dirty live editor while a comparison temporarily owns the surface", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const changes = new ChangesController(git(), source());
    changes.activate(scope());
    const platform = {
      readBoundedFile: vi.fn(async () => ({
        status: "text" as const,
        text: "const value = 1;",
        byteLength: 16,
        writable: true,
      })),
      writeTextFile: vi.fn(async () => undefined),
      fileStamp: vi.fn(async () => ({ modified: 1, length: 16 })),
      onCloseRequested: () => () => {},
      closeWindow: vi.fn(async () => undefined),
    } as unknown as Platform;
    const context = {
      launch: launch(alpha),
      platform,
      state: owner,
      instrumentation: createUnavailableInstrumentationClient(),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFileWithChanges(host, context, changes);
    const liveSurface = host.querySelector<HTMLElement>("[data-changes-surface='live']")!;
    const liveEditor = liveSurface.querySelector<HTMLElement>(".md-editor")!;
    const view = EditorView.findFromDOM(liveEditor)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });

    await changes.openWorkingDiff("change-project-alpha");

    expect(liveSurface.hidden).toBe(true);
    expect(liveEditor.isConnected).toBe(true);
    expect(commandTargetAvailable("file.find")).toBe(true);
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.available?.(),
    ).toBe(false);
    expect(runCommandTarget("workbench.escape")).toBe(true);
    expect(liveSurface.hidden).toBe(false);
    expect(EditorView.findFromDOM(liveEditor)?.state.doc.toString()).toContain("const mine = 2;");
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.available?.(),
    ).toBe(true);

    unmount();
    host.remove();
  });
});
