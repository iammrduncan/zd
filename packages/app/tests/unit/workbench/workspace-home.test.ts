import { describe, expect, it, vi } from "vitest";

import { attachWorkspacePersistence, mountWorkspaceHome } from "@/workbench/workspace-home";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner } from "@/workbench/state";

const alpha: ProjectGrant = {
  id: "project-alpha",
  name: "alpha",
  root: "/work/alpha",
  availability: "available",
  worktrees: [
    {
      id: "worktree-alpha",
      name: "alpha",
      root: "/work/alpha",
      availability: "available",
    },
  ],
};

const beta: ProjectGrant = {
  id: "project-beta",
  name: "beta",
  root: "/work/beta",
  availability: "available",
  worktrees: [
    {
      id: "worktree-beta",
      name: "beta",
      root: "/work/beta",
      availability: "available",
    },
  ],
};

describe("the no-path workspace launcher", () => {
  it("offers a folder picker and opens a recent multi-project workspace", async () => {
    const owner = createWorkbenchStateOwner();
    const platform = {
      chooseProject: vi.fn(async () => alpha),
      recentWorkspaces: vi.fn(async () => [
        {
          id: "workspace-one",
          name: "alpha + beta",
          kind: "workspace" as const,
          projectNames: ["alpha", "beta"],
          lastOpened: 10,
        },
      ]),
      openWorkspace: vi.fn(async () => [alpha]),
    };
    const host = document.createElement("main");

    const unmount = mountWorkspaceHome(host, owner, platform);
    await vi.waitFor(() =>
      expect(host.querySelector("[data-recent-workspace='workspace-one']")).not.toBeNull(),
    );

    expect(host.querySelector<HTMLButtonElement>("[data-open-project]")?.textContent).toBe(
      "Open Folder…",
    );
    host.querySelector<HTMLButtonElement>("[data-recent-workspace='workspace-one']")!.click();

    await vi.waitFor(() =>
      expect(owner.snapshot().projects.map(({ id }) => id)).toEqual([alpha.id]),
    );
    expect(platform.openWorkspace).toHaveBeenCalledWith("workspace-one");
    expect(owner.snapshot().active.projectId).toBe(alpha.id);
    unmount();
  });

  it("persists each changed ordered project set as one workspace setup", async () => {
    const owner = createWorkbenchStateOwner();
    const saveWorkspace = vi.fn(async () => ({
      id: "workspace-one",
      name: "alpha",
      kind: "project" as const,
      projectNames: ["alpha"],
      lastOpened: 10,
    }));
    const detach = attachWorkspacePersistence(owner, { saveWorkspace });

    await owner.applyLaunch(
      {
        ...homeLaunch(),
        project: alpha,
        worktreeId: alpha.worktrees[0]!.id,
      },
      [alpha],
    );

    await vi.waitFor(() => expect(saveWorkspace).toHaveBeenCalledWith([alpha.id]));
    await owner.acceptProjectGrant(beta);
    await owner.reorderProjects([beta.id, alpha.id]);

    await vi.waitFor(() => expect(saveWorkspace).toHaveBeenLastCalledWith([beta.id, alpha.id]));
    detach();
  });
});
