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
const WEBSITE = resolve(ROOT, "packages/website");
const SKIP = new Set(["node_modules", "dist", "test-results", "target", ".git"]);
const PRODUCT_DESCRIPTION =
  "ZenSuite — a fast, local agent workbench for projects, threads, terminals, files, and Git.";

function directFiles(directory: string, suffix: string): string[] {
  return readdirSync(resolve(ROOT, directory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort();
}

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("package ownership", () => {
  it("files product, shell, and automation inputs under their package", () => {
    const ownedInputs = [
      "packages/app/index.html",
      "packages/app/src/main.ts",
      "packages/app/assets/fonts/iAWriterQuattroV.ttf",
      "packages/app/tests/unit/editor/index.test.ts",
      "packages/tauri/Cargo.toml",
      "packages/tauri/src/main.rs",
      "packages/scripts/objectives/archive.mjs",
      "packages/scripts/tests/unit/objectives/archive.test.ts",
      "packages/website/app/page.tsx",
      "packages/website/package.json",
    ];

    expect(ownedInputs.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
  });

  it("uses directories rather than filename prefixes for component families", () => {
    const componentRoots = [
      "packages/app/src/editor/focus/index.ts",
      "packages/app/src/editor/markdown/notation/index.ts",
      "packages/app/src/editor/review/index.ts",
      "packages/app/src/workbench/current-file/index.ts",
      "packages/scripts/session-loop/index.mjs",
      "packages/scripts/objectives/archive.mjs",
      "packages/scripts/release/check-tag.mjs",
      "packages/scripts/audit/unused-tokens.mjs",
      "packages/website/app/docs/_components/document.tsx",
    ];

    expect(componentRoots.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
    expect(directFiles("packages/scripts", ".mjs")).toEqual([]);
  });

  it("keeps the retired application-surface boundary out of current app code", () => {
    const retiredRoot = resolve(APP, "src/miniapps");
    const currentFiles = [resolve(APP, "src"), resolve(APP, "dev")]
      .flatMap(filesUnder)
      .filter((path) => /\.(?:css|html|ts)$/.test(path));
    const staleReferences = currentFiles
      .filter((path) => /miniapps?/i.test(readFileSync(path, "utf8")))
      .map((path) => relative(ROOT, path));

    expect(existsSync(retiredRoot)).toBe(false);
    expect(existsSync(resolve(APP, "dev/workspace.html"))).toBe(false);
    expect(existsSync(resolve(APP, "tests/unit/md"))).toBe(false);
    expect(existsSync(resolve(APP, "tests/e2e/workspace"))).toBe(false);
    expect(staleReferences).toEqual([]);
  });

  it("mirrors app and automation tests below their owning component", () => {
    expect(directFiles("packages/app/tests/e2e", ".spec.ts")).toEqual([]);
    expect(directFiles("packages/app/tests/unit", ".test.ts")).toEqual([]);
    expect(directFiles("packages/scripts/tests/unit", ".test.ts")).toEqual([]);

    expect(
      directFiles("packages/app/tests/e2e/editor", ".spec.ts").filter((name) =>
        name.startsWith("editor-"),
      ),
    ).toEqual([]);
    expect(
      directFiles("packages/scripts/tests/unit/session-loop", ".test.ts").filter((name) =>
        name.startsWith("session-loop-"),
      ),
    ).toEqual([]);
  });

  it("leaves no loose package inputs at the repository root", () => {
    const looseInputs = ["assets", "dev", "index.html", "scripts", "src", "src-tauri", "tests"];

    expect(looseInputs.filter((path) => existsSync(resolve(ROOT, path)))).toEqual([]);
  });

  it("keeps generated app output outside the lint input set", async () => {
    const eslint = new ESLint({ cwd: ROOT });

    expect(await eslint.isPathIgnored("packages/app/dist/assets/generated.js")).toBe(true);
  });

  it("publishes the current workbench identity in package metadata", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      description: string;
    };
    const cargo = readFileSync(resolve(ROOT, "packages/tauri/Cargo.toml"), "utf8");
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as {
      bundle: { shortDescription: string; longDescription: string };
    };

    expect(rootPackage.description).toBe(PRODUCT_DESCRIPTION);
    expect(cargo).toContain(`description = "${PRODUCT_DESCRIPTION}"`);
    expect(config.bundle).toMatchObject({
      shortDescription: "A fast, local agent workbench",
      longDescription: PRODUCT_DESCRIPTION,
    });
  });

  it("preserves the invoking directory for ordinary Tauri development launches", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const cwdPreservingLaunch =
      'ZD_CWD="$INIT_CWD" tauri dev --config packages/tauri/tauri.conf.json -- --';

    expect(rootPackage.scripts.app).toBe(cwdPreservingLaunch);
    expect(rootPackage.scripts["app:open"]).toBe(cwdPreservingLaunch);
  });

  it("keeps the desktop runtime network-closed by default", () => {
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as { app: { security: { csp: string } } };
    const preferences = readFileSync(
      resolve(ROOT, "packages/app/src/workbench/preferences.ts"),
      "utf8",
    );

    expect(config.app.security.csp).toContain("script-src 'self';");
    expect(config.app.security.csp).toContain("connect-src 'self' ipc: http://ipc.localhost");
    expect(config.app.security.csp).not.toContain("ws:");
    expect(config.app.security.csp).not.toContain("wss:");
    expect(existsSync(resolve(ROOT, "packages/app/src/suite"))).toBe(false);
    expect(preferences).not.toMatch(/presence|ssps/i);
  });
});

describe("static website", () => {
  it("is a workspace with root-level build and launch commands", () => {
    const rootPackage = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
    const websitePackage = JSON.parse(readFileSync(resolve(WEBSITE, "package.json"), "utf8"));

    expect(rootPackage.workspaces).toContain("packages/website");
    expect(rootPackage.scripts["website:dev"]).toContain("@zd/website");
    expect(rootPackage.scripts["website:build"]).toContain("@zd/website");
    expect(rootPackage.scripts["website:preview"]).toContain("@zd/website");
    expect(websitePackage.private).toBe(true);
    expect(websitePackage.scripts).toMatchObject({
      build: "next build",
      dev: "next dev",
    });
    expect(websitePackage.dependencies).toMatchObject({
      "markdown-it": "14.3.0",
      next: "16.3.0",
    });
  });

  it("exports static HTML and keeps product imagery with the website", () => {
    const config = readFileSync(resolve(WEBSITE, "next.config.ts"), "utf8");
    const home = readFileSync(resolve(WEBSITE, "app/page.tsx"), "utf8");

    expect(config).toContain('output: "export"');
    expect(config).toContain("trailingSlash: true");
    expect(home).toContain("/docs/");
    expect(home).toContain("RELEASE_URL");
    expect(home).toContain("docs/user-facing-docs/assets/zd-workbench.png");
    expect(home).toContain("docs/user-facing-docs/assets/zd-workbench-side-by-side.png");
    expect(existsSync(resolve(WEBSITE, "public/screenshots"))).toBe(false);
  });

  it("publishes canonical crawl and sharing metadata", () => {
    const seoFiles = ["app/robots.ts", "app/sitemap.ts", "lib/site.ts"];
    expect(seoFiles.filter((path) => !existsSync(resolve(WEBSITE, path)))).toEqual([]);

    const layout = readFileSync(resolve(WEBSITE, "app/layout.tsx"), "utf8");
    const home = readFileSync(resolve(WEBSITE, "app/page.tsx"), "utf8");
    const robots = readFileSync(resolve(WEBSITE, "app/robots.ts"), "utf8");
    const sitemap = readFileSync(resolve(WEBSITE, "app/sitemap.ts"), "utf8");
    const site = readFileSync(resolve(WEBSITE, "lib/site.ts"), "utf8");

    expect(site).toContain("https://getzensuite.com");
    expect(site).toContain("github.com/iammrduncan/zd");
    expect(site).toContain("/releases/latest");
    expect(site).toContain("zd-social-card.png");
    expect(site).toContain('SITE_NAME = "zd"');
    expect(site).toContain('creator: "ZenSuite"');
    expect(site).toContain("metadataBase");
    expect(layout).toContain("rootMetadata");
    expect(home).toContain('type="application/ld+json"');
    expect(robots).toContain('dynamic = "force-static"');
    expect(robots).toContain("sitemap.xml");
    expect(sitemap).toContain('dynamic = "force-static"');
    expect(sitemap).toContain("getPublicDocs");
  });

  it("loads Fathom analytics once from the shared layout", () => {
    const layout = readFileSync(resolve(WEBSITE, "app/layout.tsx"), "utf8");
    const scriptMatches = layout.match(/cdn\.usefathom\.com\/script\.js/g) ?? [];

    expect(scriptMatches).toHaveLength(1);
    expect(layout).toContain('data-site="LIDRLGUW"');
    expect(layout).toContain("defer");
  });

  it("does not claim a live desktop presence feed", () => {
    const home = readFileSync(resolve(WEBSITE, "app/page.tsx"), "utf8");
    const presencePath = resolve(WEBSITE, "app/presence.tsx");
    const workerPath = resolve(WEBSITE, "public/_worker.js");

    expect(existsSync(presencePath)).toBe(false);
    expect(existsSync(workerPath)).toBe(false);
    expect(home).not.toContain("AppPresence");
    expect(home).not.toMatch(/live app activity|live desktop presence/i);
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
 * Feature surfaces consume it through the root runtime, so the bottom layer
 * naming a type owned by the layer above it is backwards.
 *
 * It was one import — `FileStamp` from a feature-owned reconcile module — and one import
 * is exactly how a layering rule stops being true: nothing announces it, the
 * typechecker is satisfied, and the next one is easier than the first.
 */

const PLATFORM = resolve(APP, "src/platform.ts");

describe("layering", () => {
  it("keeps the platform from importing the retired source boundary", () => {
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
