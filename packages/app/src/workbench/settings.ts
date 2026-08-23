import "./settings.css";

import type { InstrumentationClient } from "@/instrumentation";
import type { AttentionSettingsController } from "./attention";
import { mountDiagnosticSettings } from "./diagnostics";
import type { Unmount } from "./runtime";
import { registerCommandTarget } from "./shortcuts";

/** Mount the quiet entry point for the workbench's one transient Settings plane. */
export function mountWorkbenchSettings(
  navigationHost: HTMLElement,
  planeHost: HTMLElement,
  instrumentation: InstrumentationClient,
  revealDiagnostics: () => Promise<void>,
  attention: AttentionSettingsController,
): Unmount {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "zd-workbench-settings-trigger";
  trigger.dataset.settingsTrigger = "true";
  trigger.setAttribute("aria-label", "Open Settings");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "zd-workbench-settings");
  trigger.textContent = "Settings";
  navigationHost.append(trigger);

  let plane: HTMLElement | null = null;
  let stopControls: Unmount = () => {};
  let returnFocus: HTMLElement | null = null;

  const close = (): boolean => {
    if (!plane) return false;
    stopControls();
    stopControls = () => {};
    plane.remove();
    plane = null;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    return true;
  };

  const open = (): boolean => {
    if (plane) return true;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : trigger;

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

    stopControls = mountDiagnosticSettings(column, instrumentation, revealDiagnostics, attention);
    const diagnosticSettings = column.querySelector<HTMLDetailsElement>(
      "[data-diagnostic-settings]",
    );
    if (diagnosticSettings) {
      diagnosticSettings.open = true;
      const summary = diagnosticSettings.querySelector("summary");
      if (summary) summary.hidden = true;
    }
    trigger.setAttribute("aria-expanded", "true");
    dismiss.focus();
    return true;
  };

  const onTrigger = () => open();
  trigger.addEventListener("click", onTrigger);
  const stopOpenCommand = registerCommandTarget({
    id: "workbench.settings.open",
    commandId: "settings.open",
    priority: 100,
    available: () => plane === null,
    run: open,
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
    stopOpenCommand();
    trigger.removeEventListener("click", onTrigger);
    trigger.remove();
  };
}
