import { describe, expect, it, vi } from "vitest";

import type { Platform, WorkspaceListing } from "@/platform";
import { mountWorkspace, type DocumentMount, type MountedDocument } from "@/miniapps/md/workspace";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
import type { LaunchRequest, ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

function projectFor(listing: WorkspaceListing): ProjectGrant {
  const name = listing.root.split(/[\\/]/).at(-1) ?? listing.root;
  return {
    id: listing.projectId,
    name,
    root: listing.root,
    availability: "available",
    worktrees: [
      {
        id: listing.worktreeId,
        name,
        root: listing.root,
        availability: "available",
      },
    ],
  };
}

function launch(path: string, listing: WorkspaceListing): LaunchRequest {
  return {
    project: projectFor(listing),
    worktreeId: listing.worktreeId,
    relativePath: path === listing.root ? null : path.slice(listing.root.length + 1),
    problem: null,
  };
}

function workspace(
  root: string,
  relativePaths: readonly string[],
  projectId = "project-w",
  worktreeId = "worktree-w",
): WorkspaceListing {
  return {
    projectId,
    worktreeId,
    root,
    files: relativePaths.map((relative) => ({
      resource: { projectId, worktreeId, relativePath: relative },
      relative,
    })),
  };
}

function context(path: string, listing: WorkspaceListing): WorkbenchRuntimeContext {
  const request = launch(path, listing);
  const project = projectFor(listing);
  return {
    launch: request,
    platform: {
      kind: "browser",
      launchRequest: async () => request,
      onOpenRequested: () => () => {},
      pendingOpenRequest: async () => null,
      acceptOpenRequest: async () => null,
      projectGrants: async () => [project],
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
      workspaceFiles: async () => listing,
      readTextFile: async () => "",
      writeTextFile: async () => {},
      fileStamp: async () => null,
      onCloseRequested: () => () => {},
      closeWindow: async () => {},
      openExternal: async () => {},
    } satisfies Platform,
    state: createWorkbenchStateOwner(workbenchStateFromGrants([project], request)),
  };
}

function documentMount(switchable: () => boolean): {
  mount: DocumentMount;
  paths: string[];
  unmounted: string[];
} {
  const paths: string[] = [];
  const unmounted: string[] = [];
  const mount: DocumentMount = async (host, ctx) => {
    const path = ctx.launch.relativePath!;
    paths.push(path);
    host.textContent = `open:${path}`;
    return {
      canSwitch: switchable,
      unmount: () => {
        unmounted.push(path);
        host.replaceChildren();
      },
    } satisfies MountedDocument;
  };
  return { mount, paths, unmounted };
}

const listing = workspace("/w", ["notes/b.md", "a.md"]);

describe("the markdown workspace", () => {
  it("opens the first markdown file when the launch path is the folder", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w", listing), mounted.mount);

    expect(mounted.paths).toEqual(["a.md"]);
    expect(
      [...host.querySelectorAll(".md-workspace-file")].map((file) => file.textContent),
    ).toEqual(["b.md", "a.md"]);
    expect(host.querySelector('[role="tree"]')).not.toBeNull();
    expect(host.querySelector(".md-workspace-folder")?.textContent).toBe("notes");
    expect(host.querySelector(".md-workspace-folder")?.getAttribute("aria-expanded")).toBe("false");
    expect(host.querySelector<HTMLElement>('[role="group"]')?.hidden).toBe(true);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("a.md");
  });

  it("sorts folders before files and alphabetizes each group", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);
    const unsorted = workspace("/w", ["z.md", "beta/one.md", "a.md", "alpha/two.md"]);

    await mountWorkspace(host, context("/w", unsorted), mounted.mount);

    const root = host.querySelector(".md-workspace-tree")!;
    expect([...root.children].map((item) => item.firstElementChild?.textContent)).toEqual([
      "alpha",
      "beta",
      "a.md",
      "z.md",
    ]);
  });

  it("expands and collapses a folder subtree from its context menu", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);
    const nested = workspace("/w", ["outer/inner/deep.md"]);
    const unmount = await mountWorkspace(host, context("/w", nested), mounted.mount);
    const folders = [...host.querySelectorAll<HTMLButtonElement>(".md-workspace-folder")];

    folders[0]!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    const expand = document.body.querySelector<HTMLButtonElement>(
      '.md-file-tree-menu button[data-action="expand"]',
    );
    expect(expand).not.toBeNull();
    expand?.click();
    expect(folders.map((folder) => folder.getAttribute("aria-expanded"))).toEqual(["true", "true"]);
    expect(
      [...host.querySelectorAll<HTMLElement>(".md-workspace-group")].map((group) => group.hidden),
    ).toEqual([false, false]);

    folders[0]!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 60 }),
    );
    document.body
      .querySelector<HTMLButtonElement>('.md-file-tree-menu button[data-action="collapse"]')!
      .click();
    expect(folders.map((folder) => folder.getAttribute("aria-expanded"))).toEqual([
      "false",
      "false",
    ]);
    expect(
      [...host.querySelectorAll<HTMLElement>(".md-workspace-group")].map((group) => group.hidden),
    ).toEqual([true, true]);

    unmount();
    expect(document.body.querySelector(".md-file-tree-menu")).toBeNull();
  });

  it("expands and collapses a directory without changing the open file", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w", listing), mounted.mount);
    const folder = host.querySelector<HTMLButtonElement>(".md-workspace-folder")!;
    const children = host.querySelector<HTMLElement>('[role="group"]')!;

    expect(folder.getAttribute("aria-expanded")).toBe("false");
    expect(children.hidden).toBe(true);
    expect(mounted.paths).toEqual(["a.md"]);

    folder.click();
    expect(folder.getAttribute("aria-expanded")).toBe("true");
    expect(children.hidden).toBe(false);

    folder.click();
    expect(folder.getAttribute("aria-expanded")).toBe("false");
    expect(children.hidden).toBe(true);
  });

  it("opens another file from the sidebar without retaining the previous document", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w", listing), mounted.mount);
    host.querySelector<HTMLButtonElement>('.md-workspace-file[title="notes/b.md"]')!.click();
    await vi.waitFor(() => expect(mounted.paths).toEqual(["a.md", "notes/b.md"]));

    expect(mounted.unmounted).toEqual(["a.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("b.md");
    expect(host.querySelector(".md-workspace-document")?.textContent).toBe("open:notes/b.md");
  });

  it("keeps an unsaved document open instead of losing it during a switch", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => false);

    await mountWorkspace(host, context("/w", listing), mounted.mount);
    host.querySelectorAll<HTMLButtonElement>(".md-workspace-file")[1]!.click();
    await Promise.resolve();

    expect(mounted.paths).toEqual(["a.md"]);
    expect(mounted.unmounted).toEqual([]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("a.md");
  });

  it("keeps an explicitly launched file selected", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w/notes/b.md", listing), mounted.mount);

    expect(mounted.paths).toEqual(["notes/b.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("b.md");
  });

  it("keeps a new explicit path instead of replacing it with the first existing file", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w/new.md", listing), mounted.mount);

    expect(mounted.paths).toEqual(["new.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("new.md");
  });

  it("accepts a Finder open only after the current document can switch", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);
    const next = workspace("/next", ["plan.md"], "project-next", "worktree-next");
    let openRequested: (() => void) | undefined;
    let activeListing = listing;
    let accepted = 0;
    const initial = context("/w/a.md", listing);
    initial.platform.workspaceFiles = async () => activeListing;
    initial.platform.onOpenRequested = (handler) => {
      openRequested = handler;
      return () => {
        openRequested = undefined;
      };
    };
    const nextLaunch = launch("/next/plan.md", next);
    initial.platform.pendingOpenRequest = async () => nextLaunch;
    initial.platform.acceptOpenRequest = async () => {
      accepted += 1;
      activeListing = next;
      return nextLaunch;
    };

    const unmount = await mountWorkspace(host, initial, mounted.mount);
    openRequested?.();
    await vi.waitFor(() => expect(mounted.paths).toEqual(["a.md", "plan.md"]));

    expect(accepted).toBe(1);
    expect(mounted.unmounted).toEqual(["a.md"]);
    expect(host.querySelector(".md-workspace-sidebar")?.getAttribute("aria-label")).toContain(
      "/next",
    );

    unmount();
    expect(openRequested).toBeUndefined();
  });

  it("leaves a Finder open pending while the current document is unsaved", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => false);
    let openRequested: (() => void) | undefined;
    let accepted = 0;
    const initial = context("/w/a.md", listing);
    initial.platform.onOpenRequested = (handler) => {
      openRequested = handler;
      return () => {};
    };
    const nextLaunch = launch(
      "/next/plan.md",
      workspace("/next", ["plan.md"], "project-next", "worktree-next"),
    );
    initial.platform.pendingOpenRequest = async () => nextLaunch;
    initial.platform.acceptOpenRequest = async () => {
      accepted += 1;
      return nextLaunch;
    };

    await mountWorkspace(host, initial, mounted.mount);
    openRequested?.();
    await Promise.resolve();

    expect(accepted).toBe(0);
    expect(mounted.paths).toEqual(["a.md"]);
    expect(mounted.unmounted).toEqual([]);
  });
});
