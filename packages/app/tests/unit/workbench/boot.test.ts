import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform } from "@/platform";
import { bootWorkbench, type WorkbenchMount } from "@/workbench/boot";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { clearCommands, commands } from "@/suite/shortcuts";

const project: ProjectGrant = {
  id: "project-test",
  name: "work",
  root: "/work",
  availability: "available",
  worktrees: [
    {
      id: "worktree-test",
      name: "work",
      root: "/work",
      availability: "available",
    },
  ],
};

function launch(path: string | null) {
  if (path === null) return homeLaunch();
  return {
    project,
    worktreeId: "worktree-test",
    relativePath: path.replace(/^\/work\//, ""),
    problem: null,
  };
}

function stubPlatform(path: string | null = null): Platform {
  return {
    kind: "browser",
    launchRequest: async () => launch(path),
    onOpenRequested: () => () => {},
    pendingOpenRequest: async () => null,
    acceptOpenRequest: async () => null,
    projectGrants: async () => [project],
    removeProjectGrant: async () => project,
    workspaceFiles: async () => {
      throw new Error("no listing");
    },
    readTextFile: async () => "",
    writeTextFile: async () => {},
    fileStamp: async () => null,
    onCloseRequested: () => () => {},
    closeWindow: async () => {},
    openExternal: async () => {},
  };
}

beforeEach(() => clearCommands());

describe("one workbench boot", () => {
  it("passes one grant-relative launch resource without resolving a surface id", async () => {
    const mount = vi.fn<WorkbenchMount>((host, context) => {
      host.textContent = context.launch.relativePath ?? "home";
      return () => host.replaceChildren();
    });
    const host = document.createElement("div");

    await bootWorkbench(host, stubPlatform("/work/plan.md"), mount);

    expect(mount).toHaveBeenCalledOnce();
    expect(mount.mock.calls[0]?.[1].launch).toEqual(launch("/work/plan.md"));
    expect(mount.mock.calls[0]?.[1].state.snapshot()).toMatchObject({
      schemaVersion: 1,
      projects: [{ id: "project-test" }],
      active: {
        projectId: "project-test",
        worktreeId: "worktree-test",
        fileId: expect.stringContaining("plan.md"),
      },
    });
    expect(host.textContent).toBe("plan.md");
    expect(document.title).toBe("zd");
  });

  it("returns one teardown for the mount and root command listeners", async () => {
    const unmount = vi.fn();
    const mount = vi.fn<WorkbenchMount>(() => unmount);
    const host = document.createElement("div");

    const teardown = await bootWorkbench(host, stubPlatform(), mount);
    expect(commands().map(({ id }) => id)).toContain("help.shortcuts");

    teardown();

    expect(unmount).toHaveBeenCalledOnce();
    expect(commands().map(({ id }) => id)).not.toContain("help.shortcuts");
  });

  it("puts a launch failure and its cause on the canvas without rejecting", async () => {
    const platform = stubPlatform();
    platform.launchRequest = async () => {
      throw new Error("launch_request unavailable");
    };
    const host = document.createElement("div");

    await expect(bootWorkbench(host, platform, vi.fn())).resolves.toBeTypeOf("function");

    expect(host.textContent).toContain("zd could not start");
    expect(host.textContent).toContain("launch_request unavailable");
  });

  it("cleans root listeners and explains a mount failure", async () => {
    const mount = vi.fn<WorkbenchMount>(() => {
      throw new Error("editor construction failed");
    });
    const host = document.createElement("div");

    await bootWorkbench(host, stubPlatform(), mount);

    expect(host.textContent).toContain("editor construction failed");
    expect(commands()).toEqual([]);
  });

  it("does not register the retired network-presence command", async () => {
    const host = document.createElement("div");
    const mount = vi.fn<WorkbenchMount>(() => () => {});

    await bootWorkbench(host, stubPlatform(), mount);

    expect(commands().map(({ id }) => id)).not.toContain("suite.ssps");
  });
});
