import "@vscode/codicons/dist/codicon.css";
import "./files.css";

import { fileTreeStateText } from "./labels";
import { maximumRowColumns } from "./model";
import { createFileTreeRow } from "./row";
import type { FileTreeController } from "./controller";
import type { FileTreeViewSnapshot } from "./types";
import { FILE_TREE_ROW_HEIGHT, fileTreeWindow } from "./virtualizer";
import { closeContextMenu, openContextMenu } from "@/workbench/context-menu";
import type { TransientCoordinator } from "@/workbench/transients";

const FALLBACK_VIEWPORT_HEIGHT = 240;
const DRAG_EXPAND_DELAY_MS = 600;

interface FileTreeElements {
  readonly root: HTMLElement;
  readonly filter: HTMLElement;
  readonly filterInput: HTMLInputElement;
  readonly filterCount: HTMLElement;
  readonly filterClose: HTMLButtonElement;
  readonly viewport: HTMLElement;
  readonly spacer: HTMLElement;
  readonly layer: HTMLElement;
  readonly status: HTMLElement;
  readonly notice: HTMLElement;
}

function elements(): FileTreeElements {
  const root = document.createElement("section");
  root.className = "zd-file-tree";
  root.setAttribute("aria-label", "Files");

  const filter = document.createElement("div");
  filter.className = "zd-file-tree-filter";
  filter.hidden = true;
  const filterInput = document.createElement("input");
  filterInput.type = "search";
  filterInput.className = "zd-file-tree-filter-input";
  filterInput.autocomplete = "off";
  filterInput.spellcheck = false;
  filterInput.setAttribute("aria-label", "Filter project files by name, path, or type");
  filterInput.placeholder = "Filter files";
  const filterCount = document.createElement("span");
  filterCount.className = "zd-file-tree-filter-count";
  filterCount.setAttribute("aria-live", "polite");
  const filterClose = document.createElement("button");
  filterClose.type = "button";
  filterClose.className = "zd-file-tree-filter-close";
  filterClose.dataset.fileFilterClose = "true";
  filterClose.setAttribute("aria-label", "Close file filter");
  filterClose.textContent = "×";
  filter.append(filterInput, filterCount, filterClose);

  const viewport = document.createElement("div");
  viewport.className = "zd-file-tree-viewport";
  viewport.dataset.fileTreeViewport = "";
  viewport.setAttribute("role", "tree");
  viewport.setAttribute("aria-label", "Project files");
  viewport.tabIndex = 0;
  const spacer = document.createElement("div");
  spacer.className = "zd-file-tree-spacer";
  const layer = document.createElement("div");
  layer.className = "zd-file-tree-layer";
  spacer.append(layer);
  viewport.append(spacer);

  const status = document.createElement("p");
  status.className = "zd-file-tree-status";
  status.setAttribute("role", "status");
  const notice = document.createElement("p");
  notice.className = "zd-file-tree-notice";
  notice.setAttribute("role", "status");
  root.append(filter, viewport, status, notice);
  return {
    root,
    filter,
    filterInput,
    filterCount,
    filterClose,
    viewport,
    spacer,
    layer,
    status,
    notice,
  };
}

function stateDescription(snapshot: FileTreeViewSnapshot, rowCount: number): string {
  const state = fileTreeStateText(snapshot.state);
  if (state) return snapshot.notice ?? state;
  if (snapshot.filterQuery && rowCount === 0) return "No files match this filter.";
  return "";
}

function focusSelected(
  elements: FileTreeElements,
  controller: FileTreeController,
  path: string | null,
  renderRows: () => void,
): void {
  if (!path) return;
  const rows = controller.rows();
  const index = rows.findIndex((row) => row.entry.relativePath === path);
  if (index < 0) return;
  const top = index * FILE_TREE_ROW_HEIGHT;
  const bottom = top + FILE_TREE_ROW_HEIGHT;
  const viewportHeight = elements.viewport.clientHeight || FALLBACK_VIEWPORT_HEIGHT;
  const viewportBottom = elements.viewport.scrollTop + viewportHeight;
  if (top < elements.viewport.scrollTop) elements.viewport.scrollTop = top;
  else if (bottom > viewportBottom) {
    elements.viewport.scrollTop = bottom - viewportHeight;
  }
  controller.setScroll({
    top: elements.viewport.scrollTop,
    left: elements.viewport.scrollLeft,
  });
  renderRows();
  [...elements.layer.querySelectorAll<HTMLElement>("[data-file-path]")]
    .find((row) => row.dataset.filePath === path)
    ?.focus();
}

function restoreTreeFocus(
  elements: FileTreeElements,
  path: string | null,
  renderRows: () => void,
): void {
  renderRows();
  const row = [...elements.layer.querySelectorAll<HTMLElement>("[data-file-path]")].find(
    (candidate) => candidate.dataset.filePath === path,
  );
  (row ?? elements.viewport).focus({ preventScroll: true });
}

/** Mount the Files hierarchy. The controller survives tab unmount/remount. */
export function mountFileTree(
  host: HTMLElement,
  controller: FileTreeController,
  transients?: TransientCoordinator,
): () => void {
  const ui = elements();
  host.append(ui.root);
  let current = controller.snapshot();
  let rows = controller.rows();
  let active = true;
  let fileMenu: HTMLElement | null = null;
  let fileMenuPath: string | null = null;
  let safetyTransient: string | null = null;
  let dropTargetPath: string | null = null;
  let hoverExpandPath: string | null = null;
  let hoverExpandTimer: ReturnType<typeof setTimeout> | null = null;
  const fileRow = (path: string): HTMLElement | undefined =>
    [...ui.layer.querySelectorAll<HTMLElement>("[data-file-path]")].find(
      (candidate) => candidate.dataset.filePath === path,
    );

  const dismissFileMenu = (restoreFocus = false): void => {
    const path = fileMenuPath;
    if (fileMenu?.getAttribute("role") === "menu") closeContextMenu(fileMenu, restoreFocus);
    else fileMenu?.remove();
    fileMenu = null;
    fileMenuPath = null;
    if (safetyTransient) {
      const transient = safetyTransient;
      safetyTransient = null;
      transients?.closed(transient);
    }
    document.removeEventListener("pointerdown", dismissFileMenuFromPointer);
    document.removeEventListener("keydown", dismissFileMenuFromKeyboard);
    if (!restoreFocus || !path) return;
    fileRow(path)?.focus();
  };

  function dismissFileMenuFromPointer(event: PointerEvent): void {
    if (fileMenu?.contains(event.target as Node)) return;
    dismissFileMenu();
  }

  function dismissFileMenuFromKeyboard(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !fileMenu) return;
    event.preventDefault();
    event.stopPropagation();
    dismissFileMenu(true);
  }

  const placeFileMenu = (menu: HTMLElement, inlineStart: number, blockStart: number): void => {
    ui.root.append(menu);
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(inlineStart, window.innerWidth - bounds.width))}px`;
    menu.style.top = `${Math.max(0, Math.min(blockStart, window.innerHeight - bounds.height))}px`;
    fileMenu = menu;
    document.addEventListener("pointerdown", dismissFileMenuFromPointer);
    document.addEventListener("keydown", dismissFileMenuFromKeyboard);
  };

  const openNameEditor = (
    operation: "create-file" | "create-directory" | "rename",
    path: string | null,
    name: string,
    inlineStart: number,
    blockStart: number,
  ): void => {
    dismissFileMenu();
    const entry = path
      ? controller.snapshot().entries.find((candidate) => candidate.relativePath === path)
      : null;
    const parentPath = operation === "rename" ? (entry?.parentPath ?? null) : path;
    const title =
      operation === "rename"
        ? `Rename ${name}`
        : `${operation === "create-file" ? "New file" : "New folder"}${parentPath ? ` in ${parentPath}` : ""}`;

    const editor = document.createElement("form");
    editor.className = "zd-file-tree-operation";
    editor.setAttribute("role", "dialog");
    editor.setAttribute("aria-label", title);
    const label = document.createElement("label");
    label.textContent = title;
    const input = document.createElement("input");
    input.type = "text";
    input.value = operation === "rename" ? name : "";
    input.setAttribute("aria-label", operation === "rename" ? "New name" : "Name");
    const problem = document.createElement("span");
    problem.className = "zd-file-tree-operation-problem";
    problem.setAttribute("role", "status");
    const controls = document.createElement("span");
    controls.className = "zd-file-tree-operation-controls";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = operation === "rename" ? "Rename" : "Create";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dismissFileMenu(true));
    controls.append(submit, cancel);
    label.append(input);
    editor.append(label, problem, controls);
    editor.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextName = input.value;
      submit.disabled = true;
      void (async () => {
        const committed =
          operation === "rename"
            ? Boolean(path && (await controller.renameEntry(path, nextName)))
            : await controller.createEntry(
                parentPath,
                nextName,
                operation === "create-file" ? "file" : "directory",
              );
        if (committed) {
          dismissFileMenu();
          return;
        }
        problem.textContent = controller.snapshot().notice ?? "The operation was refused.";
        submit.disabled = false;
        input.focus();
        input.select();
      })();
    });
    placeFileMenu(editor, inlineStart, blockStart);
    fileMenuPath = path;
    input.focus();
    input.select();
  };

  const openTrashConfirmation = (
    path: string,
    name: string,
    inlineStart: number,
    blockStart: number,
  ): void => {
    dismissFileMenu();
    if (
      transients &&
      !transients.open("file-trash-confirmation", "safety", (restoreFocus) =>
        dismissFileMenu(restoreFocus),
      )
    ) {
      return;
    }
    safetyTransient = transients ? "file-trash-confirmation" : null;
    const selectedPaths = [...controller.snapshot().selectedPaths];
    const count = selectedPaths.length;
    const confirmation = document.createElement("div");
    confirmation.className = "zd-file-tree-operation";
    confirmation.setAttribute("role", "alertdialog");
    confirmation.setAttribute(
      "aria-label",
      count === 1 ? `Move ${name} to Trash` : `Move ${count} items to Trash`,
    );
    const question = document.createElement("p");
    question.textContent =
      count === 1 ? `Move ${path} to Trash?` : `Move ${count} selected items to Trash?`;
    const problem = document.createElement("span");
    problem.className = "zd-file-tree-operation-problem";
    problem.setAttribute("role", "status");
    const controls = document.createElement("span");
    controls.className = "zd-file-tree-operation-controls";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Move to Trash";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dismissFileMenu(true));
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void (async () => {
        if (await controller.trashSelection()) {
          dismissFileMenu();
          return;
        }
        problem.textContent = controller.snapshot().notice ?? "The operation was refused.";
        confirm.disabled = false;
        confirm.focus();
      })();
    });
    controls.append(confirm, cancel);
    confirmation.append(question, problem, controls);
    placeFileMenu(confirmation, inlineStart, blockStart);
    fileMenuPath = path;
    confirm.focus();
  };

  const openDiscardConfirmation = (path: string, inlineStart: number, blockStart: number): void => {
    dismissFileMenu();
    const transientId = "file-draft-discard-confirmation";
    if (
      transients &&
      !transients.open(transientId, "safety", (restoreFocus) => dismissFileMenu(restoreFocus))
    ) {
      return;
    }
    safetyTransient = transients ? transientId : null;
    const count = controller.dirtySelectionCount();
    const confirmation = document.createElement("div");
    confirmation.className = "zd-file-tree-operation";
    confirmation.setAttribute("role", "alertdialog");
    confirmation.setAttribute("aria-label", "Discard unsaved changes");
    const question = document.createElement("p");
    question.textContent =
      count === 1
        ? `Discard unsaved changes in ${path}?`
        : `Discard unsaved changes in ${count} files?`;
    const explanation = document.createElement("p");
    explanation.textContent =
      "The affected files will close. Open them again to read their saved copies.";
    const problem = document.createElement("span");
    problem.className = "zd-file-tree-operation-problem";
    problem.setAttribute("role", "status");
    const controls = document.createElement("span");
    controls.className = "zd-file-tree-operation-controls";
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.textContent = "Discard Changes";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => dismissFileMenu(true));
    confirm.addEventListener("click", () => {
      confirm.disabled = true;
      void (async () => {
        if (await controller.discardUnsavedSelection()) {
          dismissFileMenu();
          return;
        }
        problem.textContent =
          controller.snapshot().notice ?? "The unsaved changes could not be discarded.";
        confirm.disabled = false;
        confirm.focus();
      })();
    });
    controls.append(confirm, cancel);
    confirmation.append(question, explanation, problem, controls);
    placeFileMenu(confirmation, inlineStart, blockStart);
    fileMenuPath = path;
    confirm.focus();
  };

  const openFileMenu = (
    path: string | null,
    name: string,
    inlineStart: number,
    blockStart: number,
  ): void => {
    dismissFileMenu();
    if (path && !controller.snapshot().selectedPaths.has(path)) controller.select(path);
    const entry = path
      ? controller.snapshot().entries.find((candidate) => candidate.relativePath === path)
      : null;

    const menu = document.createElement("div");
    menu.className = "zd-file-tree-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", path ? `${name} file actions` : "Project file actions");

    const action = (label: string, run: () => void, data?: readonly [string, string]): void => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "zd-file-tree-menu-action";
      if (data) button.dataset[data[0]] = data[1];
      button.setAttribute("role", "menuitem");
      button.textContent = label;
      button.addEventListener("click", run);
      menu.append(button);
    };

    if (!entry || entry.kind === "directory") {
      action("New File…", () => openNameEditor("create-file", path, name, inlineStart, blockStart));
      action("New Folder…", () =>
        openNameEditor("create-directory", path, name, inlineStart, blockStart),
      );
    } else {
      action("Open", () => {
        dismissFileMenu(true);
        void controller.activateSelected();
      });
    }

    if (entry && entry.kind !== "symlink") {
      action("Cut", () => {
        controller.markSelection("cut");
        dismissFileMenu(true);
      });
      action("Copy", () => {
        controller.markSelection("copy");
        dismissFileMenu(true);
      });
    }

    if ((!entry || entry.kind === "directory") && controller.hasClipboard()) {
      action("Paste", () => {
        dismissFileMenu(true);
        void controller.pasteSelection(path);
      });
    }

    if (entry && entry.kind !== "symlink" && controller.snapshot().selectedPaths.size === 1) {
      action("Rename…", () => openNameEditor("rename", path, name, inlineStart, blockStart));
    }

    if (entry) {
      const entryPath = entry.relativePath;
      for (const [presentation, label] of [
        ["relative", "Copy Relative Path"],
        ["full", "Copy Full Path"],
      ] as const) {
        action(label, () => {
          dismissFileMenu(true);
          void controller.copyPath(entryPath, presentation);
        }, ["copyPath", presentation]);
      }
      if (controller.dirtySelectionCount() > 0) {
        action("Discard Unsaved Changes…", () =>
          openDiscardConfirmation(entryPath, inlineStart, blockStart),
        );
      }
      if (entry.kind !== "symlink") {
        action("Move to Trash…", () =>
          openTrashConfirmation(entryPath, name, inlineStart, blockStart),
        );
      }
    }

    fileMenu = menu;
    fileMenuPath = path;
    openContextMenu({
      host: ui.root,
      menu,
      anchor: (path ? fileRow(path) : ui.viewport) ?? ui.viewport,
      inlineStart,
      blockStart,
    });
  };

  const renderRows = (): void => {
    if (!active) return;
    rows = controller.rows();
    const viewportHeight = ui.viewport.clientHeight || FALLBACK_VIEWPORT_HEIGHT;
    const window = fileTreeWindow(rows.length, ui.viewport.scrollTop, viewportHeight);
    const fragment = document.createDocumentFragment();
    rows.slice(window.start, window.end).forEach((row, index) => {
      const element = createFileTreeRow(row, current, controller);
      if (current.selectedPath === null && window.start + index === 0) element.tabIndex = 0;
      if (row.entry.relativePath === dropTargetPath) {
        element.dataset.dropTarget = "true";
        element.dataset.dropPosition = row.entry.kind === "directory" ? "inside" : "parent";
      }
      fragment.append(element);
    });
    ui.spacer.style.height = `${window.totalHeight}px`;
    ui.spacer.style.minWidth = `${maximumRowColumns(rows)}ch`;
    ui.layer.style.transform = `translateY(${window.offset}px)`;
    ui.layer.replaceChildren(fragment);
  };

  const render = (snapshot: FileTreeViewSnapshot): void => {
    if (!active) return;
    current = snapshot;
    rows = controller.rows();
    ui.root.dataset.fileTreeState = snapshot.state;
    ui.root.setAttribute("aria-busy", String(snapshot.state === "loading" || snapshot.refreshing));
    ui.filter.hidden = !snapshot.filterOpen;
    if (ui.filterInput.value !== snapshot.filterQuery) ui.filterInput.value = snapshot.filterQuery;
    const matchCount = rows.filter((row) => row.matched).length;
    ui.filterCount.textContent = snapshot.filterQuery
      ? `${matchCount} ${matchCount === 1 ? "result" : "results"}`
      : "";
    ui.status.textContent = stateDescription(snapshot, rows.length);
    ui.status.hidden = ui.status.textContent.length === 0;
    ui.notice.textContent = snapshot.state === "ready" ? (snapshot.notice ?? "") : "";
    ui.notice.hidden = ui.notice.textContent.length === 0;
    if (ui.viewport.scrollTop !== snapshot.scroll.top) ui.viewport.scrollTop = snapshot.scroll.top;
    if (ui.viewport.scrollLeft !== snapshot.scroll.left)
      ui.viewport.scrollLeft = snapshot.scroll.left;
    renderRows();
    if (snapshot.filterOpen && document.activeElement !== ui.filterInput) ui.filterInput.focus();
  };

  const dismissFilter = (): void => {
    controller.dismissFilter();
    restoreTreeFocus(ui, controller.snapshot().selectedPath, renderRows);
  };

  ui.filterInput.addEventListener("input", () => controller.setFilter(ui.filterInput.value));
  ui.filterInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissFilter();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      const selected = controller.snapshot().selectedPath ?? controller.selectBoundary("first");
      focusSelected(ui, controller, selected, renderRows);
    }
  });
  ui.filterClose.addEventListener("click", dismissFilter);
  ui.viewport.addEventListener("scroll", () => {
    dismissFileMenu();
    controller.setScroll({ top: ui.viewport.scrollTop, left: ui.viewport.scrollLeft });
    renderRows();
  });
  ui.viewport.addEventListener("contextmenu", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-file-path]");
    event.preventDefault();
    openFileMenu(
      target?.dataset.filePath ?? null,
      target?.querySelector<HTMLElement>(".zd-file-tree-name")?.textContent ?? "project root",
      event.clientX,
      event.clientY,
    );
  });
  const destinationDirectory = (path: string | null): string | null => {
    if (!path) return null;
    const entry = controller
      .snapshot()
      .entries.find((candidate) => candidate.relativePath === path);
    return entry?.kind === "directory" ? path : (entry?.parentPath ?? null);
  };
  const clearDropTarget = (): void => {
    dropTargetPath = null;
    hoverExpandPath = null;
    if (hoverExpandTimer !== null) clearTimeout(hoverExpandTimer);
    hoverExpandTimer = null;
    ui.layer.querySelectorAll<HTMLElement>("[data-drop-target]").forEach((row) => {
      delete row.dataset.dropTarget;
      delete row.dataset.dropPosition;
    });
  };
  const setDropTarget = (path: string | null): void => {
    if (path === dropTargetPath) return;
    clearDropTarget();
    dropTargetPath = path;
    if (!path) return;
    const target = fileRow(path);
    const row = controller.rows().find(({ entry }) => entry.relativePath === path);
    if (target) {
      target.dataset.dropTarget = "true";
      target.dataset.dropPosition = row?.entry.kind === "directory" ? "inside" : "parent";
    }
    if (!row || row.entry.kind !== "directory" || !row.hasChildren || row.expanded) return;
    hoverExpandPath = path;
    hoverExpandTimer = setTimeout(() => {
      hoverExpandTimer = null;
      if (hoverExpandPath === path && dropTargetPath === path) controller.expand(path);
    }, DRAG_EXPAND_DELAY_MS);
  };
  let mouseDrag:
    | {
        readonly paths: readonly string[];
        readonly startX: number;
        readonly startY: number;
        active: boolean;
      }
    | undefined;
  let suppressDragClick = false;
  let suppressDragClickTimer: ReturnType<typeof setTimeout> | null = null;

  function pathUnderPointer(clientX: number, clientY: number): string | null | undefined {
    const hit = document.elementFromPoint(clientX, clientY);
    if (!hit || !ui.viewport.contains(hit)) return undefined;
    return hit.closest<HTMLElement>("[data-file-path]")?.dataset.filePath ?? null;
  }

  function stopMouseDrag(): void {
    mouseDrag = undefined;
    delete ui.root.dataset.dragging;
    window.removeEventListener("mousemove", moveMouseDrag, true);
    window.removeEventListener("mouseup", finishMouseDrag, true);
  }

  function moveMouseDrag(event: MouseEvent): void {
    if (!mouseDrag) return;
    if (!mouseDrag.active) {
      const distance = Math.hypot(
        event.clientX - mouseDrag.startX,
        event.clientY - mouseDrag.startY,
      );
      if (distance < 5) return;
      mouseDrag.active = true;
      ui.root.dataset.dragging = "true";
    }

    event.preventDefault();
    const path = pathUnderPointer(event.clientX, event.clientY);
    setDropTarget(path === undefined ? null : path);
  }

  function finishMouseDrag(event: MouseEvent): void {
    const gesture = mouseDrag;
    if (!gesture) return;
    const path = pathUnderPointer(event.clientX, event.clientY);
    const transfer = gesture.active && path !== undefined;
    if (gesture.active) {
      event.preventDefault();
      suppressDragClick = true;
      if (suppressDragClickTimer !== null) clearTimeout(suppressDragClickTimer);
      suppressDragClickTimer = setTimeout(() => {
        suppressDragClick = false;
        suppressDragClickTimer = null;
      }, 0);
    }
    clearDropTarget();
    stopMouseDrag();
    if (transfer) {
      void controller.transferPaths(
        gesture.paths,
        destinationDirectory(path),
        event.altKey ? "copy" : "move",
      );
    }
  }

  ui.viewport.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-file-path]");
    const path = target?.dataset.filePath;
    if (!path || target.dataset.fileKind === "symlink") return;
    const selection = controller.snapshot().selectedPaths;
    mouseDrag = {
      paths: selection.has(path) ? [...selection] : [path],
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
    window.addEventListener("mousemove", moveMouseDrag, { capture: true, passive: false });
    window.addEventListener("mouseup", finishMouseDrag, { capture: true, passive: false });
  });
  ui.viewport.addEventListener(
    "click",
    (event) => {
      if (!suppressDragClick) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressDragClick = false;
    },
    true,
  );
  ui.viewport.addEventListener("keydown", (event) => {
    const eventPath = (event.target as HTMLElement).dataset.filePath ?? null;
    if (eventPath && controller.snapshot().selectedPath !== eventPath) controller.select(eventPath);
    const selected = eventPath ?? controller.snapshot().selectedPath;
    if (event.metaKey || event.ctrlKey) {
      if (event.key.toLowerCase() === "c" && controller.markSelection("copy")) {
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === "x" && controller.markSelection("cut")) {
        event.preventDefault();
        return;
      }
      if (event.key.toLowerCase() === "v" && controller.hasClipboard()) {
        event.preventDefault();
        void controller.pasteSelection(destinationDirectory(selected));
        return;
      }
    }
    if (selected && (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))) {
      const target = fileRow(selected);
      if (target) {
        event.preventDefault();
        const bounds = target.getBoundingClientRect();
        openFileMenu(
          selected,
          target.querySelector<HTMLElement>(".zd-file-tree-name")?.textContent ?? selected,
          bounds.left,
          bounds.bottom,
        );
      }
      return;
    }
    let next: string | null = selected;
    switch (event.key) {
      case "ArrowDown":
        next = controller.moveSelection(1, event.shiftKey);
        break;
      case "ArrowUp":
        next = controller.moveSelection(-1, event.shiftKey);
        break;
      case "ArrowRight":
        if (selected) next = controller.selectChild(selected);
        break;
      case "ArrowLeft":
        if (selected) next = controller.selectParent(selected);
        break;
      case "Home":
        next = controller.selectBoundary("first");
        break;
      case "End":
        next = controller.selectBoundary("last");
        break;
      case "Enter":
      case " ":
        void controller.activateSelected();
        break;
      default:
        return;
    }
    event.preventDefault();
    focusSelected(ui, controller, next, renderRows);
  });
  window.addEventListener("resize", renderRows);
  const viewportObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => renderRows());
  viewportObserver?.observe(ui.viewport);
  const unsubscribe = controller.subscribe(render);
  render(current);

  return () => {
    if (!active) return;
    active = false;
    stopMouseDrag();
    if (suppressDragClickTimer !== null) clearTimeout(suppressDragClickTimer);
    clearDropTarget();
    dismissFileMenu();
    unsubscribe();
    viewportObserver?.disconnect();
    window.removeEventListener("resize", renderRows);
    ui.root.remove();
  };
}
