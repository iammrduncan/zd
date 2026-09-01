import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const genericListen = vi.hoisted(() => vi.fn(async () => vi.fn()));
const genericEmit = vi.hoisted(() => vi.fn(async () => undefined));
const nativeWindow = vi.hoisted(() => ({
  onCloseRequested: vi.fn(async () => vi.fn()),
  isFocused: vi.fn(async () => true),
  onFocusChanged: vi.fn(async () => vi.fn()),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ emit: genericEmit, listen: genericListen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => nativeWindow }));

import { connectDesktopServedPlatform } from "@/platform";
import {
  mountDesktopHostStatus,
  mountDesktopStartup,
  reportDesktopInstalledSmokeReady,
} from "@/platform/desktop-startup";
import type { ServedHostClient } from "@/platform/served-client";

describe("the desktop served boundary", () => {
  afterEach(() => {
    invoke.mockReset();
    genericListen.mockClear();
    genericEmit.mockClear();
    window.history.replaceState(null, "", "/");
    nativeWindow.onCloseRequested.mockReset();
    nativeWindow.onCloseRequested.mockResolvedValue(vi.fn());
    nativeWindow.isFocused.mockReset();
    nativeWindow.isFocused.mockResolvedValue(true);
    nativeWindow.onFocusChanged.mockReset();
    nativeWindow.onFocusChanged.mockResolvedValue(vi.fn());
  });

  it("uses the private bootstrap once, host socket for work, and Tauri only for shell behavior", async () => {
    const bootstrap = {
      origin: window.location.origin,
      sessionEpoch: "YWFhYWFhYWFhYWFhYWFhYQ",
      secret: "a".repeat(43),
    };
    invoke
      .mockResolvedValueOnce(bootstrap)
      .mockResolvedValueOnce("quick-access")
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const request = vi.fn(async (method: string) => {
      if (method === "session.snapshot") {
        return {
          sessionEpoch: bootstrap.sessionEpoch,
          sequence: 0,
          resourceStatus: "active",
          watches: [],
          terminals: [],
        };
      }
      if (method === "projectGrants.list") return { projects: [] };
      throw new Error(`unexpected host method: ${method}`);
    });
    const client: ServedHostClient = {
      request: request as unknown as ServedHostClient["request"],
      onEvent: () => () => {},
      onSnapshot: () => () => {},
      recentTimings: () => [],
      close: () => {},
    };
    const connect = vi.fn(async () => client);

    const platform = await connectDesktopServedPlatform(connect);

    await expect(platform.projectGrants()).resolves.toEqual([]);
    await expect(platform.toggleQuickAccess()).resolves.toBe("quick-access");
    await expect(platform.chooseProject()).resolves.toBeNull();
    await expect(platform.recoverProjectGrant("project-1")).resolves.toBeNull();
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      origin: bootstrap.origin,
      secret: bootstrap.secret,
    });
    expect(request.mock.calls).toEqual([
      ["session.snapshot", {}],
      ["projectGrants.list", {}],
    ]);
    expect(invoke.mock.calls).toEqual([
      ["take_desktop_bootstrap"],
      ["toggle_quick_access"],
      ["choose_project"],
      ["recover_project_grant", { projectId: "project-1" }],
    ]);
    expect(document.documentElement.outerHTML).not.toContain(bootstrap.secret);
    expect(window.localStorage.getItem("zd-desktop-secret")).toBeNull();
    expect(window.sessionStorage.getItem("zd-desktop-secret")).toBeNull();
  });

  it("rejects bootstrap data for any origin other than the loaded served page", async () => {
    invoke.mockResolvedValue({
      origin: "http://127.0.0.1:9",
      sessionEpoch: "YWFhYWFhYWFhYWFhYWFhYQ",
      secret: "a".repeat(43),
    });
    const connect = vi.fn();

    await expect(connectDesktopServedPlatform(connect)).rejects.toThrow("desktop bootstrap origin");
    expect(connect).not.toHaveBeenCalled();
  });

  it("keeps the desktop half limited to viewing-computer commands", async () => {
    const bootstrap = {
      origin: window.location.origin,
      sessionEpoch: "YWFhYWFhYWFhYWFhYWFhYQ",
      secret: "a".repeat(43),
    };
    invoke.mockImplementation(async (command: string) => {
      switch (command) {
        case "take_desktop_bootstrap":
          return bootstrap;
        case "register_global_summon":
          return {
            supported: true,
            registered: true,
            shortcut: "CmdOrCtrl+Shift+Space",
            problem: null,
          };
        case "toggle_quick_access":
          return "quick-access";
        case "hide_quick_access":
        case "show_workbench":
          return "ordinary";
        case "notification_permission":
        case "notification_request_permission":
          return "granted";
        case "show_thread_notification":
          return { status: "presented", problem: null };
        case "play_completion_sound":
          return { status: "played", problem: null };
        case "close_window":
        case "open_external":
          return undefined;
        default:
          throw new Error(`unexpected desktop command: ${command}`);
      }
    });
    const request = vi.fn(async (method: string) => {
      if (method === "session.snapshot") {
        return {
          sessionEpoch: bootstrap.sessionEpoch,
          sequence: 0,
          resourceStatus: "active",
          watches: [],
          terminals: [],
        };
      }
      throw new Error(`unexpected host method: ${method}`);
    });
    const client: ServedHostClient = {
      request: request as unknown as ServedHostClient["request"],
      onEvent: () => () => {},
      onSnapshot: () => () => {},
      recentTimings: () => [],
      close: () => {},
    };
    let nativeClose: ((event: { preventDefault(): void }) => void) | null = null;
    const unlistenClose = vi.fn();
    const typedCloseRequest = nativeWindow.onCloseRequested as unknown as {
      mockImplementation(
        implementation: (
          handler: (event: { preventDefault(): void }) => void,
        ) => Promise<() => void>,
      ): void;
    };
    typedCloseRequest.mockImplementation(async (handler) => {
      nativeClose = handler;
      return unlistenClose;
    });
    const platform = await connectDesktopServedPlatform(async () => client);
    const closeRequested = vi.fn();
    const stopClose = platform.onCloseRequested(closeRequested);
    const notification = {
      schemaVersion: 1 as const,
      notificationId: "attention:thread-alpha:1",
      eventId: "thread-alpha:1",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      title: "zd" as const,
      body: "Workbench · Review output · Codex",
    };

    await expect(platform.registerGlobalSummon()).resolves.toMatchObject({ registered: true });
    await expect(platform.toggleQuickAccess()).resolves.toBe("quick-access");
    await expect(platform.hideQuickAccess()).resolves.toBe("ordinary");
    await expect(platform.showWorkbench()).resolves.toBe("ordinary");
    await expect(platform.isWindowFocused()).resolves.toBe(true);
    await expect(platform.notifications.permission()).resolves.toBe("granted");
    await expect(platform.notifications.requestPermission()).resolves.toBe("granted");
    await expect(platform.notifications.show(notification)).resolves.toEqual({
      status: "presented",
      problem: null,
    });
    await expect(
      platform.notifications.playSound({ sound: "subtle", volume: 0.4 }),
    ).resolves.toEqual({ status: "played", problem: null });
    const preventDefault = vi.fn();
    nativeClose!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(closeRequested).toHaveBeenCalledOnce();
    await platform.closeWindow();
    await platform.openExternal("https://example.com");
    stopClose();
    await Promise.resolve();
    expect(unlistenClose).toHaveBeenCalledOnce();

    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "take_desktop_bootstrap",
      "register_global_summon",
      "toggle_quick_access",
      "hide_quick_access",
      "show_workbench",
      "notification_permission",
      "notification_request_permission",
      "show_thread_notification",
      "play_completion_sound",
      "close_window",
      "open_external",
    ]);
    expect(request.mock.calls).toEqual([["session.snapshot", {}]]);
  });

  it("keeps the local bootstrap page inert and reports startup failure accessibly", async () => {
    genericListen.mockImplementationOnce(async (...arguments_: unknown[]) => {
      const handler = arguments_[1] as (event: {
        payload: { phase: string; problem: string };
      }) => void;
      handler({
        payload: {
          phase: "failed",
          problem: "the desktop host process could not start",
        },
      });
      return vi.fn();
    });
    const host = document.createElement("main");

    mountDesktopStartup(host);

    await vi.waitFor(() => expect(host.textContent).toContain("could not start"));
    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("preserves the mounted workbench and appends an accessible disconnect notice", async () => {
    let status: ((event: unknown) => void) | null = null;
    genericListen.mockImplementationOnce(async (...arguments_: unknown[]) => {
      status = arguments_[1] as (event: unknown) => void;
      return vi.fn();
    });
    const host = document.createElement("main");
    const workbench = document.createElement("section");
    workbench.className = "zd-workbench";
    workbench.textContent = "unsaved editor state";
    host.append(workbench);

    mountDesktopHostStatus(host);
    await vi.waitFor(() => expect(status).not.toBeNull());
    status!({
      payload: {
        phase: "disconnected",
        problem: "the desktop host process exited unexpectedly",
      },
    });

    expect(host.querySelector(".zd-workbench")).toBe(workbench);
    expect(host.textContent).toContain("unsaved editor state");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("disconnected");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("exited unexpectedly");
  });

  it("reports installed readiness only after one shell action and a refused retired command", async () => {
    window.history.replaceState(null, "", "/?zd-installed-smoke=normal");
    invoke.mockResolvedValueOnce("ordinary").mockRejectedValueOnce(new Error("not registered"));

    await reportDesktopInstalledSmokeReady();

    expect(invoke.mock.calls).toEqual([["show_workbench"], ["read_text_file", {}]]);
    expect(genericEmit).toHaveBeenCalledExactlyOnceWith("zd-installed-smoke", {
      checkpoint: "ready",
    });
  });

  it("reports crash presentation only after the installed crash notice is mounted", async () => {
    window.history.replaceState(null, "", "/?zd-installed-smoke=crash");
    let status: ((event: unknown) => void) | null = null;
    genericListen.mockImplementationOnce(async (...arguments_: unknown[]) => {
      status = arguments_[1] as (event: unknown) => void;
      return vi.fn();
    });
    const host = document.createElement("main");

    mountDesktopHostStatus(host);
    await vi.waitFor(() => expect(status).not.toBeNull());
    status!({
      payload: {
        phase: "disconnected",
        problem: "the desktop host process exited unexpectedly",
      },
    });

    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(genericEmit).toHaveBeenCalledExactlyOnceWith("zd-installed-smoke", {
      checkpoint: "crash-presented",
    });
  });
});
