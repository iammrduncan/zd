import type { ThreadsController } from "./controller";
import type { ThreadWorktreeContext } from "./types";
import { performThreadAction } from "./view-actions";

export interface ProjectThreadsOptions {
  readonly projectName?: string;
  readonly workspaces?: readonly ThreadWorktreeContext[];
  /** Project-owned heading slot supplied by the Projects region. */
  readonly actionHost?: HTMLElement;
}

function automaticThreadName(controller: ThreadsController, projectId: string): string {
  const names = new Set(
    controller
      .snapshot()
      .threads.filter((thread) => thread.projectId === projectId)
      .map((thread) => thread.name.trim().toLocaleLowerCase()),
  );
  if (!names.has("terminal")) return "Terminal";

  for (let suffix = 2; suffix <= names.size + 2; suffix += 1) {
    const candidate = `Terminal ${suffix}`;
    if (!names.has(candidate.toLocaleLowerCase())) return candidate;
  }
  return `Terminal ${names.size + 2}`;
}

/** A project-header action that starts the ordinary terminal path immediately. */
export function createThreadAction(
  controller: ThreadsController,
  projectId: string,
  status: HTMLElement,
  options: ProjectThreadsOptions,
): HTMLButtonElement | null {
  if (!options.workspaces) return null;
  const available = options.workspaces.filter(({ availability }) => availability === "available");
  const target = available.find(({ kind }) => kind === "project-root") ?? available[0] ?? null;
  if (!target) return null;

  const action = document.createElement("button");
  action.type = "button";
  action.className = "zd-thread-create-action";
  action.dataset.threadCreateToggle = projectId;
  action.setAttribute("aria-label", `New terminal in ${options.projectName ?? projectId}`);
  action.title = `New terminal in ${options.projectName ?? projectId}`;
  action.textContent = "+";
  action.addEventListener("click", () => {
    if (action.disabled) return;
    action.disabled = true;
    void performThreadAction(status, () =>
      controller.createThread({
        name: automaticThreadName(controller, projectId),
        type: { kind: "terminal", agent: "shell" },
        workspace: {
          kind: target.kind === "project-root" ? "project-root" : "existing-worktree",
          projectId,
          worktreeId: target.id,
        },
      }),
    ).finally(() => {
      action.disabled = false;
    });
  });
  return action;
}
