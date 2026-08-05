import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const PUBLIC_PAGES = [
  "README.md",
  "CONTRIBUTING.md",
  "docs/README.md",
  "docs/tutorials/first-document.md",
  "docs/how-to/install-macos.md",
  "docs/how-to/develop.md",
  "docs/reference/cli.md",
  "docs/explanation/architecture.md",
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
  it("keeps the repository front page short and routes each reader onward", () => {
    const readme = page("README.md");

    expect(readme.trimEnd().split("\n").length).toBeLessThanOrEqual(90);
    expect(readme).toContain("docs/tutorials/first-document.md");
    expect(readme).toContain("docs/how-to/install-macos.md");
    expect(readme).toContain("docs/reference/cli.md");
    expect(readme).toContain("docs/explanation/architecture.md");
    expect(readme).toContain("CONTRIBUTING.md");
  });

  it("gives the documentation hub one entry point for every Diátaxis purpose", () => {
    const hub = page("docs/README.md");

    expect(hub).toMatch(/^## Tutorial$/m);
    expect(hub).toMatch(/^## How-to guides$/m);
    expect(hub).toMatch(/^## Reference$/m);
    expect(hub).toMatch(/^## Explanation$/m);
    for (const path of PUBLIC_PAGES.slice(3)) {
      expect(hub).toContain(path.replace(/^docs\//, ""));
    }
  });

  it.each(PUBLIC_PAGES)("has no broken local link in %s", (path) => {
    for (const target of localLinks(path)) {
      const destination = resolve(ROOT, dirname(path), target);
      expect(existsSync(destination), `${path} links to missing ${target}`).toBe(true);
    }
  });
});
