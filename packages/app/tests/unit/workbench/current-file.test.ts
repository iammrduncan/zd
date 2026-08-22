import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorView } from "@codemirror/view";
import type { BoundedFileRead } from "@/editor";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { FileStamp, Platform } from "@/platform";
import { mountCurrentFile } from "@/workbench/current-file";
import { attachOpenRequests } from "@/workbench/open-requests";
import type { LaunchRequest } from "@/workbench/resources";
import type { FileResource, ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";
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

function context(read: BoundedFileRead) {
  const launch = {
    project,
    worktreeId: "worktree-a",
    relativePath: "src/main.ts",
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

beforeEach(clearCommands);
afterEach(clearCommands);

describe("the root current-file owner", () => {
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
    expect(host.querySelector(".md-editor")?.getAttribute("data-language")).toBe("code");
    expect(host.querySelector(".md-editor")?.getAttribute("data-focus-mode")).toBe("false");
    expect(commandTargetAvailable("file.find")).toBe(true);
    expect(commandTargetAvailable("focus.toggle")).toBe(true);

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

  it("saves the current text and refuses a dirty file transition", async () => {
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

    const transition = await fixture.runtime.state.activateFile(resource("src/other.ts"));
    expect(transition).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("unsaved"),
    });
    expect(fixture.readBoundedFile).toHaveBeenCalledOnce();

    expect(
      commands()
        .find(({ id }) => id === "document.save")
        ?.run(),
    ).toBe(true);
    await vi.waitFor(() =>
      expect(fixture.writeTextFile).toHaveBeenCalledWith(
        resource("src/main.ts"),
        "const value = 1;\nconst next = 2;",
      ),
    );

    fixture.requestClose();
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
    ).toBe(true);
    expect(fixture.writeTextFile).not.toHaveBeenCalled();
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
