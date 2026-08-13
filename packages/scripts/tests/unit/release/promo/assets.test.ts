import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SCREENSHOT = resolve(ROOT, "docs/user-facing-docs/assets/zd-reader.jpeg");
const SOCIAL_CARD = resolve(ROOT, "docs/user-facing-docs/assets/zd-social-card.png");

function jpegDimensions(path: string) {
  const bytes = readFileSync(path);
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error(`invalid JPEG marker at ${offset}`);
    const marker = bytes[offset + 1]!;
    const length = bytes.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    }
    offset += length + 2;
  }
  throw new Error("JPEG has no dimensions");
}

function pngDimensions(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the v0.1 promotional kit", () => {
  it("uses a legible native product capture on the repository front page", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

    expect(existsSync(SCREENSHOT)).toBe(true);
    expect(jpegDimensions(SCREENSHOT)).toEqual({ width: 1100, height: 760 });
    expect(readme).toContain("docs/user-facing-docs/assets/zd-reader.jpeg");
    expect(readme).toMatch(/!\[[^\]]*Markdown reader[^\]]*\]/i);
  });

  it("provides a social preview at the exact sharing-card size", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };

    expect(existsSync(SOCIAL_CARD)).toBe(true);
    expect(pngDimensions(SOCIAL_CARD)).toEqual({ width: 1200, height: 630 });
    expect(manifest.scripts["promo:render"]).toContain("render-social-card.swift");
  });

  it("keeps honest release limits beside the public download guidance", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

    expect(readme).toContain("Apple Silicon or Intel DMG");
    expect(readme).toContain("not Developer ID signed or notarized");
    expect(readme).toContain("Windows x64 setup executable");
    expect(readme).toContain("not code signed");
  });
});
