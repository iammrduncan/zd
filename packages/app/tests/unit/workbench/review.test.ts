import { describe, expect, it, vi } from "vitest";

import type { Platform, WorkspaceFile } from "@/platform";
import { mountReview } from "@/workbench/review";

const file: WorkspaceFile = {
  resource: {
    projectId: "project-a",
    worktreeId: "worktree-a",
    relativePath: "docs/plan.md",
  },
  relative: "docs/plan.md",
};

describe("Markdown review comments", () => {
  it("collects selected-text comments in the worktree feedback file", async () => {
    const writeTextFile = vi.fn(async () => {});
    const host = document.createElement("div");
    document.body.append(host);
    const review = mountReview(host, { writeTextFile } as unknown as Platform);
    const reviewed = review.document(file);
    const renderTags = vi.fn();
    reviewed.connect(renderTags);

    reviewed.selection({
      from: 2,
      to: 18,
      startLine: 4,
      endLine: 5,
      text: "Ship this slice.",
      rect: { left: 120, bottom: 240 },
    });
    const composer = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
    const textbox = composer.querySelector<HTMLTextAreaElement>("textarea")!;
    textbox.value = "Name the owner.";
    composer.requestSubmit();

    await vi.waitFor(() =>
      expect(writeTextFile).toHaveBeenCalledWith(
        {
          projectId: "project-a",
          worktreeId: "worktree-a",
          relativePath: "zd-feedback.txt",
        },
        "[docs/plan.md][LN4:LN5] [Ship this slice.] Name the owner.\n",
      ),
    );
    expect(renderTags).toHaveBeenLastCalledWith([
      expect.objectContaining({ line: 4, text: "Name the owner." }),
    ]);

    review.unmount();
    host.remove();
  });
});
