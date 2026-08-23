import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

describe("bounded objective work groups", () => {
  it("keeps the top-level todo as a short queue of work groups", () => {
    const todos = readFileSync(resolve(ROOT, "docs/planning/objectives/todo.txt"), "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(todos.length).toBeGreaterThan(1);
    expect(todos.every((todo) => !/^x |\best:\d+m\b|\([ABC]\)/.test(todo))).toBe(true);
  });
});
