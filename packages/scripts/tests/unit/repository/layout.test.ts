import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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
      "packages/app/src/miniapps/md/workspace/index.ts",
      "packages/app/src/miniapps/md/editor/focus/index.ts",
      "packages/app/src/miniapps/md/editor/notation/index.ts",
      "packages/app/src/miniapps/md/review/index.ts",
      "packages/scripts/session-loop/index.mjs",
      "packages/scripts/objectives/archive.mjs",
      "packages/scripts/release/check-tag.mjs",
      "packages/scripts/audit/unused-tokens.mjs",
      "packages/website/app/docs/_components/document.tsx",
    ];

    expect(componentRoots.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
    expect(directFiles("packages/scripts", ".mjs")).toEqual([]);
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

  it("keeps the desktop runtime network-closed by default", () => {
    const config = JSON.parse(
      readFileSync(resolve(ROOT, "packages/tauri/tauri.conf.json"), "utf8"),
    ) as { app: { security: { csp: string } } };
    const preferences = readFileSync(
      resolve(ROOT, "packages/app/src/suite/preferences.ts"),
      "utf8",
    );

    expect(config.app.security.csp).toContain("script-src 'self';");
    expect(config.app.security.csp).toContain("connect-src 'self' ipc: http://ipc.localhost");
    expect(config.app.security.csp).not.toContain("ws:");
    expect(config.app.security.csp).not.toContain("wss:");
    expect(existsSync(resolve(ROOT, "packages/app/src/suite/presence.ts"))).toBe(false);
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
    expect(home).toContain("docs/user-facing-docs/assets/zd-reader.jpeg");
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

  it("reports desktop presence without counting website visitors", () => {
    const home = readFileSync(resolve(WEBSITE, "app/page.tsx"), "utf8");
    const presencePath = resolve(WEBSITE, "app/presence.tsx");
    const workerPath = resolve(WEBSITE, "public/_worker.js");

    expect(existsSync(presencePath)).toBe(true);
    expect(existsSync(workerPath)).toBe(true);

    const presence = readFileSync(presencePath, "utf8");
    const worker = readFileSync(workerPath, "utf8");
    expect(home).toContain("<AppPresence />");
    expect(presence).toContain('fetch("/api/zd-presence"');
    expect(presence).not.toContain("usessps.com/ssps.js");
    expect(worker).toContain("https://usessps.com/api/sites/271/stats");
    expect(worker).toContain("env.ASSETS.fetch(request)");
  });

  it("publishes only the validated live count from SSPS", async () => {
    const workerURL = pathToFileURL(resolve(WEBSITE, "public/_worker.js")).href;
    const worker = (await import(workerURL)) as {
      fetchPresence(fetcher: () => Promise<Response>): Promise<Response>;
    };

    const response = await worker.fetchPresence(async () =>
      Response.json({ siteId: 271, live: 4, totalHits: 18, uniqueVisitors: 7 }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ live: 4 });
  });

  it("shows how inline comments become an AI-sidekick handoff", () => {
    const home = readFileSync(resolve(WEBSITE, "app/page.tsx"), "utf8");
    const commentScreenshot = resolve(ROOT, "docs/user-facing-docs/assets/zd-comments.png");

    expect(existsSync(commentScreenshot)).toBe(true);
    expect(home).toContain("docs/user-facing-docs/assets/zd-comments.png");
    expect(home).toContain("AI sidekick");
    expect(home).toContain("zd-feedback.txt");
    expect(home).toContain("/docs/how-to/review-with-comments/");
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
