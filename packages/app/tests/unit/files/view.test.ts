import { describe, expect, it, vi } from "vitest";

import { FileTreeController, mountFileTree } from "@/files";
import type { FileTreeAdapter, FileTreeResult, NativeFileTreeEntry } from "@/files";

const scope = { projectId: "alpha", worktreeId: "alpha-root" } as const;

function entry(relativePath: string, kind: "directory" | "file" = "file"): NativeFileTreeEntry {
  const index = relativePath.lastIndexOf("/");
  return {
    relativePath,
    parentPath: index < 0 ? null : relativePath.slice(0, index),
    name: relativePath.slice(index + 1),
    kind,
    ignored: false,
    byteLength: kind === "file" ? 10 : null,
    modified: 1,
  };
}

function adapter(entries: readonly NativeFileTreeEntry[]): FileTreeAdapter {
  return {
    snapshot: async () => ({
      ...scope,
      status: "ready",
      revision: "one",
      entries,
      truncated: false,
      ignoredTruncated: false,
      unreadableDirectories: 0,
      elapsedMicros: 1,
    }),
    watch: () => () => {},
  };
}

async function mounted(entries: readonly NativeFileTreeEntry[]) {
  const actions = {
    activateFile: vi.fn(async () => ({ status: "committed" as const })),
    copyPath: vi.fn(async () => {}),
    createEntry: vi.fn(async () => {}),
    renameEntry: vi.fn(async () => {}),
    trashEntry: vi.fn(async () => {}),
  };
  const controller = new FileTreeController(adapter(entries), actions);
  const host = document.createElement("aside");
  const unmount = mountFileTree(host, controller);
  await controller.activate(scope);
  return { actions, controller, host, unmount };
}

describe("Files tree view", () => {
  it("shows an explicit loading row while the bounded snapshot is pending", async () => {
    let resolve!: (result: FileTreeResult) => void;
    const pending = new Promise<FileTreeResult>((complete) => {
      resolve = complete;
    });
    const controller = new FileTreeController({
      snapshot: async () => pending,
      watch: () => () => {},
    });
    const host = document.createElement("aside");
    mountFileTree(host, controller);
    const activation = controller.activate(scope);

    expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading files…");
    resolve({ ...scope, status: "empty", revision: "empty", elapsedMicros: 1 });
    await activation;
  });

  it("renders a compact semantic tree with type and Git state in its accessible name", async () => {
    const fixture = await mounted([entry("docs", "directory"), entry("notes.md")]);
    fixture.controller.reconcileGit(new Map([["notes.md", "modified"]]));
    const notes = fixture.host.querySelector<HTMLElement>('[data-file-path="notes.md"]')!;

    expect(fixture.host.querySelector('[role="tree"]')?.getAttribute("aria-label")).toBe(
      "Project files",
    );
    expect(notes.getAttribute("aria-label")).toBe("notes.md, Markdown file, modified");
    expect(notes.getAttribute("aria-description")).toBe("notes.md");
    expect(notes.dataset.gitState).toBe("changed");
    expect(notes.textContent).not.toMatch(/\bM\b/u);
  });

  it("uses themeable editor icons instead of punctuation stand-ins", async () => {
    const fixture = await mounted([
      entry("docs", "directory"),
      entry("README.md"),
      entry("main.ts"),
      entry("image.png"),
    ]);

    expect(
      fixture.host.querySelector('[data-file-path="docs"] .zd-file-tree-icon')?.classList,
    ).toContain("codicon-folder");
    expect(
      fixture.host.querySelector('[data-file-path="README.md"] .zd-file-tree-icon')?.classList,
    ).toContain("codicon-markdown");
    expect(
      fixture.host.querySelector('[data-file-path="main.ts"] .zd-file-tree-icon')?.classList,
    ).toContain("codicon-code");
    expect(
      fixture.host.querySelector('[data-file-path="image.png"] .zd-file-tree-icon')?.classList,
    ).toContain("codicon-file-media");
    expect(
      fixture.host.querySelector('[data-file-path="README.md"] .zd-file-tree-icon')?.textContent,
    ).toBe("");
  });

  it("bolds recoverable unsaved files and names their state", async () => {
    const fixture = await mounted([entry("notes.md")]);
    fixture.controller.setDirtyPaths(new Set(["notes.md"]));
    const notes = fixture.host.querySelector<HTMLElement>('[data-file-path="notes.md"]')!;

    expect(notes.dataset.dirty).toBe("true");
    expect(notes.getAttribute("aria-label")).toContain("unsaved");
  });

  it("copies a file's relative or full path from its context menu", async () => {
    const fixture = await mounted([entry("docs", "directory"), entry("docs/notes.md")]);
    fixture.controller.expand("docs");

    fixture.host.querySelector<HTMLElement>('[data-file-path="docs/notes.md"]')!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
      }),
    );
    const menu = fixture.host.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.getAttribute("aria-label")).toBe("notes.md file actions");
    menu.querySelector<HTMLButtonElement>('[data-copy-path="relative"]')!.click();
    await Promise.resolve();
    expect(fixture.actions.copyPath).toHaveBeenLastCalledWith(
      { projectId: "alpha", worktreeId: "alpha-root", relativePath: "docs/notes.md" },
      "relative",
    );

    fixture.host.querySelector<HTMLElement>('[data-file-path="docs/notes.md"]')!.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 50,
      }),
    );
    fixture.host.querySelector<HTMLButtonElement>('[data-copy-path="full"]')!.click();
    await Promise.resolve();
    expect(fixture.actions.copyPath).toHaveBeenLastCalledWith(
      { projectId: "alpha", worktreeId: "alpha-root", relativePath: "docs/notes.md" },
      "full",
    );
  });

  it("opens file path actions from the keyboard context-menu chord", async () => {
    const fixture = await mounted([entry("notes.md")]);
    const notes = fixture.host.querySelector<HTMLElement>('[data-file-path="notes.md"]')!;

    notes.dispatchEvent(
      new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }),
    );

    expect(fixture.host.querySelector('[role="menu"]')).not.toBeNull();
    expect(fixture.host.querySelector('[role="menuitem"]')?.textContent).toBe("Open");
  });

  it("replaces the system menu with ordinary editor operations for files and folders", async () => {
    const fixture = await mounted([
      entry("docs", "directory"),
      entry("docs/notes.md"),
      entry("README.md"),
    ]);
    fixture.controller.expand("docs");
    const docs = fixture.host.querySelector<HTMLElement>('[data-file-path="docs"]')!;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });

    docs.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(
      [...fixture.host.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
        ({ textContent }) => textContent,
      ),
    ).toEqual([
      "New File…",
      "New Folder…",
      "Rename…",
      "Copy Relative Path",
      "Copy Full Path",
      "Move to Trash…",
    ]);
  });

  it("captures names and confirms Trash before dispatching file operations", async () => {
    const fixture = await mounted([
      entry("docs", "directory"),
      entry("docs/notes.md"),
      entry("README.md"),
    ]);
    fixture.controller.expand("docs");
    const contextMenu = (path: string) =>
      fixture.host
        .querySelector<HTMLElement>(`[data-file-path="${path}"]`)!
        .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    contextMenu("docs");
    [...fixture.host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(({ textContent }) => textContent === "New File…")!
      .click();
    const create = fixture.host.querySelector<HTMLFormElement>('[role="dialog"]')!;
    create.querySelector<HTMLInputElement>("input")!.value = "draft.md";
    create.requestSubmit();
    await vi.waitFor(() =>
      expect(fixture.actions.createEntry).toHaveBeenCalledWith(
        { ...scope, relativePath: "docs/draft.md" },
        "file",
      ),
    );

    contextMenu("docs/notes.md");
    [...fixture.host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(({ textContent }) => textContent === "Rename…")!
      .click();
    const rename = fixture.host.querySelector<HTMLFormElement>('[role="dialog"]')!;
    rename.querySelector<HTMLInputElement>("input")!.value = "renamed.md";
    rename.requestSubmit();
    await vi.waitFor(() =>
      expect(fixture.actions.renameEntry).toHaveBeenCalledWith(
        { ...scope, relativePath: "docs/notes.md" },
        "renamed.md",
      ),
    );

    contextMenu("docs/notes.md");
    [...fixture.host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
      .find(({ textContent }) => textContent === "Move to Trash…")!
      .click();
    const confirmation = fixture.host.querySelector<HTMLElement>('[role="alertdialog"]')!;
    expect(confirmation.textContent).toContain("docs/notes.md");
    [...confirmation.querySelectorAll<HTMLButtonElement>("button")]
      .find(({ textContent }) => textContent === "Move to Trash")!
      .click();
    await vi.waitFor(() =>
      expect(fixture.actions.trashEntry).toHaveBeenCalledWith({
        ...scope,
        relativePath: "docs/notes.md",
      }),
    );
  });

  it("uses one keyboard path for expansion, navigation, and root-owned activation", async () => {
    const fixture = await mounted([
      entry("src", "directory"),
      entry("src/main.ts"),
      entry("notes.md"),
    ]);
    const src = fixture.host.querySelector<HTMLElement>('[data-file-path="src"]')!;
    src.focus();
    src.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    src.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    fixture.host
      .querySelector<HTMLElement>('[data-file-path="src/main.ts"]')!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await Promise.resolve();

    expect(fixture.controller.snapshot().expandedPaths.has("src")).toBe(true);
    expect(fixture.controller.snapshot().selectedPath).toBe("src/main.ts");
    expect(fixture.actions.activateFile).toHaveBeenCalledWith({
      projectId: "alpha",
      worktreeId: "alpha-root",
      relativePath: "src/main.ts",
    });
  });

  it("toggles a folder whenever its row is selected", async () => {
    const fixture = await mounted([
      entry("src", "directory"),
      entry("src/main.ts"),
      entry("notes.md"),
    ]);
    fixture.controller.expand("src");
    const src = fixture.host.querySelector<HTMLElement>('[data-file-path="src"]')!;

    src.querySelector<HTMLElement>(".zd-file-tree-name")!.click();

    expect(fixture.controller.snapshot().selectedPath).toBe("src");
    expect(fixture.controller.snapshot().expandedPaths.has("src")).toBe(false);
    expect(fixture.host.querySelector('[data-file-path="src/main.ts"]')).toBeNull();

    fixture.host.querySelector<HTMLElement>('[data-file-path="src"] .zd-file-tree-name')!.click();

    expect(fixture.controller.snapshot().expandedPaths.has("src")).toBe(true);
    expect(fixture.host.querySelector('[data-file-path="src/main.ts"]')).not.toBeNull();
  });

  it("shows filter only when summoned and Escape restores navigation state", async () => {
    const fixture = await mounted([entry("main.ts"), entry("notes.md")]);
    const filter = fixture.host.querySelector<HTMLElement>(".zd-file-tree-filter")!;
    expect(filter.hidden).toBe(true);
    fixture.controller.select("notes.md");
    fixture.controller.setScroll({ top: 23, left: 7 });

    fixture.controller.summonFilter();
    const input = fixture.host.querySelector<HTMLInputElement>("input[type=search]")!;
    input.value = "type:code";
    input.dispatchEvent(new InputEvent("input", { bubbles: true }));
    expect(filter.hidden).toBe(false);
    expect(fixture.host.querySelector(".zd-file-tree-filter-count")?.textContent).toBe("1 result");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(filter.hidden).toBe(true);
    expect(fixture.controller.snapshot()).toMatchObject({
      selectedPath: "notes.md",
      scroll: { top: 23, left: 7 },
    });
  });

  it("provides a visible action that closes the summoned filter", async () => {
    const fixture = await mounted([entry("main.ts"), entry("notes.md")]);
    fixture.controller.summonFilter();

    const close = fixture.host.querySelector<HTMLButtonElement>("[data-file-filter-close]");
    expect(close?.getAttribute("aria-label")).toBe("Close file filter");
    close!.click();

    expect(fixture.controller.snapshot().filterOpen).toBe(false);
    expect(fixture.host.querySelector<HTMLElement>(".zd-file-tree-filter")?.hidden).toBe(true);
  });

  it("virtualizes a large logical tree and retains controller state across remount", async () => {
    const entries = Array.from({ length: 10_000 }, (_, index) =>
      entry(`file-${index.toString().padStart(5, "0")}.txt`),
    );
    const fixture = await mounted(entries);
    expect(fixture.host.querySelectorAll("[role=treeitem]").length).toBeLessThan(30);
    fixture.controller.select("file-00001.txt");
    fixture.controller.setScroll({ top: 190, left: 40 });
    fixture.unmount();

    mountFileTree(fixture.host, fixture.controller);

    expect(fixture.controller.snapshot()).toMatchObject({
      selectedPath: "file-00001.txt",
      scroll: { top: 190, left: 40 },
    });
  });

  it.each([
    ["empty", "This project is empty."],
    ["missing", "The project folder is missing."],
    ["denied", "Access to this project folder was denied."],
    ["not-directory", "The approved project path is not a folder."],
    ["unavailable", "native unavailable"],
  ] as const)("names the %s state without an empty chrome shell", async (status, expected) => {
    const result: FileTreeResult =
      status === "empty"
        ? { ...scope, status, revision: "empty", elapsedMicros: 1 }
        : status === "unavailable"
          ? { ...scope, status, problem: expected }
          : { ...scope, status };
    const controller = new FileTreeController({
      snapshot: async () => result,
      watch: () => () => {},
    });
    const host = document.createElement("aside");
    mountFileTree(host, controller);
    await controller.activate(scope);

    expect(host.querySelector('[role="status"]')?.textContent).toContain(expected);
  });
});
