import { chordLabel, commands, register, registerCommandTarget, type Command } from "./shortcuts";

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

/**
 * What an unavailable row says.
 *
 * Words rather than only a shade, because §9 requires state to survive "without
 * colour" and a greyed row with nothing else is exactly "displayed as working"
 * to anyone who cannot see the grey. Prose rather than a badge or a pill, because
 * §7.10 forbids both.
 */
const UNAVAILABLE_NOTE = "not available here";

function row(command: Command): HTMLElement {
  const line = document.createElement("div");
  line.className = "zd-reference-row";
  line.setAttribute("role", "row");

  /*
   * F16, the half the registry cannot keep on its own: "Unavailable commands must
   * be identified honestly rather than displayed as working shortcuts."
   *
   * Read at render time from the same `available()` that `dispatch` reads, so the
   * row and the key can never disagree — the drift F16 describes is exactly what
   * happens when a display and a behaviour each get their own idea of state.
   *
   * Listed, never omitted: a Reference that hides what it cannot run is one you
   * cannot trust to be complete.
   */
  const available = command.available ? command.available() : true;
  line.dataset.available = String(available);
  if (!available) line.setAttribute("aria-disabled", "true");

  const chord = document.createElement("kbd");
  chord.className = "zd-reference-chord";
  chord.setAttribute("role", "cell");
  chord.textContent = command.chord ? chordLabel(command.chord) : "Unassigned";

  const description = document.createElement("span");
  description.className = "zd-reference-description";
  description.setAttribute("role", "cell");
  description.textContent = command.description;

  line.append(chord, description);

  if (!available) {
    const note = document.createElement("span");
    note.className = "zd-reference-note";
    note.textContent = UNAVAILABLE_NOTE;
    description.append(" ", note);
  }

  return line;
}

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
  column.setAttribute("role", "table");
  column.setAttribute("aria-label", "Keyboard shortcuts");
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

  for (const command of commands()) column.append(row(command));
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
