import { describe, expect, it } from "vitest";

import {
  stateAfterFileClose,
  stateAfterFileRemoval,
  stateAfterFileRename,
} from "@/workbench/state-owner-files";
import { defaultWorkbenchState, fileStateId, type WorkbenchState } from "@/workbench/state";

function stateWithOpenFolder(): WorkbenchState {
  const state = defaultWorkbenchState();
  return {
    ...state,
    openFiles: [
      {
        id: "file-root",
        projectId: "project-a",
        worktreeId: "worktree-a",
        relativePath: "docs/README.md",
        bufferId: "buffer-root",
      },
      {
        id: "file-child",
        projectId: "project-a",
        worktreeId: "worktree-a",
        relativePath: "docs/notes.md",
        bufferId: "buffer-child",
      },
      {
        id: "file-other",
        projectId: "project-b",
        worktreeId: "worktree-b",
        relativePath: "src/main.ts",
        bufferId: "buffer-other",
      },
    ],
    threads: [
      {
        id: "thread-a",
        projectId: "project-a",
        worktreeId: "worktree-a",
        name: "Plan",
        order: 0,
        type: "terminal",
        agent: "shell",
        lifecycle: "idle",
        lifecycleSource: "process",
        lifecycleRevision: 1,
        attentionUnread: false,
        attentionVersion: 0,
        backingId: "terminal-thread-a",
        backingAvailability: "ready",
        recovery: null,
        fileId: "file-root",
      },
    ],
    active: {
      projectId: "project-a",
      worktreeId: "worktree-a",
      threadId: "thread-a",
      fileId: "file-root",
    },
  };
}

describe("file identity reconciliation", () => {
  it("closes only the requested file without switching to another open file", () => {
    const state = stateWithOpenFolder();
    const contexts = new Map([["project-a", { ...state.active }]]);

    const closed = stateAfterFileClose(state, contexts, {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "docs/README.md",
    });

    expect(closed?.openFiles.map(({ id }) => id)).toEqual(["file-child", "file-other"]);
    expect(closed?.active.fileId).toBeNull();
    expect(closed?.threads[0]?.fileId).toBeNull();
    expect(closed?.regions.focus).toBe("thread");
    expect(contexts.get("project-a")?.fileId).toBeNull();
  });

  it("updates open files and thread memory after native rename and Trash operations", () => {
    const resource = {
      projectId: "project-a",
      worktreeId: "worktree-a",
      relativePath: "docs",
    };
    const contexts = new Map([["project-a", { ...stateWithOpenFolder().active }]]);

    const renamed = stateAfterFileRename(stateWithOpenFolder(), contexts, resource, "writing");

    expect(renamed?.openFiles.map(({ relativePath }) => relativePath)).toEqual([
      "writing/README.md",
      "writing/notes.md",
      "src/main.ts",
    ]);
    const readmeId = fileStateId({ ...resource, relativePath: "writing/README.md" });
    expect(renamed?.active.fileId).toBe(readmeId);
    expect(renamed?.threads[0]?.fileId).toBe(readmeId);

    const removed = stateAfterFileRemoval(renamed!, contexts, {
      ...resource,
      relativePath: "writing",
    });

    expect(removed?.openFiles.map(({ relativePath }) => relativePath)).toEqual(["src/main.ts"]);
    expect(removed?.active.fileId).toBeNull();
    expect(removed?.threads[0]?.fileId).toBeNull();
    expect(contexts.get("project-a")?.fileId).toBeNull();
  });
});
