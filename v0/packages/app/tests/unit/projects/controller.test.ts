import { describe, expect, it, vi } from "vitest";

import { ProjectsController } from "@/projects/controller";
import type {
  ProjectActionResult,
  ProjectWorkbenchAdapter,
  ProjectWorkbenchSnapshot,
} from "@/projects/types";
import type { ProjectGrant } from "@/workbench/resources";

const committed: ProjectActionResult = { status: "committed" };

function project(id: string, root = `/work/${id}`) {
  return {
    id,
    name: id,
    root,
    order: id === "alpha" ? 0 : id === "beta" ? 1 : 2,
    availability: "available" as const,
    worktrees: [{ id: `${id}-root`, name: "main", root, availability: "available" as const }],
    recovery: null,
  };
}

function grant(id: string, root = `/work/${id}`): ProjectGrant {
  return {
    id,
    name: id,
    root,
    availability: "available",
    worktrees: [{ id: `${id}-root`, name: "main", root, availability: "available" }],
  };
}

function adapter(
  snapshot: ProjectWorkbenchSnapshot,
  choice: ProjectGrant | null = null,
): ProjectWorkbenchAdapter & {
  acceptChosenProject: ReturnType<typeof vi.fn>;
  activateProject: ReturnType<typeof vi.fn>;
  reorderProjects: ReturnType<typeof vi.fn>;
  removeProject: ReturnType<typeof vi.fn>;
  recoverProject: ReturnType<typeof vi.fn>;
} {
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    chooseProject: async () => choice,
    acceptChosenProject: vi.fn(async () => committed),
    activateProject: vi.fn(async () => committed),
    reorderProjects: vi.fn(async () => committed),
    removeProject: vi.fn(async () => committed),
    recoverProject: vi.fn(async () => committed),
  };
}

function snapshot(): ProjectWorkbenchSnapshot {
  return {
    projects: [project("alpha"), project("beta")],
    active: {
      projectId: "alpha",
      projectRoot: "/work/alpha",
      worktreeId: "alpha-root",
      worktreeRoot: "/work/alpha",
      threadId: "thread-alpha",
      fileId: "file-alpha",
    },
  };
}

describe("the Projects controller", () => {
  it("activates an existing canonical root instead of accepting a duplicate identity", async () => {
    const workbench = adapter(snapshot(), grant("competing-id", "/work/beta"));
    const projects = new ProjectsController(workbench);

    await projects.addProject();

    expect(workbench.activateProject).toHaveBeenCalledExactlyOnceWith("beta");
    expect(workbench.acceptChosenProject).not.toHaveBeenCalled();
  });

  it("accepts only the native-approved grant returned by the chooser", async () => {
    const chosen = grant("gamma");
    const workbench = adapter(snapshot(), chosen);
    const projects = new ProjectsController(workbench);

    await projects.addProject();

    expect(workbench.acceptChosenProject).toHaveBeenCalledExactlyOnceWith(chosen);
  });

  it("treats picker cancellation as a quiet no-op", async () => {
    const workbench = adapter(snapshot());
    const projects = new ProjectsController(workbench);

    await expect(projects.addProject()).resolves.toBeNull();
    expect(workbench.acceptChosenProject).not.toHaveBeenCalled();
    expect(workbench.activateProject).not.toHaveBeenCalled();
  });

  it("routes pointer, keyboard, and shortcut activation through the same adapter method", async () => {
    const workbench = adapter(snapshot());
    const projects = new ProjectsController(workbench);

    await projects.activateProject("beta");
    await projects.activateShortcut(2);

    expect(workbench.activateProject).toHaveBeenNthCalledWith(1, "beta");
    expect(workbench.activateProject).toHaveBeenNthCalledWith(2, "beta");
  });

  it("keeps projects beyond the shortcut range reachable by direct activation", async () => {
    const workbench = adapter({
      projects: Array.from({ length: 10 }, (_, index) => project(`project-${index + 1}`)),
      active: null,
    });
    const projects = new ProjectsController(workbench);

    await expect(projects.activateShortcut(10)).resolves.toBeNull();
    await projects.activateProject("project-10");

    expect(workbench.activateProject).toHaveBeenCalledExactlyOnceWith("project-10");
  });

  it("submits one complete stable ordering operation", async () => {
    const workbench = adapter(snapshot());
    const projects = new ProjectsController(workbench);

    await projects.moveProject("alpha", 2);

    expect(workbench.reorderProjects).toHaveBeenCalledExactlyOnceWith(["beta", "alpha"]);
  });

  it("does not mutate the list when removal is refused for named dirty or live work", async () => {
    const current = snapshot();
    const workbench = adapter(current);
    workbench.removeProject.mockResolvedValue({
      status: "refused",
      reason: "README.md has unsaved work and Build is still running",
      recovery: { label: "Review project work", run: vi.fn() },
    });
    const projects = new ProjectsController(workbench);

    const result = await projects.removeProject("alpha");

    expect(result).toMatchObject({
      status: "refused",
      reason: "README.md has unsaved work and Build is still running",
    });
    expect(projects.snapshot()).toBe(current);
  });

  it("leaves recovery and exact context restoration to the one workbench adapter", async () => {
    const current = snapshot();
    const workbench = adapter(current);
    const projects = new ProjectsController(workbench);

    await projects.recoverProject("beta");
    await projects.activateProject("alpha");

    expect(workbench.recoverProject).toHaveBeenCalledExactlyOnceWith("beta");
    expect(workbench.activateProject).toHaveBeenCalledExactlyOnceWith("alpha");
    expect(projects.snapshot().active).toEqual(current.active);
  });
});
