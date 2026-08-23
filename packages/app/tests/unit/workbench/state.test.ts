import { describe, expect, it, vi } from "vitest";

import {
  createWorkbenchStateOwner,
  defaultWorkbenchState,
  fileStateId,
  parseWorkbenchState,
  workbenchStateFromGrants,
  type WorkbenchContext,
  type ProjectRemoval,
  type ProjectState,
  type WorkbenchState,
} from "@/workbench/state";
import type { FileResource, LaunchRequest, ProjectGrant } from "@/workbench/resources";

function grant(id: string, root: string): ProjectGrant {
  return {
    id,
    name: id,
    root,
    availability: "available",
    worktrees: [
      {
        id: `${id}-root`,
        name: "main",
        root,
        availability: "available",
      },
    ],
  };
}

function launchFor(project: ProjectGrant, relativePath: string | null): LaunchRequest {
  return {
    project,
    worktreeId: project.worktrees[0]!.id,
    relativePath,
    problem: null,
  };
}

function populatedState(): WorkbenchState {
  return {
    ...defaultWorkbenchState(),
    projects: [
      { id: "project-a", name: "Alpha", root: "/work/alpha", availability: "available" },
      { id: "project-b", name: "Beta", root: "/work/beta", availability: "available" },
    ],
    worktrees: [
      {
        id: "worktree-a",
        projectId: "project-a",
        name: "main",
        root: "/work/alpha",
        availability: "available",
      },
      {
        id: "worktree-b",
        projectId: "project-b",
        name: "main",
        root: "/work/beta",
        availability: "available",
      },
    ],
    threads: [
      {
        id: "thread-a",
        projectId: "project-a",
        worktreeId: "worktree-a",
        name: "Plan",
        order: 0,
        type: "terminal",
        agent: "shell",
        lifecycle: "idle",
        lifecycleSource: "process",
        lifecycleRevision: 1,
        attentionUnread: false,
        attentionVersion: 0,
        backingId: "terminal-thread-a",
        backingAvailability: "ready",
        recovery: null,
        fileId: "file-a",
      },
      {
        id: "thread-b",
        projectId: "project-b",
        worktreeId: "worktree-b",
        name: "Build",
        order: 0,
        type: "terminal",
        agent: "shell",
        lifecycle: "idle",
        lifecycleSource: "process",
        lifecycleRevision: 1,
        attentionUnread: false,
        attentionVersion: 0,
        backingId: "terminal-thread-b",
        backingAvailability: "ready",
        recovery: null,
        fileId: "file-b",
      },
    ],
    openFiles: [
      {
        id: "file-a",
        projectId: "project-a",
        worktreeId: "worktree-a",
        relativePath: "README.md",
        bufferId: "buffer-a",
      },
      {
        id: "file-b",
        projectId: "project-b",
        worktreeId: "worktree-b",
        relativePath: "src/main.ts",
        bufferId: "buffer-b",
      },
    ],
    active: {
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: "file-a",
    },
  };
}

const beta: WorkbenchContext = {
  projectId: "project-b",
  worktreeId: "worktree-b",
  threadId: "thread-b",
  fileId: "file-b",
};

describe("the versioned workbench state", () => {
  it("starts with one safe region, focus, and theme contract", () => {
    expect(defaultWorkbenchState()).toMatchObject({
      schemaVersion: 2,
      active: { projectId: null, worktreeId: null, threadId: null, fileId: null },
      regions: {
        threads: { visibility: "full", width: 236 },
        files: { visibility: "visible", width: 280, tab: "files" },
        centre: { mode: "overlap", split: 0.42 },
        focus: "file",
      },
      window: { presentation: "ordinary" },
      theme: { selected: "system", lastValid: "current-light" },
    });
  });

  it("rejects unsupported or malformed persisted state without preventing launch", () => {
    expect(parseWorkbenchState({ schemaVersion: 3 })).toEqual(defaultWorkbenchState());
    expect(parseWorkbenchState({ schemaVersion: 1, projects: "not-an-array" })).toEqual(
      defaultWorkbenchState(),
    );
    expect(parseWorkbenchState("not state")).toEqual(defaultWorkbenchState());
  });

  it("accepts a valid version-two snapshot", () => {
    const state = populatedState();
    expect(parseWorkbenchState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it("keeps the public parsed snapshot isolated from caller-owned arrays", () => {
    const source = populatedState();
    const parsed = parseWorkbenchState(source);

    (source.projects as ProjectState[]).splice(0);

    expect(parsed.projects.map(({ id }) => id)).toEqual(["project-a", "project-b"]);
  });

  it("seeds every native grant and the launched file into one active snapshot", () => {
    const alpha = grant("project-alpha", "/work/alpha");
    const beta = grant("project-beta", "/work/beta");

    const state = workbenchStateFromGrants([alpha, beta], launchFor(beta, "src/main.ts"));

    expect(state.projects.map(({ id }) => id)).toEqual(["project-alpha", "project-beta"]);
    expect(state.worktrees.map(({ id }) => id)).toEqual([
      "project-alpha-root",
      "project-beta-root",
    ]);
    expect(state.openFiles).toEqual([
      expect.objectContaining({
        projectId: "project-beta",
        worktreeId: "project-beta-root",
        relativePath: "src/main.ts",
      }),
    ]);
    expect(state.active).toEqual({
      projectId: "project-beta",
      worktreeId: "project-beta-root",
      threadId: null,
      fileId: state.openFiles[0]!.id,
    });
  });
});

describe("atomic workbench context transitions", () => {
  it("resolves project, thread, file, and exact intents through one entry point", async () => {
    const owner = createWorkbenchStateOwner(populatedState());

    await expect(
      owner.activateContext({ kind: "project", projectId: "project-b" }),
    ).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual(beta);

    await expect(owner.activateContext({ kind: "thread", threadId: "thread-a" })).resolves.toEqual({
      status: "committed",
    });
    expect(owner.snapshot().active).toEqual({
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: "file-a",
    });

    const resource: FileResource = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "next.md",
    };
    await expect(owner.activateContext({ kind: "file", resource })).resolves.toEqual({
      status: "committed",
    });
    expect(owner.snapshot().active).toMatchObject({
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: fileStateId(resource),
    });

    await expect(owner.activateContext({ kind: "exact", context: beta })).resolves.toEqual({
      status: "committed",
    });
    expect(owner.snapshot().active).toEqual(beta);
  });

  it("publishes one snapshot containing the complete target context", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const seen: WorkbenchContext[] = [];
    owner.subscribe((state) => seen.push(state.active));

    const result = await owner.activateContext({ kind: "exact", context: beta });

    expect(result).toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual(beta);
    expect(seen).toEqual([beta]);
  });

  it("refuses a mixed context before any observer can see it", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const seen = vi.fn();
    owner.subscribe(seen);

    const result = await owner.activateContext({
      kind: "exact",
      context: { ...beta, fileId: "file-a" },
    });

    expect(result).toMatchObject({ status: "refused", reason: expect.stringContaining("file-a") });
    expect(owner.snapshot().active.projectId).toBe("project-a");
    expect(seen).not.toHaveBeenCalled();
  });

  it("lets a dirty buffer refuse the switch and expose one recovery action", async () => {
    const recover = vi.fn();
    const owner = createWorkbenchStateOwner(populatedState());
    owner.registerTransitionGuard({
      id: "buffer-a",
      prepare: () => ({
        status: "refused",
        reason: "README.md has unsaved work",
        recovery: { label: "Save README.md", run: recover },
      }),
    });

    const result = await owner.activateContext({ kind: "exact", context: beta });

    expect(result).toMatchObject({
      status: "refused",
      reason: "README.md has unsaved work",
      recovery: { label: "Save README.md" },
    });
    expect(owner.snapshot().active.projectId).toBe("project-a");
    expect(recover).not.toHaveBeenCalled();
  });

  it("preserves the previous snapshot when a guard itself fails", async () => {
    const before = populatedState();
    const owner = createWorkbenchStateOwner(before);
    owner.registerTransitionGuard({
      id: "terminal-a",
      prepare: () => {
        throw new Error("terminal lifecycle unavailable");
      },
    });

    const result = await owner.activateContext({ kind: "exact", context: beta });

    expect(result).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("terminal lifecycle unavailable"),
    });
    expect(owner.snapshot()).toEqual(before);
  });

  it("adds a native launch grant and activates its file in one publication", async () => {
    const alpha = grant("project-alpha", "/work/alpha");
    const beta = grant("project-beta", "/work/beta");
    const owner = createWorkbenchStateOwner(
      workbenchStateFromGrants([alpha], launchFor(alpha, "README.md")),
    );
    const seen = vi.fn();
    owner.subscribe(seen);

    const result = await owner.applyLaunch(launchFor(beta, "src/main.ts"), [alpha, beta]);

    expect(result).toEqual({ status: "committed" });
    expect(seen).toHaveBeenCalledOnce();
    expect(owner.snapshot()).toMatchObject({
      projects: [{ id: "project-alpha" }, { id: "project-beta" }],
      active: {
        projectId: "project-beta",
        worktreeId: "project-beta-root",
        fileId: fileStateId({
          projectId: "project-beta",
          worktreeId: "project-beta-root",
          relativePath: "src/main.ts",
        }),
      },
    });
  });

  it("routes file activation through guards before changing or publishing state", async () => {
    const alpha = grant("project-alpha", "/work/alpha");
    const owner = createWorkbenchStateOwner(
      workbenchStateFromGrants([alpha], launchFor(alpha, "README.md")),
    );
    const seen = vi.fn();
    owner.subscribe(seen);
    owner.registerTransitionGuard({
      id: "dirty-buffer",
      prepare: () => ({ status: "refused", reason: "README.md has unsaved work" }),
    });
    const target: FileResource = {
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      relativePath: "next.md",
    };

    const result = await owner.activateFile(target);

    expect(result).toEqual({ status: "refused", reason: "README.md has unsaved work" });
    expect(owner.snapshot().active.fileId).not.toBe(fileStateId(target));
    expect(seen).not.toHaveBeenCalled();
  });

  it("reconciles open files and thread memory after native rename and Trash operations", () => {
    const state = populatedState();
    const owner = createWorkbenchStateOwner({
      ...state,
      openFiles: [
        { ...state.openFiles[0]!, relativePath: "docs/README.md" },
        {
          id: "file-child",
          projectId: "project-a",
          worktreeId: "worktree-a",
          relativePath: "docs/notes.md",
          bufferId: "buffer-child",
        },
        state.openFiles[1]!,
      ],
    });
    const docs = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "docs",
    };

    owner.renameFilePath(docs, "writing");

    expect(owner.snapshot().openFiles.map(({ relativePath }) => relativePath)).toEqual([
      "writing/README.md",
      "writing/notes.md",
      "src/main.ts",
    ]);
    expect(owner.snapshot().active.fileId).toBe(
      fileStateId({ ...docs, relativePath: "writing/README.md" }),
    );
    expect(owner.snapshot().threads[0]?.fileId).toBe(owner.snapshot().active.fileId);

    owner.removeFilePath({ ...docs, relativePath: "writing" });

    expect(owner.snapshot().openFiles.map(({ relativePath }) => relativePath)).toEqual([
      "src/main.ts",
    ]);
    expect(owner.snapshot().active.fileId).toBeNull();
    expect(owner.snapshot().threads[0]?.fileId).toBeNull();
  });

  it("restores each project's exact session context after repeated activation", async () => {
    const owner = createWorkbenchStateOwner(populatedState());

    await expect(owner.activateProject("project-b")).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual(beta);

    await expect(owner.activateProject("project-a")).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual({
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: "file-a",
    });

    await expect(owner.activateProject("project-b")).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot().active).toEqual(beta);
  });

  it("accepts a new native grant atomically and activates an existing canonical root", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const seen = vi.fn();
    owner.subscribe(seen);

    const duplicate = grant("competing-id", "/work/beta");
    await expect(owner.acceptProjectGrant(duplicate)).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot().projects).toHaveLength(2);
    expect(owner.snapshot().active.projectId).toBe("project-b");

    const gamma = grant("project-c", "/work/gamma");
    await expect(owner.acceptProjectGrant(gamma)).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot()).toMatchObject({
      projects: [{ id: "project-a" }, { id: "project-b" }, { id: "project-c" }],
      active: { projectId: "project-c", worktreeId: "project-c-root" },
    });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("reorders projects only when given one complete identity set", async () => {
    const owner = createWorkbenchStateOwner(populatedState());

    await expect(owner.reorderProjects(["project-b", "project-a"])).resolves.toEqual({
      status: "committed",
    });
    expect(owner.snapshot().projects.map(({ id }) => id)).toEqual(["project-b", "project-a"]);

    await expect(owner.reorderProjects(["project-a"])).resolves.toMatchObject({
      status: "refused",
      reason: expect.stringContaining("complete"),
    });
    expect(owner.snapshot().projects.map(({ id }) => id)).toEqual(["project-b", "project-a"]);
  });

  it("lets inactive dirty or live work refuse project removal before native revocation", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const revoke = vi.fn(async () => undefined);
    const seen: ProjectRemoval[] = [];
    owner.registerProjectRemovalGuard({
      id: "project-work",
      prepareRemoval: (change) => {
        seen.push(change);
        return change.projectId === "project-b"
          ? { status: "refused", reason: "src/main.ts is dirty and Build is still running" }
          : { status: "ready" };
      },
    });

    const result = await owner.removeProject("project-b", revoke);

    expect(result).toMatchObject({
      status: "refused",
      reason: "src/main.ts is dirty and Build is still running",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ projectId: "project-b", wasActive: false });
    expect(revoke).not.toHaveBeenCalled();
    expect(owner.snapshot().projects).toHaveLength(2);
  });

  it("revokes an approved active project before publishing one complete fallback context", async () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const revoke = vi.fn(async () => undefined);
    const snapshots: WorkbenchState[] = [];
    owner.subscribe((state) => snapshots.push(state));

    const result = await owner.removeProject("project-a", revoke);

    expect(result).toEqual({ status: "committed" });
    expect(revoke).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]).toMatchObject({
      projects: [{ id: "project-b" }],
      active: beta,
    });
    expect(snapshots[0]!.worktrees.map(({ id }) => id)).toEqual(["worktree-b"]);
    expect(snapshots[0]!.threads.map(({ id }) => id)).toEqual(["thread-b"]);
    expect(snapshots[0]!.openFiles.map(({ id }) => id)).toEqual(["file-b"]);
  });

  it("preserves root state when native project revocation fails", async () => {
    const before = populatedState();
    const owner = createWorkbenchStateOwner(before);

    const result = await owner.removeProject("project-a", async () => {
      throw new Error("native grant store unavailable");
    });

    expect(result).toEqual({ status: "refused", reason: "native grant store unavailable" });
    expect(owner.snapshot()).toEqual(before);
  });

  it("refreshes a recovered native grant without changing its stable identity", async () => {
    const owner = createWorkbenchStateOwner({
      ...populatedState(),
      projects: [
        { id: "project-a", name: "Alpha", root: "/old/alpha", availability: "missing" },
        { id: "project-b", name: "Beta", root: "/work/beta", availability: "available" },
      ],
      worktrees: [
        {
          id: "worktree-a",
          projectId: "project-a",
          name: "main",
          root: "/old/alpha",
          availability: "missing",
        },
        populatedState().worktrees[1]!,
      ],
    });
    const recovered: ProjectGrant = {
      id: "project-a",
      name: "Alpha",
      root: "/work/alpha",
      availability: "available",
      worktrees: [
        {
          id: "worktree-a",
          name: "main",
          root: "/work/alpha",
          availability: "available",
        },
      ],
    };

    await expect(owner.refreshProjectGrant(recovered)).resolves.toEqual({ status: "committed" });
    expect(owner.snapshot()).toMatchObject({
      projects: expect.arrayContaining([
        { id: "project-a", name: "Alpha", root: "/work/alpha", availability: "available" },
      ]),
      active: {
        projectId: "project-a",
        worktreeId: "worktree-a",
        threadId: "thread-a",
        fileId: "file-a",
      },
    });
  });
});

describe("root-owned region state", () => {
  it("clamps geometry and changes focus in one published snapshot", () => {
    const owner = createWorkbenchStateOwner();
    const seen = vi.fn();
    owner.subscribe(seen);

    owner.updateRegions({
      threads: { visibility: "collapsed", width: 50 },
      files: { visibility: "visible", width: 900, tab: "changes" },
      centre: { mode: "side-by-side", split: 0.9 },
      focus: "thread",
    });

    expect(owner.snapshot().regions).toEqual({
      threads: { visibility: "collapsed", width: 184 },
      files: { visibility: "visible", width: 360, tab: "changes" },
      centre: { mode: "side-by-side", split: 0.7 },
      focus: "thread",
    });
    expect(seen).toHaveBeenCalledOnce();
  });

  it("changes quick access presentation without changing work context", () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const before = owner.snapshot().active;

    owner.setWindowPresentation("quick-access");

    expect(owner.snapshot().window.presentation).toBe("quick-access");
    expect(owner.snapshot().active).toEqual(before);
  });

  it("publishes resolved theme identity without changing work context", () => {
    const owner = createWorkbenchStateOwner(populatedState());
    const before = owner.snapshot().active;
    const seen = vi.fn();
    owner.subscribe(seen);

    owner.setThemeSelection("dracula", "dracula");

    expect(owner.snapshot().theme).toEqual({ selected: "dracula", lastValid: "dracula" });
    expect(owner.snapshot().active).toEqual(before);
    expect(seen).toHaveBeenCalledOnce();
  });
});
