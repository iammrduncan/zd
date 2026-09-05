import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

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

  it("builds the DMG without Finder automation", () => {
    const source = readFileSync(resolve(ROOT, "packaging/macos/package.sh"), "utf8");

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
});
