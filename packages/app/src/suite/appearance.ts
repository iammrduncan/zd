/** Appearance settings shared by every mini app in the suite. */

export type Theme = "system" | "light" | "dark";

const APPLYING_COLOUR_SETTING = "data-applying-colour-setting";

/**
 * Apply a colour setting without borrowing Focus Mode's outgoing transition.
 *
 * DESIGN.md §6.3 reserves the suite's 120ms token for a focus target becoming
 * context. A theme or Dim Level change updates context colours too, so the root
 * carries a one-frame state that makes that particular update immediate. It is
 * removed on the next frame, restoring the transition before focus moves again.
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
    if (theme === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
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
