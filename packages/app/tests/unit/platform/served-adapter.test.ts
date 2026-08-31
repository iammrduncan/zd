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
          access: "read-only",
          startupProjectId: "project-1",
          startupWorktreeId: "worktree-1",
          startupRelativePath: null,
          capabilities: {
            projectGrants: "read-only",
            fileTree: "read-only",
            fileRead: "read-only",
            fileWrite: "unavailable",
            fileMutations: "unavailable",
            fileWatch: "unavailable",
            git: "unavailable",
            terminal: "unavailable",
            durableState: "read-write",
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
          text: "hello",
          byteLength: 5,
          writable: true,
          reason: null,
        };
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

  it("forces every served text result to remain non-writable", async () => {
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
      writable: false,
      reason: "Served workbenches are read-only",
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

  it("makes every capability outside packet zero visibly unavailable", async () => {
    const served = createServedWorkbenchHost(client());
    const scope = { projectId: "project-1", worktreeId: "worktree-1" };
    const resource = { ...scope, relativePath: "notes.md" };

    await expect(served.writeTextFile(resource, "changed")).rejects.toThrow("read-only");
    await expect(served.saveWorkspace(["project-1"])).rejects.toThrow("unavailable");
    await expect(served.openWorkspace("workspace-1")).rejects.toThrow("unavailable");
    await expect(
      served.createThreadWorktree({
        projectId: scope.projectId,
        name: "thread",
        branch: "thread",
        baseRevision: null,
      }),
    ).resolves.toMatchObject({ status: "refused" });
    await expect(
      served.terminal.start({
        ...scope,
        viewport: { rows: 24, columns: 80, pixelWidth: 0, pixelHeight: 0 },
      }),
    ).rejects.toThrow();
    await expect(served.git.status(scope)).resolves.toMatchObject({
      availability: "unavailable",
      problem: "Git inspection is unavailable in the read-only served workbench",
    });
    await expect(
      served.fileTree.mutate?.({
        ...scope,
        operation: "create",
        relativePath: "new.md",
        kind: "file",
      }),
    ).resolves.toMatchObject({ status: "refused" });
  });
});
