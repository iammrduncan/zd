import { afterEach, describe, expect, it, vi } from "vitest";

import { detectPlatform } from "@/platform";
import { createTerminalStartRequest } from "@/terminal";

describe("the unserved browser platform boundary", () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("refuses to compose legacy Tauri host authority without served bootstrap", () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    expect(() => detectPlatform()).toThrow("served host");
  });

  it("reports file operations and automatic updates as unavailable", async () => {
    const platform = detectPlatform();
    const scope = { projectId: "project-a", worktreeId: "worktree-a" };
    const watchEvent = vi.fn();

    await expect(platform.fileTree.snapshot({ ...scope, previousRevision: null })).resolves.toEqual(
      {
        status: "unavailable",
        ...scope,
        problem: "file trees require the desktop shell",
      },
    );
    await expect(
      platform.fileTree.mutate!({
        ...scope,
        operation: "rename",
        relativePath: "notes.md",
        newName: "draft.md",
      }),
    ).resolves.toEqual({
      status: "refused",
      reason: "file operations require the desktop shell",
    });
    const stop = platform.fileTree.watch(scope, watchEvent);
    await vi.waitFor(() =>
      expect(watchEvent).toHaveBeenCalledWith({
        status: "unavailable",
        problem: "automatic file-tree updates require the desktop shell",
      }),
    );
    stop();
  });

  it("reports Git, terminals, and bounded reads as unavailable", async () => {
    const platform = detectPlatform();
    const scope = { projectId: "project-a", worktreeId: "worktree-a" };
    const resource = { ...scope, relativePath: "src/main.ts" };

    await expect(platform.git.status(scope)).resolves.toMatchObject({
      scope,
      availability: "unavailable",
      entries: [],
    });
    await expect(
      platform.terminal.start(
        createTerminalStartRequest(scope, "terminal-a", { rows: 24, columns: 80 }),
      ),
    ).rejects.toThrow("desktop shell");
    await expect(platform.readBoundedFile(resource)).resolves.toEqual({
      status: "unavailable",
      problem: "bounded file reads require the desktop shell",
    });
  });

  it("keeps project and workspace expansion unavailable", async () => {
    const platform = detectPlatform();

    await expect(platform.chooseProject()).resolves.toBeNull();
    await expect(platform.recoverProjectGrant("project-a")).resolves.toBeNull();
    await expect(
      platform.createThreadWorktree({
        projectId: "project-a",
        name: "review",
        branch: "feature/review",
        baseRevision: null,
      }),
    ).resolves.toMatchObject({
      status: "refused",
      kind: "git-failed",
    });
    await expect(platform.saveWorkspace(["project-a"])).rejects.toThrow("desktop shell");
  });

  it("keeps notifications and diagnostics inert", async () => {
    const platform = detectPlatform();
    const request = {
      schemaVersion: 1 as const,
      notificationId: "attention:thread-alpha:1",
      eventId: "thread-alpha:1",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      title: "zd" as const,
      body: "Workbench · Review output · Codex",
    };

    await expect(platform.notifications.permission()).resolves.toBe("unsupported");
    await expect(platform.notifications.show(request)).resolves.toMatchObject({
      status: "unsupported",
    });
    await expect(platform.diagnosticsStatus()).resolves.toMatchObject({ enabled: false });
    await expect(platform.enableDiagnostics()).resolves.toMatchObject({
      enabled: false,
      problem: expect.any(String),
    });
    await expect(platform.revealDiagnostics()).rejects.toThrow("desktop shell");
  });

  it("does not pretend it can persist clipboard images or close a browser tab", async () => {
    const platform = detectPlatform();

    await expect(
      platform.saveClipboardImage({
        projectId: "project-a",
        worktreeId: "worktree-a",
        mediaType: "image/png",
        bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
      }),
    ).rejects.toThrow("desktop shell");
    await expect(platform.closeWindow()).resolves.toBeUndefined();
  });
});
