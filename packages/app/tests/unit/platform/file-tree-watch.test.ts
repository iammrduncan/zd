import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
const nativeListen = vi.hoisted(() => vi.fn(async () => vi.fn()));

vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: nativeListen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));

import { detectPlatform } from "@/platform";

describe("the file-tree watch platform boundary", () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    invoke.mockReset();
    nativeListen.mockReset();
    nativeListen.mockResolvedValue(vi.fn());
  });

  it("starts and stops one path-free native watch", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    let emit: (event: { payload: Record<string, string> }) => void = () => {
      throw new Error("file-tree listener was not installed");
    };
    const unlisten = vi.fn();
    const typedListen = nativeListen as unknown as {
      mockImplementationOnce(
        implementation: (
          eventName: string,
          handler: (event: { payload: Record<string, string> }) => void,
        ) => Promise<() => void>,
      ): void;
    };
    typedListen.mockImplementationOnce(async (_eventName, handler) => {
      emit = handler;
      return unlisten;
    });
    invoke.mockResolvedValue(undefined);
    const scope = { projectId: "project-a", worktreeId: "worktree-a" };
    const changed = vi.fn();

    const stop = detectPlatform().fileTree.watch(scope, changed);
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "start_file_tree_watch",
        expect.objectContaining({ request: expect.objectContaining(scope) }),
      ),
    );
    const request = invoke.mock.calls.find(([command]) => command === "start_file_tree_watch")?.[1]
      .request;
    expect(request.watchId).toMatch(/^file-tree-watch-\d+$/u);
    expect(request).not.toHaveProperty("path");
    expect(changed).toHaveBeenCalledWith({ status: "ready" });

    emit({ payload: { ...request, status: "changed" } });
    expect(changed).toHaveBeenLastCalledWith({ status: "changed" });

    stop();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("stop_file_tree_watch", { request }),
    );
    expect(unlisten).toHaveBeenCalledOnce();
  });

  it("reports automatic updates as unavailable without a desktop shell", async () => {
    const watchEvent = vi.fn();

    const stop = detectPlatform().fileTree.watch(
      { projectId: "project-a", worktreeId: "worktree-a" },
      watchEvent,
    );

    await vi.waitFor(() =>
      expect(watchEvent).toHaveBeenCalledWith({
        status: "unavailable",
        problem: "automatic file-tree updates require the desktop shell",
      }),
    );
    stop();
    expect(invoke).not.toHaveBeenCalled();
  });
});
