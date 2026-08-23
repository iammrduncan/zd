import "./settings.css";

import type { InstrumentationClient } from "@/instrumentation";
import type { AttentionSettingsController } from "./attention";
import { mountDiagnosticSettings } from "./diagnostics";
import type { Unmount } from "./runtime";
import { registerCommandTarget } from "./shortcuts";

/** Register the workbench's one command-driven transient Settings plane. */
export function mountWorkbenchSettings(
  planeHost: HTMLElement,
  instrumentation: InstrumentationClient,
  revealDiagnostics: () => Promise<void>,
  attention: AttentionSettingsController,
): Unmount {
  let plane: HTMLElement | null = null;
  let stopControls: Unmount = () => {};
  let returnFocus: HTMLElement | null = null;

  const close = (): boolean => {
    if (!plane) return false;
    stopControls();
    stopControls = () => {};
    plane.remove();
    plane = null;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    return true;
  };

  const open = (): boolean => {
    if (plane) return true;
    returnFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : planeHost;

    const nextPlane = document.createElement("section");
    nextPlane.id = "zd-workbench-settings";
    nextPlane.className = "zd-settings-plane";
    nextPlane.dataset.workbenchSettings = "true";
    nextPlane.setAttribute("role", "dialog");
    nextPlane.setAttribute("aria-modal", "true");
    nextPlane.setAttribute("aria-labelledby", "zd-workbench-settings-title");

    const column = document.createElement("div");
    column.className = "zd-settings-column";
    const header = document.createElement("header");
    header.className = "zd-settings-header";
    const title = document.createElement("h2");
    title.id = "zd-workbench-settings-title";
    title.textContent = "Settings";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "zd-settings-dismiss";
    dismiss.setAttribute("aria-label", "Close Settings");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", close);
    header.append(title, dismiss);
    column.append(header);
    nextPlane.append(column);
    planeHost.append(nextPlane);
    plane = nextPlane;

    const stopDiagnostics = mountDiagnosticSettings(
      column,
      instrumentation,
      revealDiagnostics,
      attention,
    );
    stopControls = stopDiagnostics;
    const diagnosticSettings = column.querySelector<HTMLDetailsElement>(
      "[data-diagnostic-settings]",
    );
    if (diagnosticSettings) {
      diagnosticSettings.open = true;
      const summary = diagnosticSettings.querySelector("summary");
      if (summary) summary.hidden = true;
    }
    dismiss.focus();
    return true;
  };

  const stopToggleCommand = registerCommandTarget({
    id: "workbench.settings.toggle",
    commandId: "settings.open",
    priority: 100,
    available: () => true,
    run: () => (plane ? close() : open()),
  });
  const stopDismissCommand = registerCommandTarget({
    id: "workbench.settings.dismiss",
    commandId: "workbench.escape",
    priority: 400,
    available: () => plane !== null,
    run: close,
  });

  return () => {
    close();
    stopDismissCommand();
    stopToggleCommand();
  };
}
