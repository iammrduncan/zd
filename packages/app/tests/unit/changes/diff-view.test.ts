import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChangesController, mountChangesDiff, type ChangesStatusSource } from "@/changes";
import type {
  GitAdapter,
  GitComparison,
  GitDiff,
  GitHistoryPage,
  GitScope,
  GitStatusSnapshot,
} from "@/git";
import { clearCommands, commandTargetAvailable, runCommandTarget } from "@/workbench/shortcuts";

const scope: GitScope = { projectId: "project-alpha", worktreeId: "worktree-alpha" };

function status(): GitStatusSnapshot {
  return {
    scope,
    availability: "available",
    entries: [
      {
        id: "working-change",
        path: "src/main.ts",
        previousPath: null,
        state: "modified",
        indexState: null,
        worktreeState: "modified",
        submodule: false,
      },
    ],
    truncated: false,
    problem: null,
  };
}

function source(): ChangesStatusSource {
  const snapshot = status();
  return {
    snapshot: () => snapshot,
    subscribe: () => () => {},
    refresh: vi.fn(async () => undefined),
  };
}

function textDiff(): GitDiff {
  return {
    scope,
    availability: "available",
    base: {
      status: "text",
      identity: "base-buffer",
      path: "src/main.ts",
      revision: "a".repeat(40),
      text: "const value = 1;\n",
      byteLength: 17,
    },
    head: {
      status: "text",
      identity: "head-buffer",
      path: "src/main.ts",
      revision: "working-tree",
      text: "const value = 2;\n",
      byteLength: 17,
    },
    problem: null,
  };
}

function controller(result: GitDiff) {
  const adapter: GitAdapter = {
    status: vi.fn(async () => status()),
    history: vi.fn(async (request): Promise<GitHistoryPage> => ({
      scope: request.scope,
      availability: "available",
      commits: [],
      nextCursor: null,
      truncated: false,
      problem: null,
    })),
    compare: vi.fn(async (request): Promise<GitComparison> => ({
      scope: request.scope,
      availability: "available",
      baseCommitId: request.baseCommitId,
      headCommitId: request.headCommitId,
      entries: [],
      truncated: false,
      problem: null,
    })),
    diff: vi.fn(async () => result),
  };
  const value = new ChangesController(adapter, source());
  value.activate(scope);
  return value;
}

beforeEach(clearCommands);
afterEach(clearCommands);

describe("Changes diff surface", () => {
  it("mounts explicitly identified before and after buffers read-only", async () => {
    const changes = controller(textDiff());
    await changes.openWorkingDiff("working-change");
    const host = document.createElement("div");
    const unmount = mountChangesDiff(host, changes);

    expect(
      [...host.querySelectorAll<HTMLElement>("[data-buffer-identity]")].map(
        ({ dataset }) => dataset.bufferIdentity,
      ),
    ).toEqual(["base-buffer", "head-buffer"]);
    expect(
      [...host.querySelectorAll<HTMLElement>(".cm-content")].map((element) =>
        element.getAttribute("contenteditable"),
      ),
    ).toEqual(["false", "false"]);
    expect(host.textContent).toContain("Working tree");
    unmount();
  });

  it("gives Find and Escape to the focused diff before closing the diff", async () => {
    const changes = controller(textDiff());
    await changes.openWorkingDiff("working-change");
    const host = document.createElement("div");
    document.body.append(host);
    const unmount = mountChangesDiff(host, changes);
    host.querySelector<HTMLElement>("[data-diff-side='base'] .cm-content")!.focus();

    expect(commandTargetAvailable("file.find")).toBe(true);
    expect(runCommandTarget("file.find")).toBe(true);
    expect(host.querySelector<HTMLElement>("[data-diff-side='base'] .editor-find")?.hidden).toBe(
      false,
    );
    expect(runCommandTarget("workbench.escape")).toBe(true);
    expect(changes.snapshot().diff).not.toBeNull();
    expect(runCommandTarget("workbench.escape")).toBe(true);
    expect(changes.snapshot().diff).toBeNull();

    unmount();
    host.remove();
  });

  it("keeps binary and missing revisions honest without creating editors", async () => {
    const unavailable: GitDiff = {
      ...textDiff(),
      base: {
        status: "binary",
        identity: "binary-base",
        path: "asset.bin",
        revision: "a".repeat(40),
        byteLength: 512,
      },
      head: {
        status: "missing",
        identity: "missing-head",
        path: "asset.bin",
        revision: "working-tree",
      },
    };
    const changes = controller(unavailable);
    await changes.openWorkingDiff("working-change");
    const host = document.createElement("div");
    const unmount = mountChangesDiff(host, changes);

    expect(host.textContent).toContain("Binary file");
    expect(host.textContent).toContain("no longer exists");
    expect(host.querySelector(".cm-editor")).toBeNull();
    expect(commandTargetAvailable("file.find")).toBe(false);
    unmount();
  });
});
