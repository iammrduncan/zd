/** Literal-source state for Markdown buffers. */
import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";

/**
 * Raw mode — vision §6.1, DESIGN.md §7.4.
 *
 * "Raw mode is a toggle, and it is off by default. It reveals the literal source of
 * everything in the renders list — brackets, destinations, pipes, fences, language
 * tags — for when you need to see the file exactly as it is written. Nothing else
 * changes: same calm, same measure, same focus."
 *
 * One flag in the editor's own state, read by every decoration that hides
 * something: link punctuation in notation.ts, the table widget in table.ts, the
 * fence rows in fence.ts. Editor state rather than a DOM attribute or a module
 * variable, for two reasons that both matter here:
 *
 *   - Decorations already recompute from state, so a flag in state recomputes them
 *     for free and in the same transaction. A DOM attribute needs a
 *     MutationObserver and an empty dispatch to fake what this gets by existing.
 *   - It is per document. §7.4 calls it "document-wide", and two windows must be
 *     able to disagree — a module variable would make raw mode global by accident.
 *
 * Deliberately *not* tied to the caret. §7.4: "Notation is never revealed by caret
 * proximity, in either state; the toggle is the only thing that reveals." Editors
 * that reveal syntax under the cursor make the line you are working on the one line
 * that keeps moving, which is the opposite of what §2 asks for.
 */

/** Turn raw mode on or off. */
export const setRaw = StateEffect.define<boolean>();

const rawMode = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setRaw)) return effect.value;
    }
    return value;
  },
});

/**
 * Is the source revealed?
 *
 * Defaults to false when the field is absent rather than throwing. Every decoration
 * in this directory calls it, and a decoration that cannot be built because an
 * extension was left out of one call site would take the whole surface down — a
 * missing raw-mode field should mean "not raw", not "no editor".
 */
export function isRaw(state: EditorState): boolean {
  return state.field(rawMode, false) ?? false;
}

/** Has raw mode changed across this transaction? Decorations rebuild when it has. */
export function rawModeChanged(before: EditorState, after: EditorState): boolean {
  return isRaw(before) !== isRaw(after);
}

/** The raw-mode flag. Must come before any extension that reads it. */
export function rawModeState(): Extension {
  return rawMode;
}
