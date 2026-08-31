import { beforeEach, describe, expect, it, vi } from "vitest";

import { createDurableStateAdapter, type DurableStateMutation } from "@/platform/durable-state";
import { migrateLegacyDurableState } from "@/workbench/durable-migration";

const projectId = "project-00000000000000000000000000000001";
const worktreeId = "worktree-00000000000000000000000000000002";
const draftKey = "zd.fileDraft.v1:fixture";
const reviewKey = `zd.review.v2:${projectId}\0${worktreeId}`;

beforeEach(() => localStorage.clear());

describe("legacy origin-state migration", () => {
  it("removes each valid key only after the host confirms its closed mutation", async () => {
    localStorage.setItem(
      "zd.themeSelection.v1",
      JSON.stringify({ selected: "current-dark", lastValid: "current-dark" }),
    );
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        schemaVersion: 1,
        projectId,
        worktreeId,
        relativePath: "notes.md",
        text: "recover me",
        updatedAt: 1,
      }),
    );
    localStorage.setItem(
      reviewKey,
      JSON.stringify([
        {
          id: "comment-1",
          relative: "notes.md",
          startLine: 1,
          endLine: 1,
          selected: "line",
          comment: "keep",
        },
      ]),
    );
    let revision = { preferences: 0, project: 0 };
    const adapter = createDurableStateAdapter({
      describe: async () => ({
        revision,
        preferences: null,
        workbench: null,
        drafts: [],
        reviewLedgers: [],
      }),
      apply: async ({ mutation }: { mutation: DurableStateMutation }) => {
        revision = {
          preferences: revision.preferences + (mutation.kind === "replace-preferences" ? 1 : 0),
          project: revision.project + (mutation.kind === "replace-preferences" ? 0 : 1),
        };
        return { status: "applied", revision };
      },
    });
    await adapter.load();

    const notices = await migrateLegacyDurableState(adapter, localStorage);

    expect(notices).toEqual([]);
    expect(localStorage.getItem("zd.themeSelection.v1")).toBeNull();
    expect(localStorage.getItem(draftKey)).toBeNull();
    expect(localStorage.getItem(reviewKey)).toBeNull();
    expect(adapter.snapshot().preferences).toMatchObject({
      values: { "zd.themeSelection.v1": expect.any(String) },
    });
    expect(adapter.snapshot().drafts[0]?.text).toBe("recover me");
    expect(adapter.snapshot().reviewLedgers[0]?.comments[0]?.comment).toBe("keep");
  });

  it("preserves malformed and refused keys with bounded content-free notices", async () => {
    localStorage.setItem("zd.themeSelection.v1", "private malformed value");
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        schemaVersion: 1,
        projectId,
        worktreeId,
        relativePath: "notes.md",
        text: "private recovery text",
        updatedAt: -1,
      }),
    );
    localStorage.setItem("zd.wordWrap", "false");
    const durable = {
      load: vi.fn(),
      snapshot: () => ({
        revision: { preferences: 0, project: 0 },
        preferences: null,
        workbench: null,
        drafts: [],
        reviewLedgers: [],
      }),
      mutate: vi.fn(async () => false),
      flush: vi.fn(async () => {}),
      onProblem: () => () => {},
    };

    const notices = await migrateLegacyDurableState(durable, localStorage);

    expect(localStorage.getItem("zd.themeSelection.v1")).not.toBeNull();
    expect(localStorage.getItem(draftKey)).not.toBeNull();
    expect(localStorage.getItem("zd.wordWrap")).toBe("false");
    expect(notices.length).toBeLessThanOrEqual(4);
    expect(notices.join(" ")).not.toContain("private");
  });

  it("maps the old one-project counter scope to the explicitly launched stable scope", async () => {
    localStorage.setItem(
      draftKey,
      JSON.stringify({
        schemaVersion: 1,
        projectId: "project-0000000000000001",
        worktreeId: "worktree-0000000000000002",
        relativePath: "notes.md",
        text: "legacy scope",
        updatedAt: 1,
      }),
    );
    const mutate = vi.fn(async () => true);
    const durable = {
      load: vi.fn(),
      snapshot: () => ({
        revision: { preferences: 0, project: 0 },
        preferences: null,
        workbench: null,
        drafts: [],
        reviewLedgers: [],
      }),
      mutate,
      flush: vi.fn(async () => {}),
      onProblem: () => () => {},
    };

    await migrateLegacyDurableState(durable, localStorage, { projectId, worktreeId });

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "put-draft",
        draft: expect.objectContaining({ projectId, worktreeId }),
      }),
    );
    expect(localStorage.getItem(draftKey)).toBeNull();
  });
});
