import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "zd-macos-package-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("the macOS application bundle", () => {
  it("registers zd as an alternate editor for Markdown documents", () => {
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as {
      bundle: {
        fileAssociations?: Array<Record<string, unknown>>;
      };
    };

    expect(config.bundle.fileAssociations).toEqual([
      {
        ext: ["md", "markdown"],
        contentTypes: ["net.daringfireball.markdown"],
        name: "Markdown document",
        role: "Editor",
        mimeType: "text/markdown",
        rank: "Alternate",
      },
    ]);
  });

  it("offers one repeatable command for producing the app and disk image", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts["package:macos"]).toBe("bash packaging/macos/package.sh");
    expect(manifest.scripts["smoke:macos"]).toBe("bash packaging/macos/smoke.sh");
  });

  it("installs and exercises the app from the produced disk image", () => {
    const source = readFileSync(resolve(ROOT, "packaging/macos/smoke.sh"), "utf8");

    expect(source).toContain("hdiutil verify");
    expect(source).toContain("hdiutil attach");
    expect(source).toContain("hdiutil detach");
    expect(source).toContain("packaging/macos/install.sh");
    expect(source).toContain("inspect-macos-app.mjs");
    expect(source).toContain('ZD_SERVE_EXECUTABLE="$install_root/bin/zd"');
    expect(source).toContain("playwright.served.config.ts");
    expect(source).toContain('browser_log="$install_root/browser-smoke.log"');
    expect(source).not.toContain('cat "$browser_log"');
    expect(source).toContain("logBytes=$browser_log_bytes");
    expect(source).toContain('browser_tests="$(sed -nE');
    expect(source).toContain("tests=$browser_tests");
    expect(source).not.toMatch(/tests=\d+/u);
    expect(source).toContain("smoke-macos-wrapper.mjs");
    expect(source).toContain('wrapper_log="$install_root/wrapper-smoke.log"');
    expect(source).not.toContain('cat "$wrapper_log"');
    expect(source).toContain("logBytes=$wrapper_log_bytes");
    expect(source).toContain(
      "Verified installed macOS wrapper: controller=one reload=same-session " +
        "shell=show-workbench secondary=reused graceful=passed forced=passed " +
        "crash=presented cleanup=passed",
    );
  });

  it("cleans the mount root when install-root allocation fails", () => {
    const root = temporaryDirectory();
    const commands = resolve(root, "commands");
    const scratch = resolve(root, "scratch");
    const artifact = resolve(root, "zd.dmg");
    const allocationState = resolve(root, "mktemp-called");
    const mktemp = resolve(commands, "mktemp");
    mkdirSync(commands);
    mkdirSync(scratch);
    writeFileSync(artifact, "test artifact");
    writeFileSync(
      mktemp,
      [
        "#!/bin/sh",
        "set -eu",
        'if [ ! -e "$ZD_TEST_MKTEMP_STATE" ]; then',
        '  touch "$ZD_TEST_MKTEMP_STATE"',
        '  candidate="${2%XXXXXX}first"',
        '  mkdir "$candidate"',
        '  printf "%s\\n" "$candidate"',
        "  exit 0",
        "fi",
        "exit 1",
        "",
      ].join("\n"),
    );
    chmodSync(mktemp, 0o755);

    const result = spawnSync("bash", [resolve(ROOT, "packaging/macos/smoke.sh"), artifact], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        TMPDIR: scratch,
        ZD_TEST_MKTEMP_STATE: allocationState,
        PATH: `${commands}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(1);
    expect(existsSync(allocationState)).toBe(true);
    expect(existsSync(resolve(scratch, "zd-macos-mount.first"))).toBe(false);
  });

  it("builds the DMG without Finder automation", () => {
    const source = readFileSync(resolve(ROOT, "packaging/macos/package.sh"), "utf8");

    expect(source).toMatch(
      /npm run build[\s\S]*cargo build --locked --release -p zd-desktop --bin zd[\s\S]*tauri build/u,
    );
    expect(source).toContain("cargo build --locked --release -p zd-desktop --bin zd");
    expect(source).toContain("--bundles app");
    expect(source).toContain('bundle_dir="$repo_root/target/release/bundle"');
    expect(source).not.toContain("packages/tauri/target");
    expect(source).toContain("hdiutil create");
    expect(source).toContain('ln -s /Applications "$staging/Applications"');
    expect(source).toContain('codesign --force --sign - "$app_path/Contents/Resources/bin/zd"');
    expect(source).toContain('codesign --force --sign - "$app_path/Contents/MacOS/zd-desktop"');
    expect(source).toContain('codesign --force --sign - "$app_path"');
    expect(source).toContain('codesign --verify --deep --strict "$app_path"');
    expect(source).toContain('case "$staging" in');
    expect(source).toContain('"${TMPDIR:-/tmp}"/zd-dmg.*) rm -rf -- "$staging"');
    expect(source).not.toContain('rm -rf "$staging"');
    expect(source).not.toContain("--bundles app,dmg");
    expect(source).not.toContain("osascript");
  });

  it("refuses and preserves an unexpected package staging directory", () => {
    const root = temporaryDirectory();
    const commands = resolve(root, "commands");
    const unsafeStaging = resolve(root, "unrelated");
    const sentinel = resolve(unsafeStaging, "keep.txt");
    const mktemp = resolve(commands, "mktemp");
    mkdirSync(commands);
    mkdirSync(unsafeStaging);
    writeFileSync(sentinel, "keep me");
    writeFileSync(mktemp, '#!/bin/sh\nprintf "%s\\n" "$ZD_TEST_UNSAFE_STAGING"\n');
    chmodSync(mktemp, 0o755);

    const result = spawnSync("bash", [resolve(ROOT, "packaging/macos/package.sh")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ZD_TEST_UNSAFE_STAGING: unsafeStaging,
        PATH: `${commands}:${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing unexpected package staging path");
    expect(readFileSync(sentinel, "utf8")).toBe("keep me");
  });
});
