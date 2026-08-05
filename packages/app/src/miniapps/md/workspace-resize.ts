interface SidebarBounds {
  max: number;
  min: number;
}

export interface SidebarResizer {
  element: HTMLDivElement;
  sync(): void;
  unmount(): void;
}

function number(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bounds(sidebar: HTMLElement): SidebarBounds {
  const style = getComputedStyle(sidebar);
  return {
    min: number(style.minInlineSize),
    max: number(style.maxInlineSize),
  };
}

/** A full-height pointer and keyboard separator for the bounded sidebar plane. */
export function mountSidebarResizer(sidebar: HTMLElement): SidebarResizer {
  const element = document.createElement("div");
  element.className = "md-workspace-resizer";
  element.tabIndex = 0;
  element.setAttribute("role", "separator");
  element.setAttribute("aria-label", "Resize file tree");
  element.setAttribute("aria-orientation", "vertical");

  let startX = 0;
  let startWidth = 0;

  const setWidth = (width: number) => {
    const range = bounds(sidebar);
    if (range.min === 0 || range.max === 0) return;
    const clamped = Math.min(range.max, Math.max(range.min, width));
    sidebar.style.inlineSize = `${clamped}px`;
    element.setAttribute("aria-valuenow", String(Math.round(clamped)));
  };

  const move = (event: PointerEvent) => setWidth(startWidth + event.clientX - startX);
  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  const start = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    startX = event.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  };

  const keydown = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = number(getComputedStyle(document.documentElement).getPropertyValue("--space-2"));
    const direction = event.key === "ArrowLeft" ? -1 : 1;
    setWidth(sidebar.getBoundingClientRect().width + direction * step);
  };

  element.addEventListener("pointerdown", start);
  element.addEventListener("keydown", keydown);

  return {
    element,
    sync: () => {
      const range = bounds(sidebar);
      element.setAttribute("aria-valuemin", String(Math.round(range.min)));
      element.setAttribute("aria-valuemax", String(Math.round(range.max)));
      element.setAttribute(
        "aria-valuenow",
        String(Math.round(sidebar.getBoundingClientRect().width)),
      );
    },
    unmount: () => {
      stop();
      element.removeEventListener("pointerdown", start);
      element.removeEventListener("keydown", keydown);
      element.remove();
    },
  };
}
