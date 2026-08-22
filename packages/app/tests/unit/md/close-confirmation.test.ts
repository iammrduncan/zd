import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { EditorView } from "@codemirror/view";

import { mountCurrentWorkspace } from "@/miniapps/md";
import type { Platform } from "@/platform";
import { attachShortcuts, clearCommands } from "@/suite/shortcuts";
import type { WorkbenchRuntimeContext } from "@/workbench/runtime";
import type { ProjectGrant } from "@/workbench/resources";
import { createWorkbenchStateOwner, workbenchStateFromGrants } from "@/workbench/state";

const MOD = /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "metaKey" : "ctrlKey";

describe("quitting with unsaved work", () => {
  let requestClose: (() => void) | null = null;
  let closed = 0;
  let detachShortcuts = () => {};
  let unmount = () => {};

  beforeEach(() => {
    requestClose = null;
    closed = 0;
    clearCommands();
    detachShortcuts = attachShortcuts();
  });

  afterEach(() => {
    unmount();
    unmount = () => {};
    detachShortcuts();
  });

  function context(): WorkbenchRuntimeContext {
    const project: ProjectGrant = {
      id: "project-w",
      name: "w",
      root: "/w",
      availability: "available",
      worktrees: [{ id: "worktree-w", name: "w", root: "/w", availability: "available" }],
    };
    const launch = {
      project,
      worktreeId: "worktree-w",
      relativePath: "plan.md",
      problem: null,
    };
    const platform: Platform = {
      kind: "browser",
      launchRequest: async () => launch,
      onOpenRequested: () => () => {},
      pendingOpenRequest: async () => null,
      acceptOpenRequest: async () => null,
      projectGrants: async () => [project],
      removeProjectGrant: async () => project,
      themeConfigFiles: async () => [],
      workspaceFiles: async () => {
        throw new Error("no listing");
      },
      readTextFile: async () => "# Plan",
      writeTextFile: async () => {},
      fileStamp: async () => null,
      onCloseRequested: (handler) => {
        requestClose = handler;
        return () => {
          requestClose = null;
        };
      },
      closeWindow: async () => {
        closed += 1;
      },
      openExternal: async () => {},
    };
    return {
      launch,
      platform,
      state: createWorkbenchStateOwner(workbenchStateFromGrants([project], launch)),
    };
  }

  async function mountDocument() {
    const host = document.createElement("div");
    document.body.append(host);
    unmount = await mountCurrentWorkspace(host, context());
    return host;
  }

  function dirty(host: HTMLElement) {
    const view = EditorView.findFromDOM(host.querySelector<HTMLElement>(".md-editor")!)!;
    view.dispatch({ changes: { from: view.state.doc.length, insert: " more" } });
  }

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function save(host: HTMLElement) {
    host
      .querySelector(".cm-content")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", [MOD]: true, bubbles: true, cancelable: true }),
      );
    await settle();
  }

  function dialog(host: HTMLElement) {
    return host.querySelector<HTMLDialogElement>('[role="alertdialog"]');
  }

  it("closes straight away when nothing is unsaved", async () => {
    const host = await mountDocument();
    expect(requestClose, "nothing registered for the close request").not.toBeNull();

    requestClose!();
    await settle();

    expect(closed, "a clean document refused to close").toBe(1);
    expect(dialog(host), "a clean document opened a needless confirmation").toBeNull();
  });

  it("shows a visible Cancel or Close choice over unsaved work", async () => {
    const host = await mountDocument();
    dirty(host);

    requestClose!();

    const choice = dialog(host);
    expect(choice, "the refused close had no visible confirmation").not.toBeNull();
    expect(choice?.open, "the confirmation exists but is not presented").toBe(true);
    expect(choice?.textContent).toContain("This document has unsaved changes");
    expect([...choice!.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Cancel",
      "Close",
    ]);
    expect(closed, "the window closed before a choice was clicked").toBe(0);
  });

  it("keeps unsaved work when Cancel is clicked", async () => {
    const host = await mountDocument();
    dirty(host);
    requestClose!();

    dialog(host)?.querySelector<HTMLButtonElement>('[data-close-choice="cancel"]')?.click();
    await settle();

    expect(dialog(host), "Cancel left the confirmation open").toBeNull();
    expect(closed, "Cancel closed the window over unsaved work").toBe(0);
  });

  it("closes only after Close is clicked", async () => {
    const host = await mountDocument();
    dirty(host);
    requestClose!();

    dialog(host)?.querySelector<HTMLButtonElement>('[data-close-choice="close"]')?.click();
    await settle();

    expect(dialog(host), "the accepted confirmation stayed open").toBeNull();
    expect(closed, "the accepted confirmation did not close the window").toBe(1);
  });

  it("does not let a repeated Cmd+w bypass the visible choice", async () => {
    const host = await mountDocument();
    dirty(host);

    requestClose!();
    requestClose!();

    expect(host.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
    expect(closed, "a repeated shortcut bypassed the confirmation").toBe(0);
  });

  it("closes without another confirmation once the document is saved", async () => {
    const host = await mountDocument();
    dirty(host);
    requestClose!();
    dialog(host)?.querySelector<HTMLButtonElement>('[data-close-choice="cancel"]')?.click();
    await save(host);

    requestClose!();
    await settle();

    expect(dialog(host), "a saved document was asked again").toBeNull();
    expect(closed, "a saved document should just close").toBe(1);
  });
});
