import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const genericListen = vi.hoisted(() => vi.fn(async () => vi.fn()));
const nativeWindow = vi.hoisted(() => ({
  onCloseRequested: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: genericListen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => nativeWindow }));

import { detectPlatform } from "@/platform";
import { createTerminalStartRequest, terminalViewport } from "@/terminal";
import { forgetPreferences } from "@/workbench/preferences";

describe("the Tauri window boundary", () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invoke.mockReset();
    genericListen.mockClear();
    nativeWindow.onCloseRequested.mockReset();
    forgetPreferences();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("asks the native shell for one approved project/worktree listing", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue({
      projectId: "project-a",
      worktreeId: "worktree-a",
      root: "/w",
      files: [
        {
          resource: {
            projectId: "project-a",
            worktreeId: "worktree-a",
            relativePath: "notes.md",
          },
          relative: "notes.md",
        },
      ],
    });

    await detectPlatform().workspaceFiles("project-a", "worktree-a");

    expect(invoke).toHaveBeenCalledExactlyOnceWith("workspace_files", {
      projectId: "project-a",
      worktreeId: "worktree-a",
    });
  });

  it("keeps complete file-tree snapshots inside an approved project/worktree scope", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue({
      status: "empty",
      projectId: "project-a",
      worktreeId: "worktree-a",
      revision: "revision-1",
      elapsedMicros: 12,
    });
    const request = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      previousRevision: null,
    };

    await detectPlatform().fileTree.snapshot(request);

    expect(invoke).toHaveBeenCalledExactlyOnceWith("file_tree_snapshot", { request });
    expect(request).not.toHaveProperty("root");
    expect(request).not.toHaveProperty("followLinks");
  });

  it("reports file trees as unavailable without a desktop grant boundary", async () => {
    await expect(
      detectPlatform().fileTree.snapshot({
        projectId: "project-a",
        worktreeId: "worktree-a",
        previousRevision: null,
      }),
    ).resolves.toEqual({
      status: "unavailable",
      projectId: "project-a",
      worktreeId: "worktree-a",
      problem: "file trees require the desktop shell",
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps Git inspection read-only and scoped to approved identities", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue({ availability: "available" });
    const scope = { projectId: "project-a", worktreeId: "worktree-a" };
    const history = { scope, cursor: null, pageSize: 40 };
    const comparison = {
      scope,
      baseCommitId: "a".repeat(40),
      headCommitId: "b".repeat(40),
    };
    const git = detectPlatform().git;

    await git.status(scope);
    await git.history(history);
    await git.compare(comparison);

    expect(invoke.mock.calls).toEqual([
      ["git_status", { scope }],
      ["git_history_page", { request: history }],
      ["git_compare", { request: comparison }],
    ]);
    expect(scope).not.toHaveProperty("root");
  });

  it("reports Git inspection as unavailable without a desktop shell", async () => {
    const scope = { projectId: "project-a", worktreeId: "worktree-a" };

    await expect(detectPlatform().git.status(scope)).resolves.toMatchObject({
      scope,
      availability: "unavailable",
      entries: [],
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("opens and recovers projects only through native picker commands", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue(null);
    const platform = detectPlatform();

    await platform.chooseProject();
    await platform.recoverProjectGrant("project-a");

    expect(invoke.mock.calls).toEqual([
      ["choose_project"],
      ["recover_project_grant", { projectId: "project-a" }],
    ]);
  });

  it("treats project picking as unavailable in the browser shell", async () => {
    const platform = detectPlatform();

    await expect(platform.chooseProject()).resolves.toBeNull();
    await expect(platform.recoverProjectGrant("project-a")).resolves.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads theme configuration only through the native config boundary", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue([{ fileName: "quiet.theme.config", contents: "{}", problem: null }]);

    await detectPlatform().themeConfigFiles();

    expect(invoke).toHaveBeenCalledExactlyOnceWith("theme_config_files");
  });

  it("keeps native global summon behind the typed window boundary", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke
      .mockResolvedValueOnce({
        supported: true,
        registered: true,
        shortcut: "CmdOrCtrl+Shift+Space",
        problem: null,
      })
      .mockResolvedValueOnce("quick-access")
      .mockResolvedValueOnce("ordinary");
    const platform = detectPlatform();

    await platform.registerGlobalSummon();
    await platform.toggleQuickAccess();
    await platform.hideQuickAccess();

    expect(invoke.mock.calls).toEqual([
      ["register_global_summon"],
      ["toggle_quick_access"],
      ["hide_quick_access"],
    ]);
  });

  it("keeps local diagnostics behind closed native commands", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke
      .mockResolvedValueOnce({
        enabled: false,
        sessionId: null,
        backgroundSampling: false,
        problem: null,
      })
      .mockResolvedValueOnce({
        enabled: true,
        sessionId: "session-1",
        backgroundSampling: true,
        problem: null,
      })
      .mockResolvedValueOnce({ recorded: true, problem: null })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        enabled: false,
        sessionId: null,
        backgroundSampling: false,
        problem: null,
      });
    const platform = detectPlatform();
    const record = {
      recordType: "event" as const,
      operation: "workbench.launch",
      outcome: "ok" as const,
    };

    await platform.diagnosticsStatus();
    await platform.enableDiagnostics();
    await platform.recordDiagnostic(record);
    await platform.revealDiagnostics();
    await platform.disableDiagnostics();

    expect(invoke.mock.calls).toEqual([
      ["diagnostics_status"],
      ["enable_diagnostics"],
      ["record_diagnostic", { record }],
      ["reveal_diagnostics"],
      ["disable_diagnostics"],
    ]);
  });

  it("keeps diagnostics inert in the browser shell", async () => {
    const platform = detectPlatform();

    await expect(platform.diagnosticsStatus()).resolves.toMatchObject({ enabled: false });
    await expect(platform.enableDiagnostics()).resolves.toMatchObject({
      enabled: false,
      problem: expect.any(String),
    });
    await expect(
      platform.recordDiagnostic({
        recordType: "event",
        operation: "workbench.launch",
        outcome: "ok",
      }),
    ).resolves.toEqual({ recorded: false, problem: null });
    await expect(platform.revealDiagnostics()).rejects.toThrow("desktop shell");
    await expect(platform.disableDiagnostics()).resolves.toMatchObject({ enabled: false });
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps terminal lifecycle behind the structured native boundary", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    const session = {
      sessionId: "session-0000000000000001",
      projectId: "project-a",
      worktreeId: "worktree-a",
    };
    const viewport = terminalViewport({ rows: 24, columns: 80 });
    const request = createTerminalStartRequest(session, viewport);
    invoke
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        session,
        offset: 0,
        droppedBefore: 0,
        bytes: [122, 100],
        readError: null,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ reason: "terminated", code: null, signal: null })
      .mockResolvedValueOnce(undefined);
    const terminal = detectPlatform().terminal;

    await terminal.start(request);
    await terminal.write(session, [13]);
    await terminal.resize(session, viewport);
    await terminal.read(session);
    await terminal.pollExit(session);
    await terminal.terminate(session);
    await terminal.dispose(session);

    expect(invoke.mock.calls).toEqual([
      ["terminal_start", { request }],
      ["terminal_write", { session, bytes: [13] }],
      ["terminal_resize", { session, viewport }],
      ["terminal_read", { session }],
      ["terminal_poll_exit", { session }],
      ["terminal_terminate", { session }],
      ["terminal_dispose", { session }],
    ]);
    expect(request).not.toHaveProperty("cwd");
    expect(request).not.toHaveProperty("command");
    expect(request).not.toHaveProperty("environment");
  });

  it("does not pretend a browser can own terminal processes", async () => {
    const terminal = detectPlatform().terminal;
    const request = createTerminalStartRequest(
      { projectId: "project-a", worktreeId: "worktree-a" },
      { rows: 24, columns: 80 },
    );

    await expect(terminal.start(request)).rejects.toThrow("desktop shell");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("never sends an absolute path through ordinary file commands", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue(null);
    const resource = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "docs/notes.md",
    };
    const platform = detectPlatform();

    await platform.readTextFile(resource);
    await platform.readBoundedFile(resource);
    await platform.writeTextFile(resource, "updated");
    await platform.fileStamp(resource);

    expect(invoke.mock.calls).toEqual([
      ["read_text_file", { resource }],
      ["read_bounded_file", { resource }],
      ["write_text_file", { resource, contents: "updated" }],
      ["file_stamp", { resource }],
    ]);
  });

  it("returns an honest bounded-read state without a desktop shell", async () => {
    const resource = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "src/main.ts",
    };

    await expect(detectPlatform().readBoundedFile(resource)).resolves.toEqual({
      status: "unavailable",
      problem: "bounded file reads require the desktop shell",
    });
  });

  it("routes the native close request through the document before the window can close", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });

    let nativeClose: ((event: { preventDefault(): void }) => void) | null = null;
    const unlisten = vi.fn();
    nativeWindow.onCloseRequested.mockImplementation(async (handler) => {
      nativeClose = handler;
      return unlisten;
    });

    const requested = vi.fn();
    const stop = detectPlatform().onCloseRequested(requested);

    expect(
      nativeWindow.onCloseRequested,
      "Cmd+W never reached the native close-request guard",
    ).toHaveBeenCalledOnce();
    expect(
      genericListen,
      "the close guard still relies on a second custom event",
    ).not.toHaveBeenCalled();

    const preventDefault = vi.fn();
    nativeClose!({ preventDefault });

    expect(
      preventDefault,
      "the native window was allowed to close before the editor answered",
    ).toHaveBeenCalledOnce();
    expect(requested).toHaveBeenCalledOnce();

    stop();
    await Promise.resolve();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
