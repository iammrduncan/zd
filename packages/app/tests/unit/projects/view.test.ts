import { describe, expect, it, vi } from "vitest";

import { ProjectsController } from "@/projects/controller";
import type {
  ProjectActionResult,
  ProjectWorkbenchAdapter,
  ProjectWorkbenchSnapshot,
} from "@/projects/types";
import { mountProjectList } from "@/projects/view";
import type { ProjectGrant } from "@/workbench/resources";

function snapshot(): ProjectWorkbenchSnapshot {
  return {
    projects: [
      {
        id: "alpha",
        name: "Alpha",
        root: "/work/alpha",
        order: 0,
        availability: "available",
        worktrees: [
          {
            id: "alpha-root",
            name: "main",
            root: "/work/alpha",
            availability: "available",
          },
        ],
        recovery: null,
      },
      {
        id: "beta",
        name: "Beta",
        root: "/work/beta-old",
        order: 1,
        availability: "missing",
        worktrees: [
          {
            id: "beta-root",
            name: "main",
            root: "/work/beta-old",
            availability: "missing",
          },
        ],
        recovery: {
          kind: "moved",
          summary: "Folder moved since it was approved.",
          actionLabel: "Locate folder",
        },
      },
    ],
    active: {
      projectId: "alpha",
      projectRoot: "/work/alpha",
      worktreeId: "alpha-root",
      worktreeRoot: "/work/alpha",
      threadId: "thread-alpha",
      fileId: "file-alpha",
    },
  };
}

function adapter(initial = snapshot(), choice: ProjectGrant | null = null) {
  let current = initial;
  const listeners = new Set<(next: ProjectWorkbenchSnapshot) => void>();
  const committed: ProjectActionResult = { status: "committed" };
  const workbench: ProjectWorkbenchAdapter & {
    chooseProject: ReturnType<typeof vi.fn>;
    acceptChosenProject: ReturnType<typeof vi.fn>;
    activateProject: ReturnType<typeof vi.fn>;
    reorderProjects: ReturnType<typeof vi.fn>;
    removeProject: ReturnType<typeof vi.fn>;
    recoverProject: ReturnType<typeof vi.fn>;
    publish(next: ProjectWorkbenchSnapshot): void;
  } = {
    snapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    chooseProject: vi.fn(async () => choice),
    acceptChosenProject: vi.fn(async () => committed),
    activateProject: vi.fn(async () => committed),
    reorderProjects: vi.fn(async () => committed),
    removeProject: vi.fn(async () => committed),
    recoverProject: vi.fn(async () => committed),
    publish: (next) => {
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

describe("the Projects list", () => {
  it("opens the native project chooser and exposes removal without mutating early", async () => {
    const gamma: ProjectGrant = {
      id: "gamma",
      name: "Gamma",
      root: "/work/gamma",
      availability: "available",
      worktrees: [
        {
          id: "gamma-root",
          name: "main",
          root: "/work/gamma",
          availability: "available",
        },
      ],
    };
    const workbench = adapter(snapshot(), gamma);
    const host = document.createElement("div");
    mountProjectList(host, new ProjectsController(workbench));

    host.querySelector<HTMLButtonElement>("[data-project-add]")!.click();
    host.querySelector<HTMLButtonElement>('[data-project-remove="beta"]')!.click();
    await settle();

    expect(workbench.chooseProject).toHaveBeenCalledOnce();
    expect(workbench.acceptChosenProject).toHaveBeenCalledExactlyOnceWith(gamma);
    expect(workbench.removeProject).toHaveBeenCalledExactlyOnceWith("beta");
    expect(host.querySelector('[data-project-id="beta"]')).not.toBeNull();
    expect(host.querySelector('[data-project-id="gamma"]')).toBeNull();
  });

  it("renders ordered project headings with thread content nested under each owner", () => {
    const workbench = adapter();
    const host = document.createElement("div");

    mountProjectList(host, new ProjectsController(workbench), {
      renderChildren: (project, childHost, actionHost) => {
        childHost.textContent = project.id === "alpha" ? "codex · waiting" : "shell · idle";
        const action = document.createElement("button");
        action.dataset.projectThreadAction = project.id;
        actionHost.append(action);
      },
    });

    const groups = [...host.querySelectorAll<HTMLElement>("[data-project-id]")];
    expect(groups.map(({ dataset }) => dataset.projectId)).toEqual(["alpha", "beta"]);
    expect(groups[0]!.querySelector(".zd-project-children")?.textContent).toBe("codex · waiting");
    expect(groups[1]!.querySelector(".zd-project-children")?.textContent).toBe("shell · idle");
    expect(
      groups[0]!.querySelector(".zd-project-heading [data-project-thread-action='alpha']"),
    ).not.toBeNull();
  });

  it("exposes active, root, and unavailable state without relying on colour", () => {
    const host = document.createElement("div");
    mountProjectList(host, new ProjectsController(adapter()));

    const alpha = host.querySelector<HTMLButtonElement>('[data-project-id="alpha"] button')!;
    const beta = host.querySelector<HTMLButtonElement>('[data-project-id="beta"] button')!;

    expect(alpha.getAttribute("aria-current")).toBe("true");
    expect(alpha.getAttribute("aria-label")).toContain("/work/alpha");
    expect(beta.getAttribute("aria-label")).toContain("Folder moved since it was approved.");
    expect(host.querySelector('[data-recovery-kind="moved"]')?.textContent).toContain(
      "Folder moved since it was approved.",
    );
  });

  it("routes ordinary and modified clicks through one activation method", async () => {
    const workbench = adapter();
    const host = document.createElement("div");
    mountProjectList(host, new ProjectsController(workbench));
    const beta = host.querySelector<HTMLButtonElement>('[data-project-id="beta"] button')!;

    beta.click();
    beta.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
        ctrlKey: true,
        shiftKey: true,
        altKey: true,
      }),
    );
    await settle();

    expect(workbench.activateProject).toHaveBeenNthCalledWith(1, "beta");
    expect(workbench.activateProject).toHaveBeenNthCalledWith(2, "beta");
  });

  it("keeps a refused project visible and names the work blocking activation", async () => {
    const workbench = adapter();
    workbench.activateProject.mockResolvedValue({
      status: "refused",
      reason: "README.md has unsaved work",
      recovery: { label: "Save README.md", run: vi.fn() },
    });
    const host = document.createElement("div");
    mountProjectList(host, new ProjectsController(workbench));

    host.querySelector<HTMLButtonElement>('[data-project-id="beta"] button')!.click();
    await settle();

    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "README.md has unsaved work",
    );
    expect(host.querySelector('[data-project-id="beta"]')).not.toBeNull();
    expect(host.querySelector<HTMLButtonElement>('[role="status"] button')?.textContent).toBe(
      "Save README.md",
    );
  });

  it("invokes a specific recovery action without making the unavailable row disappear early", async () => {
    const workbench = adapter();
    const host = document.createElement("div");
    mountProjectList(host, new ProjectsController(workbench));

    host.querySelector<HTMLButtonElement>('[data-recovery-kind="moved"] button')!.click();
    await settle();

    expect(workbench.recoverProject).toHaveBeenCalledExactlyOnceWith("beta");
    expect(host.querySelector('[data-project-id="beta"]')).not.toBeNull();
  });

  it("re-renders only after the adapter publishes and unsubscribes on unmount", () => {
    const workbench = adapter();
    const childCleanup = vi.fn();
    const host = document.createElement("div");
    const unmount = mountProjectList(host, new ProjectsController(workbench), {
      renderChildren: (_project, childHost) => {
        childHost.textContent = "thread";
        return childCleanup;
      },
    });

    workbench.publish({ ...snapshot(), projects: [snapshot().projects[1]!] });
    expect(host.querySelectorAll("[data-project-id]")).toHaveLength(1);
    expect(childCleanup).toHaveBeenCalledTimes(2);

    unmount();
    workbench.publish(snapshot());
    expect(childCleanup).toHaveBeenCalledTimes(3);
    expect(host.children).toHaveLength(0);
  });
});
