import type { WorkspaceFile } from "@/platform";

interface Directory {
  name: string;
  directories: Map<string, Directory>;
  files: WorkspaceFile[];
}

export interface FileTree {
  buttons: Map<string, HTMLButtonElement>;
  element: HTMLUListElement;
  unmount(): void;
}

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function parts(path: string): string[] {
  return path.split(/[\\/]/).filter(Boolean);
}

function directory(name: string): Directory {
  return { name, directories: new Map(), files: [] };
}

function hierarchy(files: WorkspaceFile[]): Directory {
  const root = directory("");
  for (const file of files) {
    const path = parts(file.relative);
    let parent = root;
    for (const name of path.slice(0, -1)) {
      let child = parent.directories.get(name);
      if (!child) {
        child = directory(name);
        parent.directories.set(name, child);
      }
      parent = child;
    }
    parent.files.push(file);
  }
  return root;
}

function fileName(file: WorkspaceFile): string {
  return parts(file.relative).at(-1) ?? file.relative;
}

function setFolderTree(folder: HTMLButtonElement, group: HTMLElement, expanded: boolean): void {
  folder.setAttribute("aria-expanded", String(expanded));
  group.hidden = !expanded;
  for (const descendant of group.querySelectorAll<HTMLButtonElement>(".md-workspace-folder")) {
    descendant.setAttribute("aria-expanded", String(expanded));
    const children = descendant.nextElementSibling;
    if (children instanceof HTMLElement) children.hidden = !expanded;
  }
}

/** Render an explicit, collapsible directory hierarchy from workspace-relative paths. */
export function buildFileTree(
  files: WorkspaceFile[],
  open: (file: WorkspaceFile) => void,
): FileTree {
  const buttons = new Map<string, HTMLButtonElement>();
  let menu: HTMLDivElement | null = null;
  let dismissMenu: ((event: PointerEvent) => void) | null = null;

  const closeMenu = () => {
    menu?.remove();
    menu = null;
    if (dismissMenu) window.removeEventListener("pointerdown", dismissMenu, true);
    dismissMenu = null;
  };

  const openMenu = (event: MouseEvent, folder: HTMLButtonElement, group: HTMLUListElement) => {
    event.preventDefault();
    event.stopPropagation();
    closeMenu();

    const contextMenu = document.createElement("div");
    contextMenu.className = "md-file-tree-menu";
    contextMenu.setAttribute("role", "menu");
    contextMenu.setAttribute("aria-label", `Folder actions for ${folder.textContent}`);
    const box = folder.getBoundingClientRect();
    contextMenu.style.setProperty("--md-file-menu-left", `${event.clientX || box.left}px`);
    contextMenu.style.setProperty("--md-file-menu-top", `${event.clientY || box.bottom}px`);

    const expand = document.createElement("button");
    expand.type = "button";
    expand.textContent = "Expand all";
    expand.dataset.action = "expand";
    expand.setAttribute("role", "menuitem");
    expand.addEventListener("click", () => {
      setFolderTree(folder, group, true);
      closeMenu();
      folder.focus();
    });

    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.textContent = "Collapse all";
    collapse.dataset.action = "collapse";
    collapse.setAttribute("role", "menuitem");
    collapse.addEventListener("click", () => {
      setFolderTree(folder, group, false);
      closeMenu();
      folder.focus();
    });

    contextMenu.addEventListener("keydown", (keyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      closeMenu();
      folder.focus();
    });
    contextMenu.append(expand, collapse);
    document.body.append(contextMenu);
    menu = contextMenu;
    dismissMenu = (pointerEvent) => {
      if (!contextMenu.contains(pointerEvent.target as Node)) closeMenu();
    };
    window.addEventListener("pointerdown", dismissMenu, true);
    expand.focus();
  };

  const renderDirectory = (node: Directory, root = false): HTMLUListElement => {
    const list = document.createElement("ul");
    list.className = root ? "md-workspace-tree" : "md-workspace-group";
    list.setAttribute("role", root ? "tree" : "group");

    const children: Array<{ name: string; directory?: Directory; file?: WorkspaceFile }> = [
      ...[...node.directories.values()]
        .map((child) => ({ name: child.name, directory: child }))
        .sort((left, right) => compareNames(left.name, right.name)),
      ...node.files
        .map((file) => ({ name: fileName(file), file }))
        .sort((left, right) => compareNames(left.name, right.name)),
    ];

    for (const child of children) {
      const item = document.createElement("li");
      item.setAttribute("role", "none");

      if (child.directory) {
        const button = document.createElement("button");
        button.className = "md-workspace-folder";
        button.type = "button";
        button.textContent = child.name;
        button.setAttribute("role", "treeitem");
        button.setAttribute("aria-expanded", "false");

        const group = renderDirectory(child.directory);
        group.hidden = true;
        button.addEventListener("contextmenu", (event) => openMenu(event, button, group));
        button.addEventListener("click", () => {
          const expanded = button.getAttribute("aria-expanded") === "true";
          button.setAttribute("aria-expanded", String(!expanded));
          group.hidden = expanded;
        });
        item.append(button, group);
      } else if (child.file) {
        const button = document.createElement("button");
        button.className = "md-workspace-file";
        button.type = "button";
        button.textContent = child.name;
        button.title = child.file.relative;
        button.setAttribute("role", "treeitem");
        button.addEventListener("click", () => open(child.file!));
        buttons.set(child.file.path, button);
        item.append(button);
      }

      list.append(item);
    }

    return list;
  };

  return {
    buttons,
    element: renderDirectory(hierarchy(files), true),
    unmount: closeMenu,
  };
}
