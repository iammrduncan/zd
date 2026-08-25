import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  FileTreeAdapter,
  FileTreeMutationRequest,
  FileTreeMutationResult,
  FileTreeResult,
  FileTreeWatchEvent,
} from "@/files";
import { unavailableGitAdapter, type GitAdapter, type GitStatusSnapshot } from "@/git";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import { createWorkbenchFilesRuntime } from "@/workbench/files";
import { FileDraftStore } from "@/workbench/current-file/drafts";
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
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async () => treeResult(alpha)),
      watch: () => () => {},
    };
    const git = gitAdapter(vi.fn(async () => gitResult(alpha, "modified")));
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      git,
      createUnavailableInstrumentationClient(),
    );
    const seen = vi.fn();
    const stopGit = runtime.subscribe(seen);

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
    expect(runtime.snapshot()).toEqual(gitResult(alpha, "modified"));
    expect(seen).toHaveBeenLastCalledWith(gitResult(alpha, "modified"));
    stopGit();
    detach();
  });

  it("ignores a late Git result from the previously active project", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha, beta], launch(alpha)));
    const first = deferred<GitStatusSnapshot>();
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async (request) =>
        request.projectId === alpha.id ? treeResult(alpha) : treeResult(beta),
      ),
      watch: () => () => {},
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
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async () => treeResult(alpha)),
      watch: () => () => {},
    };
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

  it("selects and reveals a file activated outside the Files tree", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async () => ({
        ...treeResult(alpha),
        entries: [
          {
            relativePath: "README.md",
            parentPath: null,
            name: "README.md",
            kind: "file" as const,
            ignored: false,
            byteLength: 10,
            modified: 1,
          },
          {
            relativePath: "docs",
            parentPath: null,
            name: "docs",
            kind: "directory" as const,
            ignored: false,
            byteLength: null,
            modified: 1,
          },
          {
            relativePath: "docs/DESIGN.md",
            parentPath: "docs",
            name: "DESIGN.md",
            kind: "file" as const,
            ignored: false,
            byteLength: 10,
            modified: 1,
          },
        ],
      })),
      watch: () => () => {},
    };
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
      relativePath: "docs/DESIGN.md",
    });

    await vi.waitFor(() => expect(runtime.controller.snapshot().activePath).toBe("docs/DESIGN.md"));
    const snapshot = runtime.controller.snapshot();
    expect(snapshot.selectedPath).toBe("docs/DESIGN.md");
    expect(snapshot.selectedPaths).toEqual(new Set(["docs/DESIGN.md"]));
    expect(snapshot.expandedPaths).toContain("docs");
    expect(
      runtime.controller.rows().some(({ entry }) => entry.relativePath === "docs/DESIGN.md"),
    ).toBe(true);
    expect(files.snapshot).toHaveBeenCalledOnce();
    detach();
  });

  it("projects recoverable draft state into the active Files tree", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const drafts = new FileDraftStore(window.localStorage);
    const runtime = createWorkbenchFilesRuntime(
      owner,
      { snapshot: vi.fn(async () => treeResult(alpha)), watch: () => () => {} },
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
      drafts,
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));

    drafts.save(
      {
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "README.md",
      },
      "unsaved",
    );

    expect(runtime.controller.snapshot().dirtyPaths).toEqual(new Set(["README.md"]));
    detach();
  });

  it("copies relative and full paths using the active approved worktree root", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const copyText = vi.fn(async () => {});
    const runtime = createWorkbenchFilesRuntime(
      owner,
      { snapshot: vi.fn(async () => treeResult(alpha)), watch: () => () => {} },
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
      undefined,
      copyText,
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));

    await runtime.controller.copyPath("README.md", "relative");
    expect(copyText).toHaveBeenLastCalledWith("README.md");
    expect(runtime.controller.snapshot().notice).toBe("Copied relative path.");

    await runtime.controller.copyPath("README.md", "full");
    expect(copyText).toHaveBeenLastCalledWith("/work/alpha/README.md");
    expect(runtime.controller.snapshot().notice).toBe("Copied full path.");

    copyText.mockRejectedValueOnce(new Error("Clipboard permission was denied."));
    await runtime.controller.copyPath("README.md", "relative");
    expect(runtime.controller.snapshot().notice).toBe("Clipboard permission was denied.");
    detach();
  });

  it("coordinates native file mutations with active-file and recoverable-draft identities", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    const drafts = new FileDraftStore(window.localStorage);
    let currentPath: string | null = "README.md";
    let revision = 0;
    const mutate = vi.fn(
      async (request: FileTreeMutationRequest): Promise<FileTreeMutationResult> => {
        revision += 1;
        if (request.operation === "create") currentPath = request.relativePath;
        if (request.operation === "rename") {
          const slash = request.relativePath.lastIndexOf("/");
          currentPath =
            slash < 0
              ? request.newName
              : `${request.relativePath.slice(0, slash)}/${request.newName}`;
        }
        if (request.operation === "trash") currentPath = null;
        return { status: "committed" };
      },
    );
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async (): Promise<FileTreeResult> => {
        if (!currentPath) {
          return {
            status: "empty",
            projectId: alpha.id,
            worktreeId: alpha.worktrees[0]!.id,
            revision: `mutation-${revision}`,
            elapsedMicros: 1,
          };
        }
        const current = treeResult(alpha, currentPath);
        if (current.status !== "ready") throw new Error("fixture must return a ready tree");
        return { ...current, revision: `mutation-${revision}` };
      }),
      watch: () => () => {},
      mutate,
    };
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
      drafts,
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));

    await expect(runtime.controller.createEntry(null, "notes.md", "file")).resolves.toBe(true);
    expect(owner.snapshot().openFiles.at(-1)?.relativePath).toBe("notes.md");
    drafts.save(
      {
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "notes.md",
      },
      "unsaved",
    );

    await expect(runtime.controller.renameEntry("notes.md", "draft.md")).resolves.toBe(true);
    expect(owner.snapshot().active.fileId).toBe(
      owner.snapshot().openFiles.find(({ relativePath }) => relativePath === "draft.md")?.id,
    );
    expect(
      drafts.get({
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "draft.md",
      })?.text,
    ).toBe("unsaved");

    await expect(runtime.controller.trashEntry("draft.md")).resolves.toBe(false);
    expect(runtime.controller.snapshot().notice).toContain("Save or close");
    expect(mutate).toHaveBeenCalledTimes(2);

    drafts.clear({
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      relativePath: "draft.md",
    });
    await expect(runtime.controller.trashEntry("draft.md")).resolves.toBe(true);
    expect(owner.snapshot().openFiles.some(({ relativePath }) => relativePath === "draft.md")).toBe(
      false,
    );
    expect(mutate).toHaveBeenLastCalledWith({
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      operation: "trash",
      relativePath: "draft.md",
    });
    detach();
  });

  it("reconciles every open file and draft below a moved directory", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    await owner.activateFile({
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      relativePath: "src/main.ts",
    });
    await owner.activateFile({
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      relativePath: "src/nested/notes.md",
    });
    const drafts = new FileDraftStore(window.localStorage);
    drafts.save(
      {
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "src/main.ts",
      },
      "changed main",
    );
    drafts.save(
      {
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "src/nested/notes.md",
      },
      "changed notes",
    );
    let moved = false;
    const mutate = vi.fn(
      async (request: FileTreeMutationRequest): Promise<FileTreeMutationResult> => {
        if (request.operation === "move") moved = true;
        return { status: "committed" };
      },
    );
    const files: FileTreeAdapter = {
      snapshot: vi.fn(async () => {
        const root = moved ? "archive/src" : "src";
        return {
          status: "ready" as const,
          projectId: alpha.id,
          worktreeId: alpha.worktrees[0]!.id,
          revision: moved ? "moved" : "initial",
          entries: [
            {
              relativePath: "archive",
              parentPath: null,
              name: "archive",
              kind: "directory" as const,
              ignored: false,
              byteLength: null,
              modified: 1,
            },
            {
              relativePath: root,
              parentPath: moved ? "archive" : null,
              name: "src",
              kind: "directory" as const,
              ignored: false,
              byteLength: null,
              modified: 1,
            },
            {
              relativePath: `${root}/main.ts`,
              parentPath: root,
              name: "main.ts",
              kind: "file" as const,
              ignored: false,
              byteLength: 10,
              modified: 1,
            },
            {
              relativePath: `${root}/nested/notes.md`,
              parentPath: `${root}/nested`,
              name: "notes.md",
              kind: "file" as const,
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
      }),
      watch: () => () => {},
      mutate,
    };
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
      drafts,
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(runtime.controller.snapshot().state).toBe("ready"));

    await expect(runtime.controller.transferPaths(["src"], "archive", "move")).resolves.toBe(true);

    expect(mutate).toHaveBeenCalledWith({
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      operation: "move",
      relativePath: "src",
      destinationPath: "archive/src",
    });
    expect(owner.snapshot().openFiles.map(({ relativePath }) => relativePath)).toEqual([
      "README.md",
      "archive/src/main.ts",
      "archive/src/nested/notes.md",
    ]);
    expect(
      drafts.get({
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "archive/src/main.ts",
      })?.text,
    ).toBe("changed main");
    expect(
      drafts.get({
        projectId: alpha.id,
        worktreeId: alpha.worktrees[0]!.id,
        relativePath: "archive/src/nested/notes.md",
      })?.text,
    ).toBe("changed notes");
    detach();
  });

  it("refreshes on bounded disk and focus signals without polling", async () => {
    const owner = createWorkbenchStateOwner(workbenchStateFromGrants([alpha], launch(alpha)));
    let fileAdded = false;
    let watchReady: () => void = () => {
      throw new Error("disk watcher was not installed");
    };
    let diskChange: () => void = () => {
      throw new Error("disk watcher was not installed");
    };
    const stopWatch = vi.fn();
    const watch = vi.fn(
      (
        _scope: { readonly projectId: string; readonly worktreeId: string },
        listener: (event: FileTreeWatchEvent) => void,
      ) => {
        watchReady = () => listener({ status: "ready" });
        diskChange = () => {
          fileAdded = true;
          listener({ status: "changed" });
        };
        return stopWatch;
      },
    );
    const files = {
      snapshot: vi.fn(async () => treeResult(alpha, fileAdded ? "new.md" : "README.md")),
      watch,
    };
    const intervals = vi.spyOn(window, "setInterval");
    const refreshGrants = vi.fn(async () => [
      {
        ...alpha,
        worktrees: [{ ...alpha.worktrees[0]!, name: "feature/live" }],
      },
    ]);
    const runtime = createWorkbenchFilesRuntime(
      owner,
      files,
      gitAdapter(async () => gitResult(alpha, "modified")),
      createUnavailableInstrumentationClient(),
      undefined,
      undefined,
      refreshGrants,
    );
    const detach = runtime.attach();
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledOnce());

    expect(watch).toHaveBeenCalledExactlyOnceWith(
      { projectId: alpha.id, worktreeId: "worktree-alpha" },
      expect.any(Function),
    );
    watchReady();
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledTimes(2));
    expect(runtime.controller.snapshot().entries[0]?.name).toBe("README.md");

    diskChange();
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledTimes(3));
    expect(runtime.controller.snapshot().entries[0]?.name).toBe("new.md");
    await vi.waitFor(() => expect(owner.snapshot().worktrees[0]?.name).toBe("feature/live"));
    expect(refreshGrants).toHaveBeenCalledOnce();

    expect(commandTargetAvailable("files.filter")).toBe(true);
    expect(runCommandTarget("files.filter")).toBe(true);
    expect(runtime.controller.snapshot().filterOpen).toBe(true);

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(files.snapshot).toHaveBeenCalledTimes(4));
    expect(intervals).not.toHaveBeenCalled();

    detach();
    expect(stopWatch).toHaveBeenCalledOnce();
    intervals.mockRestore();
    expect(commandTargetAvailable("files.filter")).toBe(false);
  });
});
