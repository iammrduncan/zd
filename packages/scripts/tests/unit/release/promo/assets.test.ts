import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SCREENSHOT = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench.png");
const SIDE_BY_SIDE = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-side-by-side.png");
const SOCIAL_CARD = resolve(ROOT, "docs/user-facing-docs/assets/zd-social-card.png");

function pngDimensions(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the workbench promotional kit", () => {
  it("uses a legible implemented-workbench capture on the repository front page", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

    expect(existsSync(SCREENSHOT)).toBe(true);
    expect(existsSync(SIDE_BY_SIDE)).toBe(true);
    expect(pngDimensions(SCREENSHOT)).toEqual({ width: 1440, height: 900 });
    expect(pngDimensions(SIDE_BY_SIDE)).toEqual({ width: 1440, height: 900 });
    expect(readme).toContain("docs/user-facing-docs/assets/zd-workbench.png");
    expect(readme).toMatch(/!\[[^\]]*workbench[^\]]*\]/i);
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
