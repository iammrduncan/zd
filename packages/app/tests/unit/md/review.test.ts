import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Platform, WorkspaceFile } from "@/platform";
import { formatFeedback, mountReview, type ReviewSelection } from "@/miniapps/md/review";
import type { FileResource, ProjectGrant } from "@/workbench/resources";

const project: ProjectGrant = {
  id: "project-w",
  name: "workspace",
  root: "/workspace",
  availability: "available",
  worktrees: [
    {
      id: "worktree-w",
      name: "workspace",
      root: "/workspace",
      availability: "available",
    },
  ],
};
const rootResource = { projectId: project.id, worktreeId: project.worktrees[0]!.id };
const feedbackResource: FileResource = { ...rootResource, relativePath: "zd-feedback.txt" };
const file: WorkspaceFile = {
  resource: { ...rootResource, relativePath: "notes/plan.md" },
  relative: "notes/plan.md",
};

const selection: ReviewSelection = {
  from: 12,
  to: 35,
  startLine: 2,
  endLine: 3,
  text: "First step\n  and the next",
  rect: { left: 80, bottom: 120 },
};

function platform(writeTextFile: Platform["writeTextFile"] = async () => {}): Platform {
  return {
    kind: "browser",
    launchRequest: async () => ({
      project,
      worktreeId: project.worktrees[0]!.id,
      relativePath: null,
      problem: null,
    }),
    onOpenRequested: () => () => {},
    pendingOpenRequest: async () => null,
    acceptOpenRequest: async () => null,
    projectGrants: async () => [project],
    chooseProject: async () => null,
    recoverProjectGrant: async () => null,
    removeProjectGrant: async () => project,
    themeConfigFiles: async () => [],
    registerGlobalSummon: async () => ({
      supported: false,
      registered: false,
      shortcut: "CmdOrCtrl+Shift+Space",
      problem: null,
    }),
    onWindowPresentationChanged: () => () => {},
    toggleQuickAccess: async () => "ordinary",
    hideQuickAccess: async () => "ordinary",
    workspaceFiles: async () => {
      throw new Error("no listing");
    },
    readTextFile: async () => "",
    writeTextFile,
    fileStamp: async () => null,
    onCloseRequested: () => () => {},
    closeWindow: async () => {},
    openExternal: async () => {},
  };
}

describe("review feedback", () => {
  beforeEach(() => localStorage.clear());

  it("normalizes each selection into the requested one-line format", () => {
    expect(
      formatFeedback([
        {
          id: "one",
          path: "project-w\0worktree-w\0notes/plan.md",
          relative: file.relative,
          startLine: 2,
          endLine: 3,
          selected: "First step\n  and the next",
          comment: "Explain why",
        },
      ]),
    ).toBe("[notes/plan.md][LN2:LN3] [First step and the next] Explain why");
  });

  it("accepts multiline comments and keeps the feedback handoff on one line", async () => {
    const host = document.createElement("div");
    const writeTextFile = vi.fn(async () => {});
    const review = mountReview({
      host,
      root: "/workspace",
      rootResource,
      platform: platform(writeTextFile),
    });
    const document_ = review.document(file);
    document_.connect(() => {});

    document_.selection(selection);
    const composer = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
    const textbox = composer.querySelector<HTMLTextAreaElement>("textarea");
    expect(textbox).not.toBeNull();
    if (!textbox) throw new Error("comment textbox was not rendered");
    textbox.value = "Explain why\nand name the owner";
    composer.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(writeTextFile).toHaveBeenCalledWith(
        feedbackResource,
        "[notes/plan.md][LN2:LN3] [First step and the next] Explain why and name the owner\n",
      ),
    );
    review.unmount();
  });

  it("turns a selection into a durable line tag and feedback file", async () => {
    const host = document.createElement("div");
    const sidebar = document.createElement("aside");
    document.body.append(host, sidebar);
    const writeTextFile = vi.fn(async () => {});
    const review = mountReview({
      host,
      launcherHost: sidebar,
      root: "/workspace",
      rootResource,
      platform: platform(writeTextFile),
    });
    const document_ = review.document(file);
    let tags: Array<{ line: number; text: string }> = [];
    const disconnect = document_.connect((next) => {
      tags = next.map(({ line, text }) => ({ line, text }));
    });

    document_.selection(selection);
    const composer = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
    const textbox = composer.querySelector<HTMLTextAreaElement>("textarea")!;
    textbox.value = "Explain why";
    composer.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));

    await vi.waitFor(() =>
      expect(writeTextFile).toHaveBeenCalledWith(
        feedbackResource,
        "[notes/plan.md][LN2:LN3] [First step and the next] Explain why\n",
      ),
    );
    expect(tags).toEqual([{ line: 2, text: "Explain why" }]);
    expect(sidebar.querySelector(".md-feedback-launcher")?.textContent).toBe("Feedback 1");

    sidebar.querySelector<HTMLButtonElement>(".md-feedback-launcher")!.click();
    expect(host.querySelector(".md-feedback-output")?.textContent).toBe(
      "[notes/plan.md][LN2:LN3] [First step and the next] Explain why",
    );

    disconnect();
    review.unmount();
  });

  it("deletes a comment from the feedback view and regenerates the feedback file", async () => {
    const host = document.createElement("div");
    const sidebar = document.createElement("aside");
    const writeTextFile = vi.fn(async () => {});
    const review = mountReview({
      host,
      launcherHost: sidebar,
      root: "/workspace",
      rootResource,
      platform: platform(writeTextFile),
    });
    const document_ = review.document(file);
    let tags: Array<{ line: number; text: string }> = [];
    document_.connect((next) => {
      tags = next.map(({ line, text }) => ({ line, text }));
    });
    document_.selection(selection);
    const form = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
    form.querySelector<HTMLTextAreaElement>("textarea")!.value = "Remove this";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(tags).toHaveLength(1));

    review.open();
    const deleteButton = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete comment: Remove this"]',
    );
    expect(deleteButton).not.toBeNull();
    deleteButton?.click();

    await vi.waitFor(() => expect(tags).toEqual([]));
    expect(sidebar.querySelector(".md-feedback-launcher")?.textContent).toBe("Feedback 0");
    expect(host.querySelector(".md-feedback-output")?.textContent).toBe("");
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenLastCalledWith(feedbackResource, ""));
    review.unmount();

    const reopened = mountReview({
      host,
      root: "/workspace",
      rootResource,
      platform: platform(),
    });
    let reopenedTags = 1;
    reopened.document(file).connect((next) => {
      reopenedTags = next.length;
    });
    expect(reopenedTags).toBe(0);
    reopened.unmount();
  });

  it("restores comments and their tags when the workspace opens again", () => {
    const firstHost = document.createElement("div");
    const first = mountReview({
      host: firstHost,
      root: "/workspace",
      rootResource,
      platform: platform(),
    });
    const firstDocument = first.document(file);
    firstDocument.connect(() => {});
    firstDocument.selection(selection);
    const form = firstHost.querySelector<HTMLFormElement>(".md-comment-composer")!;
    form.querySelector<HTMLTextAreaElement>("textarea")!.value = "Keep this";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    first.unmount();

    const reopenedHost = document.createElement("div");
    const reopened = mountReview({
      host: reopenedHost,
      root: "/workspace",
      rootResource,
      platform: platform(),
    });
    let tags: Array<{ line: number; text: string }> = [];
    reopened.document(file).connect((next) => {
      tags = next.map(({ line, text }) => ({ line, text }));
    });

    expect(tags).toEqual([{ line: 2, text: "Keep this" }]);
    reopened.open();
    expect(reopenedHost.querySelector(".md-feedback-output")?.textContent).toContain("Keep this");
    reopened.unmount();
  });

  it("serializes feedback writes so an older file cannot land after a newer one", async () => {
    let releaseFirst!: () => void;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const writeTextFile = vi
      .fn<Platform["writeTextFile"]>()
      .mockImplementationOnce(() => firstWrite)
      .mockResolvedValue();
    const host = document.createElement("div");
    const review = mountReview({
      host,
      root: "/workspace",
      rootResource,
      platform: platform(writeTextFile),
    });
    const document_ = review.document(file);
    document_.connect(() => {});

    const submit = (comment: string) => {
      document_.selection(selection);
      const form = host.querySelector<HTMLFormElement>(".md-comment-composer")!;
      form.querySelector<HTMLTextAreaElement>("textarea")!.value = comment;
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    };

    submit("First comment");
    submit("Second comment");
    await Promise.resolve();
    expect(writeTextFile).toHaveBeenCalledTimes(1);

    releaseFirst();
    await vi.waitFor(() => expect(writeTextFile).toHaveBeenCalledTimes(2));
    expect(writeTextFile.mock.calls[1]![1]).toContain("First comment");
    expect(writeTextFile.mock.calls[1]![1]).toContain("Second comment");
    review.unmount();
  });
});
