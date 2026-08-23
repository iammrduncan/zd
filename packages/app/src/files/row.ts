import { categoryIconClass, categoryLabel, fileTreeEntryLabel } from "./labels";
import type { FileTreeController } from "./controller";
import type { FileTreeViewSnapshot, VisibleFileTreeRow } from "./types";

function gitStateClass(row: VisibleFileTreeRow): string | null {
  const state = row.entry.gitState;
  if (!state) return null;
  if (state === "added" || state === "untracked") return "added";
  if (state === "deleted") return "deleted";
  if (state === "ignored") return "ignored";
  return "changed";
}

export function createFileTreeRow(
  row: VisibleFileTreeRow,
  snapshot: FileTreeViewSnapshot,
  controller: FileTreeController,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zd-file-tree-row";
  button.dataset.filePath = row.entry.relativePath;
  button.dataset.fileKind = row.entry.kind;
  button.dataset.fileCategory = row.entry.category;
  const dirty = snapshot.dirtyPaths.has(row.entry.relativePath);
  button.dataset.dirty = String(dirty);
  const stateClass = gitStateClass(row);
  if (stateClass) button.dataset.gitState = stateClass;
  button.setAttribute("role", "treeitem");
  button.setAttribute("aria-level", String(row.depth + 1));
  button.setAttribute("aria-posinset", String(row.positionInSet));
  button.setAttribute("aria-setsize", String(row.setSize));
  button.setAttribute("aria-label", fileTreeEntryLabel(row.entry, dirty));
  button.setAttribute("aria-description", row.entry.relativePath);
  button.setAttribute("aria-selected", String(snapshot.selectedPath === row.entry.relativePath));
  button.setAttribute("aria-haspopup", "menu");
  if (snapshot.activePath === row.entry.relativePath) button.setAttribute("aria-current", "page");
  if (row.entry.kind === "directory" && row.hasChildren) {
    button.setAttribute("aria-expanded", String(row.expanded));
  }
  button.tabIndex = snapshot.selectedPath === row.entry.relativePath ? 0 : -1;

  const guides = document.createElement("span");
  guides.className = "zd-file-tree-guides";
  guides.setAttribute("aria-hidden", "true");
  for (let depth = 0; depth < row.depth; depth += 1) guides.append(document.createElement("span"));
  const disclosure = document.createElement("span");
  disclosure.className = "zd-file-tree-disclosure";
  disclosure.setAttribute("aria-hidden", "true");
  disclosure.textContent = row.hasChildren ? (row.expanded ? "▾" : "›") : "";
  const icon = document.createElement("span");
  icon.className = `zd-file-tree-icon codicon ${categoryIconClass(row.entry.category)}`;
  icon.dataset.icon = row.entry.category;
  icon.setAttribute("aria-hidden", "true");
  icon.title = categoryLabel(row.entry.category);
  const name = document.createElement("span");
  name.className = "zd-file-tree-name";
  name.textContent = row.entry.name;
  button.append(guides, disclosure, icon, name);
  button.addEventListener("click", () => {
    controller.select(row.entry.relativePath);
    if (row.entry.kind === "directory") {
      controller.toggle(row.entry.relativePath);
      return;
    }
    void controller.activateSelected();
  });
  return button;
}
