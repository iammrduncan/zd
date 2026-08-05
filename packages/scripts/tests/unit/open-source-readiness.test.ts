import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const DOCS = resolve(ROOT, "docs");

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the public repository boundary", () => {
  it("ships the basic open-source policy files", () => {
    const required = ["LICENSE", "CONTRIBUTING.md", "SECURITY.md"];

    expect(required.filter((path) => !existsSync(resolve(ROOT, path)))).toEqual([]);
    expect(readFileSync(resolve(ROOT, "LICENSE"), "utf8")).toContain(
      "Permission is hereby granted",
    );
  });

  it("does not publish empty planning documents or the retired report stub", () => {
    const goals = resolve(ROOT, "docs/goals");
    const emptyMarkdown = filesUnder(goals)
      .filter((path) => path.endsWith(".md") && statSync(path).size === 0)
      .map((path) => relative(ROOT, path));

    expect(emptyMarkdown).toEqual([]);
    expect(existsSync(resolve(ROOT, "docs/report.txt"))).toBe(false);
  });

  it("keeps the optional loop display free of the vulnerable image stack", () => {
    const manifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    const declared = {
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.optionalDependencies,
    };

    expect(declared).not.toHaveProperty("@huggingface/transformers");
    expect(existsSync(resolve(ROOT, "packages/scripts/session-inference-worker.mjs"))).toBe(false);
  });

  it("keeps public documentation links inside the repository valid", () => {
    const rootMarkdown = readdirSync(ROOT, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => resolve(ROOT, entry.name));
    const markdown = [...rootMarkdown, ...filesUnder(DOCS).filter((path) => path.endsWith(".md"))];
    const broken = markdown.flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return [...source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].flatMap((match) => {
        const target = match[1]?.trim().replace(/^<|>$/g, "") ?? "";
        if (!target || target.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(target)) return [];

        const localPath = decodeURI(target.split("#", 1)[0] ?? "");
        return existsSync(resolve(join(path, ".."), localPath))
          ? []
          : [`${relative(ROOT, path)}: ${target}`];
      });
    });

    expect(broken).toEqual([]);
  });
});
