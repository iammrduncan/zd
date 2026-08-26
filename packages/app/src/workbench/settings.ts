import "./settings.css";

import type { InstrumentationClient } from "@/instrumentation";
import type { AttentionSettingsController } from "./attention";
import { mountAttentionSettings } from "./attention";
import { mountDiagnosticSettings } from "./diagnostics";
import type { Unmount, WorkbenchThemeRuntime } from "./runtime";
import { registerCommandTarget } from "./shortcuts";
import { TransientCoordinator } from "./transients";
import type { WorkbenchStateOwner } from "./state";
import { setTheme, type Theme } from "@/design/appearance";
import { setWordWrap, themePreference } from "./preferences";
import {
  applyWorkbenchSettings,
  saveWorkbenchSettings,
  workbenchSettingsPreferences,
  type WorkbenchSettingsPreferences,
} from "./settings-preferences";
import { SURFACE_THEME_OPTIONS } from "./surface-themes";

function group(title: string): HTMLElement {
  const section = document.createElement("section");
  section.className = "zd-settings-group";
  const heading = document.createElement("h3");
  heading.textContent = title;
  section.append(heading);
  return section;
}

function choices<T extends string>(
  label: string,
  values: readonly (readonly [T, string])[],
  selected: T,
  select: (value: T) => void,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "zd-settings-row";
  const name = document.createElement("span");
  name.textContent = label;
  const controls = document.createElement("span");
  controls.className = "zd-settings-choices";
  controls.setAttribute("role", "radiogroup");
  controls.setAttribute("aria-label", label);
  const buttons = values.map(([value, text]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(value === selected));
    button.textContent = text;
    button.addEventListener("click", () => {
      buttons.forEach((candidate) => candidate.setAttribute("aria-checked", "false"));
      button.setAttribute("aria-checked", "true");
      select(value);
    });
    return button;
  });
  controls.append(...buttons);
  row.append(name, controls);
  return row;
}

function toggle(label: string, enabled: boolean, change: (enabled: boolean) => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "zd-settings-toggle";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", label);
  const render = (next: boolean) => {
    button.setAttribute("aria-checked", String(next));
    button.textContent = next ? "On" : "Off";
  };
  render(enabled);
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-checked") !== "true";
    render(next);
    change(next);
  });
  const row = document.createElement("div");
  row.className = "zd-settings-row";
  const name = document.createElement("span");
  name.textContent = label;
  row.append(name, button);
  return row;
}

function range(
  label: string,
  value: number,
  minimum: number,
  maximum: number,
  step: number,
  format: (value: number) => string,
  change: (value: number) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.className = "zd-settings-row";
  const name = document.createElement("span");
  name.textContent = label;
  const controls = document.createElement("span");
  controls.className = "zd-settings-range";
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(minimum);
  input.max = String(maximum);
  input.step = String(step);
  input.value = String(value);
  input.setAttribute("aria-label", label);
  const output = document.createElement("output");
  output.textContent = format(value);
  input.addEventListener("input", () => {
    const next = Number(input.value);
    output.textContent = format(next);
    change(next);
  });
  controls.append(input, output);
  row.append(name, controls);
  return row;
}

/** Register the workbench's one command-driven transient Settings plane. */
export function mountWorkbenchSettings(
  planeHost: HTMLElement,
  instrumentation: InstrumentationClient,
  revealDiagnostics: () => Promise<void>,
  attention: AttentionSettingsController,
  transients = new TransientCoordinator(),
  state?: WorkbenchStateOwner,
  themes?: WorkbenchThemeRuntime,
): Unmount {
  let plane: HTMLElement | null = null;
  let stopControls: Unmount = () => {};
  let returnFocus: HTMLElement | null = null;

  const close = (restoreFocus = true): boolean => {
    if (!plane) return false;
    stopControls();
    stopControls = () => {};
    plane.remove();
    plane = null;
    transients.closed("settings");
    if (restoreFocus && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    returnFocus = null;
    return true;
  };

  const open = (): boolean => {
    if (plane) return true;
    if (!transients.open("settings", "ordinary", close)) return false;
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
    dismiss.addEventListener("click", () => close());
    header.append(title, dismiss);
    column.append(header);
    nextPlane.append(column);
    planeHost.append(nextPlane);
    plane = nextPlane;

    let preferences = workbenchSettingsPreferences();
    const problem = document.createElement("p");
    problem.className = "zd-settings-problem";
    problem.setAttribute("role", "status");
    problem.hidden = true;
    const commit = (next: WorkbenchSettingsPreferences) => {
      preferences = next;
      const storageProblem = saveWorkbenchSettings(next);
      setWordWrap(next.reading.wordWrap);
      applyWorkbenchSettings(next, state);
      problem.textContent = storageProblem ?? "";
      problem.hidden = storageProblem === null;
    };

    const appearance = group("Appearance");
    const selectedTheme = themes?.globalSelection() ?? themePreference().selected;
    const themeChoices =
      themes?.choices.map(({ id, name }) => [id, name] as const) ??
      ([
        ["system", "System"],
        ["light", "Light"],
        ["dark", "Dark"],
        ["dracula", "Dracula"],
        ["homebrew", "Homebrew"],
      ] as const);
    appearance.append(
      choices(
        "Theme",
        themeChoices,
        themes ? selectedTheme : selectedTheme === "current-light" ? "light" : selectedTheme,
        (selected) => {
          if (themes) themes.setGlobalSelection(selected);
          else setTheme(selected as Theme);
        },
      ),
      range(
        "Warmth",
        preferences.appearance.warmth,
        0,
        1,
        0.05,
        (value) => `${Math.round(value * 100)}%`,
        (warmth) => commit({ ...preferences, appearance: { ...preferences.appearance, warmth } }),
      ),
      range(
        "Prose size",
        preferences.appearance.proseSize,
        14,
        28,
        1,
        (value) => `${value}px`,
        (proseSize) =>
          commit({ ...preferences, appearance: { ...preferences.appearance, proseSize } }),
      ),
      range(
        "Code size",
        preferences.appearance.codeSize,
        12,
        24,
        1,
        (value) => `${value}px`,
        (codeSize) =>
          commit({ ...preferences, appearance: { ...preferences.appearance, codeSize } }),
      ),
      range(
        "Heading scale",
        preferences.appearance.headingScale,
        0.85,
        1.25,
        0.05,
        (value) => `${Math.round(value * 100)}%`,
        (headingScale) =>
          commit({ ...preferences, appearance: { ...preferences.appearance, headingScale } }),
      ),
    );
    if (themes) {
      const surfaceChoices = [
        ["workbench", "Workbench"],
        ...themes.choices
          .filter(({ id }) => id !== "system")
          .map(({ id, name }) => [id, name] as const),
      ] as const;
      for (const surface of SURFACE_THEME_OPTIONS) {
        appearance.append(
          choices(
            `${surface.label} theme`,
            surfaceChoices,
            themes.surfaceSelection(surface.id),
            (selected) => themes.setSurfaceSelection(surface.id, selected),
          ),
        );
      }
    }

    const reading = group("Reading");
    reading.append(
      toggle("Focus", preferences.reading.focus, (focus) =>
        commit({ ...preferences, reading: { ...preferences.reading, focus } }),
      ),
      range(
        "Dim level",
        preferences.reading.focusDim,
        0,
        1,
        0.05,
        (value) => `${Math.round(value * 100)}%`,
        (focusDim) => commit({ ...preferences, reading: { ...preferences.reading, focusDim } }),
      ),
      choices(
        "Granularity",
        [
          ["line", "Line"],
          ["paragraph", "Paragraph"],
          ["section", "Section"],
        ] as const,
        preferences.reading.granularity,
        (granularity) =>
          commit({ ...preferences, reading: { ...preferences.reading, granularity } }),
      ),
      toggle("Markdown Code Mode", preferences.reading.markdownCodeMode, (markdownCodeMode) =>
        commit({ ...preferences, reading: { ...preferences.reading, markdownCodeMode } }),
      ),
      toggle("Typewriter", preferences.reading.typewriter, (typewriter) =>
        commit({ ...preferences, reading: { ...preferences.reading, typewriter } }),
      ),
      toggle("Word Wrap", preferences.reading.wordWrap, (wordWrap) =>
        commit({ ...preferences, reading: { ...preferences.reading, wordWrap } }),
      ),
    );

    const workbench = group("Workbench");
    workbench.append(
      choices(
        "Projects",
        [
          ["full", "Full"],
          ["collapsed", "Collapsed"],
          ["hidden", "Hidden"],
        ] as const,
        preferences.workbench.threadsVisibility,
        (threadsVisibility) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, threadsVisibility } }),
      ),
      choices(
        "Files",
        [
          ["visible", "Visible"],
          ["hidden", "Hidden"],
        ] as const,
        preferences.workbench.filesVisibility,
        (filesVisibility) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, filesVisibility } }),
      ),
      choices(
        "Centre",
        [
          ["overlap", "Overlap"],
          ["side-by-side", "Side by side"],
        ] as const,
        preferences.workbench.centreMode,
        (centreMode) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, centreMode } }),
      ),
      range(
        "Projects width",
        preferences.workbench.threadsWidth,
        184,
        300,
        8,
        (value) => `${value}px`,
        (threadsWidth) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, threadsWidth } }),
      ),
      range(
        "Files width",
        preferences.workbench.filesWidth,
        220,
        360,
        8,
        (value) => `${value}px`,
        (filesWidth) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, filesWidth } }),
      ),
      range(
        "Centre split",
        preferences.workbench.centreSplit,
        0.3,
        0.7,
        0.02,
        (value) => `${Math.round(value * 100)}%`,
        (centreSplit) =>
          commit({ ...preferences, workbench: { ...preferences.workbench, centreSplit } }),
      ),
    );

    column.append(appearance, reading, workbench);
    const stopAttention = mountAttentionSettings(column, attention);
    const stopDiagnostics = mountDiagnosticSettings(column, instrumentation, revealDiagnostics);
    column.append(problem);
    stopControls = () => {
      stopDiagnostics();
      stopAttention();
    };
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
  return () => {
    close();
    stopToggleCommand();
  };
}
