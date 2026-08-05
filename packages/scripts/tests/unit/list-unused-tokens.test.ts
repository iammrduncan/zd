import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

const AUDITOR = resolve(process.cwd(), "packages/scripts/list-unused-tokens.mjs");
const fixtures: string[] = [];

function makeFixture(tokens: string, styles: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "zd-unused-tokens-"));
  fixtures.push(root);
  const source = join(root, "packages/app/src");
  mkdirSync(join(source, "design"), { recursive: true });
  writeFileSync(join(source, "design/tokens.css"), tokens);

  for (const [name, contents] of Object.entries(styles)) {
    const path = join(source, name);
    mkdirSync(resolve(path, ".."), { recursive: true });
    writeFileSync(path, contents);
  }
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [AUDITOR], {
    cwd: root,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("the unused design token inventory", () => {
  it("lists defined tokens that no stylesheet consumes and ignores comments", () => {
    const root = makeFixture(
      `:root {
  --used-directly: red;
  --used-by-token: var(--used-directly);
  --unused: blue;
  --comment-only: green;
}
`,
      {
        "miniapps/example.css": `/* var(--comment-only) is documentation, not consumption. */
.example { color: var(--used-by-token); }
`,
      },
    );

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("2 of 4 design tokens are not consumed by a stylesheet:");
    expect(result.stdout).toContain("  --comment-only\n");
    expect(result.stdout).toContain("  --unused\n");
    expect(result.stdout).not.toContain("  --used-directly\n");
    expect(result.stdout).not.toContain("  --used-by-token\n");
  });

  it("reports a clean inventory without turning it into a failing check", () => {
    const root = makeFixture(
      `:root {
  --used: red;
}
`,
      { "app.css": ".example { color: var(--used); }\n" },
    );

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("All 1 design tokens are consumed by a stylesheet.\n");
  });

  it("is exposed as an explicit npm command rather than part of the test gate", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["tokens:unused"]).toBe(
      "node packages/scripts/list-unused-tokens.mjs",
    );
    expect(packageJson.scripts.test).not.toContain("tokens:unused");
    expect(packageJson.scripts.check).not.toContain("tokens:unused");
  });
});
