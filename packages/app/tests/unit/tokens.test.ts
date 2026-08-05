import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// DESIGN.md §5.2 is the source of truth for the type roles. This test guards the
// *shape* of the token file: every role in the table exists, and it names a
// family, weight, size, and line. The resolved pixel values are a real-engine
// claim and live in tests/e2e/typography.spec.ts, because jsdom does not resolve
// var() or calc() chains.

// jsdom rewrites import.meta.url to an http URL, so resolve from the repo root.
const TOKENS = readFileSync(resolve(process.cwd(), "packages/app/src/design/tokens.css"), "utf8");

/** Every role in the DESIGN.md §5.2 table, by token stem. */
const ROLES = [
  "prose",
  "prose-emphasis",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code",
  "inline-code",
  "navigation",
  "supporting",
  "action",
] as const;

function declaredValue(property: string): string | undefined {
  const match = TOKENS.match(new RegExp(`^\\s*${property}:\\s*([^;]+);`, "m"));
  return match?.[1]?.trim();
}

describe("design tokens: DESIGN.md §5.2 type roles", () => {
  it.each(ROLES)("declares a complete type role for %s", (role) => {
    for (const facet of ["family", "weight", "size", "line"]) {
      expect(declaredValue(`--type-${role}-${facet}`), `--type-${role}-${facet}`).toBeDefined();
    }
  });

  it("keeps the two adjustable sizes as the only free knobs", () => {
    // §5.2: prose defaults to 17px, code to 14px, and headings are one global
    // multiplier over the canonical ratios rather than six independent controls.
    expect(declaredValue("--type-prose-size")).toBe("17px");
    expect(declaredValue("--type-code-size")).toBe("14px");
    expect(declaredValue("--type-heading-scale")).toBe("1");
  });

  it("derives every heading size from prose size and the heading scale", () => {
    // §5.2: "Changing prose size retains the ratios; changing heading scale
    // never changes body size." A literal px heading size would break both.
    for (const heading of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      const size = declaredValue(`--type-${heading}-size`) ?? "";
      expect(size, `--type-${heading}-size`).toContain("var(--type-prose-size)");
      expect(size, `--type-${heading}-size`).toContain("var(--type-heading-scale)");
    }
  });

  it("uses the decided stepped type scale for deep headings", () => {
    const deepHeadingRatios = {
      h3: "1.2941",
      h4: "1.1765",
      h5: "1.0588",
      h6: "0.9412",
    };

    for (const [heading, ratio] of Object.entries(deepHeadingRatios)) {
      expect(declaredValue(`--type-${heading}-size`), `--type-${heading}-size`).toContain(
        `* ${ratio} *`,
      );
    }
  });

  it("gives headings the shipped bold face and never a synthetic weight", () => {
    // §5.1: no synthetic bold. 700 is the static iAWriterQuattroS-Bold face.
    for (const heading of ["h1", "h2", "h3", "h4", "h5", "h6"]) {
      expect(declaredValue(`--type-${heading}-weight`)).toBe("700");
    }
  });

  it("puts code, inline code, and navigation on the mono family", () => {
    for (const role of ["code", "inline-code", "navigation"]) {
      expect(declaredValue(`--type-${role}-family`)).toBe("var(--font-mono)");
    }
  });

  it("puts prose, headings, supporting text, and actions on the prose family", () => {
    for (const role of ["prose", "prose-emphasis", "h1", "h6", "supporting", "action"]) {
      expect(declaredValue(`--type-${role}-family`)).toBe("var(--font-prose)");
    }
  });

  it("carries emphasis as a drawn italic style rather than a slant", () => {
    expect(declaredValue("--type-prose-emphasis-style")).toBe("italic");
  });

  it("drops the scaffold's placeholder type scale", () => {
    // The rhythm and measure placeholders are session 1.2's job and stay marked.
    expect(declaredValue("--type-mono-size")).toBeUndefined();
    expect(declaredValue("--type-mono-line")).toBeUndefined();
    expect(declaredValue("--type-prose-line")).toBeDefined();
  });
});
