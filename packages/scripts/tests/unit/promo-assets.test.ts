import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SCREENSHOT = resolve(ROOT, "docs/assets/zd-reader.jpeg");
const SOCIAL_CARD = resolve(ROOT, "docs/assets/zd-social-card.png");
const COPY = resolve(ROOT, "docs/promotion/v0.1.0.md");

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
    expect(readme).toContain("docs/assets/zd-reader.jpeg");
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

  it("keeps reusable launch copy and honest release limits together", () => {
    const copy = readFileSync(COPY, "utf8");
    const socialPost = copy.split("## Social post\n\n")[1]!.split("\n\n##", 1)[0]!.trim();

    expect(copy).toMatch(/^## GitHub Release$/m);
    expect(copy).toMatch(/^## Social post$/m);
    expect(copy).toMatch(/^## Image alt text$/m);
    expect(copy).toContain("Apple Silicon and Intel");
    expect(copy).toContain("not notarized");
    expect(copy).toContain("https://github.com/iammrduncan/zd/releases/tag/v0.1.0");
    expect(socialPost.length).toBeLessThanOrEqual(280);
  });
});
