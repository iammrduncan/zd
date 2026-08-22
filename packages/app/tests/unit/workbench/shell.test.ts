import { describe, expect, it, vi } from "vitest";

import type { Platform } from "@/platform";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
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
    removeProjectGrant: async () => {
      throw new Error("no grants");
    },
    themeConfigFiles: async () => [],
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
  return { launch: homeLaunch(), platform, state: createWorkbenchStateOwner() };
}

describe("the root workbench shell", () => {
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
});
