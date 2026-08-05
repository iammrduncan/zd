import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const ICONS = resolve(ROOT, "packages/tauri/icons");
const MASTER = resolve(ROOT, "packaging/icon.png");
const RENDERER = resolve(ROOT, "packaging/macos/render-icon.swift");

function pngMetadata(name: string) {
  const png = readFileSync(resolve(ICONS, name));
  expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20),
    bitDepth: png[24],
    colorType: png[25],
  };
}

function icoSizes(): number[] {
  const ico = readFileSync(resolve(ICONS, "icon.ico"));
  const count = ico.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const width = ico.readUInt8(6 + index * 16);
    return width === 0 ? 256 : width;
  }).sort((left, right) => left - right);
}

describe("the zd product icon", () => {
  it("has a deterministic renderer that encodes the approved design", () => {
    expect(existsSync(RENDERER)).toBe(true);
    if (!existsSync(RENDERER)) return;

    const source = readFileSync(RENDERER, "utf8");
    expect(source).toContain("private let canvasSize = 1024");
    expect(source).toContain("components: [250.0 / 255.0, 250.0 / 255.0, 247.0 / 255.0, 1.0]");
    expect(source).toContain("components: [36.0 / 255.0, 37.0 / 255.0, 34.0 / 255.0, 1.0]");
    expect(source).toContain('NSAttributedString(string: "zd"');
    expect(source).toContain("let targetWordmarkWidth: CGFloat = 480.0");
    expect(source).not.toContain("kCTKernAttributeName");
    expect(source).not.toContain("kCTLigatureAttributeName");
  });

  it("keeps one reviewable 1024px RGBA master", () => {
    expect(existsSync(MASTER)).toBe(true);
    if (!existsSync(MASTER)) return;

    const master = readFileSync(MASTER);
    expect(master.readUInt32BE(16)).toBe(1024);
    expect(master.readUInt32BE(20)).toBe(1024);
    expect(master[24]).toBe(8);
    expect(master[25]).toBe(6);
    expect(createHash("sha256").update(master).digest("hex")).toBe(
      "2d7a6d68277e71f0a42df3a956587ecfe19ac8c725576d32a0c469de56a7611f",
    );
  });

  it("ships the complete Tauri desktop and store icon set", () => {
    const expectedPngs = new Map([
      ["32x32.png", 32],
      ["64x64.png", 64],
      ["128x128.png", 128],
      ["128x128@2x.png", 256],
      ["icon.png", 512],
      ["Square30x30Logo.png", 30],
      ["Square44x44Logo.png", 44],
      ["Square71x71Logo.png", 71],
      ["Square89x89Logo.png", 89],
      ["StoreLogo.png", 50],
      ["Square107x107Logo.png", 107],
      ["Square142x142Logo.png", 142],
      ["Square150x150Logo.png", 150],
      ["Square284x284Logo.png", 284],
      ["Square310x310Logo.png", 310],
    ]);

    for (const [name, size] of expectedPngs) {
      expect(existsSync(resolve(ICONS, name)), name).toBe(true);
      if (!existsSync(resolve(ICONS, name))) continue;
      expect(pngMetadata(name), name).toEqual({
        width: size,
        height: size,
        bitDepth: 8,
        colorType: 6,
      });
    }
    expect(icoSizes()).toEqual([16, 24, 32, 48, 64, 256]);
    expect(readFileSync(resolve(ICONS, "icon.icns")).length).toBeGreaterThan(0);
    expect(existsSync(resolve(ICONS, "android"))).toBe(false);
    expect(existsSync(resolve(ICONS, "ios"))).toBe(false);
  });

  it("exposes one command that regenerates every tracked icon", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(manifest.scripts["icons:generate"]).toBe("bash packaging/macos/generate-icons.sh");
  });
});
