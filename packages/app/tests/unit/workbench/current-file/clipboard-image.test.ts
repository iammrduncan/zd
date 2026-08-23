import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EditorView } from "@codemirror/view";

import type { BoundedFileRead } from "@/editor";
import { createUnavailableInstrumentationClient } from "@/instrumentation";
import type { Platform, SavedClipboardImage } from "@/platform";
import { mountCurrentFile } from "@/workbench/current-file";
import type { FileResource, ProjectGrant } from "@/workbench/resources";
import { clearCommands } from "@/workbench/shortcuts";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

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

function pasteImage(target: HTMLElement): Event {
  const bytes = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const file = {
    type: "image/png",
    size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer,
  } as File;
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
      getData: () => "",
    },
  });
  target.dispatchEvent(event);
  return event;
}

function fixture(relativePath: string, read: BoundedFileRead) {
  const launch = { project, worktreeId: "worktree-a", relativePath, problem: null };
  const saveClipboardImage = vi.fn<
    (request: Parameters<Platform["saveClipboardImage"]>[0]) => Promise<SavedClipboardImage>
  >(async () => ({ relativePath: "docs/screenshots/screenshot-1.png" }));
  let requestClose: (() => void) | null = null;
  const closeWindow = vi.fn(async () => {});
  const platform = {
    readBoundedFile: vi.fn(async () => read),
    writeTextFile: vi.fn(async () => {}),
    saveClipboardImage,
    fileStamp: vi.fn(async () => ({ modified: 1, length: 9 })),
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
    saveClipboardImage,
    closeWindow,
    requestClose: () => requestClose?.(),
  };
}

async function mount(relativePath: string, text: string) {
  const current = fixture(relativePath, {
    status: "text",
    text,
    byteLength: new TextEncoder().encode(text).byteLength,
    writable: true,
  });
  const host = document.createElement("div");
  document.body.append(host);
  const unmount = await mountCurrentFile(host, current.runtime);
  const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
  return { ...current, host, unmount, view };
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("clipboard images in the current file", () => {
  it("saves a pasted screenshot and inserts its document-relative link at the caret", async () => {
    const current = await mount("docs/planning/FEEDBACK.txt", "Feedback\n");
    current.view.dispatch({ selection: { anchor: current.view.state.doc.length } });

    const event = pasteImage(current.view.contentDOM);

    expect(event.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(current.saveClipboardImage).toHaveBeenCalledOnce());
    expect(current.saveClipboardImage).toHaveBeenCalledWith({
      projectId: "project-a",
      worktreeId: "worktree-a",
      mediaType: "image/png",
      bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
    });
    await vi.waitFor(() =>
      expect(current.view.state.doc.toString()).toBe(
        "Feedback\n![Screenshot](../screenshots/screenshot-1.png)",
      ),
    );
    expect(await current.runtime.state.activateFile(resource("src/other.ts"))).toEqual({
      status: "committed",
    });

    current.unmount();
    current.host.remove();
  });

  it("leaves the document unchanged when the native image write fails", async () => {
    const current = await mount("docs/planning/FEEDBACK.txt", "Feedback\n");
    current.saveClipboardImage.mockRejectedValueOnce(new Error("disk full"));

    pasteImage(current.view.contentDOM);

    await vi.waitFor(() =>
      expect(current.host.querySelector(".current-file-notice")?.textContent).toContain(
        "could not be saved",
      ),
    );
    expect(current.view.state.doc.toString()).toBe("Feedback\n");

    current.unmount();
    current.host.remove();
  });

  it("protects pending image work and preserves an intervening edit", async () => {
    const current = await mount("docs/planning/FEEDBACK.txt", "Feedback\n");
    let finishSave!: (saved: SavedClipboardImage) => void;
    const saving = new Promise<SavedClipboardImage>((resolve) => {
      finishSave = resolve;
    });
    current.saveClipboardImage.mockReturnValueOnce(saving);
    current.view.dispatch({ selection: { anchor: 0, head: 8 } });

    pasteImage(current.view.contentDOM);
    await vi.waitFor(() => expect(current.saveClipboardImage).toHaveBeenCalledOnce());
    expect(await current.runtime.state.activateFile(resource("src/other.ts"))).toMatchObject({
      status: "refused",
      reason: expect.stringContaining("still being saved"),
    });
    current.requestClose();
    expect(current.closeWindow).not.toHaveBeenCalled();
    expect(current.host.querySelector(".current-file-notice")?.textContent).toContain(
      "finish saving",
    );

    current.view.dispatch({ changes: { from: 0, to: 8, insert: "New" } });
    finishSave({ relativePath: "docs/screenshots/screenshot-1.png" });
    await vi.waitFor(() =>
      expect(current.view.state.doc.toString()).toBe(
        "New![Screenshot](../screenshots/screenshot-1.png)\n",
      ),
    );

    current.unmount();
    current.host.remove();
  });

  it("does not translate image paste into Markdown inside a code file", async () => {
    const current = await mount("src/main.ts", "const value = 1;\n");

    pasteImage(current.view.contentDOM);
    await Promise.resolve();

    expect(current.saveClipboardImage).not.toHaveBeenCalled();
    expect(current.view.state.doc.toString()).toBe("const value = 1;\n");

    current.unmount();
    current.host.remove();
  });
});
