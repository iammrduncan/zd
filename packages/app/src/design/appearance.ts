import { ThemeController, loadThemeCatalog } from "./themes";

/** Transitional appearance controls used by design fixtures and Settings work. */

export type Theme = "system" | "light" | "dark" | "dracula";

const APPLYING_COLOUR_SETTING = "data-applying-colour-setting";
const BUILT_INS = loadThemeCatalog([]);
let fixtureController: ThemeController | null = null;

interface ThemeSelectionRegistration {
  readonly apply: (selected: string) => void;
}

let selectionOwner: ThemeSelectionRegistration | null = null;

/** Route appearance requests through the workbench's one state and theme owner. */
export function registerThemeSelectionOwner(apply: (selected: string) => void): () => void {
  const registration = { apply };
  selectionOwner = registration;
  return () => {
    if (selectionOwner === registration) selectionOwner = null;
  };
}

/**
 * Apply a colour setting without borrowing Focus Mode's outgoing transition.
 *
 * DESIGN.md reserves the 120ms token for a focus target becoming context. A
 * theme or Dim Level change updates context colours too, so the root carries a
 * one-frame state that makes that particular update immediate.
 */
function applyColourSetting(change: (root: HTMLElement) => void): void {
  const root = document.documentElement;
  root.setAttribute(APPLYING_COLOUR_SETTING, "");
  change(root);

  requestAnimationFrame(() => {
    root.removeAttribute(APPLYING_COLOUR_SETTING);
  });
}

/** Use an explicit palette, or return to following the operating system. */
export function setTheme(theme: Theme): void {
  applyColourSetting((root) => {
    const selected = theme === "light" ? "current-light" : theme;
    if (selectionOwner) {
      selectionOwner.apply(selected);
      return;
    }

    fixtureController?.dispose();
    fixtureController = new ThemeController(root, BUILT_INS, {
      selected,
      lastValid: theme === "dark" ? "dark" : "current-light",
    });
  });
}

/** Set Dim Level on its documented continuous 0..1 range. */
export function setFocusDim(amount: number): void {
  if (!Number.isFinite(amount)) return;
  const clamped = Math.min(1, Math.max(0, amount));

  applyColourSetting((root) => {
    root.style.setProperty("--focus-dim", String(clamped));
  });
}
