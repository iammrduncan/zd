import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const genericListen = vi.hoisted(() => vi.fn(async () => vi.fn()));
const nativeWindow = vi.hoisted(() => ({
  onCloseRequested: vi.fn(async () => vi.fn()),
  isFocused: vi.fn(async () => true),
  onFocusChanged: vi.fn(async () => vi.fn()),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: genericListen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => nativeWindow }));

import { connectDesktopServedPlatform } from "@/platform";
import { mountDesktopHostStatus, mountDesktopStartup } from "@/platform/desktop-startup";
import type { ServedHostClient } from "@/platform/served-client";

describe("the desktop served boundary", () => {
  afterEach(() => {
    invoke.mockReset();
    genericListen.mockClear();
  });

  it("uses the private bootstrap once, host socket for work, and Tauri only for shell behavior", async () => {
    const bootstrap = {
      origin: window.location.origin,
      sessionEpoch: "YWFhYWFhYWFhYWFhYWFhYQ",
      secret: "a".repeat(43),
    };
    invoke.mockResolvedValueOnce(bootstrap).mockResolvedValueOnce("quick-access");
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
    expect(connect).toHaveBeenCalledExactlyOnceWith({
      origin: bootstrap.origin,
      secret: bootstrap.secret,
    });
    expect(request.mock.calls).toEqual([
      ["session.snapshot", {}],
      ["projectGrants.list", {}],
    ]);
    expect(invoke.mock.calls).toEqual([["take_desktop_bootstrap"], ["toggle_quick_access"]]);
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
});
