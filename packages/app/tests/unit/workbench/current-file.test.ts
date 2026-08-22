import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorView } from "@codemirror/view";
import type { BoundedFileRead } from "@/editor";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { Platform } from "@/platform";
import { mountCurrentFile } from "@/workbench/current-file";
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
  const readBoundedFile = vi.fn(async () => read);
  const writeTextFile = vi.fn(async () => {});
  let requestClose: (() => void) | null = null;
  const closeWindow = vi.fn(async () => {});
  const platform = {
    readBoundedFile,
    writeTextFile,
    onCloseRequested: (handler: () => void) => {
      requestClose = handler;
      return () => {
        requestClose = null;
      };
    },
    closeWindow,
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
    closeWindow,
    requestClose: () => requestClose?.(),
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
});
