import { beforeEach, describe, expect, it, vi } from "vitest";

import { unavailableAttentionPlatform, unavailableThreadWorktree, type Platform } from "@/platform";
import { setTheme } from "@/design/appearance";
import { unavailableFileTreeAdapter } from "@/files";
import { unavailableGitAdapter } from "@/git";
import { unavailableTerminalAdapter } from "@/terminal";
import { bootWorkbench, type WorkbenchMount } from "@/workbench/boot";
import { homeLaunch, type ProjectGrant } from "@/workbench/resources";
import { clearCommands, commands } from "@/workbench/shortcuts";
import { forgetPreferences, setDiagnosticsEnabled } from "@/workbench/preferences";

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
    ...unavailableAttentionPlatform,
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
    terminal: unavailableTerminalAdapter,
    createThreadWorktree: unavailableThreadWorktree,
    fileTree: unavailableFileTreeAdapter,
    git: unavailableGitAdapter,
    workspaceFiles: async () => {
      throw new Error("no listing");
    },
    readTextFile: async () => "",
    readBoundedFile: async () => ({ status: "unavailable", problem: "unused test boundary" }),
    writeTextFile: async () => {},
    saveClipboardImage: async () => ({ relativePath: "docs/screenshots/test.png" }),
    fileStamp: async () => null,
    onCloseRequested: () => () => {},
    closeWindow: async () => {},
    openExternal: async () => {},
  };
}

beforeEach(() => {
  clearCommands();
  forgetPreferences();
  window.localStorage.clear();
});

describe("one workbench boot", () => {
  it("does not construct diagnostic transport during an ordinary default-off boot", async () => {
    const platform = stubPlatform();
    platform.enableDiagnostics = vi.fn(platform.enableDiagnostics);
    platform.disableDiagnostics = vi.fn(platform.disableDiagnostics);
    platform.recordDiagnostic = vi.fn(platform.recordDiagnostic);
    const host = document.createElement("div");

    const teardown = await bootWorkbench(host, platform, () => () => {});
    teardown();

    expect(platform.enableDiagnostics).not.toHaveBeenCalled();
    expect(platform.disableDiagnostics).not.toHaveBeenCalled();
    expect(platform.recordDiagnostic).not.toHaveBeenCalled();
  });

  it("starts a persisted opt-in before recording launch and closes on teardown", async () => {
    setDiagnosticsEnabled(true);
    const platform = stubPlatform();
    platform.enableDiagnostics = vi.fn(async () => ({
      enabled: true,
      sessionId: "session-1",
      backgroundSampling: true,
      problem: null,
    }));
    platform.disableDiagnostics = vi.fn(async () => ({
      enabled: false,
      sessionId: null,
      backgroundSampling: false,
      problem: null,
    }));
    platform.recordDiagnostic = vi.fn(async () => ({ recorded: true, problem: null }));
    const host = document.createElement("div");

    const teardown = await bootWorkbench(host, platform, (_host, context) => {
      expect(context.instrumentation.snapshot().enabled).toBe(true);
      return () => {};
    });

    expect(platform.enableDiagnostics).toHaveBeenCalledOnce();
    expect(platform.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ recordType: "span", operation: "workbench.launch" }),
    );
    teardown();
    await vi.waitFor(() => expect(platform.disableDiagnostics).toHaveBeenCalledOnce());
  });
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

  it("mounts nested project threads and the reconciled file tree in their root regions", async () => {
    const fileTree = {
      snapshot: vi.fn(async (request) => ({
        status: "ready" as const,
        projectId: request.projectId,
        worktreeId: request.worktreeId,
        revision: "revision-1",
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
        ],
        truncated: false,
        ignoredTruncated: false,
        unreadableDirectories: 0,
        elapsedMicros: 1,
      })),
    };
    const git = {
      ...unavailableGitAdapter,
      status: vi.fn(async (scope) => ({
        scope,
        availability: "available" as const,
        entries: [
          {
            id: "change-readme",
            path: "README.md",
            previousPath: null,
            state: "modified" as const,
            indexState: null,
            worktreeState: "modified" as const,
            submodule: false,
          },
        ],
        truncated: false,
        problem: null,
      })),
    };
    const platform: Platform = { ...stubPlatform("/work/README.md"), fileTree, git };
    const host = document.createElement("div");

    const unmount = await bootWorkbench(host, platform);

    expect(
      host.querySelector('[data-project-id="project-test"] .zd-project-threads'),
    ).not.toBeNull();
    const row = await vi.waitFor(() => {
      const current = host.querySelector<HTMLElement>('[data-file-path="README.md"]');
      expect(current).not.toBeNull();
      return current!;
    });
    expect(row.closest('[data-region="files"]')).not.toBeNull();
    await vi.waitFor(() => expect(row.dataset.gitState).toBe("changed"));
    expect(commands().map(({ id }) => id)).toContain("files.filter");

    unmount();
  });

  it("mounts Changes through the root scope and overlays a read-only diff", async () => {
    const fileTree = {
      snapshot: vi.fn(async (request) => ({
        status: "ready" as const,
        projectId: request.projectId,
        worktreeId: request.worktreeId,
        revision: "revision-1",
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
        ],
        truncated: false,
        ignoredTruncated: false,
        unreadableDirectories: 0,
        elapsedMicros: 1,
      })),
    };
    const git = {
      ...unavailableGitAdapter,
      status: vi.fn(async (scope) => ({
        scope,
        availability: "available" as const,
        entries: [
          {
            id: "change-readme",
            path: "README.md",
            previousPath: null,
            state: "modified" as const,
            indexState: null,
            worktreeState: "modified" as const,
            submodule: false,
          },
        ],
        truncated: false,
        problem: null,
      })),
      history: vi.fn(async (request) => ({
        scope: request.scope,
        availability: "available" as const,
        commits: [],
        nextCursor: null,
        truncated: false,
        problem: null,
      })),
      diff: vi.fn(async (request) => ({
        scope: request.scope,
        availability: "available" as const,
        base: {
          status: "text" as const,
          identity: "base-readme",
          path: "README.md",
          revision: "a".repeat(40),
          text: "before\n",
          byteLength: 7,
        },
        head: {
          status: "text" as const,
          identity: "head-readme",
          path: "README.md",
          revision: "working-tree",
          text: "after\n",
          byteLength: 6,
        },
        problem: null,
      })),
    };
    const platform: Platform = {
      ...stubPlatform("/work/README.md"),
      fileTree,
      git,
      readBoundedFile: vi.fn(async () => ({
        status: "text" as const,
        text: "live\n",
        byteLength: 5,
        writable: true,
      })),
    };
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await bootWorkbench(host, platform);

    host.querySelector<HTMLButtonElement>("#zd-changes-tab")!.click();
    const row = await vi.waitFor(() => {
      const current = host.querySelector<HTMLButtonElement>("[data-change-id='change-readme']");
      expect(current).not.toBeNull();
      return current!;
    });
    expect(row.closest("[data-workbench-slot='changes']")).not.toBeNull();
    expect(git.history).toHaveBeenCalledWith({
      scope: { projectId: "project-test", worktreeId: "worktree-test" },
      cursor: null,
      pageSize: 50,
    });
    row.click();
    await vi.waitFor(() => expect(host.querySelectorAll("[data-buffer-identity]")).toHaveLength(3));
    expect(host.querySelector<HTMLElement>("[data-changes-surface='live']")?.hidden).toBe(true);
    expect(git.diff).toHaveBeenCalledWith({
      scope: { projectId: "project-test", worktreeId: "worktree-test" },
      source: { kind: "working-tree", changeId: "change-readme" },
    });

    host.querySelector<HTMLButtonElement>("[aria-label='Close file comparison']")!.click();
    expect(host.querySelector<HTMLElement>("[data-changes-surface='live']")?.hidden).toBe(false);
    unmount();
    host.remove();
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
      schemaVersion: 2,
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
