import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());
const WRAP_UP = resolve(ROOT, "docs/planning/objectives/wrap-up");

function goalFiles(): string[] {
  return readdirSync(WRAP_UP, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{2}-/.test(entry.name))
    .map((entry) => resolve(WRAP_UP, entry.name, "goal.md"));
}

describe("bounded objective work groups", () => {
  it("keeps the top-level todo as a short queue of work groups", () => {
    const todos = readFileSync(resolve(ROOT, "docs/planning/objectives/todo.txt"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(todos.length).toBeGreaterThan(1);
    expect(todos.every((todo) => !/^x |\best:\d+m\b|\([ABC]\)/.test(todo))).toBe(true);
  });

  it.each(goalFiles())("makes %s a multi-todo group with a bounded acceptance contract", (path) => {
    const goal = readFileSync(path, "utf8");
    const sourceTodos = goal.match(/^- \*\*WU-\d+:\*\*/gm) ?? [];
    const criteria = goal.match(/^\d+\. /gm) ?? [];

    expect(goal).toMatch(/^## Outcome$/m);
    expect(goal).toMatch(/^## Source todos$/m);
    expect(sourceTodos.length).toBeGreaterThan(1);
    expect(goal).toMatch(/^## Acceptance criteria$/m);
    expect(criteria.length).toBeGreaterThan(1);
    expect(goal).toMatch(/^## Terminal condition$/m);
    expect(goal).toMatch(/^## Exclusions$/m);
  });
});
