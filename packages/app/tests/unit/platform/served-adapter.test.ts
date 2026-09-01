import { describe, expect, it, vi } from "vitest";

import { createServedWorkbenchHost } from "@/platform/served";
import type { ServedHostClient } from "@/platform/served-client";

function client(): ServedHostClient {
  const request = vi.fn(async (method: string) => {
    switch (method) {
      case "session.describe":
        return {
          protocolVersion: 1,
          sessionEpoch: "epoch-1",
          access: "read-write",
          startupProjectId: "project-1",
          startupWorktreeId: "worktree-1",
          startupRelativePath: null,
          capabilities: {
            projectGrants: "read-only",
            fileTree: "read-only",
            fileRead: "read-only",
            fileWrite: "read-write",
            fileMutations: "read-write",
            clipboardImages: "read-write",
            projectImages: "read-only",
            fileWatch: "unavailable",
            git: "read-only",
            worktrees: "read-write",
            terminal: "unavailable",
            durableState: "read-write",
            themeFiles: "read-only",
            hostDiagnostics: "read-write",
            projectPicker: "unavailable",
            recentWorkspaces: "unavailable",
          },
        };
      case "projectGrants.list":
        return {
          projects: [
            {
              id: "project-1",
              name: "fixture",
              root: "/remote/fixture",
              availability: "available",
              worktrees: [
                {
                  id: "worktree-1",
                  name: "main",
                  root: "/remote/fixture",
                  availability: "available",
                },
              ],
            },
          ],
        };
      case "fileTree.snapshot":
        return {
          status: "ready",
          projectId: "project-1",
          worktreeId: "worktree-1",
          revision: "revision-1",
          entries: [
            {
              relativePath: "notes.md",
              parentPath: null,
              name: "notes.md",
              kind: "file",
              ignored: false,
              byteLength: 5,
              modified: 1,
            },
          ],
          truncated: false,
          ignoredTruncated: false,
          unreadableDirectories: 0,
          elapsedMicros: 10,
        };
      case "file.readBounded":
        return {
          status: "text",
          textBase64: "aGVsbG8=",
          byteLength: 5,
          writable: true,
          reason: null,
        };
      case "workspaceFiles.list":
        return {
          projectId: "project-1",
          worktreeId: "worktree-1",
          root: "/remote/fixture",
          files: [],
        };
      case "file.writeText":
        return null;
      case "file.stamp":
        return { modified: 1, length: 5 };
      case "fileTree.mutate":
        return { status: "committed" };
      case "image.readProject":
        return { mediaType: "image/png", bytesBase64: "iVBORw0KGgo=" };
      case "image.saveClipboard":
        return { relativePath: "docs/screenshots/screenshot.png" };
      case "git.status":
        return {
          scope: { projectId: "project-1", worktreeId: "worktree-1" },
          availability: "available",
          entries: [],
          truncated: false,
          problem: null,
        };
      case "worktree.create":
        return { status: "refused", kind: "collision", reason: "already exists" };
      case "theme.list":
        return [{ fileName: "fixture.theme.config", contents: "{}", problem: null }];
      case "diagnostics.status":
      case "diagnostics.enable":
      case "diagnostics.disable":
        return {
          enabled: method === "diagnostics.enable",
          sessionId: method === "diagnostics.enable" ? "session-1" : null,
          backgroundSampling: method === "diagnostics.enable",
          problem: null,
        };
      case "diagnostics.record":
        return { recorded: true, problem: null };
      case "state.describe":
        return {
          revision: { preferences: 0, project: 0 },
          preferences: null,
          workbench: null,
          drafts: [],
          reviewLedgers: [],
        };
      case "state.apply":
        return {
          status: "applied",
          revision: { preferences: 1, project: 0 },
        };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  });
  return {
    // The fixture returns the same closed method results that the adapter requests below.
    request: request as ServedHostClient["request"],
    recentTimings: () => [],
    close: vi.fn(),
  };
}

describe("served WorkbenchHost", () => {
  it("boots from the authenticated startup grant and reads its real tree", async () => {
    const served = createServedWorkbenchHost(client());

    await expect(served.launchRequest()).resolves.toMatchObject({
      project: { id: "project-1" },
      worktreeId: "worktree-1",
      relativePath: null,
      problem: null,
    });
    await expect(
      served.fileTree.snapshot({
        projectId: "project-1",
        worktreeId: "worktree-1",
        previousRevision: null,
      }),
    ).resolves.toMatchObject({
      status: "ready",
      entries: [expect.objectContaining({ relativePath: "notes.md" })],
    });
  });

  it("decodes bounded served text and preserves its writable state", async () => {
    const served = createServedWorkbenchHost(client());

    await expect(
      served.readBoundedFile({
        projectId: "project-1",
        worktreeId: "worktree-1",
        relativePath: "notes.md",
      }),
    ).resolves.toEqual({
      status: "text",
      text: "hello",
      byteLength: 5,
      writable: true,
    });
  });

  it("uses the same revisioned durable-state adapter as the desktop shell", async () => {
    const served = createServedWorkbenchHost(client());
    await served.durableState.load();

    const stored = served.durableState.mutate({
      kind: "replace-preferences",
      record: { schemaVersion: 1, theme: "current-dark" },
    });
    await served.durableState.flush();

    await expect(stored).resolves.toBe(true);
    expect(served.durableState.snapshot().preferences).toEqual({
      schemaVersion: 1,
      theme: "current-dark",
    });
  });

  it("routes editing, Git, worktrees, themes, and diagnostics through closed methods", async () => {
    const hostClient = client();
    const served = createServedWorkbenchHost(hostClient);
    const scope = { projectId: "project-1", worktreeId: "worktree-1" };
    const resource = { ...scope, relativePath: "notes.md" };

    await expect(served.writeTextFile(resource, "changed")).resolves.toBeUndefined();
    expect(hostClient.request).toHaveBeenCalledWith("file.writeText", {
      ...resource,
      contentsBase64: "Y2hhbmdlZA==",
    });
    await expect(served.fileStamp(resource)).resolves.toEqual({ modified: 1, length: 5 });
    await expect(served.workspaceFiles(scope.projectId, scope.worktreeId)).resolves.toMatchObject({
      root: "/remote/fixture",
    });
    await expect(
      served.fileTree.mutate?.({
        ...scope,
        operation: "create",
        relativePath: "new.md",
        kind: "file",
      }),
    ).resolves.toEqual({ status: "committed" });
    await expect(served.readProjectImage({ ...scope, relativePath: "image.png" })).resolves.toEqual(
      {
        mediaType: "image/png",
        bytes: [137, 80, 78, 71, 13, 10, 26, 10],
      },
    );
    await expect(
      served.saveClipboardImage({
        ...scope,
        mediaType: "image/png",
        bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    ).resolves.toEqual({ relativePath: "docs/screenshots/screenshot.png" });
    await expect(served.git.status(scope)).resolves.toMatchObject({ availability: "available" });
    await expect(
      served.createThreadWorktree({
        projectId: scope.projectId,
        name: "thread",
        branch: "thread",
        baseRevision: null,
      }),
    ).resolves.toMatchObject({ status: "refused", kind: "collision" });
    await expect(served.themeConfigFiles()).resolves.toHaveLength(1);
    await expect(served.enableDiagnostics()).resolves.toMatchObject({ enabled: true });
    await expect(
      served.recordDiagnostic({
        recordType: "event",
        operation: "served.test",
        outcome: "ok",
      }),
    ).resolves.toEqual({ recorded: true, problem: null });
  });

  it("keeps streaming and native shell authority unavailable", async () => {
    const served = createServedWorkbenchHost(client());
    const scope = { projectId: "project-1", worktreeId: "worktree-1" };

    await expect(served.saveWorkspace(["project-1"])).rejects.toThrow("unavailable");
    await expect(served.openWorkspace("workspace-1")).rejects.toThrow("unavailable");
    await expect(
      served.terminal.start({
        ...scope,
        viewport: { rows: 24, columns: 80, pixelWidth: 0, pixelHeight: 0 },
      }),
    ).rejects.toThrow();
    await expect(served.revealDiagnostics()).rejects.toThrow("unavailable");
  });
});
