import { chordLabel, commands, register, type Command } from "./shortcuts";

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
 * Suite-owned: a mini app never cooperates with this and does not know it exists.
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
  chord.textContent = chordLabel(command.chord);

  const description = document.createElement("span");
  description.className = "zd-reference-description";
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
 * Register the Reference's own command. Returns the removal function.
 *
 * One command, held rather than toggled: the sheet is on screen for exactly as
 * long as `cmd+.` is down. That is the 2026-07-30 decision — "when releasing
 * cmd+. should just close it. esc should be set to unfocus the editor" — and it
 * changes §7.1's "pressing it again restores that context" into letting go, which
 * is the same round trip reached a different way. F02's real requirement is that
 * the context comes back untouched, and that is unaffected.
 *
 * There *was* a second command: `transient.dismiss`, Escape, available only while
 * the sheet was up. It is gone, and not merely unbound. Held means the sheet cannot
 * still be there by the time a separate key could be pressed, so that command could
 * never run — and §7.1 forbids listing a binding that cannot run. Escape belongs to
 * the editor now, which is the whole point of taking this task first.
 *
 * `run` only opens. It used to toggle, which a held chord makes wrong twice over: a
 * held key auto-repeats, so a toggle would flicker the sheet many times a second,
 * and the close is `release`'s job.
 */
export function registerReference(host: HTMLElement): () => void {
  const remove = register({
    id: "help.shortcuts",
    chord: { key: ".", mod: true },
    description: "Show the Shortcut Reference while held",
    run: () => {
      openReference(host);
      return true;
    },
    release: closeReference,
  });

  return () => {
    closeReference();
    remove();
  };
}
