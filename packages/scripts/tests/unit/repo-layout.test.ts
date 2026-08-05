import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Feedback, 2026-07-29: "why are there random html files in root directory of
// repo?" — reader.html and specimen.html sat next to index.html with nothing to
// say which of the three the app actually ships. Vite only builds the entry
// points it is pointed at, so extra pages at the root cost nothing at build time
// and everything in legibility: the root is the first thing anyone reads.
//
// The rule is one shipped entry point at the app package root. Dev-only pages
// live beside the app under packages/app/dev/.

const ROOT = resolve(process.cwd());
const APP = resolve(ROOT, "packages/app");
const SKIP = new Set(["node_modules", "dist", "test-results", "target", ".git"]);

describe("package ownership", () => {
  it("files product, shell, and automation inputs under their package", () => {
    const ownedInputs = [
      "packages/app/index.html",
      "packages/app/src/main.ts",
      "packages/app/assets/fonts/iAWriterQuattroV.ttf",
      "packages/app/tests/unit/editor.test.ts",
      "packages/tauri/Cargo.toml",
      "packages/tauri/src/main.rs",
      "packages/scripts/archive-tasks.mjs",
      "packages/scripts/tests/unit/archive-tasks.test.ts",
    ];

    expect(ownedInputs.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
  });

  it("leaves no loose package inputs at the repository root", () => {
    const looseInputs = ["assets", "dev", "index.html", "scripts", "src", "src-tauri", "tests"];

    expect(looseInputs.filter((path) => existsSync(resolve(ROOT, path)))).toEqual([]);
  });

  it("keeps generated app output outside the lint input set", async () => {
    const eslint = new ESLint({ cwd: ROOT });

    expect(await eslint.isPathIgnored("packages/app/dist/assets/generated.js")).toBe(true);
  });
});

function htmlUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : htmlUnder(path);
    return entry.isFile() && entry.name.endsWith(".html") ? [relative(APP, path)] : [];
  });
}

describe("app entry points", () => {
  it("keeps index.html as the only HTML file at the app package root", () => {
    const atRoot = readdirSync(APP, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
      .map((entry) => entry.name);

    expect(atRoot).toEqual(["index.html"]);
  });

  it("keeps every other HTML entry point in dev/", () => {
    // Stated as a rule rather than a listing, so adding a dev page is not a test
    // edit — putting one somewhere surprising is.
    const stray = htmlUnder(APP).filter(
      (path) => path !== "index.html" && !path.startsWith("dev/"),
    );

    expect(stray).toEqual([]);
  });

  it("finds the dev pages it is meant to be guarding", () => {
    expect(htmlUnder(APP).length).toBeGreaterThan(1);
  });
});

/*
 * The platform is the bottom layer — audit finding L1.
 *
 * "Mini apps consume it through `ctx.platform`, so the bottom layer naming a type
 * owned by the layer above it is backwards, and it means a future `zd td` that
 * touches files inherits a type from `md`'s directory."
 *
 * It was one import — `FileStamp` from `@/miniapps/md/reconcile` — and one import
 * is exactly how a layering rule stops being true: nothing announces it, the
 * typechecker is satisfied, and the next one is easier than the first.
 */

const PLATFORM = resolve(APP, "src/platform.ts");

describe("layering", () => {
  it("keeps the platform from importing anything a mini app owns", () => {
    const source = readFileSync(PLATFORM, "utf8");
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);

    // Stated as a rule about the directory rather than about `FileStamp`, so the
    // second one is caught as well as the first.
    expect(imports.filter((path) => path.includes("miniapps"))).toEqual([]);
  });

  it("is looking at a file that really does import things", () => {
    // The control. "No import matches" is trivially true of a file this test
    // failed to read, or of one whose import syntax this regex does not know.
    const source = readFileSync(PLATFORM, "utf8");
    expect([...source.matchAll(/from\s+"([^"]+)"/g)].length).toBeGreaterThan(0);
  });
});
