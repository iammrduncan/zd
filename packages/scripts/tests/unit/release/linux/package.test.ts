import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

  it("inspects and exercises the extracted artifact before release", () => {
    const source = readFileSync(resolve(ROOT, "packaging/linux/smoke.sh"), "utf8");

    expect(source).toContain("inspect-linux-package.mjs");
    expect(source).toContain('ZD_SERVE_EXECUTABLE="$install_root/usr/bin/zd"');
    expect(source).toContain("playwright.served.config.ts");
    expect(source).toContain("xvfb-run -a");
    expect(source).toContain("smoke-linux-wrapper.mjs");
    expect(source).toContain('browser_log="$install_root/browser-smoke.log"');
    expect(source).toContain('wrapper_log="$install_root/wrapper-smoke.log"');
    expect(source).toContain("installed Linux browser smoke failed");
    expect(source).toContain("installed Linux wrapper smoke failed");
    expect(source).toContain('>"$wrapper_log" 2>&1');
    expect(source).toContain(
      "Verified installed Linux wrapper: controller=one reload=same-session " +
        "shell=show-workbench secondary=reused graceful=passed forced=passed " +
        "crash=presented cleanup=passed",
    );
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
