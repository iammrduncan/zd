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
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

describe("the Linux Debian package", () => {
  it("has one repeatable package command", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(manifest.scripts["package:linux"]).toBe("bash packaging/linux/package.sh");
    expect(manifest.scripts["smoke:linux"]).toBe("bash packaging/linux/smoke.sh");
  });

  it("installs, upgrades, exercises, and removes the artifact before release", () => {
    const source = readFileSync(resolve(ROOT, "packaging/linux/smoke.sh"), "utf8");
    const lifecycle = readFileSync(
      resolve(ROOT, "packages/scripts/release/linux-install-lifecycle.mjs"),
      "utf8",
    );

    expect(source).toContain("inspect-linux-package.mjs");
    expect(source).toContain('linux-install-lifecycle.mjs prepare "$artifact" "$install_root"');
    expect(source).toContain('linux-install-lifecycle.mjs remove "$install_root"');
    expect(source).toContain('PATH="$install_root/usr/bin:$PATH" command -v zd');
    expect(source).toContain('ZD_SERVE_EXECUTABLE="$installed_zd"');
    expect(source).toContain("playwright.served.config.ts");
    expect(source).toContain("xvfb-run -a");
    expect(source).toContain("smoke-linux-wrapper.mjs");
    expect(source).toContain('browser_log="$install_root/browser-smoke.log"');
    expect(source).toContain('browser_tests="$(sed -nE');
    expect(source).toContain("tests=$browser_tests");
    expect(source).not.toMatch(/tests=\d+/u);
    expect(source).toContain('wrapper_log="$install_root/wrapper-smoke.log"');
    expect(source).toContain("installed Linux browser smoke failed");
    expect(source).toContain("installed Linux wrapper smoke failed");
    expect(source).not.toContain('cat "$browser_log"');
    expect(source).not.toContain('cat "$wrapper_log"');
    expect(source).toContain("command -v xvfb-run");
    expect(source).toContain("command -v dbus-run-session");
    expect(source).toContain("logBytes=$browser_log_bytes");
    expect(source).toContain("logBytes=$wrapper_log_bytes");
    expect(source).toContain('>"$wrapper_log" 2>&1');
    expect(lifecycle).toContain(
      "Verified installed Linux package: install=passed upgrade=passed stale=removed",
    );
    expect(lifecycle).toContain(
      "Verified removed Linux package: package-files=removed user-data=preserved",
    );
    expect(lifecycle).toContain('"home/com.zensuite.zd/keep.state"');
    expect(source).not.toContain("dpkg-deb --extract");
    expect(source).toContain(
      "Verified installed Linux wrapper: controller=one reload=same-session " +
        "shell=show-workbench secondary=reused graceful=passed forced=passed " +
        "crash=presented cleanup=passed",
    );
  });

  it("refuses an install root outside the requested temporary directory", () => {
    const root = mkdtempSync(join(tmpdir(), "zd-linux-smoke-test-"));
    try {
      const commands = resolve(root, "commands");
      const scratch = resolve(root, "scratch");
      const unsafeRoot = resolve(root, "unrelated");
      const sentinel = resolve(unsafeRoot, "keep.txt");
      const artifact = resolve(root, "zd.deb");
      const invoked = resolve(root, "node-invoked");
      mkdirSync(commands);
      mkdirSync(scratch);
      mkdirSync(unsafeRoot);
      writeFileSync(sentinel, "keep me");
      writeFileSync(artifact, "test artifact");
      writeFileSync(resolve(commands, "mktemp"), '#!/bin/sh\nprintf "%s\\n" "$ZD_TEST_ROOT"\n');
      writeFileSync(resolve(commands, "node"), '#!/bin/sh\ntouch "$ZD_TEST_NODE_INVOKED"\n');
      chmodSync(resolve(commands, "mktemp"), 0o755);
      chmodSync(resolve(commands, "node"), 0o755);

      const result = spawnSync("bash", [resolve(ROOT, "packaging/linux/smoke.sh"), artifact], {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          TMPDIR: scratch,
          ZD_TEST_ROOT: unsafeRoot,
          ZD_TEST_NODE_INVOKED: invoked,
          PATH: `${commands}:${process.env.PATH ?? ""}`,
        },
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("refusing unexpected smoke staging path");
      expect(existsSync(invoked)).toBe(false);
      expect(readFileSync(sentinel, "utf8")).toBe("keep me");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("builds the console executable before Tauri assembles the desktop package", () => {
    const source = readFileSync(resolve(ROOT, "packaging/linux/package.sh"), "utf8");

    expect(source).toContain("cargo build --locked --release -p zd-desktop --bin zd");
    expect(source).toContain("--bundles deb");
    expect(source).toContain("target/release/bundle/deb");
    expect(source).toContain('artifacts=("$bundle_dir"/zd_*.deb)');
    expect(source).toMatch(/\$\{#artifacts\[@\]\} != 1/);
  });

  it("forwards associated Markdown paths to the desktop wrapper", () => {
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as { bundle: { linux?: { deb?: { desktopTemplate?: string } } } };

    expect(config.bundle.linux?.deb?.desktopTemplate).toBe("../../packaging/linux/zd.desktop");
    const template = readFileSync(resolve(ROOT, "packaging/linux/zd.desktop"), "utf8");
    expect(template).toContain("Exec={{exec}} %F");
    expect(template).toContain("MimeType=text/markdown;");
    expect(template).toContain("Terminal=false");
  });
});
