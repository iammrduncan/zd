import { beforeEach, describe, expect, it } from "vitest";

import type { Platform } from "@/platform";
import { boot } from "@/suite/boot";
import { DEFAULT_MINIAPP, clearRegistry, register, registeredIds, resolve } from "@/suite/registry";
import type { MiniApp } from "@/suite/types";

function stubApp(id: string, onMount?: (host: HTMLElement) => void): MiniApp {
  return {
    id,
    title: `zd ${id}`,
    mount(host) {
      onMount?.(host);
      return () => {
        host.textContent = "";
      };
    },
  };
}

function stubPlatform(miniapp: string, path: string | null = null): Platform {
  return {
    kind: "browser",
    launchRequest: async () => ({ miniapp, path }),
    workspaceFiles: async () => null,
    readTextFile: async () => "",
    writeTextFile: async () => {},
    fileStamp: async () => null,
    onCloseRequested: () => () => {},
    closeWindow: async () => {},
    openExternal: async () => {},
  };
}

describe("mini app registry", () => {
  beforeEach(() => clearRegistry());

  it("resolves a registered mini app by id", () => {
    register(stubApp("md"));
    expect(resolve("md")?.id).toBe("md");
  });

  it("returns undefined for an unknown id", () => {
    expect(resolve("nope")).toBeUndefined();
  });

  it("keeps registration order so main.ts reads as the app list", () => {
    register(stubApp("md"));
    register(stubApp("td"));
    register(stubApp("studio"));
    expect(registeredIds()).toEqual(["md", "td", "studio"]);
  });

  it("replaces rather than duplicates when an id registers twice", () => {
    register(stubApp("md"));
    register({ ...stubApp("md"), title: "second" });
    expect(registeredIds()).toEqual(["md"]);
    expect(resolve("md")?.title).toBe("second");
  });
});

describe("boot", () => {
  beforeEach(() => clearRegistry());

  it("mounts the mini app the launch request names", async () => {
    register(stubApp("md", (host) => (host.textContent = "md mounted")));
    register(stubApp("td", (host) => (host.textContent = "td mounted")));

    const host = document.createElement("div");
    await boot(host, stubPlatform("td"));

    expect(host.textContent).toBe("td mounted");
  });

  it("falls back to the default mini app for an unknown id", async () => {
    register(stubApp(DEFAULT_MINIAPP, (host) => (host.textContent = "default mounted")));

    const host = document.createElement("div");
    await boot(host, stubPlatform("does-not-exist"));

    expect(host.textContent).toBe("default mounted");
  });

  it("says so on screen rather than throwing when nothing is registered", async () => {
    const host = document.createElement("div");
    await boot(host, stubPlatform("md"));

    expect(host.textContent).toContain("No mini app registered");
  });

  it("returns a teardown that undoes the mount", async () => {
    register(stubApp("md", (host) => (host.textContent = "mounted")));

    const host = document.createElement("div");
    const unmount = await boot(host, stubPlatform("md"));
    expect(host.textContent).toBe("mounted");

    unmount();
    expect(host.textContent).toBe("");
  });
});

describe("boot says why when it cannot start", () => {
  /*
   * Audit finding M4. `main.ts` is `void boot(host, detectPlatform())`, and the
   * first thing `boot` did was `await platform.launchRequest()` — so an IPC
   * misconfiguration, a capability regression, or anything at all going wrong on
   * the Rust side became an unhandled rejection and a permanently blank window.
   *
   * That is finding F02's failure shape arriving through a different door: "the
   * entire window goes blank and shows no shortcuts". The audit's own words for the
   * fix are that it "converts the worst diagnostic experience (blank window) into
   * the best (the reason, on screen)".
   */

  it("puts the reason on screen when the launch request fails", async () => {
    const host = document.createElement("div");
    const platform = stubPlatform("md");
    platform.launchRequest = async () => {
      throw new Error("ipc: command launch_request not found");
    };

    await boot(host, platform);

    expect(host.textContent, "the window was left blank").toContain("could not start");
    // The reason, not just the fact. A sentence that says only "something went
    // wrong" is the blank window with extra steps.
    expect(host.textContent, "the cause was swallowed").toContain("launch_request");
  });

  it("puts the reason on screen when the mini app fails to mount", async () => {
    // The second door. `mount` is a mini app's own code and can throw for reasons
    // boot cannot anticipate; the window must not go blank for those either.
    register({
      ...stubApp("md"),
      mount() {
        throw new Error("the editor could not be built");
      },
    });

    const host = document.createElement("div");
    await boot(host, stubPlatform("md"));

    expect(host.textContent).toContain("could not start");
    expect(host.textContent).toContain("the editor could not be built");
  });

  it("resolves rather than rejecting, so nothing is left unhandled", async () => {
    /*
     * The claim `main.ts` depends on. It calls `void boot(...)`, which discards the
     * promise — so a `boot` that rejects produces an unhandled rejection and no
     * surface at all, which is the defect. Pinning that it resolves is what makes
     * the `void` at the call site honest rather than lucky.
     */
    const host = document.createElement("div");
    const platform = stubPlatform("md");
    platform.launchRequest = async () => {
      throw new Error("nope");
    };

    await expect(boot(host, platform)).resolves.toBeTypeOf("function");
  });

  it("leaves nothing attached when a mount fails", async () => {
    /*
     * The suite's keyboard listener and the Reference are attached *before* the
     * mini app mounts, deliberately — see the note in boot.ts. So a mount that
     * throws between them and the return would leave both listening over a window
     * with nothing in it, and `cmd+.` would open a Reference for a mini app that
     * does not exist.
     */
    register({
      ...stubApp("md"),
      mount() {
        throw new Error("no");
      },
    });

    const host = document.createElement("div");
    await boot(host, stubPlatform("md"));

    const sheet = document.querySelector(".zd-reference");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", metaKey: true }));
    expect(document.querySelector(".zd-reference"), "the Reference outlived the boot").toBe(sheet);
  });

  it("still mounts when nothing is wrong", async () => {
    // The control. Every assertion above is satisfied by a boot that always fails.
    register(stubApp("md", (host) => (host.textContent = "mounted")));

    const host = document.createElement("div");
    await boot(host, stubPlatform("md"));

    expect(host.textContent).toBe("mounted");
  });
});
