import { describe, expect, it, vi } from "vitest";

import type { Platform } from "@/platform";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { WorkbenchMount, WorkbenchRuntimeContext } from "@/workbench/runtime";
import { mountWorkbenchShell } from "@/workbench/shell";
import { createWorkbenchStateOwner } from "@/workbench/state";
import { homeLaunch } from "@/workbench/resources";

function context(): WorkbenchRuntimeContext {
  const platform: Platform = {
    kind: "browser",
    launchRequest: async () => homeLaunch(),
    onOpenRequested: () => () => {},
    pendingOpenRequest: async () => null,
    acceptOpenRequest: async () => null,
    projectGrants: async () => [],
    chooseProject: async () => null,
    recoverProjectGrant: async () => null,
    removeProjectGrant: async () => {
      throw new Error("no grants");
    },
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
  return {
    launch: homeLaunch(),
    platform,
    state: createWorkbenchStateOwner(),
    instrumentation: createUnavailableInstrumentationClient(),
  };
}

describe("the root workbench shell", () => {
  it("mounts every feature through a named region host and tears them down in reverse", async () => {
    const host = document.createElement("div");
    const mounted: string[] = [];
    const unmounted: string[] = [];
    const mount =
      (name: string): WorkbenchMount =>
      (region) => {
        mounted.push(`${name}:${region.dataset.workbenchSlot}`);
        region.replaceChildren(document.createTextNode(name));
        return () => unmounted.push(name);
      };

    const unmount = await mountWorkbenchShell(host, context(), {
      threads: mount("threads"),
      thread: mount("thread"),
      file: mount("file"),
      files: mount("files"),
      changes: mount("changes"),
    });

    expect(mounted).toEqual([
      "threads:threads",
      "thread:thread",
      "file:file",
      "files:files",
      "changes:changes",
    ]);

    unmount();
    expect(unmounted).toEqual(["changes", "files", "file", "thread", "threads"]);
  });

  it("tears down mounted sibling regions when one feature cannot mount", async () => {
    const host = document.createElement("div");
    const stopThreads = vi.fn();

    await expect(
      mountWorkbenchShell(host, context(), {
        threads: () => stopThreads,
        file: () => {
          throw new Error("file surface unavailable");
        },
      }),
    ).rejects.toThrow("file surface unavailable");

    expect(stopThreads).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });

  it("owns Threads, centre content, and Files/Changes in the specified order", async () => {
    const host = document.createElement("div");
    const mountedContent = vi.fn(() => () => {});

    await mountWorkbenchShell(host, context(), mountedContent);

    const shell = host.querySelector(".zd-workbench")!;
    expect(
      [...shell.querySelectorAll<HTMLElement>(":scope > [data-region]")].map(
        (region) => region.dataset.region,
      ),
    ).toEqual(["threads", "centre", "files"]);
    expect(shell.querySelector('[data-region="threads"]')?.getAttribute("aria-label")).toBe(
      "Threads",
    );
    expect(shell.querySelector('[data-region="files"]')?.getAttribute("aria-label")).toBe(
      "Files and Changes",
    );
    expect(mountedContent).toHaveBeenCalledExactlyOnceWith(
      shell.querySelector('[data-centre-surface="file"]'),
      expect.objectContaining({ state: expect.anything() }),
    );
  });

  it("renders Files and Changes as one accessible state-owned tab pair", async () => {
    const runtime = context();
    const host = document.createElement("div");
    await mountWorkbenchShell(host, runtime, () => () => {});

    const tabs = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent)).toEqual(["FILES", "CHANGES"]);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["true", "false"]);

    tabs[1]!.click();

    expect(runtime.state.snapshot().regions.files.tab).toBe("changes");
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual(["false", "true"]);
  });

  it("projects one geometry snapshot into attributes and CSS variables", async () => {
    const runtime = context();
    const host = document.createElement("div");
    await mountWorkbenchShell(host, runtime, () => () => {});

    runtime.state.updateRegions({
      threads: { visibility: "collapsed", width: 244 },
      files: { visibility: "hidden", width: 320, tab: "changes" },
      centre: { mode: "side-by-side", split: 0.55 },
      focus: "thread",
    });

    const shell = host.querySelector<HTMLElement>(".zd-workbench")!;
    expect(shell.dataset.threadsVisibility).toBe("collapsed");
    expect(shell.dataset.filesVisibility).toBe("hidden");
    expect(shell.dataset.centreMode).toBe("side-by-side");
    expect(shell.dataset.focusRegion).toBe("thread");
    expect(shell.style.getPropertyValue("--workbench-threads-width")).toBe("244px");
    expect(shell.style.getPropertyValue("--workbench-files-width")).toBe("320px");
    expect(shell.style.getPropertyValue("--workbench-centre-split")).toBe("55%");
  });

  it("gives invisible dividers keyboard geometry controls", async () => {
    const runtime = context();
    const host = document.createElement("div");
    await mountWorkbenchShell(host, runtime, () => () => {});
    const threads = host.querySelector<HTMLElement>('[data-resizer="threads"]')!;
    const files = host.querySelector<HTMLElement>('[data-resizer="files"]')!;

    threads.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    files.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));

    expect(runtime.state.snapshot().regions.threads.width).toBe(244);
    expect(runtime.state.snapshot().regions.files.width).toBe(288);
    expect([threads.tabIndex, files.tabIndex]).toEqual([0, 0]);
    expect([threads, files].map((separator) => separator.getAttribute("aria-orientation"))).toEqual(
      ["vertical", "vertical"],
    );
  });

  it("unsubscribes and tears down mounted content exactly once", async () => {
    const runtime = context();
    const host = document.createElement("div");
    const unmountContent = vi.fn();
    const unmount = await mountWorkbenchShell(host, runtime, () => unmountContent);

    unmount();
    runtime.state.setWindowPresentation("quick-access");

    expect(unmountContent).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
  });

  it("restores the last meaningful workbench focus when quick access is summoned", async () => {
    const runtime = context();
    const host = document.createElement("div");
    const outside = document.createElement("button");
    document.body.append(host, outside);
    const unmount = await mountWorkbenchShell(host, runtime, () => () => {});
    const changes = host.querySelector<HTMLButtonElement>(
      '[role="tab"][aria-controls="zd-changes-panel"]',
    )!;
    changes.focus();
    outside.focus();
    expect(document.activeElement).toBe(outside);

    runtime.state.setWindowPresentation("quick-access");
    await Promise.resolve();

    expect(document.activeElement).toBe(changes);
    unmount();
    host.remove();
    outside.remove();
  });
});
