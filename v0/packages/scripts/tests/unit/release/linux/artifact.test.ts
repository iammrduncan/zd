import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { verifyLinuxInstallRoot } from "../../../../release/linux-artifact.mjs";

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
  const installRoot = temporaryDirectory("zd-linux-artifact-");
  const expectedAssets = temporaryDirectory("zd-linux-assets-");
  write(join(expectedAssets, "index.html"), "<!doctype html><title>zd</title>\n");
  write(join(expectedAssets, "assets", "app.js"), "console.log('release');\n");
  write(join(installRoot, "usr", "bin", "zd"), "console-role\n", 0o755);
  write(join(installRoot, "usr", "bin", "zd-desktop"), "desktop-role\n", 0o755);
  write(
    join(installRoot, "usr", "share", "applications", "zd.desktop"),
    [
      "[Desktop Entry]",
      "Exec=zd-desktop %F",
      "Icon=zd-desktop",
      "Name=zd",
      "Terminal=false",
      "Type=Application",
      "MimeType=text/markdown;",
      "",
    ].join("\n"),
  );
  for (const directory of ["32x32", "128x128", "256x256@2"]) {
    write(
      join(installRoot, "usr", "share", "icons", "hicolor", directory, "apps", "zd-desktop.png"),
      "png-bytes\n",
    );
  }
  write(
    join(installRoot, "usr", "lib", "zd", "assets", "index.html"),
    "<!doctype html><title>zd</title>\n",
  );
  write(
    join(installRoot, "usr", "lib", "zd", "assets", "assets", "app.js"),
    "console.log('release');\n",
  );
  return { expectedAssets, installRoot };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("the extracted Linux artifact inspector", () => {
  it("accepts exactly two executable roles and one byte-identical frontend", async () => {
    const { expectedAssets, installRoot } = fixture();

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).resolves.toEqual({
      assetBytes: 57,
      assetFiles: 2,
      executables: ["usr/bin/zd", "usr/bin/zd-desktop"],
    });
  });

  it("rejects a changed frontend byte", async () => {
    const { expectedAssets, installRoot } = fixture();
    write(
      join(installRoot, "usr", "lib", "zd", "assets", "assets", "app.js"),
      "console.log('changed');\n",
    );

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("packaged frontend assets differ from packages/app/dist");
  });

  it.each([
    ["missing console", "usr/bin/zd", "required executable is missing"],
    [
      "desktop entry drops files",
      "usr/share/applications/zd.desktop",
      "desktop entry must launch zd-desktop %F",
    ],
  ])("rejects %s", async (_name, relative, message) => {
    const { expectedAssets, installRoot } = fixture();
    const path = resolve(installRoot, relative);
    if (relative === "usr/bin/zd") rmSync(path);
    else write(path, "[Desktop Entry]\nExec=zd-desktop\n");

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow(message);
  });

  it("rejects source maps and development server references", async () => {
    const { expectedAssets, installRoot } = fixture();
    write(join(expectedAssets, "assets", "app.js.map"), "{}\n");
    write(join(installRoot, "usr", "lib", "zd", "assets", "assets", "app.js.map"), "{}\n");
    write(join(expectedAssets, "assets", "app.js"), "fetch('http://localhost:1420');\n");
    write(
      join(installRoot, "usr", "lib", "zd", "assets", "assets", "app.js"),
      "fetch('http://localhost:1420');\n",
    );

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("release frontend contains a source map");
  });

  it("rejects a development server URL embedded in an executable", async () => {
    const { expectedAssets, installRoot } = fixture();
    write(
      join(installRoot, "usr", "bin", "zd-desktop"),
      "desktop-role http://localhost:1420\n",
      0o755,
    );

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("release artifact contains a development server URL");
  });

  it("rejects an absolute checkout path embedded in an executable", async () => {
    const { expectedAssets, installRoot } = fixture();
    write(join(installRoot, "usr", "bin", "zd"), "console-role /build/zd\n", 0o755);

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("Linux package contains an absolute build path");
  });

  it("rejects a missing desktop icon", async () => {
    const { expectedAssets, installRoot } = fixture();
    rmSync(
      join(installRoot, "usr", "share", "icons", "hicolor", "128x128", "apps", "zd-desktop.png"),
    );

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("required Linux desktop icon is missing");
  });

  it("rejects a second installed frontend copy", async () => {
    const { expectedAssets, installRoot } = fixture();
    write(join(installRoot, "usr", "share", "zd", "index.html"), "duplicate\n");

    await expect(
      verifyLinuxInstallRoot({
        expectedAssets,
        forbiddenBuildPath: "/build/zd",
        installRoot,
      }),
    ).rejects.toThrow("Linux package contains more than one frontend");
  });
});
