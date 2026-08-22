import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { getPublicDocs } from "../../../../website/lib/docs";

const ROOT = resolve(process.cwd());
const DOC_AREAS = [
  "adr",
  "zsip",
  "user-facing-docs",
  "planning",
  "planning/goals",
  "planning/objectives",
  "planning/objectives/_internal",
  "planning/ideas",
];
const PUBLIC_PAGES = [
  "README.md",
  "docs/README.md",
  "docs/user-facing-docs/README.md",
  "docs/user-facing-docs/tutorials/first-workbench.md",
  "docs/user-facing-docs/how-to/install-macos.md",
  "docs/user-facing-docs/how-to/install-windows.md",
  "docs/user-facing-docs/how-to/manage-projects-and-threads.md",
  "docs/user-facing-docs/how-to/inspect-changes.md",
  "docs/user-facing-docs/how-to/develop.md",
  "docs/user-facing-docs/reference/cli.md",
  "docs/user-facing-docs/reference/shortcuts.md",
  "docs/user-facing-docs/explanation/architecture.md",
];
const CONTRIBUTOR_PAGES = [
  "CONTRIBUTING.md",
  "docs/README.md",
  "packages/app/src/README.md",
  "packages/app/src/miniapps/README.md",
  "packages/tauri/src/README.md",
];
const EXPANDED_GOALS = [
  "goal-docs.md",
  "goal-reorganize.md",
  "goal-projects.md",
  "goal-instrumentation.md",
  "goal-editor.md",
  "goal-terminal.md",
  "goal-filetree.md",
  "goal-threads.md",
  "goal-notifications.md",
];
const MAINTAINED_CONTEXT_ROOTS = [
  ".agents/skills",
  ".claude/commands",
  "packages/scripts",
  "packages/app/src",
];
const SKIP_CONTEXT_DIRECTORIES = new Set([
  ".git",
  "dist",
  "node_modules",
  "out",
  "target",
  "test-results",
]);

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_CONTEXT_DIRECTORIES.has(entry.name) ? [] : filesUnder(path);
    }
    return [path];
  });
}

function page(path: string) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function localLinks(path: string) {
  return [...page(path).matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]!)
    .filter((target) => !/^(?:[a-z]+:|#)/i.test(target))
    .map((target) => decodeURIComponent(target.split("#", 1)[0]!));
}

describe("the repository documentation map", () => {
  it("separates decisions, proposals, user docs, internal records, and objectives", () => {
    for (const area of DOC_AREAS) {
      expect(existsSync(resolve(ROOT, "docs", area)), `docs/${area} is missing`).toBe(true);
    }
    expect(existsSync(resolve(ROOT, "docs/audit"))).toBe(false);
  });

  it("keeps the repository front page short and routes each reader onward", () => {
    const readme = page("README.md");

    expect(readme.trimEnd().split("\n").length).toBeLessThanOrEqual(90);
    expect(readme).toContain("docs/user-facing-docs/tutorials/first-workbench.md");
    expect(readme).toContain("docs/user-facing-docs/how-to/install-macos.md");
    expect(readme).toContain("install-macos.md#if-macos-says-zd-not-opened");
    expect(readme).toContain("Open Anyway");
    expect(readme).toContain("docs/user-facing-docs/how-to/manage-projects-and-threads.md");
    expect(readme).toContain("docs/user-facing-docs/how-to/inspect-changes.md");
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

  it("gives every document type one named entry point", () => {
    const hub = page("docs/README.md");

    expect(hub).toContain("adr/README.md");
    expect(hub).toContain("zsip/README.md");
    expect(hub).toContain("user-facing-docs/README.md");
    expect(hub).toContain("planning/README.md");
    expect(hub).toContain("planning/objectives/_internal/releasing.md");
    expect(hub).toContain("planning/objectives/");
  });

  it("routes superseded planning snapshots back to the current workbench plan", () => {
    const planning = page("docs/planning/README.md");

    expect(planning).toContain("goals/expanded-scope/goal.md");
    expect(planning).toContain("objectives/wrap-up/README.md");
    expect(planning).toContain("objectives/mini-apps/README.md");
    expect(planning).toContain("must not be used as execution queues");
  });

  it("records every expanded-scope goal and execution gate as complete", () => {
    const root = page("docs/planning/goals/expanded-scope/goal.md");

    expect(root).toMatch(/^Status: \*\*complete — 2026-08-22\*\*$/m);
    expect(root).toMatch(/^## Execution Record$/m);
    for (const id of ["D", "R", "P", "I", "E", "T", "F", "H", "N"]) {
      expect(root).toMatch(new RegExp(`^\\| ${id} \\| Complete \\|`, "m"));
    }
    for (const gate of ["0", "1", "2", "3", "4", "5"]) {
      expect(root).toMatch(new RegExp(`^\\| Gate ${gate} \\| Complete \\|`, "m"));
    }

    for (const file of EXPANDED_GOALS) {
      const goal = page(`docs/planning/goals/expanded-scope/${file}`);
      expect(goal, file).toMatch(/^Status: \*\*complete — 2026-08-22\*\*$/m);
      expect(goal, file).toMatch(/^## Completion Evidence$/m);
    }
  });

  it("keeps maintained workflow consumers on the sole planning objective root", () => {
    const offenders = MAINTAINED_CONTEXT_ROOTS.flatMap((root) => filesUnder(resolve(ROOT, root)))
      .filter((path) => /docs\/(?:_internal\/)?objectives(?:\/|$)/.test(readFileSync(path, "utf8")))
      .map((path) => path.slice(ROOT.length + 1));

    expect(offenders).toEqual([]);
    expect(existsSync(resolve(ROOT, "docs/planning/objectives/FEEDBACK.md"))).toBe(true);
    expect(existsSync(resolve(ROOT, "docs/planning/objectives/agent-findings.md"))).toBe(true);
  });

  it("retires the old surface-extension contributor instructions", () => {
    const guide = page("packages/app/src/miniapps/README.md");

    expect(guide).toContain("migration input, not an extension point");
    expect(guide).toContain("../README.md");
    expect(guide).not.toContain("while Gate 1");
    expect(guide).not.toContain("## Adding one");
  });

  it("routes implementation contributors through the current source owners", () => {
    const contributing = page("CONTRIBUTING.md");
    const hub = page("docs/README.md");
    const app = page("packages/app/src/README.md");
    const native = page("packages/tauri/src/README.md");

    for (const source of [contributing, hub]) {
      expect(source).toContain("packages/app/src/README.md");
      expect(source).toContain("packages/tauri/src/README.md");
    }

    expect(app).toContain("workbench/boot.ts");
    expect(app).toContain("workbench/state.ts");
    expect(app).toContain("platform.ts");
    expect(app).toContain("miniapps/README.md");
    expect(native).toContain("lib.rs");
    expect(native).toContain("grants.rs");
    expect(native).toContain("terminal/");
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

  it("keeps current product context on the workbench naming contract", () => {
    const currentPages = [
      ...PUBLIC_PAGES,
      ...CONTRIBUTOR_PAGES,
      "packages/website/app/layout.tsx",
      "packages/website/app/page.tsx",
      "packages/website/app/docs/page.tsx",
      "packages/website/lib/site.ts",
      "packaging/macos/render-social-card.swift",
      "package.json",
      "packages/tauri/Cargo.toml",
      "packages/tauri/tauri.conf.json",
    ];
    const retiredLaunch = new RegExp(`\\b${["zd", "md"].join("\\s+")}\\b`, "i");
    const retiredExtensionFraming = /\bmini[ -]?apps?\b/i;
    const spacedFamilyName = new RegExp(["Zen", "Suite"].join("\\s+"), "i");
    const reviewedLegacyLocations = new Set([
      "packages/app/src/README.md",
      "packages/app/src/miniapps/README.md",
    ]);

    const offenders = currentPages.flatMap((path) => {
      const source = page(path);
      return [
        retiredLaunch.test(source) && `${path}: retired launch form`,
        retiredExtensionFraming.test(source) &&
          !reviewedLegacyLocations.has(path) &&
          `${path}: retired extension framing`,
        spacedFamilyName.test(source) && `${path}: inconsistent family name`,
      ].filter((problem): problem is string => Boolean(problem));
    });

    expect(offenders).toEqual([]);
  });

  it("qualifies obsolete product language wherever active authority records it", () => {
    const authority = [
      "docs/VISION.md",
      "docs/DESIGN.md",
      "docs/planning/goals/expanded-scope/goal.md",
      "docs/planning/goals/expanded-scope/goal-docs.md",
      "docs/planning/goals/expanded-scope/goal-reorganize.md",
    ];
    const retiredLaunch = new RegExp(`\\b${["zd", "md"].join("\\s+")}\\b`, "i");
    const retiredExtensionFraming = /\bmini[ -]?apps?\b/i;
    const qualifier =
      /\b(?:former|histor|migration|no |not |old |pivot|reject|remove|retir|supersed|without)\w*/i;
    const offenders = authority.flatMap((path) =>
      page(path)
        .split(/\n\s*\n/)
        .filter(
          (paragraph) =>
            (retiredLaunch.test(paragraph) || retiredExtensionFraming.test(paragraph)) &&
            !qualifier.test(paragraph),
        )
        .map((paragraph) => `${path}: ${paragraph.replace(/\s+/g, " ").slice(0, 100)}`),
    );

    expect(offenders).toEqual([]);
  });

  it("does not expand the complete zd name in current product copy", () => {
    const currentPages = [...PUBLIC_PAGES, ...CONTRIBUTOR_PAGES, "packages/website"];
    const expansion =
      /\bzd\s+(?:is\s+)?(?:an?\s+)?(?:abbreviation|short\s+for|stands\s+for|means)\b/i;
    const offenders = currentPages.flatMap((entry) => {
      const absolute = resolve(ROOT, entry);
      const paths = statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
      return paths
        .filter((path) => expansion.test(readFileSync(path, "utf8")))
        .map((path) => relative(ROOT, path));
    });

    expect(offenders).toEqual([]);
  });

  it("contains no reserved external product name anywhere in repository sources", () => {
    const reservedName = String.fromCharCode(122, 101, 110, 100, 101, 115, 107);
    const offenders = filesUnder(ROOT)
      .filter((path) => statSync(path).size <= 5 * 1024 * 1024)
      .filter((path) => readFileSync(path).toString("utf8").toLowerCase().includes(reservedName))
      .map((path) => relative(ROOT, path));

    expect(offenders).toEqual([]);
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

  it.each(CONTRIBUTOR_PAGES)("has no broken local contributor link in %s", (path) => {
    for (const target of localLinks(path)) {
      const destination = resolve(ROOT, dirname(path), target);
      expect(existsSync(destination), `${path} links to missing ${target}`).toBe(true);
    }
  });
});
