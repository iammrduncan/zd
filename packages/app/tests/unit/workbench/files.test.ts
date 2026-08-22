import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FileTreeAdapter, FileTreeResult } from "@/files";
import { unavailableGitAdapter, type GitAdapter, type GitStatusSnapshot } from "@/git";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import { createWorkbenchFilesRuntime } from "@/workbench/files";
import type { ProjectGrant } from "@/workbench/resources";
import { clearCommands, commandTargetAvailable, runCommandTarget } from "@/workbench/shortcuts";
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

function launch(project: ProjectGrant, relativePath = "README.md") {
  return {
    project,
    worktreeId: project.worktrees[0]!.id,
    relativePath,
    problem: null,
  };
}

function treeResult(project: ProjectGrant, name = "README.md"): FileTreeResult {
  return {
    status: "ready",
    projectId: project.id,
    worktreeId: project.worktrees[0]!.id,
    revision: `revision-${project.id}`,
    entries: [
      {
        relativePath: name,
        parentPath: null,
        name,
        kind: "file",
        ignored: false,
        byteLength: 10,
        modified: 1,
      },
    ],
    truncated: false,
    ignoredTruncated: false,
    unreadableDirectories: 0,
    elapsedMicros: 1,
  };
}

function gitResult(project: ProjectGrant, state: "modified" | "added"): GitStatusSnapshot {
  return {
    scope: { projectId: project.id, worktreeId: project.worktrees[0]!.id },
    availability: "available",
    entries: [
      {
        id: `change-${project.id}`,
        path: "README.md",
        previousPath: null,
        state,
        indexState: null,
        worktreeState: state,
        submodule: false,
      },
    ],
    truncated: false,
    problem: null,
  };
}

function gitAdapter(status: GitAdapter["status"]): GitAdapter {
  return {
    status,
    history: async (request) => ({
      scope: request.scope,
      availability: "unavailable",
      commits: [],
      nextCursor: null,
      truncated: false,
      problem: "unused",
    }),
    compare: async (request) => ({
      scope: request.scope,
      availability: "unavailable",
      baseCommitId: request.baseCommitId,
      headCommitId: request.headCommitId,
      entries: [],
      truncated: false,
      problem: "unused",
    }),
    diff: async (request) => unavailableGitAdapter.diff(request),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

beforeEach(() => clearCommands());

describe("the root Files and Git coordinator", () => {
  it("activates the scoped tree and reconciles Git state without a path boundary", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const files: FileTreeAdapter = { snapshot: vi.fn(async () => treeResult(alpha)) };
    const git = gitAdapter(vi.fn(async () => gitResult(alpha, "modified")));
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      git,
      createUnavailableInstrumentationClient(),
    );

    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));
    await vi.waitFor(() =>
      expect(runtime.controller.snapshot().entries[0]?.gitState).toBe("modified"),
    );

    expect(files.snapshot).toHaveBeenCalledWith({
      projectId: alpha.id,
      worktreeId: "worktree-alpha",
      previousRevision: null,
    });
    expect(git.status).toHaveBeenCalledWith({
      projectId: alpha.id,
      worktreeId: "worktree-alpha",
    });
    detach();
  });

  it("ignores a late Git result from the previously active project", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha, beta], launch(alpha)));
    const first = deferred<GitStatusSnapshot>();
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async (request) =>
        request.projectId === alpha.id ? treeResult(alpha) : treeResult(beta),
      ),
    };
    const git = gitAdapter(
      vi.fn((scope) =>
        scope.projectId === alpha.id ? first.promise : Promise.resolve(gitResult(beta, "added")),
      ),
    );
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      git,
      createUnavailableInstrumentationClient(),
    );
    const detach = runtime.attach();

    await owner.activateProject(beta.id);
    await vi.waitFor(() => expect(runtime.controller.snapshot().scope?.projectId).toBe(beta.id));
    await vi.waitFor(() =>
      expect(runtime.controller.snapshot().entries[0]?.gitState).toBe("added"),
    );
    first.resolve(gitResult(alpha, "modified"));
    await first.promise;
    await Promise.resolve();

    expect(runtime.controller.snapshot().scope?.projectId).toBe(beta.id);
    expect(runtime.controller.snapshot().entries[0]?.gitState).toBe("added");
    detach();
  });

  it("updates a file-only selection without rescanning the same tree", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const files: FileTreeAdapter = { snapshot: vi.fn(async () => treeResult(alpha)) };
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));

    await owner.activateFile({
      projectId: alpha.id,
      worktreeId: "worktree-alpha",
      relativePath: "notes.md",
    });

    await vi.waitFor(() => expect(runtime.controller.snapshot().activePath).toBe("notes.md"));
    expect(files.snapshot).toHaveBeenCalledOnce();
    detach();
  });

  it("refreshes only on bounded signals and exposes the focused tree filter target", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const files: FileTreeAdapter = { snapshot: vi.fn(async () => treeResult(alpha)) };
    const intervals = vi.spyOn(window, "setInterval");
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledOnce());

    expect(commandTargetAvailable("files.filter")).toBe(true);
    expect(runCommandTarget("files.filter")).toBe(true);
    expect(runtime.controller.snapshot().filterOpen).toBe(true);

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledTimes(2));
    expect(intervals).not.toHaveBeenCalled();

    detach();
    intervals.mockRestore();
    expect(commandTargetAvailable("files.filter")).toBe(false);
  });
});
