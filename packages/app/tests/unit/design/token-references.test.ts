import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

// Every var(--token) anywhere in the app must resolve to something tokens.css
// actually defines. A dangling reference does not throw — it silently falls back
// to the browser default, which is exactly the kind of drift that looks fine on
// screen until someone compares it to DESIGN.md. This caught md.css still asking
// for --type-mono-size after that token was replaced by the §5.2 roles.

const SRC = resolve(process.cwd(), "packages/app/src");

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith(".css") ? [path] : [];
  });
}

const DEFINED = new Set(
  [...readFileSync(join(SRC, "design/tokens.css"), "utf8").matchAll(/^\s*(--[\w-]+):/gm)].map(
    (m) => m[1]!,
  ),
);

describe("design token references", () => {
  const files = cssFiles(SRC);
  // Component properties may cross stylesheet boundaries because the browser
  // resolves one cascade. Keep them out of tokens.css, but require a concrete
  // CSS default somewhere in that cascade even when JavaScript overrides it.
  const DECLARED = new Set(
    files.flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/^\s*(--[\w-]+):/gm)].map((match) => match[1]!),
    ),
  );

  it("finds the stylesheets to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => relative(SRC, f)))("%s references only defined tokens", (name) => {
    const source = readFileSync(join(SRC, name), "utf8");
    const referenced = [...source.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!);

    const dangling = [...new Set(referenced)].filter(
      (token) => !DEFINED.has(token) && !DECLARED.has(token),
    );
    expect(dangling, `undefined tokens referenced in ${name}`).toEqual([]);
  });

  it("keeps feature styles off raw families, sizes, and colours", () => {
    // DESIGN.md §4.2: a feature selects a semantic role, never a literal.
    const ownedStyles = [
      ...cssFiles(join(SRC, "editor/styles")),
      ...cssFiles(join(SRC, "editor/review")),
      ...cssFiles(join(SRC, "workbench/current-file")),
    ];
    for (const file of ownedStyles) {
      // Comments quote DESIGN.md, which is full of "44 px" and "#FAFAF7". The
      // rule is about declarations, so read the stylesheet without its prose.
      const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      const name = relative(SRC, file);
      expect(source, `${name} hardcodes a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(source, `${name} hardcodes a px size`).not.toMatch(/:\s*-?\d+(\.\d+)?px/);

      // Read each declaration's value rather than using a lookahead: `\s*`
      // backtracks to zero width and makes `(?!var\()` succeed on any spacing.
      const families = [...source.matchAll(/font-family:\s*([^;]+);/g)].map((m) => m[1]!.trim());
      for (const family of families) {
        expect(family, `${name} names a font family instead of a role`).toMatch(/^var\(--/);
      }
    }
  });
});
