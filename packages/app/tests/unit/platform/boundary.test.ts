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
    await platform.writeTextFile(resource, "updated");
    await platform.fileStamp(resource);

    expect(invoke.mock.calls).toEqual([
      ["read_text_file", { resource }],
      ["write_text_file", { resource, contents: "updated" }],
      ["file_stamp", { resource }],
    ]);
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
