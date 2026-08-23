import "./threads.css";
import "@vscode/codicons/dist/codicon.css";

import { orderedProjectThreads } from "./model";
import type { ThreadsController } from "./controller";
import { createThreadAction, type ProjectThreadsOptions } from "./create-view";
import { renderThreadActions } from "./row-actions";
import type { ThreadProjectGroup, ThreadRecord, ThreadWorkbenchSnapshot } from "./types";
import { performThreadAction } from "./view-actions";
import {
  setThreadSecondaryLine,
  threadSecondaryLine,
  type ThreadSecondaryLine,
} from "@/workbench/preferences";

export type { ProjectThreadsOptions } from "./create-view";

export type ThreadRegionUnmount = () => void;

function orderedProjects(projects: readonly ThreadProjectGroup[]): readonly ThreadProjectGroup[] {
  return projects
    .map((project, index) => ({ project, index }))
    .sort((left, right) => left.project.order - right.project.order || left.index - right.index)
    .map(({ project }) => project);
}

function typeLabel(thread: ThreadRecord): string {
  return thread.type.agent === "shell" ? "terminal" : thread.type.agent;
}

function accessibleThreadLabel(thread: ThreadRecord): string {
  const worktree =
    thread.worktree.kind === "project-root" ? "project root" : `worktree ${thread.worktree.label}`;
  const attention = thread.attention.unread ? ", attention required" : "";
  const recovery = thread.recovery ? `, ${thread.recovery.summary}` : "";
  return `${thread.name}, ${typeLabel(thread)}, ${thread.lifecycle}, ${worktree}${attention}${recovery}`;
}

function textSpan(className: string, text: string): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function secondaryLine(thread: ThreadRecord, line = threadSecondaryLine()): string {
  switch (line) {
    case "app":
      return `${typeLabel(thread)} · ${thread.lifecycle}`;
    case "directory":
      return thread.worktree.root;
    case "worktree":
      return thread.worktree.kind === "project-root" ? "project root" : thread.worktree.label;
  }
}

interface RenderContext {
  readonly root: HTMLElement;
  readonly list: HTMLElement;
  readonly status: HTMLElement;
  readonly controller: ThreadsController;
  readonly projectId?: string;
  openSettings(
    thread: ThreadRecord,
    row: HTMLButtonElement,
    inlineStart: number,
    blockStart: number,
  ): void;
}

function focusRelative(root: HTMLElement, current: HTMLElement, offset: number): void {
  const rows = [...root.querySelectorAll<HTMLButtonElement>("[data-thread-id]")];
  const index = rows.indexOf(current as HTMLButtonElement);
  const target = rows[Math.min(rows.length - 1, Math.max(0, index + offset))];
  target?.focus();
}

function installKeyboardNavigation(row: HTMLButtonElement, root: HTMLElement): void {
  row.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusRelative(root, row, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusRelative(root, row, -1);
        break;
      case "Home":
        event.preventDefault();
        root.querySelector<HTMLButtonElement>("[data-thread-id]")?.focus();
        break;
      case "End": {
        event.preventDefault();
        const rows = root.querySelectorAll<HTMLButtonElement>("[data-thread-id]");
        rows.item(rows.length - 1)?.focus();
        break;
      }
      case "Enter":
      case " ":
        event.preventDefault();
        row.click();
        break;
    }
  });
}

function renderRecovery(
  thread: ThreadRecord,
  index: number,
  controller: ThreadsController,
  status: HTMLElement,
): HTMLElement | null {
  if (!thread.recovery) return null;
  const recovery = document.createElement("p");
  recovery.className = "zd-thread-recovery";
  recovery.dataset.threadRecovery = thread.id;
  recovery.dataset.recoveryKind = thread.recovery.kind;
  recovery.id = `zd-thread-recovery-${index}`;
  recovery.append(document.createTextNode(thread.recovery.summary), " ");

  const action = document.createElement("button");
  action.type = "button";
  action.className = "zd-thread-text-action";
  action.textContent = thread.recovery.actionLabel;
  action.addEventListener("click", () => {
    void performThreadAction(status, () => controller.recoverThread(thread.id));
  });
  recovery.append(action);
  return recovery;
}

function renderThreadRows(
  host: HTMLElement,
  threads: readonly ThreadRecord[],
  snapshot: ThreadWorkbenchSnapshot,
  context: RenderContext,
): void {
  threads.forEach((thread, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "zd-thread-item";

    const row = document.createElement("button");
    row.type = "button";
    row.className = "zd-thread-row";
    row.dataset.threadId = thread.id;
    row.dataset.threadLifecycle = thread.lifecycle;
    row.dataset.threadAttention = thread.attention.unread ? "unread" : "read";
    row.dataset.threadSecondaryLine = threadSecondaryLine();
    row.draggable = true;
    row.setAttribute("role", "treeitem");
    row.setAttribute("aria-label", accessibleThreadLabel(thread));
    row.setAttribute("aria-level", context.projectId ? "1" : "2");
    row.title = accessibleThreadLabel(thread);
    if (snapshot.activeThreadId === thread.id) row.setAttribute("aria-current", "true");

    const dot = textSpan("zd-thread-state-dot", "");
    dot.setAttribute("aria-hidden", "true");
    const icon = textSpan("zd-thread-type-icon codicon codicon-terminal", "");
    icon.setAttribute("aria-hidden", "true");
    const labels = document.createElement("span");
    labels.className = "zd-thread-labels";
    labels.append(
      textSpan("zd-thread-name", thread.name),
      textSpan("zd-thread-secondary", secondaryLine(thread)),
    );
    row.append(dot, icon, labels);
    row.addEventListener("click", () => {
      void performThreadAction(context.status, () => context.controller.activateThread(thread.id));
    });
    row.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      context.openSettings(thread, row, event.clientX, event.clientY);
    });
    row.addEventListener("keydown", (event) => {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
      event.preventDefault();
      const bounds = row.getBoundingClientRect();
      context.openSettings(thread, row, bounds.left, bounds.bottom);
    });
    installKeyboardNavigation(row, context.root);

    row.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/zd-thread-id", thread.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });
    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const movedId = event.dataTransfer?.getData("text/zd-thread-id");
      if (!movedId) return;
      const bounds = row.getBoundingClientRect();
      const insertionIndex = index + (event.clientY >= bounds.top + bounds.height / 2 ? 1 : 0);
      void performThreadAction(context.status, () =>
        context.controller.moveThread(thread.projectId, movedId, insertionIndex),
      );
    });

    wrapper.append(row);
    renderThreadActions(wrapper, thread, context.controller, context.status);
    const recovery = renderRecovery(thread, index, context.controller, context.status);
    if (recovery) {
      row.setAttribute("aria-describedby", recovery.id);
      wrapper.append(recovery);
    }
    host.append(wrapper);
  });
}

function renderSnapshot(snapshot: ThreadWorkbenchSnapshot, context: RenderContext): void {
  const activeElement = document.activeElement;
  if (snapshot.visibility === "hidden" && activeElement instanceof HTMLElement) {
    if (context.root.contains(activeElement)) activeElement.blur();
  }
  context.root.dataset.threadRegionMode = snapshot.visibility;
  context.root.hidden = snapshot.visibility === "hidden";
  if (context.root.hidden) context.root.setAttribute("aria-hidden", "true");
  else context.root.removeAttribute("aria-hidden");
  context.list.replaceChildren();

  if (context.projectId) {
    const threads = orderedProjectThreads(snapshot.threads, context.projectId);
    if (threads.length === 0) {
      const empty = document.createElement("p");
      empty.className = "zd-thread-empty";
      empty.textContent = "No threads.";
      context.list.append(empty);
    } else {
      renderThreadRows(context.list, threads, snapshot, context);
    }
    return;
  }

  const projects = orderedProjects(snapshot.projects);
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "zd-thread-empty";
    empty.textContent = "No projects open.";
    context.list.append(empty);
    return;
  }

  projects.forEach((project, projectIndex) => {
    const group = document.createElement("section");
    group.className = "zd-thread-project";
    group.dataset.threadProject = project.id;
    group.dataset.projectAvailability = project.availability;
    group.setAttribute("role", "group");

    const heading = document.createElement("h2");
    heading.className = "zd-thread-project-name";
    heading.id = `zd-thread-project-${projectIndex}`;
    heading.textContent = project.name;
    group.setAttribute("aria-labelledby", heading.id);
    group.append(heading);

    const threads = orderedProjectThreads(snapshot.threads, project.id);
    if (threads.length === 0) {
      const empty = document.createElement("p");
      empty.className = "zd-thread-empty";
      empty.textContent = "No threads.";
      group.append(empty);
    } else {
      renderThreadRows(group, threads, snapshot, context);
    }
    context.list.append(group);
  });
}

function mountThreadView(
  host: HTMLElement,
  controller: ThreadsController,
  projectId?: string,
  options: ProjectThreadsOptions = {},
): ThreadRegionUnmount {
  const root = document.createElement("div");
  root.className = projectId ? "zd-project-threads" : "zd-threads-region";

  if (!projectId) {
    const heading = document.createElement("h1");
    heading.className = "zd-thread-region-heading";
    heading.textContent = "PROJECTS";
    root.append(heading);
  }

  const list = document.createElement("div");
  list.className = "zd-thread-list";
  list.setAttribute("role", "tree");
  list.setAttribute("aria-label", projectId ? "Project threads" : "Projects and threads");
  const status = document.createElement("p");
  status.className = "zd-thread-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  const createAction = projectId
    ? createThreadAction(controller, projectId, status, options)
    : null;
  if (createAction) (options.actionHost ?? root).append(createAction);
  root.append(list, status);
  host.append(root);

  let settingsMenu: HTMLElement | null = null;
  let settingsAnchor: HTMLButtonElement | null = null;
  const dismissSettings = (restoreFocus = false): void => {
    settingsMenu?.remove();
    settingsMenu = null;
    document.removeEventListener("pointerdown", dismissSettingsFromPointer);
    document.removeEventListener("keydown", dismissSettingsFromKeyboard);
    if (restoreFocus) settingsAnchor?.focus();
    settingsAnchor?.removeAttribute("aria-controls");
    settingsAnchor = null;
  };
  function dismissSettingsFromPointer(event: PointerEvent): void {
    if (settingsMenu?.contains(event.target as Node)) return;
    dismissSettings();
  }
  function dismissSettingsFromKeyboard(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !settingsMenu) return;
    event.preventDefault();
    event.stopPropagation();
    dismissSettings(true);
  }
  const openSettings = (
    thread: ThreadRecord,
    row: HTMLButtonElement,
    inlineStart: number,
    blockStart: number,
  ): void => {
    dismissSettings();
    const menu = document.createElement("div");
    menu.className = "zd-thread-settings";
    menu.dataset.threadSettings = thread.id;
    menu.id = `zd-thread-settings-${thread.id}`;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", `${thread.name} thread settings`);
    const heading = document.createElement("p");
    heading.className = "zd-thread-settings-heading";
    heading.textContent = "Second line";
    menu.append(heading);
    const selected = threadSecondaryLine();
    for (const [value, label] of [
      ["app", "App running"],
      ["directory", "Current directory"],
      ["worktree", "Branch / worktree"],
    ] as const satisfies readonly (readonly [ThreadSecondaryLine, string])[]) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "zd-thread-settings-action";
      action.dataset.threadSecondaryLine = value;
      action.setAttribute("role", "menuitemradio");
      action.setAttribute("aria-checked", String(value === selected));
      action.textContent = label;
      action.addEventListener("click", () => {
        setThreadSecondaryLine(value);
        dismissSettings(true);
        renderSnapshot(controller.snapshot(), context);
      });
      menu.append(action);
    }
    root.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(inlineStart, window.innerWidth - bounds.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(blockStart, window.innerHeight - bounds.height))}px`;
    row.setAttribute("aria-controls", menu.id);
    settingsMenu = menu;
    settingsAnchor = row;
    document.addEventListener("pointerdown", dismissSettingsFromPointer);
    document.addEventListener("keydown", dismissSettingsFromKeyboard);
    menu.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();
  };

  const context: RenderContext = {
    root,
    list,
    status,
    controller,
    openSettings,
    ...(projectId ? { projectId } : {}),
  };
  renderSnapshot(controller.snapshot(), context);
  const unsubscribe = controller.subscribe((snapshot) => renderSnapshot(snapshot, context));

  return () => {
    dismissSettings();
    unsubscribe();
    createAction?.remove();
    root.remove();
  };
}

/** Standalone project/thread hierarchy for the complete left region. */
export function mountThreadsRegion(
  host: HTMLElement,
  controller: ThreadsController,
): ThreadRegionUnmount {
  return mountThreadView(host, controller);
}

/** Integration seam for Projects' existing `renderChildren` callback. */
export function mountProjectThreads(
  host: HTMLElement,
  controller: ThreadsController,
  projectId: string,
  options: ProjectThreadsOptions = {},
): ThreadRegionUnmount {
  return mountThreadView(host, controller, projectId, options);
}
