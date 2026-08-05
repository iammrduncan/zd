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
  });

  it("builds the DMG without Finder automation", () => {
    const source = readFileSync(resolve(ROOT, "packaging/macos/package.sh"), "utf8");

    expect(source).toContain("--bundles app");
    expect(source).toContain("hdiutil create");
    expect(source).toContain('ln -s /Applications "$staging/Applications"');
    expect(source).toContain('codesign --force --sign - "$app_path"');
    expect(source).toContain('codesign --verify --deep --strict "$app_path"');
    expect(source).not.toContain("--bundles app,dmg");
    expect(source).not.toContain("osascript");
  });
});
