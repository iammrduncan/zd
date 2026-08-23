import { afterEach, describe, expect, it, vi } from "vitest";

import type { AttentionNotificationAdapter, NotificationRoutingProblem } from "@/notifications";
import { AttentionSettingsController, mountAttentionSettings } from "@/workbench/attention";
import { attentionSettings, forgetPreferences } from "@/workbench/preferences";

function adapter(permission: "granted" | "denied" | "prompt" | "unsupported" = "prompt") {
  let current = permission;
  const requestPermission = vi.fn(async () => current);
  return {
    value: {
      permission: vi.fn(async () => current),
      requestPermission,
      show: vi.fn(async () => ({ status: "presented" as const, problem: null })),
      onAction: () => () => {},
      playSound: vi.fn(async () => ({ status: "played" as const, problem: null })),
    } satisfies AttentionNotificationAdapter,
    requestPermission,
    setPermission: (next: typeof current) => {
      current = next;
    },
  };
}

afterEach(() => {
  forgetPreferences();
  window.localStorage.clear();
});

describe("attention settings", () => {
  it("inspects permission without prompting and requests only on explicit enable", async () => {
    const native = adapter("prompt");
    const controller = new AttentionSettingsController(native.value);

    await controller.load();
    expect(native.requestPermission).not.toHaveBeenCalled();
    expect(controller.snapshot()).toMatchObject({
      permission: "prompt",
      settings: { desktopEnabled: false, soundEnabled: false },
    });

    native.setPermission("granted");
    await controller.setDesktopEnabled(true);
    expect(native.requestPermission).toHaveBeenCalledOnce();
    expect(controller.snapshot().settings.desktopEnabled).toBe(true);
    expect(attentionSettings().desktopEnabled).toBe(true);
  });

  it("keeps denied and unsupported permission visible while leaving attention usable", async () => {
    for (const permission of ["denied", "unsupported"] as const) {
      const native = adapter(permission);
      const controller = new AttentionSettingsController(native.value);

      await expect(controller.setDesktopEnabled(true)).resolves.toBeUndefined();
      expect(controller.snapshot()).toMatchObject({
        permission,
        settings: { desktopEnabled: false },
        problem: expect.any(String),
      });
    }
  });

  it("applies sound, mute, volume, and per-agent selections immediately", () => {
    const controller = new AttentionSettingsController(adapter().value);

    controller.setSoundEnabled(true);
    controller.setMuted(true);
    controller.setVolume(0.24);
    controller.setAgentSound("opencode", "gentle");

    expect(controller.snapshot().settings).toMatchObject({
      soundEnabled: true,
      muted: true,
      volume: 0.24,
      agentSounds: { opencode: "gentle" },
    });
  });

  it("previews a newly selected agent sound at the current volume", async () => {
    const native = adapter();
    const controller = new AttentionSettingsController(native.value);
    controller.setSoundEnabled(true);
    controller.setVolume(0.35);
    const host = document.createElement("div");
    const unmount = mountAttentionSettings(host, controller);
    const codex = host.querySelector<HTMLSelectElement>('[data-agent-sound="codex"]')!;

    codex.value = "bright";
    codex.dispatchEvent(new Event("change"));

    await vi.waitFor(() =>
      expect(native.value.playSound).toHaveBeenCalledWith({ sound: "bright", volume: 0.35 }),
    );
    expect(attentionSettings().agentSounds.codex).toBe("bright");
    unmount();
  });

  it("renders unavailable controls with an explanation and persists immediate choices", async () => {
    const controller = new AttentionSettingsController(adapter("unsupported").value);
    const host = document.createElement("div");
    const unmount = mountAttentionSettings(host, controller);

    await vi.waitFor(() =>
      expect(host.querySelector("[data-attention-status]")?.textContent).toContain("unavailable"),
    );
    const desktop = host.querySelector<HTMLInputElement>("[data-notifications-toggle]")!;
    expect(desktop.disabled).toBe(true);

    const sound = host.querySelector<HTMLInputElement>("[data-sound-toggle]")!;
    sound.checked = true;
    sound.dispatchEvent(new Event("change"));
    expect(attentionSettings().soundEnabled).toBe(true);

    const volume = host.querySelector<HTMLInputElement>("[data-sound-volume]")!;
    volume.value = "30";
    volume.dispatchEvent(new Event("input"));
    expect(attentionSettings().volume).toBe(0.3);
    unmount();
    expect(host.children).toHaveLength(0);
  });

  it("shows the exact stale notification target as a recoverable workbench notice", () => {
    const controller = new AttentionSettingsController(adapter().value);
    const problem: NotificationRoutingProblem = {
      notificationId: "attention:thread-alpha:1",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      threadId: "thread-alpha",
      summary: "Worktree worktree-alpha is missing",
    };
    const host = document.createElement("div");
    mountAttentionSettings(host, controller);

    controller.reportRoutingProblem(problem);

    expect(host.querySelector("[data-attention-routing-problem]")?.textContent).toContain(
      "Worktree worktree-alpha is missing",
    );
    expect(controller.snapshot().routingProblem).toEqual(problem);
  });
});
