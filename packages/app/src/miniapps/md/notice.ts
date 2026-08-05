/**
 * A sentence on the document plane — DESIGN.md §7.10 and §7.3.
 *
 * §7.10: a notice is "a sentence on the canvas, never a toast, modal, banner,
 * badge, or reserved status area". So there is no background, border, icon, or
 * control here and there must never be one — what makes this a notice rather than
 * chrome is that it is simply text, in the measure, where the document is.
 *
 * Two lifetimes, one appearance:
 *
 *   - The **status strip** (status.ts) exists only after its command and leaves
 *     after ten seconds. Right for a word count, right for "the file was
 *     reloaded".
 *   - The **persistent notice** below stays until the condition that raised it
 *     clears. §7.3 defines it for the vanished-file case: "retain the last
 *     rendered content and place one persistent document-local notice line above
 *     it… It withdraws when the path reappears and never carries a button."
 *
 * Audit finding M3 is what happens when only the first exists. The three §6.3
 * messages whose entire job is to prevent loss — a refused save, a failed write, a
 * file changed underneath — all rode the ten-second strip: "look away for ten
 * seconds and the only evidence of a refused save is gone." A warning that expires
 * on its own is not evidence.
 *
 * The two are told apart by an attribute rather than by a second class, because
 * they differ in *when they leave*, not in what they look like. A notice that
 * looked different depending on how long it stayed would be inventing a severity
 * language §2 does not have.
 */

/** How the persistent one is found. Exported so a test names the product's selector. */
export const PERSISTENT_NOTICE = '.md-notice[data-notice="persistent"]';

/** One calm sentence on the canvas. Never a toast, banner, dialog, or badge. */
export function documentNotice(text: string): HTMLElement {
  const node = document.createElement("p");
  node.className = "md-notice";
  node.textContent = text;
  return node;
}

/**
 * Say one thing above the document, and keep saying it until told otherwise.
 *
 * `column` is the document's measure column, so the line
 * takes the reading measure and sits where the eye already is, rather than at the
 * top of a scroll extent the reader would have to go back for. §7.3 asks for it
 * "above" the content, and inside the column above the first line is the most
 * literal reading of that: the leading gutter is still above it, and the document
 * still opens on the anchor.
 *
 * Replaces rather than appends. §7.3 says *one* line and §7.10 forbids stacked
 * toasts — and two of these conditions really can hold at once, since a file can
 * vanish while a save is being refused. The newer message is the truer one.
 */
export function persistentNotice(column: HTMLElement, message: string): void {
  const existing = column.querySelector<HTMLElement>(PERSISTENT_NOTICE);
  if (existing) {
    existing.textContent = message;
    return;
  }

  const line = documentNotice(message);
  line.dataset.notice = "persistent";
  column.prepend(line);
}

/**
 * Take it away, because the condition it described has ended.
 *
 * A no-op when there is nothing there, deliberately: every caller clears on its
 * good path — a save that worked, a file that came back — and none of them should
 * have to find out whether something had gone wrong first. That is the same
 * "define errors out of existence" the delete-that-succeeds-on-nothing case is.
 */
export function clearPersistentNotice(column: HTMLElement): void {
  column.querySelector(PERSISTENT_NOTICE)?.remove();
}
