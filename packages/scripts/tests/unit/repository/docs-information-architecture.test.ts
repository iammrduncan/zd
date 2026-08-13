import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getPublicDocs } from "../../../../website/lib/docs";

const ROOT = resolve(process.cwd());
const DOC_AREAS = ["adr", "zsip", "user-facing-docs", "_internal", "_internal/objectives"];
const PUBLIC_PAGES = [
  "README.md",
  "docs/README.md",
  "docs/user-facing-docs/README.md",
  "docs/user-facing-docs/tutorials/first-document.md",
  "docs/user-facing-docs/how-to/install-macos.md",
  "docs/user-facing-docs/how-to/install-windows.md",
  "docs/user-facing-docs/how-to/review-with-comments.md",
  "docs/user-facing-docs/how-to/develop.md",
  "docs/user-facing-docs/reference/cli.md",
  "docs/user-facing-docs/explanation/architecture.md",
];

function page(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function localLinks(path: string) {
  return [...page(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^(?:[a-z]+:|#)/i.test(target))
    .map((target) => decodeURIComponent(target.split("#", 1)[0]!));
}

describe("the public documentation map", () => {
  it("separates decisions, proposals, user docs, internal records, and objectives", () => {
    for (const area of DOC_AREAS) {
      expect(existsSync(resolve(ROOT, "docs", area)), `docs/${area} is missing`).toBe(true);
    }
    expect(existsSync(resolve(ROOT, "docs/audit"))).toBe(false);
  });

  it("keeps the repository front page short and routes each reader onward", () => {
    const readme = page("README.md");

    expect(readme.trimEnd().split("\n").length).toBeLessThanOrEqual(90);
    expect(readme).toContain("docs/user-facing-docs/tutorials/first-document.md");
    expect(readme).toContain("docs/user-facing-docs/how-to/install-macos.md");
    expect(readme).toContain("install-macos.md#if-macos-says-zd-not-opened");
    expect(readme).toContain("Open Anyway");
    expect(readme).toContain("docs/user-facing-docs/how-to/review-with-comments.md");
    expect(readme).toContain("docs/user-facing-docs/reference/cli.md");
    expect(readme).toContain("docs/user-facing-docs/explanation/architecture.md");
    expect(readme).toContain("CONTRIBUTING.md");
  });

  it("explains how to recover safely from the macOS unverified-app alert", () => {
    const guide = page("docs/user-facing-docs/how-to/install-macos.md");

    expect(guide).toMatch(/^## If macOS says “zd” Not Opened$/m);
    expect(guide).toContain("shasum -a 256");
    expect(guide).toContain("about an hour");
    expect(guide).toContain("https://support.apple.com/102445");
    expect(guide).not.toMatch(/\bxattr\b|\bspctl\b/);
  });

  it("documents the global desktop presence control", () => {
    const readme = page("README.md");
    const reference = page("docs/user-facing-docs/reference/cli.md");

    for (const source of [readme, reference]) {
      expect(source).toContain("Cmd+Option+P");
      expect(source).toContain("Ctrl+Alt+P");
      expect(source).toContain("every open window");
      expect(source).toContain("persists");
    }
  });

  it("gives every document type one named entry point", () => {
    const hub = page("docs/README.md");

    expect(hub).toContain("adr/README.md");
    expect(hub).toContain("zsip/README.md");
    expect(hub).toContain("user-facing-docs/README.md");
    expect(hub).toContain("_internal/README.md");
    expect(hub).toContain("_internal/objectives/README.md");
  });

  it("gives user documentation one entry point for every Diátaxis purpose", () => {
    const hub = page("docs/user-facing-docs/README.md");

    expect(hub).toMatch(/^## Tutorial$/m);
    expect(hub).toMatch(/^## How-to guides$/m);
    expect(hub).toMatch(/^## Reference$/m);
    expect(hub).toMatch(/^## Explanation$/m);
    for (const path of PUBLIC_PAGES.slice(3)) {
      expect(hub).toContain(path.replace(/^docs\/user-facing-docs\//, ""));
    }
  });

  it("publishes the canonical user documentation instead of keeping a website copy", () => {
    const docsModule = page("packages/website/lib/docs.ts");
    const docsPage = page("packages/website/app/docs/[...slug]/page.tsx");

    expect(docsModule).toContain('"docs", "user-facing-docs"');
    expect(docsModule).toContain("readFileSync");
    expect(docsPage).toContain("generateStaticParams");
    expect(existsSync(resolve(ROOT, "packages/website/content"))).toBe(false);
  });

  it("does not publish agent instruction files as product documentation", () => {
    const publishedPaths = getPublicDocs().map((doc) => doc.slug.join("/"));

    expect(publishedPaths).not.toContain("AGENTS");
    expect(publishedPaths).not.toContain("CLAUDE");
  });

  it("gives every published documentation page a search description", () => {
    for (const doc of getPublicDocs()) {
      expect(doc).toHaveProperty("description");
      expect(doc.description.length).toBeGreaterThan(20);
      expect(doc.description.length).toBeLessThanOrEqual(160);
    }
  });

  it("keeps internal planning links out of standalone user documentation", () => {
    for (const path of PUBLIC_PAGES.slice(2)) {
      const source = page(path);
      expect(source, path).not.toMatch(/(?:^|\/)_(?:internal|objectives)(?:\/|$)/);
      expect(source, path).not.toMatch(/(?:^|\/)adr(?:\/|$)/);
      expect(source, path).not.toMatch(/(?:^|\/)zsip(?:\/|$)/);
    }
  });

  it.each(PUBLIC_PAGES)("has no broken local link in %s", (path) => {
    for (const target of localLinks(path)) {
      const destination = resolve(ROOT, dirname(path), target);
      expect(existsSync(destination), `${path} links to missing ${target}`).toBe(true);
    }
  });
});
