import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const SCREENSHOT = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench.png");
const SIDE_BY_SIDE = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-side-by-side.png");
const DARK = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-dark.png");
const DRACULA = resolve(ROOT, "docs/user-facing-docs/assets/zd-workbench-dracula.png");
const SOCIAL_CARD = resolve(ROOT, "docs/user-facing-docs/assets/zd-social-card.png");
const READER = resolve(ROOT, "docs/user-facing-docs/assets/zd-reader.jpeg");
const READER_DARK = resolve(ROOT, "docs/user-facing-docs/assets/zd-reader-dark.png");
const READER_DRACULA = resolve(ROOT, "docs/user-facing-docs/assets/zd-reader-dracula.png");
const COMMENTS = resolve(ROOT, "docs/user-facing-docs/assets/zd-comments.png");

function pngDimensions(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("the workbench promotional kit", () => {
  it("keeps the deterministic capture owner lint-clean", async () => {
    const results = await new ESLint({ cwd: ROOT }).lintFiles([
      "packages/scripts/release/capture-workbench.mjs",
    ]);
    const problems = results.flatMap((result) =>
      result.messages.map(
        ({ line, message, ruleId }) => `${line}:${ruleId ?? "parser"}:${message}`,
      ),
    );

    expect(problems).toEqual([]);
  });

  it("uses a legible implemented-workbench capture on the repository front page", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

    expect(existsSync(SCREENSHOT)).toBe(true);
    expect(existsSync(SIDE_BY_SIDE)).toBe(true);
    expect(pngDimensions(SCREENSHOT)).toEqual({ width: 1440, height: 900 });
    expect(pngDimensions(SIDE_BY_SIDE)).toEqual({ width: 1440, height: 900 });
    expect(readme).toContain("docs/user-facing-docs/assets/zd-workbench.png");
    expect(readme).toMatch(/!\[[^\]]*workbench[^\]]*\]/i);
  });

  it("keeps current Markdown reading and commenting captures", () => {
    const capture = readFileSync(
      resolve(ROOT, "packages/scripts/release/capture-workbench.mjs"),
      "utf8",
    );
    const fixture = readFileSync(resolve(ROOT, "packages/app/src/workbench/fixture.ts"), "utf8");

    expect(existsSync(READER)).toBe(true);
    expect(existsSync(READER_DARK)).toBe(true);
    expect(existsSync(READER_DRACULA)).toBe(true);
    expect(existsSync(COMMENTS)).toBe(true);
    expect(capture).toContain("zd-reader.jpeg");
    expect(capture).toContain("zd-reader-dark.png");
    expect(capture).toContain("zd-reader-dracula.png");
    expect(capture).toContain('name: "Show or hide Projects"');
    expect(capture).toContain('name: "Show or hide Files and Changes"');
    expect(capture).toContain("setFocusMode(true)");
    expect(capture).toContain('data-focus-mode="true"');
    expect(fixture).toContain("setFocusMode(enabled: boolean)");
    expect(capture).toContain("zd-comments.png");
    expect(pngDimensions(READER_DARK)).toEqual({ width: 1440, height: 900 });
    expect(pngDimensions(READER_DRACULA)).toEqual({ width: 1440, height: 900 });
    expect(pngDimensions(COMMENTS)).toEqual({ width: 1440, height: 900 });
  });

  it("captures the current one-click thread flow in all three bundled themes", () => {
    const capture = readFileSync(
      resolve(ROOT, "packages/scripts/release/capture-workbench.mjs"),
      "utf8",
    );

    expect(capture).not.toMatch(/data-thread-create(?!-toggle)/);
    expect(existsSync(DARK)).toBe(true);
    expect(existsSync(DRACULA)).toBe(true);
    expect(pngDimensions(DARK)).toEqual({ width: 1440, height: 900 });
    expect(pngDimensions(DRACULA)).toEqual({ width: 1440, height: 900 });
  });

  it("provides a social preview at the exact sharing-card size", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const renderer = readFileSync(
      resolve(ROOT, "packaging/macos/render-social-card.swift"),
      "utf8",
    );

    expect(existsSync(SOCIAL_CARD)).toBe(true);
    expect(pngDimensions(SOCIAL_CARD)).toEqual({ width: 1200, height: 630 });
    expect(manifest.scripts["promo:render"]).toContain("render-social-card.swift");
    expect(manifest.scripts["promo:render"]).toContain("zd-reader-dark.png");
    expect(manifest.scripts["promo:render"]).toContain("zd-reader-dracula.png");
    expect(renderer).toContain("Markdown, rendered and editable.");
    expect(renderer).toContain('"CURRENT LIGHT"');
    expect(renderer).toContain('"DARK"');
    expect(renderer).toContain('"DRACULA"');
  });

  it("keeps honest release limits beside the public download guidance", () => {
    const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");

    expect(readme).toContain("Apple Silicon or Intel DMG");
    expect(readme).toContain("not Developer ID signed or notarized");
    expect(readme).toContain("Windows x64 setup executable");
    expect(readme).toContain("not code signed");
  });
});
