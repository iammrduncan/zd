import { describe, expect, it, vi } from "vitest";

import { detectPlatform } from "@/platform";
import { isServedPage, mountServedUnlock } from "@/platform/served-unlock";

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

  it("keeps the secret in the password field only until submission", async () => {
    const host = document.createElement("main");
    const platform = detectPlatform();
    const connect = vi.fn(async () => platform);
    const unlocked = mountServedUnlock(host, connect);
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>('input[type="password"]')!;

    expect(input.autocomplete).toBe("off");
    expect(connect).not.toHaveBeenCalled();
    input.value = "process-secret";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await expect(unlocked).resolves.toBe(platform);
    expect(connect).toHaveBeenCalledExactlyOnceWith("process-secret");
    expect(input.value).toBe("");
    expect(host.textContent).not.toContain("process-secret");
  });

  it("reports a refusal beside the field and allows another attempt", async () => {
    const host = document.createElement("main");
    const platform = detectPlatform();
    const connect = vi
      .fn<(secret: string) => Promise<typeof platform>>()
      .mockRejectedValueOnce(new Error("authentication-failed"))
      .mockResolvedValueOnce(platform);
    const unlocked = mountServedUnlock(host, connect);
    const form = host.querySelector("form")!;
    const input = host.querySelector<HTMLInputElement>("input")!;

    input.value = "wrong";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(host.textContent).toContain("could not unlock"));
    expect(input.disabled).toBe(false);

    input.value = "right";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await expect(unlocked).resolves.toBe(platform);
    expect(connect).toHaveBeenCalledTimes(2);
  });
});
