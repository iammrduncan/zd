import { describe, expect, it, vi } from "vitest";

import { FileDraftStore } from "@/workbench/current-file/drafts";

const main = {
  projectId: "project-a",
  worktreeId: "worktree-a",
  relativePath: "src/main.ts",
} as const;

describe("file draft recovery", () => {
  it("persists file-scoped drafts and restores them in a new owner", async () => {
    const first = new FileDraftStore(window.localStorage);
    const listener = vi.fn();
    first.subscribe(listener);

    first.save(main, "const recovered = true;");
    await Promise.resolve();

    expect(listener).toHaveBeenCalledOnce();
    expect(new FileDraftStore(window.localStorage).get(main)?.text).toBe("const recovered = true;");
  });

  it("clears a saved draft and reports dirty paths only within the requested scope", async () => {
    const drafts = new FileDraftStore(window.localStorage);
    drafts.save(main, "changed");
    drafts.save({ ...main, worktreeId: "other", relativePath: "notes.md" }, "other");
    await Promise.resolve();

    expect(drafts.dirtyPaths({ projectId: "project-a", worktreeId: "worktree-a" })).toEqual(
      new Set(["src/main.ts"]),
    );
    drafts.clear(main);
    await Promise.resolve();

    expect(new FileDraftStore(window.localStorage).get(main)).toBeNull();
  });
});
