import { categoryIconClass, categoryLabel, fileTreeEntryLabel } from "./labels";
import type { FileTreeController } from "./controller";
import type { FileTreeEntry, FileTreeViewSnapshot, VisibleFileTreeRow } from "./types";

interface FileTreeActivationModifiers {
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
}

function gitStateClass(row: VisibleFileTreeRow): string | null {
  const state = row.entry.gitState;
  if (!state) return null;
  if (state === "added" || state === "untracked") return "added";
  if (state === "deleted") return "deleted";
  if (state === "ignored") return "ignored";
  return "changed";
}

export function activateFileTreeEntry(
  entry: FileTreeEntry,
  controller: FileTreeController,
  modifiers: FileTreeActivationModifiers,
): void {
  const mode = modifiers.shiftKey
    ? "range"
    : modifiers.metaKey || modifiers.ctrlKey
      ? "toggle"
      : "replace";
  controller.select(entry.relativePath, mode);
  if (mode !== "replace") return;
  if (entry.kind === "directory") {
    controller.toggle(entry.relativePath);
    return;
  }
  void controller.activateSelected();
}

export function createFileTreeRow(
  row: VisibleFileTreeRow,
  snapshot: FileTreeViewSnapshot,
  controller: FileTreeController,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zd-file-tree-row";
  button.setAttribute("role", "treeitem");
  button.setAttribute("aria-haspopup", "menu");
  for (const part of ["guides", "disclosure", "icon", "name"]) {
    const span = document.createElement("span");
    span.className = `zd-file-tree-${part}`;
    if (part !== "name") span.setAttribute("aria-hidden", "true");
    button.append(span);
  }
  updateFileTreeRow(button, row, snapshot, controller);
  return button;
}

/** Keep pointer targets and keyboard focus attached through host and selection updates. */
export function updateFileTreeRow(
  button: HTMLButtonElement,
  row: VisibleFileTreeRow,
  snapshot: FileTreeViewSnapshot,
  controller: FileTreeController,
): void {
  button.dataset.filePath = row.entry.relativePath;
  button.dataset.fileKind = row.entry.kind;
  button.dataset.fileCategory = row.entry.category;
  const dirty = snapshot.dirtyPaths.has(row.entry.relativePath);
  button.dataset.dirty = String(dirty);
  const stateClass = gitStateClass(row);
  if (stateClass) button.dataset.gitState = stateClass;
  else delete button.dataset.gitState;
  button.setAttribute("aria-level", String(row.depth + 1));
  button.setAttribute("aria-posinset", String(row.positionInSet));
  button.setAttribute("aria-setsize", String(row.setSize));
  button.setAttribute("aria-label", fileTreeEntryLabel(row.entry, dirty));
  button.setAttribute("aria-description", row.entry.relativePath);
  button.setAttribute("aria-selected", String(snapshot.selectedPaths.has(row.entry.relativePath)));
  if (snapshot.activePath === row.entry.relativePath) button.setAttribute("aria-current", "page");
  else button.removeAttribute("aria-current");
  if (row.entry.kind === "directory" && row.hasChildren) {
    button.setAttribute("aria-expanded", String(row.expanded));
  } else button.removeAttribute("aria-expanded");
  button.tabIndex = snapshot.selectedPath === row.entry.relativePath ? 0 : -1;
  const guides = button.children[0] as HTMLElement;
  const disclosure = button.children[1] as HTMLElement;
  const icon = button.children[2] as HTMLElement;
  const name = button.children[3] as HTMLElement;
  while (guides.childElementCount > row.depth) guides.lastElementChild?.remove();
  while (guides.childElementCount < row.depth) guides.append(document.createElement("span"));
  const marker = row.hasChildren ? (row.expanded ? "▾" : "›") : "";
  if (disclosure.textContent !== marker) disclosure.textContent = marker;
  icon.className = `zd-file-tree-icon codicon ${categoryIconClass(row.entry.category)}`;
  icon.dataset.icon = row.entry.category;
  icon.title = categoryLabel(row.entry.category);
  if (name.textContent !== row.entry.name) name.textContent = row.entry.name;
  button.onclick = (event) => {
    activateFileTreeEntry(row.entry, controller, event);
  };
}
