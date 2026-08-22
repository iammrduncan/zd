import { describe, expect, it } from "vitest";

import {
  findProjectByCanonicalRoot,
  projectOrderAfterInsertion,
  projectSnapshotFromWorkbench,
  shortcutProject,
} from "@/projects/model";
import { defaultWorkbenchState, type WorkbenchState } from "@/workbench/state";

function state(): WorkbenchState {
  return {
    ...defaultWorkbenchState(),
    projects: [
      { id: "alpha", name: "Alpha", root: "/work/alpha", availability: "available" },
      { id: "beta", name: "Beta", root: "/work/beta", availability: "missing" },
      { id: "gamma", name: "Gamma", root: "/work/gamma", availability: "available" },
    ],
    worktrees: [
      {
        id: "alpha-root",
        projectId: "alpha",
        name: "main",
        root: "/work/alpha",
        availability: "available",
      },
      {
        id: "alpha-feature",
        projectId: "alpha",
        name: "feature/navigation",
        root: "/work/alpha-feature",
        availability: "available",
      },
      {
        id: "beta-root",
        projectId: "beta",
        name: "main",
        root: "/work/beta",
        availability: "missing",
      },
      {
        id: "gamma-root",
        projectId: "gamma",
        name: "main",
        root: "/work/gamma",
        availability: "available",
      },
    ],
    threads: [
      {
        id: "thread-alpha",
        projectId: "alpha",
        worktreeId: "alpha-feature",
        name: "Build",
        sessionId: "terminal-alpha",
      },
    ],
    openFiles: [
      {
        id: "file-alpha",
        projectId: "alpha",
        worktreeId: "alpha-feature",
        relativePath: "src/projects/model.ts",
        bufferId: "buffer-alpha",
      },
    ],
    active: {
      projectId: "alpha",
      worktreeId: "alpha-feature",
      threadId: "thread-alpha",
      fileId: "file-alpha",
    },
  };
}

describe("the Projects model", () => {
  it("derives stable order and an explicit project/worktree context from root state", () => {
    const snapshot = projectSnapshotFromWorkbench(state());

    expect(snapshot.projects.map(({ id, order }) => [id, order])).toEqual([
      ["alpha", 0],
      ["beta", 1],
      ["gamma", 2],
    ]);
    expect(snapshot.projects).toHaveLength(3);
    expect(snapshot.projects[0]!.worktrees).toHaveLength(2);
    expect(snapshot.active).toEqual({
      projectId: "alpha",
      projectRoot: "/work/alpha",
      worktreeId: "alpha-feature",
      worktreeRoot: "/work/alpha-feature",
      threadId: "thread-alpha",
      fileId: "file-alpha",
    });
  });

  it("keeps worktrees inside one owning project rather than promoting them", () => {
    const snapshot = projectSnapshotFromWorkbench(state());

    expect(snapshot.projects.map(({ id }) => id)).toEqual(["alpha", "beta", "gamma"]);
    expect(snapshot.projects[0]!.worktrees.map(({ id }) => id)).toEqual([
      "alpha-root",
      "alpha-feature",
    ]);
  });

  it("uses native canonical roots to recognize an existing project identity", () => {
    const projects = projectSnapshotFromWorkbench(state()).projects;

    expect(findProjectByCanonicalRoot(projects, "/work/alpha")?.id).toBe("alpha");
    expect(findProjectByCanonicalRoot(projects, "/work/alpha/other")).toBeNull();
  });

  it("moves one stable ID to a bounded insertion point without changing the others", () => {
    const projects = projectSnapshotFromWorkbench(state()).projects;

    expect(projectOrderAfterInsertion(projects, "alpha", 3)).toEqual(["beta", "gamma", "alpha"]);
    expect(projectOrderAfterInsertion(projects, "gamma", 0)).toEqual(["gamma", "alpha", "beta"]);
    expect(projectOrderAfterInsertion(projects, "missing", 1)).toBeNull();
  });

  it("maps only the first nine visible projects to shortcut slots", () => {
    const projects = Array.from({ length: 11 }, (_, index) => ({
      ...projectSnapshotFromWorkbench(state()).projects[0]!,
      id: `project-${index + 1}`,
      order: index,
    }));

    expect(shortcutProject(projects, 1)?.id).toBe("project-1");
    expect(shortcutProject(projects, 9)?.id).toBe("project-9");
    expect(shortcutProject(projects, 10)).toBeNull();
    expect(shortcutProject(projects, 0)).toBeNull();
  });

  it("keeps unavailable projects visible with specific recovery copy", () => {
    const snapshot = projectSnapshotFromWorkbench(state(), {
      beta: {
        kind: "moved",
        summary: "Folder moved since it was approved.",
        actionLabel: "Locate folder",
      },
    });

    expect(snapshot.projects[1]).toMatchObject({
      id: "beta",
      availability: "missing",
      recovery: {
        kind: "moved",
        summary: "Folder moved since it was approved.",
        actionLabel: "Locate folder",
      },
    });
  });

  it.each([
    ["missing", "missing", "Folder is missing."],
    ["denied", "denied", "Folder access was denied."],
    ["unavailable", "unavailable", "Folder is unavailable."],
  ] as const)("maps %s native availability to named recovery", (availability, kind, summary) => {
    const current = state();
    const snapshot = projectSnapshotFromWorkbench({
      ...current,
      projects: [{ ...current.projects[0]!, availability }],
      worktrees: current.worktrees.filter(({ projectId }) => projectId === "alpha"),
      threads: current.threads,
      openFiles: current.openFiles,
    });

    expect(snapshot.projects[0]!.recovery).toMatchObject({ kind, summary });
  });

  it("allows native recovery detail to distinguish a non-directory root", () => {
    const current = state();
    const snapshot = projectSnapshotFromWorkbench(
      {
        ...current,
        projects: [{ ...current.projects[0]!, availability: "unavailable" }],
        worktrees: current.worktrees.filter(({ projectId }) => projectId === "alpha"),
      },
      {
        alpha: {
          kind: "not-directory",
          summary: "The approved root is no longer a folder.",
          actionLabel: "Choose folder",
        },
      },
    );

    expect(snapshot.projects[0]!.recovery).toEqual({
      kind: "not-directory",
      summary: "The approved root is no longer a folder.",
      actionLabel: "Choose folder",
    });
  });
});
