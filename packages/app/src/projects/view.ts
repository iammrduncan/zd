import "./projects.css";

import type { TransitionRecovery } from "@/workbench/state";
import { orderedProjects } from "./model";
import type { ProjectsController } from "./controller";
import type { ProjectActionResult, ProjectListItem, ProjectWorkbenchSnapshot } from "./types";

export type ProjectChildUnmount = () => void;

export interface ProjectListOptions {
  readonly renderChildren?: (
    project: ProjectListItem,
    host: HTMLElement,
  ) => void | ProjectChildUnmount;
}

function projectLabel(project: ProjectListItem): string {
  const state = project.recovery?.summary ?? "Available.";
  return `${project.name}. ${project.root}. ${state}`;
}

/** Mount compact project headings; the Threads feature supplies their nested rows. */
export function mountProjectList(
  host: HTMLElement,
  controller: ProjectsController,
  options: ProjectListOptions = {},
): ProjectChildUnmount {
  const root = document.createElement("div");
  root.className = "zd-projects";

  const list = document.createElement("div");
  list.className = "zd-project-list";
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", "Projects");

  const status = document.createElement("p");
  status.className = "zd-project-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  root.append(list, status);
  host.append(root);

  let active = true;
  let draggedProjectId: string | null = null;
  let childCleanups: ProjectChildUnmount[] = [];

  const clearStatus = () => {
    status.replaceChildren();
    status.hidden = true;
  };

  const showProblem = (reason: string, recovery?: TransitionRecovery) => {
    status.replaceChildren(document.createTextNode(reason));
    status.hidden = false;
    if (!recovery) return;

    const action = document.createElement("button");
    action.type = "button";
    action.className = "zd-project-text-action";
    action.textContent = recovery.label;
    action.addEventListener("click", () => {
      void Promise.resolve(recovery.run()).catch((cause: unknown) => {
        showProblem(cause instanceof Error ? cause.message : String(cause));
      });
    });
    status.append(" ", action);
  };

  const perform = async (operation: () => Promise<ProjectActionResult | null>) => {
    try {
      const result = await operation();
      if (!active || result === null) return;
      if (result.status === "committed") clearStatus();
      else showProblem(result.reason, result.recovery);
    } catch (cause) {
      if (active) showProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const render = (snapshot: ProjectWorkbenchSnapshot) => {
    for (const cleanup of childCleanups) cleanup();
    childCleanups = [];
    list.replaceChildren();

    const projects = orderedProjects(snapshot.projects);
    if (projects.length === 0) {
      const empty = document.createElement("p");
      empty.className = "zd-project-empty";
      empty.textContent = "No projects open.";
      list.append(empty);
      return;
    }

    projects.forEach((project, projectIndex) => {
      const group = document.createElement("section");
      group.className = "zd-project-group";
      group.dataset.projectId = project.id;
      group.setAttribute("role", "listitem");

      const row = document.createElement("button");
      row.type = "button";
      row.className = "zd-project-row";
      row.id = `zd-project-row-${projectIndex}`;
      row.draggable = true;
      row.setAttribute("aria-expanded", "true");
      row.setAttribute("aria-label", projectLabel(project));
      row.title = project.root;
      if (snapshot.active?.projectId === project.id) row.setAttribute("aria-current", "true");
      group.setAttribute("aria-labelledby", row.id);

      const disclosure = document.createElement("span");
      disclosure.className = "zd-project-disclosure";
      disclosure.setAttribute("aria-hidden", "true");
      disclosure.textContent = "▾";

      const name = document.createElement("span");
      name.className = "zd-project-name";
      name.textContent = project.name;
      row.append(disclosure, name);

      row.addEventListener("click", (event) => {
        event.preventDefault();
        void perform(() => controller.activateProject(project.id));
      });
      row.addEventListener("dragstart", (event) => {
        draggedProjectId = project.id;
        event.dataTransfer?.setData("text/zd-project-id", project.id);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        draggedProjectId = null;
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const movedId = draggedProjectId ?? event.dataTransfer?.getData("text/zd-project-id");
        draggedProjectId = null;
        if (!movedId) return;

        const bounds = row.getBoundingClientRect();
        const insertAfter = event.clientY >= bounds.top + bounds.height / 2;
        const insertionIndex = projectIndex + (insertAfter ? 1 : 0);
        void perform(() => controller.moveProject(movedId, insertionIndex));
      });
      group.append(row);

      if (project.recovery) {
        const recovery = document.createElement("p");
        recovery.className = "zd-project-recovery";
        recovery.dataset.recoveryKind = project.recovery.kind;
        recovery.id = `zd-project-recovery-${projectIndex}`;
        row.setAttribute("aria-describedby", recovery.id);

        const summary = document.createElement("span");
        summary.textContent = project.recovery.summary;
        const action = document.createElement("button");
        action.type = "button";
        action.className = "zd-project-text-action";
        action.dataset.projectRecovery = project.id;
        action.textContent = project.recovery.actionLabel;
        action.addEventListener("click", () => {
          void perform(() => controller.recoverProject(project.id));
        });
        recovery.append(summary, " ", action);
        group.append(recovery);
      }

      const children = document.createElement("div");
      children.className = "zd-project-children";
      children.setAttribute("role", "group");
      children.setAttribute("aria-label", `${project.name} threads`);
      group.append(children);
      const cleanup = options.renderChildren?.(project, children);
      if (cleanup) childCleanups.push(cleanup);

      list.append(group);
    });
  };

  render(controller.snapshot());
  const unsubscribe = controller.subscribe(render);

  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    for (const cleanup of childCleanups) cleanup();
    childCleanups = [];
    root.remove();
  };
}
