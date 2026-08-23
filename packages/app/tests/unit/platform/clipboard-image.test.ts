import { afterEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { detectPlatform } from "@/platform";

afterEach(() => {
  delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  invoke.mockReset();
});

describe("the clipboard-image platform boundary", () => {
  it("sends only an approved scope, supported type, and bytes to the fixed native command", async () => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invoke.mockResolvedValue({ relativePath: "docs/screenshots/screenshot-1.png" });
    const request = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      mediaType: "image/png" as const,
      bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
    };

    await detectPlatform().saveClipboardImage(request);

    expect(invoke).toHaveBeenCalledExactlyOnceWith("save_clipboard_image", { request });
    expect(request).not.toHaveProperty("path");
    expect(request).not.toHaveProperty("directory");
    expect(request).not.toHaveProperty("fileName");
  });

  it("does not pretend a browser can persist clipboard images", async () => {
    await expect(
      detectPlatform().saveClipboardImage({
        projectId: "project-a",
        worktreeId: "worktree-a",
        mediaType: "image/png",
        bytes: Uint8Array.of(0x89, 0x50, 0x4e, 0x47),
      }),
    ).rejects.toThrow("desktop shell");
    expect(invoke).not.toHaveBeenCalled();
  });
});
