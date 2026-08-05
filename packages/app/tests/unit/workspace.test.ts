import { describe, expect, it, vi } from "vitest";

import type { Platform, WorkspaceListing } from "@/platform";
import { mountWorkspace, type DocumentMount, type MountedDocument } from "@/miniapps/md/workspace";
import type { SuiteContext } from "@/suite/types";

function context(path: string, listing: WorkspaceListing): SuiteContext {
  return {
    launch: { miniapp: "md", path },
    platform: {
      kind: "browser",
      launchRequest: async () => ({ miniapp: "md", path }),
      workspaceFiles: async () => listing,
      readTextFile: async () => "",
      writeTextFile: async () => {},
      fileStamp: async () => null,
      onCloseRequested: () => () => {},
      closeWindow: async () => {},
      openExternal: async () => {},
    } satisfies Platform,
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
    const path = ctx.launch.path!;
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

const listing: WorkspaceListing = {
  root: "/w",
  files: [
    { path: "/w/notes/b.md", relative: "notes/b.md" },
    { path: "/w/a.md", relative: "a.md" },
  ],
};

describe("the markdown workspace", () => {
  it("opens the first markdown file when the launch path is the folder", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w", listing), mounted.mount);

    expect(mounted.paths).toEqual(["/w/a.md"]);
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
    const unsorted: WorkspaceListing = {
      root: "/w",
      files: [
        { path: "/w/z.md", relative: "z.md" },
        { path: "/w/beta/one.md", relative: "beta/one.md" },
        { path: "/w/a.md", relative: "a.md" },
        { path: "/w/alpha/two.md", relative: "alpha/two.md" },
      ],
    };

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
    const nested: WorkspaceListing = {
      root: "/w",
      files: [{ path: "/w/outer/inner/deep.md", relative: "outer/inner/deep.md" }],
    };
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
    expect(mounted.paths).toEqual(["/w/a.md"]);

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
    await vi.waitFor(() => expect(mounted.paths).toEqual(["/w/a.md", "/w/notes/b.md"]));

    expect(mounted.unmounted).toEqual(["/w/a.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("b.md");
    expect(host.querySelector(".md-workspace-document")?.textContent).toBe("open:/w/notes/b.md");
  });

  it("keeps an unsaved document open instead of losing it during a switch", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => false);

    await mountWorkspace(host, context("/w", listing), mounted.mount);
    host.querySelectorAll<HTMLButtonElement>(".md-workspace-file")[1]!.click();
    await Promise.resolve();

    expect(mounted.paths).toEqual(["/w/a.md"]);
    expect(mounted.unmounted).toEqual([]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("a.md");
  });

  it("keeps an explicitly launched file selected", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w/notes/b.md", listing), mounted.mount);

    expect(mounted.paths).toEqual(["/w/notes/b.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("b.md");
  });

  it("keeps a new explicit path instead of replacing it with the first existing file", async () => {
    const host = document.createElement("div");
    const mounted = documentMount(() => true);

    await mountWorkspace(host, context("/w/new.md", listing), mounted.mount);

    expect(mounted.paths).toEqual(["/w/new.md"]);
    expect(host.querySelector('[aria-current="page"]')?.textContent).toBe("new.md");
  });
});
