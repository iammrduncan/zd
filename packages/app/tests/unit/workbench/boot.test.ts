import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform } from "@/platform";
import { setTheme } from "@/design/appearance";
import { bootWorkbench, type WorkbenchMount } from "@/workbench/boot";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { clearCommands, commands } from "@/workbench/shortcuts";

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
    chooseProject: async () => null,
    recoverProjectGrant: async () => null,
    removeProjectGrant: async () => project,
    themeConfigFiles: async () => [],
    registerGlobalSummon: async () => ({
      supported: false,
      registered: false,
      shortcut: "CmdOrCtrl+Shift+Space",
      problem: null,
    }),
    onWindowPresentationChanged: () => () => {},
    toggleQuickAccess: async () => "ordinary",
    hideQuickAccess: async () => "ordinary",
    diagnosticsStatus: async () => ({
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: null,
    }),
    enableDiagnostics: async () => ({
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: "unavailable",
    }),
    disableDiagnostics: async () => ({
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: null,
    }),
    recordDiagnostic: async () => ({ recorded: false, problem: null }),
    revealDiagnostics: async () => {},
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
  it("mounts the root-owned project list inside the Threads region", async () => {
    const host = document.createElement("div");

    const unmount = await bootWorkbench(host, stubPlatform());
    const projectRow = host.querySelector<HTMLButtonElement>(
      '[data-project-id="project-test"] .zd-project-row',
    );

    expect(projectRow).not.toBeNull();
    expect(projectRow?.closest('[data-region="threads"]')).not.toBeNull();
    projectRow?.click();
    await vi.waitFor(() =>
      expect(
        host
          .querySelector('[data-project-id="project-test"] .zd-project-row')
          ?.getAttribute("aria-current"),
      ).toBe("true"),
    );

    unmount();
  });

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

  it("reports one invalid theme locally without preventing the workbench", async () => {
    const platform = stubPlatform();
    platform.themeConfigFiles = async () => [
      { fileName: "broken.theme.config", contents: "{", problem: null },
    ];
    const mount = vi.fn<WorkbenchMount>((host) => {
      const content = document.createElement("main");
      content.textContent = "workbench ready";
      host.append(content);
      return () => content.remove();
    });
    const host = document.createElement("div");

    const teardown = await bootWorkbench(host, platform, mount);

    expect(mount).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("workbench ready");
    expect(host.querySelector(".zd-local-notice")?.textContent).toContain("broken.theme.config");
    expect(document.documentElement.dataset.themeName).toBe("current-light");
    teardown();
  });

  it("applies root-owned theme changes without remounting the workbench", async () => {
    let state: Parameters<WorkbenchMount>[1]["state"] | null = null;
    const mount = vi.fn<WorkbenchMount>((host, context) => {
      state = context.state;
      host.append(document.createElement("main"));
      return () => host.replaceChildren();
    });
    const host = document.createElement("div");
    const teardown = await bootWorkbench(host, stubPlatform(), mount);

    setTheme("dracula");

    expect(mount).toHaveBeenCalledOnce();
    expect(document.documentElement.dataset.themeName).toBe("dracula");
    expect(document.documentElement.style.getPropertyValue("--surface-canvas")).toBe("#282a36");
    expect(state!.snapshot().theme).toEqual({ selected: "dracula", lastValid: "dracula" });
    teardown();
  });

  it("shows a native shortcut conflict without blocking ordinary launch", async () => {
    const platform = stubPlatform();
    platform.registerGlobalSummon = async () => ({
      supported: true,
      registered: false,
      shortcut: "CmdOrCtrl+Shift+Space",
      problem: "shortcut is already registered",
    });
    const mount = vi.fn<WorkbenchMount>((host) => {
      host.append(document.createElement("main"));
      return () => host.replaceChildren();
    });
    const host = document.createElement("div");

    const teardown = await bootWorkbench(host, platform, mount);

    expect(mount).toHaveBeenCalledOnce();
    expect(host.querySelector(".zd-local-notice")?.textContent).toContain(
      "shortcut is already registered",
    );
    expect(host.querySelector(".zd-local-notice")?.textContent).toContain("relaunch zd");
    teardown();
  });
});
