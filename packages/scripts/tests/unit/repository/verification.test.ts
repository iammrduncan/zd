import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../../../../../");
const EDITOR_TESTS = resolve(ROOT, "packages/app/tests/e2e/editor");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function named(path: string): string {
  return relative(ROOT, path);
}

describe("trustworthy browser verification", () => {
  const editorSpecs = filesUnder(EDITOR_TESTS).filter((path) => path.endsWith(".spec.ts"));

  it("materializes virtualized constructs instead of enlarging the viewport", () => {
    const oversized = editorSpecs
      .filter((path) => /height:\s*9000\b/.test(source(path)))
      .map(named);

    expect(oversized).toEqual([]);
  });

  it("does not let a fixed delay decide focus or motion assertions", () => {
    const stateful = editorSpecs.filter(
      (path) =>
        path.includes("/focus/") ||
        [
          "anchor.spec.ts",
          "block-jump.spec.ts",
          "caret-recentre.spec.ts",
          "scroll-easing.spec.ts",
          "typewriter.spec.ts",
        ].includes(path.split("/").at(-1) ?? ""),
    );
    const fixed = stateful
      .filter((path) => /waitForTimeout\(|(?:samples|frames)\.length\s*<\s*\d+/.test(source(path)))
      .map(named);

    expect(fixed).toEqual([]);
  });

  it("does not query ambiguous bare elements from an editor root", () => {
    const ambiguous = editorSpecs.flatMap((path) => {
      const contents = source(path);
      const matcher =
        /(?:page\.locator|document\.querySelector(?:All)?)\(\s*["'](img|table|a|code|pre|blockquote|p|h[1-6]|ul|ol|li|hr)["']/g;
      return [...contents.matchAll(matcher)].map((match) => `${named(path)}: ${match[1]}`);
    });

    expect(ambiguous).toEqual([]);
  });
});
