import "./projects.css";

import type { TransitionRecovery } from "@/workbench/state";
import { orderedProjects } from "./model";
import type { ProjectsController } from "./controller";
import type { ProjectActionResult, ProjectListItem, ProjectWorkbenchSnapshot } from "./types";
import { closeContextMenu, openContextMenu } from "@/workbench/context-menu";
import { projectExpanded, setProjectExpanded } from "@/workbench/preferences";

export type ProjectChildUnmount = () => void;

export interface ProjectListOptions {
  readonly renderFooterActions?: (host: HTMLElement) => void | ProjectChildUnmount;
  readonly renderChildren?: (
    project: ProjectListItem,
    host: HTMLElement,
    actionHost: HTMLElement,
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

  const toolbar = document.createElement("div");
  toolbar.className = "zd-project-toolbar";
  const navigationHeading = document.createElement("h2");
  navigationHeading.className = "zd-project-region-heading";
  navigationHeading.textContent = "PROJECTS";
  const addProject = document.createElement("button");
  addProject.type = "button";
  addProject.className = "zd-project-add";
  addProject.dataset.projectAdd = "true";
  addProject.setAttribute("aria-label", "Open project folder");
  addProject.textContent = "Open";
  const toolbarActions = document.createElement("div");
  toolbarActions.className = "zd-project-toolbar-actions";
  toolbarActions.append(addProject);
  toolbar.append(navigationHeading, toolbarActions);

  const list = document.createElement("div");
  list.className = "zd-project-list";
  list.setAttribute("role", "list");
  list.setAttribute("aria-label", "Projects");

  const status = document.createElement("p");
  status.className = "zd-project-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  const footer = document.createElement("div");
  footer.className = "zd-project-footer";
  root.append(toolbar, list, status, footer);
  host.append(root);
  const stopFooterActions = options.renderFooterActions?.(footer);

  let active = true;
  let draggedProjectId: string | null = null;
  let childCleanups: ProjectChildUnmount[] = [];
  let projectMenu: HTMLElement | null = null;

  const dismissProjectMenu = (restoreFocus = false) => {
    if (projectMenu) closeContextMenu(projectMenu, restoreFocus);
    projectMenu = null;
  };

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
      else if (result.presentation === "owner") clearStatus();
      else showProblem(result.reason, result.recovery);
    } catch (cause) {
      if (active) showProblem(cause instanceof Error ? cause.message : String(cause));
    }
  };
  addProject.addEventListener("click", () => {
    void perform(() => controller.addProject());
  });

  const openProjectMenu = (
    project: ProjectListItem,
    row: HTMLButtonElement,
    inlineStart: number,
    blockStart: number,
  ) => {
    dismissProjectMenu();

    const menu = document.createElement("div");
    menu.className = "zd-project-menu";
    menu.dataset.projectMenu = project.id;
    menu.id = `zd-project-menu-${project.id}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${project.name} project actions`);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "zd-project-menu-action";
    close.setAttribute("role", "menuitem");
    close.setAttribute("aria-label", `Close ${project.name}`);
    close.textContent = "Close";
    close.addEventListener("click", () => {
      dismissProjectMenu(true);
      void perform(() => controller.removeProject(project.id));
    });
    menu.append(close);
    projectMenu = menu;
    openContextMenu({ host: root, menu, anchor: row, inlineStart, blockStart, initialFocus: close });
  };

  const render = (snapshot: ProjectWorkbenchSnapshot) => {
    dismissProjectMenu();
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

      const projectHeading = document.createElement("div");
      projectHeading.className = "zd-project-heading";

      const projectActions = document.createElement("div");
      projectActions.className = "zd-project-actions";

      const children = document.createElement("div");
      children.className = "zd-project-children";
      children.id = `zd-project-children-${projectIndex}`;
      children.setAttribute("role", "group");
      children.setAttribute("aria-label", `${project.name} threads`);
      let expanded = projectExpanded(project.id);

      const disclosure = document.createElement("button");
      disclosure.type = "button";
      disclosure.className = "zd-project-disclosure";
      disclosure.dataset.projectDisclosure = project.id;
      disclosure.setAttribute("aria-controls", children.id);
      const applyDisclosure = () => {
        disclosure.setAttribute("aria-expanded", String(expanded));
        disclosure.setAttribute("aria-label", `${expanded ? "Collapse" : "Expand"} ${project.name}`);
        disclosure.textContent = expanded ? "▾" : "▸";
        children.hidden = !expanded;
      };
      const changeDisclosure = (next: boolean) => {
        if (next === expanded) return;
        expanded = next;
        setProjectExpanded(project.id, expanded);
        applyDisclosure();
      };
      disclosure.addEventListener("click", () => changeDisclosure(!expanded));
      disclosure.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        changeDisclosure(event.key === "ArrowRight");
      });
      applyDisclosure();

      const row = document.createElement("button");
      row.type = "button";
      row.className = "zd-project-row";
      row.id = `zd-project-row-${projectIndex}`;
      row.draggable = true;
      row.setAttribute("aria-haspopup", "menu");
      row.setAttribute("aria-label", projectLabel(project));
      row.title = project.root;
      if (snapshot.active?.projectId === project.id) row.setAttribute("aria-current", "true");
      group.setAttribute("aria-labelledby", row.id);

      const name = document.createElement("span");
      name.className = "zd-project-name";
      name.textContent = project.name;
      const icon = document.createElement("span");
      icon.className = "zd-project-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = project.name.trim().charAt(0).toLocaleUpperCase() || "•";
      row.append(icon, name);

      row.addEventListener("click", (event) => {
        event.preventDefault();
        void perform(() => controller.activateProject(project.id));
      });
      row.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        openProjectMenu(project, row, event.clientX, event.clientY);
      });
      row.addEventListener("keydown", (event) => {
        if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
        event.preventDefault();
        const bounds = row.getBoundingClientRect();
        openProjectMenu(project, row, bounds.left, bounds.bottom);
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
      projectHeading.append(disclosure, row, projectActions);
      group.append(projectHeading);

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

      group.append(children);
      const cleanup = options.renderChildren?.(project, children, projectActions);
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
    dismissProjectMenu();
    stopFooterActions?.();
    root.remove();
  };
}
