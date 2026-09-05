import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyMacosAppBundle } from "../../../../release/macos-artifact.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function write(path: string, contents: string, mode?: number) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  if (mode !== undefined) chmodSync(path, mode);
}

function fixture() {
  const appPath = join(temporaryDirectory("zd-macos-app-"), "zd.app");
  const expectedAssets = temporaryDirectory("zd-macos-assets-");
  write(join(expectedAssets, "index.html"), "<!doctype html><title>zd</title>\n");
  write(join(expectedAssets, "assets", "app.js"), "console.log('release');\n");
  write(join(appPath, "Contents", "MacOS", "zd-desktop"), "desktop-role\n", 0o755);
  write(join(appPath, "Contents", "Resources", "bin", "zd"), "console-role\n", 0o755);
  write(join(appPath, "Contents", "Resources", "icon.icns"), "icon-bytes\n");
  write(join(appPath, "Contents", "Info.plist"), "plist-bytes\n");
  write(
    join(appPath, "Contents", "Resources", "assets", "index.html"),
    "<!doctype html><title>zd</title>\n",
  );
  write(
    join(appPath, "Contents", "Resources", "assets", "assets", "app.js"),
    "console.log('release');\n",
  );
  return { appPath, expectedAssets };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("the macOS application artifact inspector", () => {
  it("accepts two executable roles and one byte-identical frontend", async () => {
    const { appPath, expectedAssets } = fixture();

    await expect(
      verifyMacosAppBundle({
        appPath,
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
      }),
    ).resolves.toEqual({
      assetBytes: 57,
      assetFiles: 2,
      executables: ["Contents/MacOS/zd-desktop", "Contents/Resources/bin/zd"],
    });
  });

  it("rejects a missing console role", async () => {
    const { appPath, expectedAssets } = fixture();
    rmSync(join(appPath, "Contents", "Resources", "bin", "zd"));

    await expect(
      verifyMacosAppBundle({
        appPath,
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
      }),
    ).rejects.toThrow("required macOS executable is missing");
  });

  it("rejects a changed or duplicated frontend", async () => {
    const { appPath, expectedAssets } = fixture();
    write(join(appPath, "Contents", "Resources", "assets", "assets", "app.js"), "changed\n");
    write(join(appPath, "Contents", "Resources", "duplicate", "index.html"), "duplicate\n");

    await expect(
      verifyMacosAppBundle({
        appPath,
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
      }),
    ).rejects.toThrow("macOS package contains more than one frontend");
  });

  it("rejects an embedded development server URL", async () => {
    const { appPath, expectedAssets } = fixture();
    write(
      join(appPath, "Contents", "MacOS", "zd-desktop"),
      "desktop-role http://localhost:1420\n",
      0o755,
    );

    await expect(
      verifyMacosAppBundle({
        appPath,
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
      }),
    ).rejects.toThrow("release artifact contains a development server URL");
  });

  it("rejects an absolute checkout path embedded in the app", async () => {
    const { appPath, expectedAssets } = fixture();
    write(
      join(appPath, "Contents", "MacOS", "zd-desktop"),
      "desktop-role /build/zd\n",
      0o755,
    );

    await expect(
      verifyMacosAppBundle({
        appPath,
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
      }),
    ).rejects.toThrow("macOS app contains an absolute build path");
  });
});
