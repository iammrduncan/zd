import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

const ARCHIVER = resolve(process.cwd(), "packages/scripts/objectives/archive.mjs");
const fixtures: string[] = [];

function makeFixture(todo: string, archive?: string): string {
  const root = mkdtempSync(join(tmpdir(), "zd-archive-tasks-"));
  fixtures.push(root);
  mkdirSync(join(root, "docs", "_internal/objectives"), { recursive: true });
  writeFileSync(join(root, "docs", "_internal/objectives", "todo.txt"), todo);
  if (archive !== undefined) {
    writeFileSync(join(root, "docs", "_internal/objectives", "todo-archive.txt"), archive);
  }
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [ARCHIVER], {
    cwd: root,
    encoding: "utf8",
  });
}

afterEach(() => {
  for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true });
});

describe("the deterministic task archiver", () => {
  it("appends every completed line verbatim and in order, then removes only those lines", () => {
    const previousArchive = `# existing archive

## 2026-07-30

x 2026-07-30 (A) 2026-07-29 Older task +p1 @reader est:20m
`;
    const first = "x 2026-07-31 (A) 2026-07-30 First finished task +p2 @editor est:20m  ";
    const second = "x 2026-07-31 (B) 2026-07-30 Second finished task +p2 @editor est:30m";
    const open = "(A) 2026-07-31 Keep this open +p2 @editor est:20m";
    const checkpoint = "CHECKPOINT - stop here";
    const root = makeFixture(
      `# plan
${first}
${open}
${second}
${checkpoint}
`,
      previousArchive,
    );

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Moved 2 completed tasks; 1 open task remains.");
    expect(readFileSync(join(root, "docs", "_internal/objectives", "todo.txt"), "utf8")).toBe(
      `# plan
${open}
${checkpoint}
`,
    );

    const archive = readFileSync(
      join(root, "docs", "_internal/objectives", "todo-archive.txt"),
      "utf8",
    );
    expect(archive.startsWith(previousArchive)).toBe(true);
    expect(archive).toMatch(/\n## \d{4}-\d{2}-\d{2}\n\n/);
    expect(archive.indexOf(first)).toBeLessThan(archive.indexOf(second));
    expect(archive).toContain(`${first}\n${second}\n`);
  });

  it("creates the canonical archive header when the archive does not exist", () => {
    const completed = "x 2026-07-31 (A) 2026-07-30 Finished +p2 @editor est:20m";
    const root = makeFixture(`${completed}\nCHECKPOINT - stop\n`);

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    const archive = readFileSync(
      join(root, "docs", "_internal/objectives", "todo-archive.txt"),
      "utf8",
    );
    expect(archive).toMatch(
      /^# zd md — completed tasks, moved out of docs\/_internal\/objectives\/todo\.txt by \/archive\n# Same format as the task list\. Newest block last\. Nothing here is edited or deleted\.\n\n## \d{4}-\d{2}-\d{2}\n\n/,
    );
    expect(archive).toContain(`${completed}\n`);
  });

  it("leaves todo and the archive untouched when there is nothing completed", () => {
    const todo = `# plan
(A) 2026-07-31 Still open +p2 @editor est:20m
CHECKPOINT - stop
`;
    const root = makeFixture(todo);

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Moved 0 completed tasks; 1 open task remains.");
    expect(readFileSync(join(root, "docs", "_internal/objectives", "todo.txt"), "utf8")).toBe(todo);
    expect(existsSync(join(root, "docs", "_internal/objectives", "todo-archive.txt"))).toBe(false);
  });

  it("keeps open checkpoints and collapses three or more blank lines left by removals", () => {
    const completed = "x 2026-07-31 (A) 2026-07-30 Finished +p2 @editor est:20m";
    const root = makeFixture(`# phase

${completed}




CHECKPOINT - preserve me

(B) 2026-07-31 Work after checkpoint +p3 @shell est:20m
`);

    const result = run(root);

    expect(result.status, result.stderr).toBe(0);
    const todo = readFileSync(join(root, "docs", "_internal/objectives", "todo.txt"), "utf8");
    expect(todo).toBe(`# phase

CHECKPOINT - preserve me

(B) 2026-07-31 Work after checkpoint +p3 @shell est:20m
`);
    expect(todo).not.toContain(completed);
  });
});

describe("the npm command names", () => {
  it("uses zd-prefixed names for both task runners", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.zdloop).toBe("node packages/scripts/session-loop/index.mjs");
    expect(packageJson.scripts.zdarchive).toBe("node packages/scripts/objectives/archive.mjs");
    expect(packageJson.scripts.loop).toBeUndefined();
    expect(packageJson.scripts.archive).toBeUndefined();
  });
});
