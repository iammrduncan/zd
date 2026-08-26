import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorView } from "@codemirror/view";
import { undo } from "@codemirror/commands";
import type { BoundedFileRead } from "@/editor";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { FileStamp, Platform } from "@/platform";
import { mountCurrentFile } from "@/workbench/current-file";
import { FileDraftStore } from "@/workbench/current-file/drafts";
import { attachOpenRequests } from "@/workbench/open-requests";
import type { LaunchRequest } from "@/workbench/resources";
import type { FileResource, ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";
import { TransientCoordinator } from "@/workbench/transients";
import {
  applyWorkbenchSettings,
  forgetWorkbenchSettingsPreferences,
  parseWorkbenchSettings,
  saveWorkbenchSettings,
} from "@/workbench/settings-preferences";
import {
  clearCommands,
  commands,
  commandTargetAvailable,
  runCommandTarget,
} from "@/workbench/shortcuts";

const project: ProjectGrant = {
  id: "project-a",
  name: "Alpha",
  root: "/private/alpha",
  availability: "available",
  worktrees: [
    {
      id: "worktree-a",
      name: "main",
      root: "/private/alpha",
      availability: "available",
    },
  ],
};

const resource = (relativePath: string): FileResource => ({
  projectId: project.id,
  worktreeId: project.worktrees[0]!.id,
  relativePath,
});

function context(read: BoundedFileRead, relativePath = "src/main.ts") {
  const launch = {
    project,
    worktreeId: "worktree-a",
    relativePath,
    problem: null,
  };
  let currentRead = read;
  let stamp: FileStamp | null = {
    modified: 1,
    length: "byteLength" in read ? read.byteLength : 0,
  };
  const readBoundedFile = vi.fn(async () => currentRead);
  const writeTextFile = vi.fn(async () => {});
  const fileStamp = vi.fn(async () => stamp);
  let requestClose: (() => void) | null = null;
  let requestOpen: (() => void) | null = null;
  let pending: LaunchRequest | null = null;
  const closeWindow = vi.fn(async () => {});
  const openExternal = vi.fn(async () => {});
  const acceptOpenRequest = vi.fn(async () => {
    const accepted = pending;
    pending = null;
    return accepted;
  });
  const platform = {
    readBoundedFile,
    writeTextFile,
    fileStamp,
    onCloseRequested: (handler: () => void) => {
      requestClose = handler;
      return () => {
        requestClose = null;
      };
    },
    closeWindow,
    openExternal,
    onOpenRequested: (handler: () => void) => {
      requestOpen = handler;
      return () => {
        requestOpen = null;
      };
    },
    pendingOpenRequest: async () => pending,
    acceptOpenRequest,
    projectGrants: async () => [project],
  } as unknown as Platform;
  return {
    runtime: {
      launch,
      platform,
      state: createWorkbenchStateOwner(workbenchStateFromGrants([project], launch)),
      instrumentation: createUnavailableInstrumentationClient(),
    },
    readBoundedFile,
    writeTextFile,
    fileStamp,
    closeWindow,
    openExternal,
    requestClose: () => requestClose?.(),
    requestOpen: (request: LaunchRequest) => {
      pending = request;
      requestOpen?.();
    },
    acceptOpenRequest,
    setRead: (next: BoundedFileRead) => {
      currentRead = next;
    },
    setStamp: (next: FileStamp | null) => {
      stamp = next;
    },
  };
}

beforeEach(() => {
  clearCommands();
  forgetWorkbenchSettingsPreferences();
});
afterEach(() => {
  clearCommands();
  forgetWorkbenchSettingsPreferences();
});

describe("the root current-file owner", () => {
  it("switches Markdown into a true code plane without replacing its editor state", async () => {
    const source = "# Plan\n\nEdit **source** and [links](README.md).";
    const fixture = context(
      { status: "text", text: source, byteLength: source.length, writable: true },
      "docs/plan.md",
    );
    saveWorkbenchSettings(
      parseWorkbenchSettings({ schemaVersion: 1, reading: { markdownCodeMode: true } }),
    );
    const host = document.createElement("div");
    document.body.append(host);

    const unmount = await mountCurrentFile(host, fixture.runtime);
    const editorHost = host.querySelector<HTMLElement>(".md-editor")!;
    const original = EditorView.findFromDOM(editorHost)!;
    original.dispatch({ changes: { from: source.length, insert: "\nunsaved" } });
    original.dispatch({ selection: { anchor: 3 } });

    expect(editorHost.dataset.language).toBe("code");
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(host.querySelector(".md-line-h1")).toBeNull();
    expect(host.querySelector(".md-syn-keyword")?.textContent).toContain("#");
    expect(
      commands()
        .find(({ id }) => id === "document.raw")
        ?.available?.(),
    ).toBe(false);

    const rendered = parseWorkbenchSettings({
      schemaVersion: 1,
      reading: { markdownCodeMode: false },
    });
    applyWorkbenchSettings(rendered, fixture.runtime.state);

    expect(EditorView.findFromDOM(editorHost)).toBe(original);
    expect(original.state.doc.toString()).toContain("unsaved");
    expect(original.state.selection.main.head).toBe(3);
    expect(editorHost.dataset.language).toBe("markdown");
    expect(host.querySelector(".cm-lineNumbers")).toBeNull();
    expect(host.querySelector(".md-line-h1")?.textContent).toContain("Plan");
    expect(
      commands()
        .find(({ id }) => id === "document.raw")
        ?.available?.(),
    ).toBe(true);
    expect(undo(original)).toBe(true);
    expect(original.state.doc.toString()).toBe(source);

    unmount();
    host.remove();
  });

  it("mounts code, Find, and the distinct explicit Focus command through one editor", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);

    const unmount = await mountCurrentFile(host, fixture.runtime);

    expect(fixture.readBoundedFile).toHaveBeenCalledExactlyOnceWith(resource("src/main.ts"));
    expect(host.querySelector(".current-file-path")?.textContent).toBe("src/main.ts");
    expect(
      host.querySelector<HTMLButtonElement>('[aria-label="Close src/main.ts"]'),
    ).not.toBeNull();
    expect(host.querySelector(".md-editor")?.getAttribute("data-language")).toBe("code");
    expect(host.querySelector(".md-editor")?.getAttribute("data-focus-mode")).toBe("false");
    expect(host.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(commandTargetAvailable("file.find")).toBe(true);
    expect(commandTargetAvailable("focus.toggle")).toBe(true);
    expect(
      commands()
        .filter(({ id }) => id.startsWith("document.format"))
        .map(({ id }) => id),
    ).toEqual([
      "document.formatBold",
      "document.formatItalic",
      "document.formatCode",
      "document.formatLink",
    ]);
    expect(commands().find(({ id }) => id === "document.formatBold")?.chord).toEqual({
      key: "b",
      mod: true,
      alt: true,
    });

    expect(runCommandTarget("file.find")).toBe(true);
    expect(host.querySelector<HTMLElement>(".editor-find")?.hidden).toBe(false);
    expect(runCommandTarget("workbench.escape")).toBe(true);
    expect(host.querySelector<HTMLElement>(".editor-find")?.hidden).toBe(true);

    expect(runCommandTarget("focus.toggle")).toBe(true);
    expect(host.querySelector(".md-editor")?.getAttribute("data-focus-mode")).toBe("true");
    unmount();
    expect(host.children).toHaveLength(0);
    host.remove();
  });

  it("renders a Markdown image relative to the open document through native authority", async () => {
    const fixture = context(
      {
        status: "text",
        text: [
          "# Notes",
          "",
          "![Screenshot](../screenshots/example.png)",
          "![Outside](../../../private.png)",
        ].join("\n"),
        byteLength: 89,
        writable: true,
      },
      "docs/notes/readme.md",
    );
    const readProjectImage = vi.fn(async () => ({
      mediaType: "image/png" as const,
      bytes: [0x89, 0x50, 0x4e, 0x47],
    }));
    Object.assign(fixture.runtime.platform, { readProjectImage });
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:example");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const host = document.createElement("div");
    document.body.append(host);

    const unmount = await mountCurrentFile(host, fixture.runtime);

    await vi.waitFor(() =>
      expect(readProjectImage).toHaveBeenCalledExactlyOnceWith(
        resource("docs/screenshots/example.png"),
      ),
    );
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLImageElement>('.md-image img[alt="Screenshot"]')?.src).toBe(
        "blob:example",
      ),
    );

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:example");
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
    host.remove();
  });

  it("keeps relative Markdown links in the workbench and sends web links to the platform", async () => {
    const fixture = context(
      {
        status: "text",
        text: "[Design](../DESIGN.md) and [Website](https://example.com)",
        byteLength: 58,
        writable: true,
      },
      "docs/notes/readme.md",
    );
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const [design] = host.querySelectorAll<HTMLElement>(".md-link-label");

    design!.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }),
    );
    await vi.waitFor(() =>
      expect(fixture.runtime.state.snapshot().openFiles.at(-1)?.relativePath).toBe(
        "docs/DESIGN.md",
      ),
    );

    await fixture.runtime.state.activateFile(resource("docs/notes/readme.md"));
    await vi.waitFor(() => expect(host.querySelectorAll(".md-link-label")).toHaveLength(2));
    host
      .querySelectorAll<HTMLElement>(".md-link-label")[1]!
      .dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true }));
    await vi.waitFor(() =>
      expect(fixture.openExternal).toHaveBeenCalledExactlyOnceWith("https://example.com"),
    );

    unmount();
    host.remove();
  });

  it("turns a Markdown selection into a durable review comment", async () => {
    const fixture = context(
      {
        status: "text",
        text: "# Plan\n\nShip this slice.",
        byteLength: 24,
        writable: true,
      },
      "docs/plan.md",
    );
    const host = document.createElement("div");
    document.body.append(host);
    const coordinates = vi.spyOn(EditorView.prototype, "coordsAtPos").mockReturnValue({
      left: 120,
      right: 160,
      top: 200,
      bottom: 220,
    });
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;

    expect(host.querySelector('[aria-label="View Markdown feedback"]')).not.toBeNull();
    view.dispatch({ selection: { anchor: 8, head: 24 } });
    await vi.waitFor(() =>
      expect(host.querySelector<HTMLFormElement>(".md-comment-composer")?.hidden).toBe(false),
    );
    const composer = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
    composer.querySelector<HTMLTextAreaElement>("textarea")!.value = "Name the owner.";
    composer.requestSubmit();

    await vi.waitFor(() =>
      expect(fixture.writeTextFile).toHaveBeenCalledWith(
        resource("zd-feedback.txt"),
        "[docs/plan.md][LN3:LN3] [Ship this slice.] Name the owner.\n",
      ),
    );
    expect(host.querySelector(".md-comment-tag")?.textContent).toBe("Name the owner.");

    unmount();
    coordinates.mockRestore();
    host.remove();
  });

  it("closes with one x action and confirms before discarding an unsaved draft", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const drafts = new FileDraftStore(window.localStorage);
    const unmount = await mountCurrentFile(host, fixture.runtime, { drafts });
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    const close = host.querySelector<HTMLButtonElement>('[aria-label="Close src/main.ts"]')!;

    expect(close.textContent).toBe("×");
    expect(host.querySelector('[aria-label="Discard edits to src/main.ts"]')).toBeNull();
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });
    await vi.waitFor(() => expect(drafts.get(resource("src/main.ts"))).not.toBeNull());
    close.click();

    const confirmation = host.querySelector<HTMLDialogElement>('[role="alertdialog"]');
    expect(confirmation?.open).toBe(true);
    expect(confirmation?.textContent).toContain("Close src/main.ts without saving?");
    expect(fixture.runtime.state.snapshot().active.fileId).not.toBeNull();
    expect(fixture.writeTextFile).not.toHaveBeenCalled();

    confirmation?.querySelector<HTMLButtonElement>('[data-file-close-choice="cancel"]')?.click();
    expect(fixture.runtime.state.snapshot().active.fileId).not.toBeNull();
    expect(drafts.get(resource("src/main.ts"))).not.toBeNull();

    close.click();
    host.querySelector<HTMLButtonElement>('[data-file-close-choice="discard"]')?.click();
    await vi.waitFor(() => expect(fixture.runtime.state.snapshot().active.fileId).toBeNull());
    expect(drafts.get(resource("src/main.ts"))).toBeNull();
    expect(host.textContent).toContain("No file selected.");
    unmount();
    host.remove();
  });

  it("confirms before closing a draft restored from recovery state", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const drafts = new FileDraftStore(window.localStorage);
    drafts.save(resource("src/main.ts"), "const value = 2;");
    const unmount = await mountCurrentFile(host, fixture.runtime, { drafts });
    await vi.waitFor(() =>
      expect(
        EditorView.findFromDOM(
          host.querySelector<HTMLElement>(".md-editor")!,
        )?.state.doc.toString(),
      ).toBe("const value = 2;"),
    );

    host.querySelector<HTMLButtonElement>('[aria-label="Close src/main.ts"]')!.click();

    const confirmation = host.querySelector<HTMLDialogElement>('[role="alertdialog"]');
    expect(confirmation?.open).toBe(true);
    expect(confirmation?.textContent).toContain("Close src/main.ts without saving?");
    expect(fixture.runtime.state.snapshot().active.fileId).not.toBeNull();

    confirmation?.querySelector<HTMLButtonElement>('[data-file-close-choice="discard"]')?.click();
    await vi.waitFor(() => expect(fixture.runtime.state.snapshot().active.fileId).toBeNull());
    expect(drafts.get(resource("src/main.ts"))).toBeNull();
    expect(host.textContent).toContain("No file selected.");
    unmount();
    host.remove();
  });

  it("switches files without losing the dirty buffer and restores it on return", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst next = 2;" } });
    await Promise.resolve();

    const transition = await fixture.runtime.state.activateFile(resource("src/other.ts"));
    expect(transition).toEqual({ status: "committed" });
    await vi.waitFor(() => expect(fixture.readBoundedFile).toHaveBeenCalledTimes(2));
    expect(host.querySelector(".current-file-notice")?.textContent).not.toContain("unsaved work");

    await fixture.runtime.state.activateFile(resource("src/main.ts"));
    await vi.waitFor(() =>
      expect(
        EditorView.findFromDOM(
          host.querySelector<HTMLElement>(".md-editor")!,
        )?.state.doc.toString(),
      ).toContain("const next = 2;"),
    );
    expect(fixture.writeTextFile).not.toHaveBeenCalled();
    unmount();
    host.remove();
  });

  it("requires an explicit choice before closing a dirty file", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const transients = new TransientCoordinator();
    const closeOrdinary = vi.fn();
    transients.open("settings", "ordinary", closeOrdinary);
    const unmount = await mountCurrentFile(host, { ...fixture.runtime, transients });
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });

    fixture.requestClose();

    const dialog = host.querySelector<HTMLDialogElement>('[role="alertdialog"]');
    expect(dialog?.open).toBe(true);
    expect(dialog?.textContent).toContain("This document has unsaved changes");
    expect(fixture.closeWindow).not.toHaveBeenCalled();
    expect(closeOrdinary).toHaveBeenCalledExactlyOnceWith(false);
    expect(transients.open("reference", "ordinary", vi.fn())).toBe(false);

    dialog?.querySelector<HTMLButtonElement>('[data-close-choice="cancel"]')?.click();
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    expect(fixture.closeWindow).not.toHaveBeenCalled();
    expect(transients.open("reference", "ordinary", vi.fn())).toBe(true);

    fixture.requestClose();
    host.querySelector<HTMLButtonElement>('[data-close-choice="close"]')?.click();
    await vi.waitFor(() => expect(fixture.closeWindow).toHaveBeenCalledOnce());

    unmount();
    host.remove();
  });

  it("refuses to save over bytes changed by another writer", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });
    fixture.setStamp({ modified: 2, length: 20 });

    commands()
      .find(({ id }) => id === "document.save")
      ?.run();

    await vi.waitFor(() => {
      expect(host.querySelector(".current-file-notice")?.textContent).toContain("changed on disk");
    });
    expect(fixture.writeTextFile).not.toHaveBeenCalled();
    expect(view.state.doc.toString()).toContain("const mine = 2;");
    unmount();
    host.remove();
  });

  it("keeps failed writes dirty and explains that the work is still present", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    fixture.writeTextFile.mockRejectedValueOnce(new Error("disk full"));
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });

    commands()
      .find(({ id }) => id === "document.save")
      ?.run();

    await vi.waitFor(() => {
      expect(host.querySelector(".current-file-notice")?.textContent).toContain(
        "Your work is still here and still unsaved",
      );
    });
    expect(view.state.doc.toString()).toContain("const mine = 2;");
    expect(await fixture.runtime.state.activateFile(resource("src/other.ts"))).toEqual({
      status: "committed",
    });

    unmount();
    host.remove();
  });

  it("reloads an externally changed clean file when the window regains focus", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    fixture.setRead({
      status: "text",
      text: "const value = 2;",
      byteLength: 16,
      writable: true,
    });
    fixture.setStamp({ modified: 2, length: 16 });

    window.dispatchEvent(new FocusEvent("focus"));

    await vi.waitFor(() => expect(view.state.doc.toString()).toBe("const value = 2;"));
    expect(host.querySelector(".current-file-notice")?.textContent).toContain("reloaded");
    expect(fixture.readBoundedFile).toHaveBeenCalledTimes(2);
    unmount();
    host.remove();
  });

  it("keeps dirty text when the file also changes on disk", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = await mountCurrentFile(host, fixture.runtime);
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });
    fixture.setStamp({ modified: 2, length: 20 });

    window.dispatchEvent(new FocusEvent("focus"));

    await vi.waitFor(() => {
      expect(host.querySelector(".current-file-notice")?.textContent).toContain("unsaved edits");
    });
    expect(view.state.doc.toString()).toContain("const mine = 2;");
    expect(fixture.readBoundedFile).toHaveBeenCalledOnce();
    unmount();
    host.remove();
  });

  it("renders a typed unavailable state without inventing an editable document", async () => {
    const fixture = context({ status: "binary", byteLength: 512 });
    const host = document.createElement("div");

    const unmount = await mountCurrentFile(host, fixture.runtime);

    expect(host.querySelector(".editor-buffer-reason")?.textContent).toContain("Binary file");
    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(commandTargetAvailable("file.find")).toBe(false);
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.run(),
    ).toBe(false);
    expect(fixture.writeTextFile).not.toHaveBeenCalled();
    unmount();
  });

  it("keeps a dirty draft while yielding editor commands when its surface is inactive", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    let active = false;
    const unmount = await mountCurrentFile(host, fixture.runtime, {
      isActive: () => active,
    });
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: "\nconst mine = 2;" } });

    expect(commandTargetAvailable("file.find")).toBe(false);
    expect(commandTargetAvailable("focus.toggle")).toBe(false);
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.available?.(),
    ).toBe(false);
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.run(),
    ).toBe(false);
    expect(await fixture.runtime.state.activateFile(resource("src/other.ts"))).toEqual({
      status: "committed",
    });

    active = true;
    expect(commandTargetAvailable("file.find")).toBe(true);
    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.available?.(),
    ).toBe(true);
    unmount();
  });

  it("applies an approved native open request through the root transition", async () => {
    const fixture = context({
      status: "text",
      text: "const value = 1;",
      byteLength: 16,
      writable: true,
    });
    const host = document.createElement("div");
    const unmountFile = await mountCurrentFile(host, fixture.runtime);
    const stopOpenRequests = attachOpenRequests(fixture.runtime);

    fixture.requestOpen({
      project,
      worktreeId: "worktree-a",
      relativePath: "src/other.ts",
      problem: null,
    });

    await vi.waitFor(() => expect(fixture.acceptOpenRequest).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(fixture.readBoundedFile).toHaveBeenCalledTimes(2));
    expect(fixture.runtime.state.snapshot().active.fileId).toContain("src/other.ts");

    stopOpenRequests();
    unmountFile();
  });
});
