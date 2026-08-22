import { describe, expect, it, vi } from "vitest";

import { createProjectWorkbenchAdapter, type ProjectGrantPlatform } from "@/workbench/projects";
import { createWorkbenchStateOwner, defaultWorkbenchState } from "@/workbench/state";
import type { ProjectGrant } from "@/workbench/resources";

function grant(id: string, root = `/work/${id}`): ProjectGrant {
  return {
    id,
    name: id,
    root,
    availability: "available",
    worktrees: [{ id: `${id}-root`, name: "main", root, availability: "available" }],
  };
}

function owner() {
  const alpha = grant("alpha");
  const beta = grant("beta");
  return createWorkbenchStateOwner({
    ...defaultWorkbenchState(),
    projects: [
      { id: alpha.id, name: alpha.name, root: alpha.root, availability: alpha.availability },
      { id: beta.id, name: beta.name, root: beta.root, availability: beta.availability },
    ],
    worktrees: [
      { ...alpha.worktrees[0]!, projectId: alpha.id },
      { ...beta.worktrees[0]!, projectId: beta.id },
    ],
    active: {
      projectId: alpha.id,
      worktreeId: alpha.worktrees[0]!.id,
      threadId: null,
      fileId: null,
    },
  });
}

function platform(choice: ProjectGrant | null = null): ProjectGrantPlatform & {
  chooseProject: ReturnType<typeof vi.fn>;
  removeProjectGrant: ReturnType<typeof vi.fn>;
  recoverProjectGrant: ReturnType<typeof vi.fn>;
} {
  return {
    chooseProject: vi.fn(async () => choice),
    removeProjectGrant: vi.fn(async (projectId: string) => grant(projectId)),
    recoverProjectGrant: vi.fn(async () => null),
  };
}

describe("the root Projects adapter", () => {
  it("exposes one presentation snapshot and maps root publications", async () => {
    const state = owner();
    const adapter = createProjectWorkbenchAdapter(state, platform());
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);

    expect(adapter.snapshot()).toMatchObject({
      projects: [
        { id: "alpha", order: 0 },
        { id: "beta", order: 1 },
      ],
      active: { projectId: "alpha", projectRoot: "/work/alpha" },
    });

    await adapter.activateProject("beta");
    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ active: expect.objectContaining({ projectId: "beta" }) }),
    );

    unsubscribe();
    await adapter.activateProject("alpha");
    expect(listener).toHaveBeenCalledOnce();
  });

  it("accepts only a grant returned through the native chooser boundary", async () => {
    const gamma = grant("gamma");
    const native = platform(gamma);
    const adapter = createProjectWorkbenchAdapter(owner(), native);

    await expect(adapter.chooseProject()).resolves.toBe(gamma);
    await expect(adapter.acceptChosenProject(gamma)).resolves.toEqual({ status: "committed" });
    expect(adapter.snapshot()).toMatchObject({
      projects: [{ id: "alpha" }, { id: "beta" }, { id: "gamma" }],
      active: { projectId: "gamma", worktreeId: "gamma-root" },
    });
  });

  it("does not revoke native authority when project work refuses removal", async () => {
    const state = owner();
    state.registerProjectRemovalGuard({
      id: "dirty-beta",
      prepareRemoval: ({ projectId }) =>
        projectId === "beta"
          ? { status: "refused", reason: "README.md has unsaved work" }
          : { status: "ready" },
    });
    const native = platform();
    const adapter = createProjectWorkbenchAdapter(state, native);

    await expect(adapter.removeProject("beta")).resolves.toMatchObject({
      status: "refused",
      reason: "README.md has unsaved work",
    });
    expect(native.removeProjectGrant).not.toHaveBeenCalled();
    expect(adapter.snapshot().projects).toHaveLength(2);
  });

  it("revokes native authority inside the same guarded removal operation", async () => {
    const native = platform();
    const adapter = createProjectWorkbenchAdapter(owner(), native);

    await expect(adapter.removeProject("alpha")).resolves.toEqual({ status: "committed" });
    expect(native.removeProjectGrant).toHaveBeenCalledExactlyOnceWith("alpha");
    expect(adapter.snapshot()).toMatchObject({
      projects: [{ id: "beta" }],
      active: { projectId: "beta" },
    });
  });

  it("keeps an unavailable project visible when recovery is cancelled", async () => {
    const state = owner();
    const native = platform();
    const adapter = createProjectWorkbenchAdapter(state, native);

    await expect(adapter.recoverProject("beta")).resolves.toEqual({
      status: "refused",
      reason: "Project recovery was cancelled",
    });
    expect(adapter.snapshot().projects.map(({ id }) => id)).toEqual(["alpha", "beta"]);
  });

  it("applies a recovered native grant while retaining its stable project identity", async () => {
    const state = owner();
    const native = platform();
    native.recoverProjectGrant.mockResolvedValue(grant("beta", "/moved/beta"));
    const adapter = createProjectWorkbenchAdapter(state, native);

    await expect(adapter.recoverProject("beta")).resolves.toEqual({ status: "committed" });
    expect(native.recoverProjectGrant).toHaveBeenCalledExactlyOnceWith("beta");
    expect(adapter.snapshot().projects[1]).toMatchObject({
      id: "beta",
      root: "/moved/beta",
      recovery: null,
    });
  });
});
