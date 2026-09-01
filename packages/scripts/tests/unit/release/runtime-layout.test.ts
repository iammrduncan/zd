import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const CONFIG_PATH = resolve(ROOT, "packages/tauri/tauri.conf.json");
const MANIFEST_PATH = resolve(ROOT, "packages/tauri/Cargo.toml");

interface ReleaseConfig {
  readonly mainBinaryName?: string;
  readonly build: {
    readonly beforeDevCommand?: string;
    readonly devUrl?: string;
    readonly frontendDist: string;
  };
  readonly bundle: {
    readonly resources?: Record<string, string>;
    readonly macOS?: { readonly files?: Record<string, string> };
    readonly linux?: { readonly deb?: { readonly files?: Record<string, string> } };
  };
}

function config(): ReleaseConfig {
  return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as ReleaseConfig;
}

describe("the installed two-executable runtime", () => {
  it("keeps Cargo's default on the desktop binary selected by Tauri", () => {
    const manifest = readFileSync(MANIFEST_PATH, "utf8");

    expect(manifest).toMatch(/^\[package\]\nname = "zd-desktop"$/m);
    expect(manifest).toMatch(/^default-run = "zd-desktop"$/m);
  });

  it("selects the console binary explicitly for source-tree serve", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts["app:serve"]).toContain("cargo run -p zd-desktop --bin zd -- serve");
  });

  it("bundles zd-desktop as the GUI and installs zd as the console", () => {
    const release = config();

    expect(release.mainBinaryName).toBe("zd-desktop");
    expect(release.bundle.macOS?.files).toMatchObject({
      "Resources/bin/zd": "../../target/release/zd",
    });
    expect(release.bundle.linux?.deb?.files).toMatchObject({
      "/usr/bin/zd": "../../target/release/zd",
    });
  });

  it("installs the production application assets once and keeps Tauri local bootstrap minimal", () => {
    const release = config();

    expect(release.build.beforeDevCommand).toBeUndefined();
    expect(release.build.devUrl).toBeUndefined();
    expect(release.build.frontendDist).toBe("bootstrap");
    expect(release.bundle.resources).toEqual({ "../app/dist/": "assets/" });
    const bootstrap = resolve(ROOT, "packages/tauri", release.build.frontendDist);
    expect(readdirSync(bootstrap)).toEqual(["index.html"]);
    const index = readFileSync(resolve(bootstrap, "index.html"), "utf8");
    expect(index).toContain("Starting zd");
    expect(index).not.toMatch(/<script\b/i);
  });

  it("keeps the Vite URL in the development-only Tauri overlay", () => {
    const development = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.dev.conf.json"), "utf8"),
    ) as { build?: { beforeDevCommand?: string; devUrl?: string } };
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(development.build).toEqual({
      beforeDevCommand: "npm run dev",
      devUrl: "http://localhost:1420",
    });
    for (const command of [manifest.scripts.app, manifest.scripts["app:open"]]) {
      expect(command).toContain("packages/tauri/tauri.dev.conf.json");
    }
  });
});
