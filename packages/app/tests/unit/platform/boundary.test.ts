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
import { forgetPreferences, setSspsEnabled } from "@/suite/preferences";
import { trackAppPresence } from "@/suite/presence";

class Socket {
  static instances: Socket[] = [];

  readonly close = vi.fn();
  readonly url: string;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    Socket.instances.push(this);
  }
}

describe("the Tauri window boundary", () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invoke.mockReset();
    genericListen.mockClear();
    nativeWindow.onCloseRequested.mockReset();
    Socket.instances = [];
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

  it("tracks only the launched desktop app as present", () => {
    vi.stubGlobal("WebSocket", Socket);

    const stopBrowser = trackAppPresence("browser");
    const stopDesktop = trackAppPresence("tauri");
    const stopDuplicate = trackAppPresence("tauri");

    expect(Socket.instances).toHaveLength(1);
    expect(Socket.instances[0]?.url).toContain("wss://usessps.com/ws?site-id=271");
    expect(stopDuplicate).toBe(stopDesktop);
    stopBrowser();
    stopDesktop();
  });

  it("disconnects immediately and stays off when globally disabled", () => {
    vi.stubGlobal("WebSocket", Socket);
    const stop = trackAppPresence("tauri");
    const socket = Socket.instances[0]!;

    setSspsEnabled(false);

    expect(socket.close).toHaveBeenCalledOnce();
    expect(Socket.instances).toHaveLength(1);
    stop();
  });

  it("starts a disabled window when the global preference is turned back on", () => {
    vi.stubGlobal("WebSocket", Socket);
    setSspsEnabled(false);
    const stop = trackAppPresence("tauri");
    expect(Socket.instances).toHaveLength(0);

    setSspsEnabled(true);
    expect(Socket.instances).toHaveLength(1);
    stop();
  });
});
