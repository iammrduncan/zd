import { renderMermaidDiagram } from "./render";

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;
const SCALE_STEP = 0.25;

function control(label: string, text: string, run: () => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.textContent = text;
  button.addEventListener("click", run);
  return button;
}

/** Open one inert Mermaid SVG in a modal full-window zoom and pan surface. */
export function openMermaidViewer(source: string): void {
  const diagram = renderMermaidDiagram(source);
  if (!diagram) return;

  const dialog = document.createElement("dialog");
  dialog.className = "md-mermaid-viewer";
  dialog.setAttribute("aria-label", "Expanded Mermaid diagram");

  const viewport = document.createElement("div");
  viewport.className = "md-mermaid-viewer-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("aria-label", "Diagram viewport; scroll to zoom and drag to pan");
  viewport.append(diagram);

  let scale = 1;
  let x = 0;
  let y = 0;
  const renderTransform = () => {
    diagram.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  const setScale = (next: number) => {
    scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
    renderTransform();
  };
  const reset = () => {
    scale = 1;
    x = 0;
    y = 0;
    renderTransform();
  };
  const close = () => dialog.close();

  const controls = document.createElement("div");
  controls.className = "md-mermaid-viewer-controls";
  controls.append(
    control("Zoom out", "−", () => setScale(scale - SCALE_STEP)),
    control("Reset diagram view", "100%", reset),
    control("Zoom in", "+", () => setScale(scale + SCALE_STEP)),
    control("Close expanded Mermaid diagram", "×", close),
  );

  let drag: { pointerId: number; x: number; y: number } | null = null;
  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
    viewport.dataset.dragging = "true";
  });
  viewport.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    x += event.clientX - drag.x;
    y += event.clientY - drag.y;
    drag = { pointerId: drag.pointerId, x: event.clientX, y: event.clientY };
    renderTransform();
  });
  const stopDrag = (event: PointerEvent) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    delete viewport.dataset.dragging;
  };
  viewport.addEventListener("pointerup", stopDrag);
  viewport.addEventListener("pointercancel", stopDrag);
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      setScale(scale + (event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP));
    },
    { passive: false },
  );

  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  dialog.append(viewport, controls);
  document.body.append(dialog);
  dialog.showModal();
  viewport.focus();
}
