export interface ContextMenuOptions {
  readonly host: HTMLElement;
  readonly menu: HTMLElement;
  readonly anchor: HTMLElement;
  readonly inlineStart: number;
  readonly blockStart: number;
  readonly initialFocus?: HTMLElement | null;
}

interface OpenMenu {
  readonly menu: HTMLElement;
  readonly anchor: HTMLElement;
  readonly dismissPointer: (event: PointerEvent) => void;
  readonly dismissKeyboard: (event: KeyboardEvent) => void;
}

let openMenu: OpenMenu | null = null;

export function closeContextMenu(menu?: HTMLElement, restoreFocus = false): boolean {
  if (!openMenu || (menu && openMenu.menu !== menu)) return false;
  const current = openMenu;
  openMenu = null;
  current.anchor.removeAttribute("aria-controls");
  document.removeEventListener("pointerdown", current.dismissPointer);
  document.removeEventListener("keydown", current.dismissKeyboard);
  current.menu.remove();
  if (restoreFocus && current.anchor.isConnected) current.anchor.focus({ preventScroll: true });
  return true;
}

/** Place and coordinate one small contextual menu across workbench features. */
export function openContextMenu(options: ContextMenuOptions): () => void {
  closeContextMenu();
  const { host, menu, anchor } = options;
  host.append(menu);
  const bounds = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(0, Math.min(options.inlineStart, window.innerWidth - bounds.width))}px`;
  menu.style.top = `${Math.max(0, Math.min(options.blockStart, window.innerHeight - bounds.height))}px`;
  if (menu.id) anchor.setAttribute("aria-controls", menu.id);

  const dismissPointer = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) closeContextMenu(menu);
  };
  const dismissKeyboard = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    closeContextMenu(menu, true);
  };
  menu.addEventListener("keydown", (event) => {
    const items = [
      ...menu.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]',
      ),
    ].filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true");
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next === null) return;
    event.preventDefault();
    items[next]?.focus();
  });
  document.addEventListener("pointerdown", dismissPointer);
  document.addEventListener("keydown", dismissKeyboard);
  openMenu = { menu, anchor, dismissPointer, dismissKeyboard };
  (options.initialFocus ?? menu.querySelector<HTMLElement>('[role^="menuitem"]'))?.focus();
  return () => closeContextMenu(menu);
}
