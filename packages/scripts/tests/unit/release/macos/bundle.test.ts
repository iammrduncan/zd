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
    expect(source).toContain("smoke-macos-wrapper.mjs");
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
    expect(source).not.toContain("--bundles app,dmg");
    expect(source).not.toContain("osascript");
  });
});
