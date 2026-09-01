import { describe, expect, it, vi } from "vitest";

import { createServedWorkbenchHost } from "@/platform/served";
import type {
  ServedHostClient,
  ServedHostEvent,
  ServedSessionSnapshot,
} from "@/platform/served-client";

interface FixtureClient extends ServedHostClient {
  emitEvent(event: ServedHostEvent): void;
  emitSnapshot(snapshot: ServedSessionSnapshot): void;
}

function terminalRequest(terminalId: string) {
  return {
    projectId: "project-1",
    worktreeId: "worktree-1",
    terminalId,
    viewport: { rows: 24, columns: 80, pixelWidth: 0, pixelHeight: 0 },
  } as const;
}

function client(runtimeTerminals: readonly unknown[] = []): FixtureClient {
  const eventListeners = new Set<(event: ServedHostEvent) => void>();
  const snapshotListeners = new Set<(snapshot: ServedSessionSnapshot) => void>();
  const request = vi.fn(async (method: string, params?: Record<string, unknown>) => {
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
            fileWatch: "read-only",
            git: "read-only",
            worktrees: "read-write",
            terminal: "read-write",
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
      case "session.snapshot":
        return {
          sessionEpoch: "epoch-1",
          sequence: 0,
          resourceStatus: "active",
          watches: [],
          terminals: runtimeTerminals,
        };
      case "fileTree.watch.start":
      case "fileTree.watch.stop":
        return null;
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
      case "terminal.start":
        return {
          sessionId: params?.terminalId,
          projectId: params?.projectId,
          worktreeId: params?.worktreeId,
        };
      case "terminal.reattach": {
        const matching = runtimeTerminals.find((value) => {
          const snapshot = value as {
            readonly session?: {
              readonly sessionId?: unknown;
              readonly projectId?: unknown;
              readonly worktreeId?: unknown;
            };
          };
          return (
            snapshot.session?.sessionId === params?.terminalId &&
            snapshot.session?.projectId === params?.projectId &&
            snapshot.session?.worktreeId === params?.worktreeId
          );
        }) as { readonly session?: unknown } | undefined;
        return matching?.session ?? null;
      }
      case "terminal.write":
      case "terminal.resize":
      case "terminal.dispose":
        return null;
      case "terminal.read":
        return {
          session: params?.session,
          offset: 0,
          droppedBefore: 0,
          bytesBase64: "aGVsbG8=",
          readError: null,
        };
      case "terminal.pollExit":
        return null;
      case "terminal.terminate":
        return { reason: "terminated", code: null, signal: null };
      default:
        throw new Error(`unexpected method ${method}`);
    }
  });
  return {
    // The fixture returns the same closed method results that the adapter requests below.
    request: request as ServedHostClient["request"],
    onEvent: (listener) => {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    onSnapshot: (listener) => {
      snapshotListeners.add(listener);
      return () => snapshotListeners.delete(listener);
    },
    recentTimings: () => [],
    close: vi.fn(),
    emitEvent: (event) => eventListeners.forEach((listener) => listener(event)),
    emitSnapshot: (snapshot) => snapshotListeners.forEach((listener) => listener(snapshot)),
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

  it("routes watcher events and terminal bytes through the served runtime", async () => {
    const hostClient = client();
    const served = createServedWorkbenchHost(hostClient);
    const scope = { projectId: "project-1", worktreeId: "worktree-1" };
    const watchEvents: string[] = [];
    const stop = served.fileTree.watch(scope, (event) => watchEvents.push(event.status));
    await vi.waitFor(() => expect(watchEvents).toEqual(["ready"]));
    const watchRequest = vi
      .mocked(hostClient.request)
      .mock.calls.find(([method]) => method === "fileTree.watch.start")?.[1] as {
      watchId: string;
    };
    hostClient.emitEvent({
      protocolVersion: 1,
      type: "event",
      sessionEpoch: "epoch-1",
      sequence: 1,
      event: "fileTree.changed",
      payload: { ...scope, watchId: watchRequest.watchId },
    });
    expect(watchEvents).toEqual(["ready", "changed"]);
    stop();
    await vi.waitFor(() =>
      expect(hostClient.request).toHaveBeenCalledWith("fileTree.watch.stop", {
        ...scope,
        watchId: watchRequest.watchId,
      }),
    );

    const output: string[] = [];
    const stopOutput = served.terminal.onOutputReady?.((session) => output.push(session.sessionId));
    expect(served.terminal.writeScheduling).toBe("ordered-pipeline");
    const session = await served.terminal.start(terminalRequest("session-started"));
    await served.terminal.write(session, [104, 105]);
    expect(hostClient.request).toHaveBeenCalledWith("terminal.write", {
      session,
      bytesBase64: "aGk=",
    });
    await expect(served.terminal.read(session)).resolves.toEqual({
      session,
      offset: 0,
      droppedBefore: 0,
      bytes: [104, 101, 108, 108, 111],
      readError: null,
    });
    hostClient.emitEvent({
      protocolVersion: 1,
      type: "event",
      sessionEpoch: "epoch-1",
      sequence: 2,
      event: "terminal.outputReady",
      payload: { session },
    });
    expect(output).toEqual(["session-started"]);
    stopOutput?.();
  });

  it("refreshes file and Git knowledge after an authoritative resnapshot", async () => {
    const hostClient = client();
    const served = createServedWorkbenchHost(hostClient);
    const scope = { projectId: "project-1", worktreeId: "worktree-1" };
    const watchEvents: string[] = [];
    served.fileTree.watch(scope, (event) => watchEvents.push(event.status));
    await vi.waitFor(() => expect(watchEvents).toEqual(["ready"]));
    const watchRequest = vi
      .mocked(hostClient.request)
      .mock.calls.find(([method]) => method === "fileTree.watch.start")?.[1] as {
      watchId: string;
    };

    hostClient.emitSnapshot({
      sessionEpoch: "epoch-1",
      sequence: 3,
      resourceStatus: "active",
      watches: [{ ...scope, watchId: watchRequest.watchId }],
      terminals: [],
    });

    await vi.waitFor(() => expect(watchEvents).toEqual(["ready", "changed"]));
  });

  it("reattaches a snapshotted terminal instead of starting a duplicate shell", async () => {
    const session = {
      sessionId: "session-existing",
      projectId: "project-1",
      worktreeId: "worktree-1",
    };
    const hostClient = client([
      {
        session,
        retainedFrom: 0,
        nextOffset: 12,
        availability: "running",
        exit: null,
      },
    ]);
    const served = createServedWorkbenchHost(hostClient);

    await expect(served.terminal.reattach!(terminalRequest("session-existing"))).resolves.toEqual(
      session,
    );
    expect(hostClient.request).toHaveBeenCalledWith(
      "terminal.reattach",
      terminalRequest("session-existing"),
    );
  });

  it("reattaches a snapshotted terminal tombstone instead of hiding its loss", async () => {
    const session = {
      sessionId: "session-lost",
      projectId: "project-1",
      worktreeId: "worktree-1",
    };
    const hostClient = client([
      {
        session,
        retainedFrom: 12,
        nextOffset: 12,
        availability: "unavailable",
        exit: null,
      },
    ]);
    const served = createServedWorkbenchHost(hostClient);

    await expect(served.terminal.reattach!(terminalRequest("session-lost"))).resolves.toEqual(
      session,
    );
    await expect(served.terminal.read(session)).resolves.toMatchObject({
      session,
      offset: 12,
      bytes: [],
      readError: "The remote terminal session is no longer available.",
    });
    expect(hostClient.request).not.toHaveBeenCalledWith("terminal.start", expect.anything());
  });

  it("retains an initial snapshot failure until terminal attachment observes it", async () => {
    const hostClient = client();
    vi.mocked(hostClient.request).mockRejectedValueOnce(new Error("snapshot unavailable"));
    const served = createServedWorkbenchHost(hostClient);
    await Promise.resolve();
    await Promise.resolve();

    await expect(served.terminal.reattach!(terminalRequest("session-existing"))).rejects.toThrow(
      "snapshot unavailable",
    );
    expect(hostClient.request).not.toHaveBeenCalledWith("terminal.start", expect.anything());
  });

  it("does not substitute another same-scope terminal during exact reattachment", async () => {
    const hostClient = client([
      {
        session: {
          sessionId: "session-other",
          projectId: "project-1",
          worktreeId: "worktree-1",
        },
        retainedFrom: 0,
        nextOffset: 12,
        availability: "running",
        exit: null,
      },
    ]);
    const served = createServedWorkbenchHost(hostClient);

    await expect(served.terminal.reattach!(terminalRequest("session-missing"))).resolves.toBeNull();
    expect(hostClient.request).not.toHaveBeenCalledWith("terminal.start", expect.anything());
  });

  it("turns a post-grace terminal tombstone into an explicit lost read", async () => {
    const hostClient = client();
    const served = createServedWorkbenchHost(hostClient);
    const session = await served.terminal.start(terminalRequest("session-started"));
    const output: string[] = [];
    served.terminal.onOutputReady?.((handle) => output.push(handle.sessionId));
    vi.mocked(hostClient.request).mockClear();

    hostClient.emitSnapshot({
      sessionEpoch: "epoch-1",
      sequence: 4,
      resourceStatus: "lost",
      watches: [],
      terminals: [
        {
          session,
          retainedFrom: 5,
          nextOffset: 5,
          availability: "unavailable",
          exit: null,
        },
      ],
    });

    expect(output).toEqual([session.sessionId]);
    await expect(served.terminal.read(session)).resolves.toMatchObject({
      session,
      offset: 5,
      bytes: [],
      readError: "The remote terminal session is no longer available.",
    });
    expect(hostClient.request).not.toHaveBeenCalledWith("terminal.read", expect.anything());
  });

  it("keeps desktop-only shell authority unavailable", async () => {
    const served = createServedWorkbenchHost(client());

    await expect(served.saveWorkspace(["project-1"])).rejects.toThrow("unavailable");
    await expect(served.openWorkspace("workspace-1")).rejects.toThrow("unavailable");
    await expect(served.revealDiagnostics()).rejects.toThrow("unavailable");
  });
});
