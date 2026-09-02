import { describe, expect, it, vi } from "vitest";

import { detectPlatform } from "@/platform";
import { isServedPage, mountServedLimits, mountServedUnlock } from "@/platform/served-unlock";

describe("served host unlock", () => {
  it("detects only the server-injected served-host marker", () => {
    const ordinary = document.implementation.createHTMLDocument("ordinary");
    const served = document.implementation.createHTMLDocument("served");
    const marker = served.createElement("meta");
    marker.name = "zd-served-host";
    marker.content = "1";
    served.head.append(marker);

    expect(isServedPage(ordinary)).toBe(false);
    expect(isServedPage(served)).toBe(true);
  });

  it("distinguishes remote runtime authority from desktop-only capabilities", () => {
    const host = document.createElement("main");

    mountServedLimits(host);

    const notice = host.querySelector('[role="status"][aria-label="Served workbench limits"]');
    expect(notice?.textContent).toContain(
      "Editing, automatic file updates, Git, terminals, themes, and diagnostics run on the remote host",
    );
    expect(notice?.textContent).toContain(
      "Remote project folders can be opened beside the current project. Recent workspaces and desktop notifications are unavailable",
    );
  });

  it("tries a saved browser pairing before rendering the credential form", async () => {
    const host = document.createElement("main");
    const platform = detectPlatform();
    const connect = vi.fn(async () => platform);

    const unlocked = mountServedUnlock(host, connect);

    await vi.waitFor(() => expect(connect).toHaveBeenCalledExactlyOnceWith(null));
    await expect(unlocked).resolves.toBe(platform);
    expect(host.querySelector('input[type="password"]')).toBeNull();
  });

  it("keeps the secret in the password field only until submission", async () => {
    const host = document.createElement("main");
    const platform = detectPlatform();
    const connect = vi
      .fn<(secret: string | null) => Promise<typeof platform>>()
      .mockRejectedValueOnce(new Error("authentication-failed"))
      .mockResolvedValueOnce(platform);
    const unlocked = mountServedUnlock(host, connect);
    await vi.waitFor(() => expect(host.querySelector("form")).not.toBeNull());
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;

    expect(input.autocomplete).toBe("off");
    expect(connect).toHaveBeenCalledExactlyOnceWith(null);
    input.value = "process-secret";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await expect(unlocked).resolves.toBe(platform);
    expect(connect.mock.calls).toEqual([[null], ["process-secret"]]);
    expect(input.value).toBe("");
    expect(host.textContent).not.toContain("process-secret");
  });

  it("reports a refusal beside the field and allows another attempt", async () => {
    const host = document.createElement("main");
    const platform = detectPlatform();
    const connect = vi
      .fn<(secret: string | null) => Promise<typeof platform>>()
      .mockRejectedValueOnce(new Error("authentication-failed"))
      .mockRejectedValueOnce(new Error("authentication-failed"))
      .mockResolvedValueOnce(platform);
    const unlocked = mountServedUnlock(host, connect);
    await vi.waitFor(() => expect(host.querySelector("form")).not.toBeNull());
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>("input")!;

    input.value = "wrong";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.textContent).toContain("could not unlock"));
    expect(input.disabled).toBe(false);

    input.value = "right";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await expect(unlocked).resolves.toBe(platform);
    expect(connect.mock.calls).toEqual([[null], ["wrong"], ["right"]]);
  });
});
