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

  it("asks the native shell for the scoped workspace files", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue({
      root: "/w",
      files: [{ path: "/w/notes.md", relative: "notes.md" }],
    });

    await detectPlatform().workspaceFiles();

    expect(invoke).toHaveBeenCalledExactlyOnceWith("workspace_files");
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
