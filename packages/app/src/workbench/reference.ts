import { mountShortcutSettings } from "./shortcut-settings";
import { register, registerCommandTarget } from "./shortcuts";

/**
 * The Shortcut Reference — vision §7.1, DESIGN.md §7.8, finding F02.
 *
 * F02 in full: "Pressing `cmd+.` makes the entire window go blank and shows no
 * shortcuts. `cmd+.` must show the complete Shortcut Reference over the current
 * context, and pressing it again must restore that context unchanged."
 *
 * Both halves of that failure are structural, so both are designed against here:
 *
 * 1. The sheet is *added over* the content, never swapped for it. Nothing hides,
 *    unmounts, or re-renders the document — §6.2: "The plane covers the content
 *    region so prose or Sidebar fragments never peek around or below it; the
 *    Document state beneath is unchanged." A window that goes blank is one that
 *    replaced its own content and had nothing to put back.
 * 2. It renders `commands()` and holds no list of its own. §7.1: "There is one
 *    shortcut registry. The Reference renders it; it is not a hand-maintained
 *    list that drifts from reality."
 *
 * Workbench-owned: feature surfaces do not maintain or render a competing list.
 */

const SHEET = "zd-reference";

/** The open sheet, or null. §6.2 allows exactly one transient at a time. */
let sheet: HTMLElement | null = null;
let stopSheet: () => void = () => {};

/** Is the Reference on screen? */
export function isReferenceOpen(): boolean {
  return sheet !== null;
}

/**
 * Put the Reference on screen over `host`.
 *
 * Built fresh each time rather than kept hidden, so what it lists is whatever the
 * registry holds right now — a sheet cached at boot would be the drifting list
 * §7.1 forbids, just with extra steps.
 */
export function openReference(host: HTMLElement): void {
  if (sheet) return;

  const plane = document.createElement("section");
  plane.className = SHEET;
  // Named for what it is, so the surface beneath keeps its own semantics — the
  // document is still the document while this is up.
  plane.setAttribute("role", "dialog");
  plane.setAttribute("aria-label", "Shortcut Reference");

  const column = document.createElement("div");
  column.className = "zd-reference-column";
  plane.append(column);

  /*
   * Open *before* the rows are built, and this ordering is load-bearing.
   *
   * Every row asks its command whether it is available, and `transient.dismiss`
   * answers with `isReferenceOpen`. Building the rows first meant the sheet
   * listed its own Escape as unavailable at the exact moment Escape worked —
   * which is F16's lie told backwards, and precisely what this file exists to
   * prevent. The state a row reports has to be the state the key is in.
   */
  sheet = plane;
  host.append(plane);
  stopSheet = mountShortcutSettings(column, { heading: false, reference: true });
}

/**
 * Take it away.
 *
 * Removing the sheet is the whole of "restore that context unchanged": the
 * document was never touched, so there is nothing to restore — which is the
 * point. Nothing here re-renders, re-scrolls, or re-focuses anything, because
 * doing so is how a round trip starts losing state.
 */
export function closeReference(): void {
  stopSheet();
  stopSheet = () => {};
  sheet?.remove();
  sheet = null;
}

/**
 * Register the Reference's command and semantic Escape target.
 *
 * `cmd+.` is a persistent toggle: a complete press opens the table and the next
 * complete press closes it. Its `release` callback only rearms the toggle after
 * keyup. That small latch matters because a held key auto-repeats keydown events;
 * without it one physical press would flicker the table open and closed.
 *
 * Escape is routed through the workbench's one semantic command. A high-priority
 * target dismisses this top transient before Find, a caret, or another underlying
 * mode can consume the same press.
 */
export function registerReference(host: HTMLElement): () => void {
  let shortcutDown = false;
  const remove = register({
    id: "help.shortcuts",
    chord: { key: ".", mod: true },
    description: "Open or close the Shortcut Reference",
    run: () => {
      if (shortcutDown) return true;
      shortcutDown = true;
      if (isReferenceOpen()) closeReference();
      else openReference(host);
      return true;
    },
    release: () => {
      shortcutDown = false;
    },
  });
  const removeDismiss = registerCommandTarget({
    id: "shortcut-reference.dismiss",
    commandId: "workbench.escape",
    priority: 1_000,
    available: isReferenceOpen,
    run: () => {
      if (!isReferenceOpen()) return false;
      closeReference();
      return true;
    },
  });

  return () => {
    closeReference();
    removeDismiss();
    remove();
  };
}
