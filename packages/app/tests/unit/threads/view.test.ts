import { describe, expect, it, vi } from "vitest";

import {
  ThreadsController,
  mountProjectThreads,
  mountThreadsRegion,
  type ThreadActionResult,
  type ThreadRecord,
  type ThreadWorkbenchAdapter,
  type ThreadWorkbenchSnapshot,
} from "@/threads";

const committed: ThreadActionResult = { status: "committed" };

function thread(
  id: string,
  projectId: string,
  overrides: Partial<ThreadRecord> = {},
): ThreadRecord {
  return {
    id,
    projectId,
    worktree: {
      id: `${projectId}-root`,
      label: "project root",
      kind: "project-root",
      availability: "available",
    },
    name: id,
    order: 0,
    type: { kind: "terminal", agent: "shell" },
    lifecycle: "idle",
    lifecycleSource: "process",
    lifecycleRevision: 0,
    attention: { unread: false, version: 0 },
    backing: { kind: "terminal", referenceId: `session-${id}`, availability: "ready" },
    recovery: null,
    ...overrides,
  };
}

function initialSnapshot(): ThreadWorkbenchSnapshot {
  return {
    projects: [
      { id: "alpha", name: "Alpha", order: 0, availability: "available" },
      { id: "beta", name: "Beta", order: 1, availability: "missing" },
    ],
    threads: [
      thread("review", "alpha", {
        name: "Review changes",
        type: { kind: "terminal", agent: "codex" },
        lifecycle: "waiting",
        lifecycleSource: "supported-agent",
        attention: { unread: true, version: 2 },
        worktree: {
          id: "alpha-review",
          label: "feature/review",
          kind: "worktree",
          availability: "available",
        },
      }),
      thread("shell", "alpha", { name: "Shell", order: 1 }),
      thread("missing", "beta", {
        name: "Old task",
        lifecycle: "unknown",
        recovery: {
          kind: "missing-worktree",
          summary: "Worktree is missing.",
          actionLabel: "Locate worktree",
        },
      }),
    ],
    activeThreadId: "review",
    visibility: "full",
  };
}

function adapter(initial = initialSnapshot()) {
  let current = initial;
  const listeners = new Set<(next: ThreadWorkbenchSnapshot) => void>();
  const workbench: ThreadWorkbenchAdapter & {
    createThread: ReturnType<typeof vi.fn>;
    renameThread: ReturnType<typeof vi.fn>;
    activateThread: ReturnType<typeof vi.fn>;
    closeThread: ReturnType<typeof vi.fn>;
    removeThread: ReturnType<typeof vi.fn>;
    recoverThread: ReturnType<typeof vi.fn>;
    reorderThreads: ReturnType<typeof vi.fn>;
    publish(next: ThreadWorkbenchSnapshot): void;
  } = {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    createThread: vi.fn(async () => committed),
    renameThread: vi.fn(async () => committed),
    reorderThreads: vi.fn(async () => committed),
    activateThread: vi.fn(async () => committed),
    closeThread: vi.fn(async () => committed),
    removeThread: vi.fn(async () => committed),
    recoverThread: vi.fn(async () => committed),
    setThreadsVisibility: vi.fn(async () => committed),
    acknowledgeAttention: vi.fn(async () => committed),
    publish(next) {
      current = next;
      listeners.forEach((listener) => listener(current));
    },
  };
  return workbench;
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("the Threads region", () => {
  it("renders compact project groups and exposes every state without relying on colour", () => {
    const host = document.createElement("aside");
    mountThreadsRegion(host, new ThreadsController(adapter()));

    expect(
      [...host.querySelectorAll<HTMLElement>("[data-thread-project]")].map(
        ({ dataset }) => dataset.threadProject,
      ),
    ).toEqual(["alpha", "beta"]);
    const waiting = host.querySelector<HTMLElement>('[data-thread-id="review"]')!;
    expect(waiting.textContent).toContain("Review changes");
    expect(waiting.textContent).toContain("codex");
    expect(waiting.textContent).toContain("waiting");
    expect(waiting.textContent).toContain("feature/review");
    expect(waiting.getAttribute("aria-label")).toContain("attention required");
    expect(waiting.getAttribute("aria-current")).toBe("true");
    expect(host.querySelector('[data-thread-recovery="missing"]')?.textContent).toContain(
      "Worktree is missing.",
    );
  });

  it("keeps selection and accessible labels in collapsed mode and removes hidden mode from layout", () => {
    const workbench = adapter();
    const host = document.createElement("aside");
    document.body.append(host);
    mountThreadsRegion(host, new ThreadsController(workbench));

    workbench.publish({ ...initialSnapshot(), visibility: "collapsed" });
    const root = host.querySelector<HTMLElement>("[data-thread-region-mode]")!;
    const selected = host.querySelector<HTMLElement>('[data-thread-id="review"]')!;
    expect(root.dataset.threadRegionMode).toBe("collapsed");
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(selected.getAttribute("aria-label")).toContain("Review changes");

    selected.focus();
    expect(document.activeElement).toBe(selected);
    workbench.publish({ ...initialSnapshot(), visibility: "hidden" });
    expect(root.hidden).toBe(true);
    expect(root.getAttribute("aria-hidden")).toBe("true");
    expect(document.activeElement).not.toBe(selected);

    workbench.publish(initialSnapshot());
    expect(root.hidden).toBe(false);
    expect(host.querySelector('[data-thread-id="review"]')?.getAttribute("aria-current")).toBe(
      "true",
    );
  });

  it("uses one activation method for pointer and keyboard intent", async () => {
    const workbench = adapter();
    const host = document.createElement("aside");
    document.body.append(host);
    mountThreadsRegion(host, new ThreadsController(workbench));
    const review = host.querySelector<HTMLButtonElement>('[data-thread-id="review"]')!;
    const shell = host.querySelector<HTMLButtonElement>('[data-thread-id="shell"]')!;

    shell.click();
    review.focus();
    review.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(document.activeElement).toBe(shell);
    shell.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();

    expect(workbench.activateThread).toHaveBeenNthCalledWith(1, "shell");
    expect(workbench.activateThread).toHaveBeenNthCalledWith(2, "shell");
  });

  it("keeps recoverable rows in place until the adapter publishes", async () => {
    const workbench = adapter();
    const host = document.createElement("aside");
    mountThreadsRegion(host, new ThreadsController(workbench));

    host.querySelector<HTMLButtonElement>('[data-thread-recovery="missing"] button')!.click();
    await settle();

    expect(workbench.recoverThread).toHaveBeenCalledExactlyOnceWith("missing");
    expect(host.querySelector('[data-thread-id="missing"]')).not.toBeNull();
  });

  it("mounts only one project's rows beneath an existing project owner", () => {
    const workbench = adapter();
    const host = document.createElement("div");
    const unmount = mountProjectThreads(host, new ThreadsController(workbench), "alpha");

    expect([...host.querySelectorAll("[data-thread-id]")]).toHaveLength(2);
    expect(host.querySelector('[data-thread-id="missing"]')).toBeNull();

    unmount();
    expect(host.children).toHaveLength(0);
  });

  it("creates, renames, closes, and removes threads through explicit compact controls", async () => {
    const workbench = adapter();
    const host = document.createElement("div");
    mountProjectThreads(host, new ThreadsController(workbench), "alpha", {
      projectName: "Alpha",
      workspaces: [
        {
          id: "alpha-root",
          label: "project root",
          kind: "project-root",
          availability: "available",
        },
        {
          id: "alpha-review",
          label: "feature/review",
          kind: "worktree",
          availability: "available",
        },
      ],
    });

    host.querySelector<HTMLButtonElement>("[data-thread-create-toggle]")!.click();
    const create = host.querySelector<HTMLFormElement>("[data-thread-create]")!;
    const name = create.querySelector<HTMLInputElement>('[name="thread-name"]')!;
    const agent = create.querySelector<HTMLSelectElement>('[name="thread-agent"]')!;
    const workspace = create.querySelector<HTMLSelectElement>('[name="thread-workspace"]')!;
    name.value = "Implement search";
    agent.value = "codex";
    workspace.value = "new-worktree";
    workspace.dispatchEvent(new Event("change", { bubbles: true }));
    create.querySelector<HTMLInputElement>('[name="worktree-name"]')!.value = "search";
    create.querySelector<HTMLInputElement>('[name="worktree-branch"]')!.value = "feature/search";
    create.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await settle();

    expect(workbench.createThread).toHaveBeenCalledExactlyOnceWith({
      name: "Implement search",
      type: { kind: "terminal", agent: "codex" },
      workspace: {
        kind: "new-worktree",
        projectId: "alpha",
        name: "search",
        branch: "feature/search",
        baseRevision: null,
      },
    });

    host.querySelector<HTMLButtonElement>('[data-thread-rename="review"]')!.click();
    const rename = host.querySelector<HTMLFormElement>('[data-thread-rename-form="review"]')!;
    rename.querySelector<HTMLInputElement>("input")!.value = "Reviewed changes";
    rename.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    host.querySelector<HTMLButtonElement>('[data-thread-close="review"]')!.click();
    host.querySelector<HTMLButtonElement>('[data-thread-remove="shell"]')!.click();
    await settle();

    expect(workbench.renameThread).toHaveBeenCalledExactlyOnceWith("review", "Reviewed changes");
    expect(workbench.closeThread).toHaveBeenCalledExactlyOnceWith("review");
    expect(workbench.removeThread).toHaveBeenCalledExactlyOnceWith("shell");
  });

  it("renders the owning safe action when closing a live thread is refused", async () => {
    const workbench = adapter();
    const terminate = vi.fn(async () => undefined);
    workbench.closeThread.mockResolvedValue({
      status: "refused",
      reason: "Review changes is still running",
      recovery: { label: "Terminate Review changes", run: terminate },
    });
    const host = document.createElement("div");
    mountProjectThreads(host, new ThreadsController(workbench), "alpha");

    host.querySelector<HTMLButtonElement>('[data-thread-close="review"]')!.click();
    await settle();
    const status = host.querySelector<HTMLElement>('[role="status"]')!;
    expect(status.textContent).toContain("Review changes is still running");
    status.querySelector("button")!.click();
    await settle();

    expect(terminate).toHaveBeenCalledOnce();
  });

  it("does not let hidden new-worktree requirements block a project-root thread", async () => {
    const workbench = adapter();
    const host = document.createElement("div");
    mountProjectThreads(host, new ThreadsController(workbench), "alpha", {
      projectName: "Alpha",
      workspaces: [
        {
          id: "alpha-root",
          label: "project root",
          kind: "project-root",
          availability: "available",
        },
      ],
    });
    host.querySelector<HTMLButtonElement>("[data-thread-create-toggle]")!.click();
    const form = host.querySelector<HTMLFormElement>("[data-thread-create]")!;
    form.querySelector<HTMLInputElement>('[name="thread-name"]')!.value = "New shell";
    form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    await settle();

    expect(workbench.createThread).toHaveBeenCalledExactlyOnceWith({
      name: "New shell",
      type: { kind: "terminal", agent: "shell" },
      workspace: {
        kind: "project-root",
        projectId: "alpha",
        worktreeId: "alpha-root",
      },
    });
  });
});
