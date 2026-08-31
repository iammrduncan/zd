import { describe, expect, it, vi } from "vitest";

import {
  createDurableStateAdapter,
  type DurableStateMutation,
  type DurableStateTransport,
} from "@/platform/durable-state";

function transport(apply: DurableStateTransport["apply"]): DurableStateTransport {
  return {
    describe: vi.fn(async () => ({
      revision: { preferences: 0, project: 0 },
      preferences: null,
      workbench: null,
      drafts: [],
      reviewLedgers: [],
    })),
    apply,
  };
}

describe("durable state adapter", () => {
  it("keeps synchronous state current while coalescing closed mutations", async () => {
    let revision = { preferences: 0, project: 0 };
    const apply = vi.fn(async (request: { mutation: DurableStateMutation }) => {
      if (request.mutation.kind === "replace-preferences") revision.preferences += 1;
      else revision.project += 1;
      return { status: "applied" as const, revision: { ...revision } };
    });
    const adapter = createDurableStateAdapter(transport(apply));
    await adapter.load();

    const firstPreference = adapter.mutate({
      kind: "replace-preferences",
      record: { schemaVersion: 1, theme: "current-light" },
    });
    const latestPreference = adapter.mutate({
      kind: "replace-preferences",
      record: { schemaVersion: 1, theme: "current-dark" },
    });
    const draft = {
      schemaVersion: 1 as const,
      projectId: "project-00000000000000000000000000000001",
      worktreeId: "worktree-00000000000000000000000000000002",
      relativePath: "notes.md",
      text: "first",
      updatedAt: 1,
    };
    void adapter.mutate({ kind: "put-draft", draft });
    void adapter.mutate({ kind: "put-draft", draft: { ...draft, text: "latest" } });

    expect(adapter.snapshot().preferences).toEqual({
      schemaVersion: 1,
      theme: "current-dark",
    });
    expect(adapter.snapshot().drafts[0]?.text).toBe("latest");

    await adapter.flush();

    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0]?.[0]).toMatchObject({
      expectedRevision: { preferences: 0, project: 0 },
      mutation: { kind: "replace-preferences", record: { theme: "current-dark" } },
    });
    expect(apply.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: { preferences: 1, project: 0 },
      mutation: { kind: "put-draft", draft: { text: "latest" } },
    });
    await expect(firstPreference).resolves.toBe(true);
    await expect(latestPreference).resolves.toBe(true);
  });

  it("reports a revision conflict without replacing live in-memory state", async () => {
    const apply = vi
      .fn<DurableStateTransport["apply"]>()
      .mockResolvedValueOnce({
        status: "reload-required",
        currentRevision: { preferences: 4, project: 7 },
      })
      .mockResolvedValueOnce({
        status: "applied",
        revision: { preferences: 5, project: 7 },
      });
    const adapter = createDurableStateAdapter(transport(apply));
    const notices: string[] = [];
    adapter.onProblem((notice) => notices.push(notice));
    await adapter.load();

    const conflicted = adapter.mutate({
      kind: "replace-preferences",
      record: { schemaVersion: 1, private: "keep only in memory" },
    });
    await adapter.flush();

    expect(await conflicted).toBe(false);
    expect(adapter.snapshot().preferences).toEqual({
      schemaVersion: 1,
      private: "keep only in memory",
    });
    expect(notices).toEqual([
      "Changes remain active in this session but could not be stored because durable state changed elsewhere.",
    ]);
    expect(notices.join(" ")).not.toContain("keep only in memory");

    void adapter.mutate({
      kind: "replace-preferences",
      record: { schemaVersion: 1, private: "next" },
    });
    await adapter.flush();
    expect(apply.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: { preferences: 4, project: 7 },
    });
  });
});
