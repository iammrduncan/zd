/** Balanced delimiter behavior for the shared editor owner. */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import type { Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Auto-pairing — feedback, 2026-07-30.
 *
 *   "we need auto pair. so if I type [ or { then it auto creates the other side,
 *    if I highlight text and hit one it auto wraps the text. Need this for back
 *    ticks and quotes etc."
 *
 * The library's `closeBrackets` does both halves, so this file is not a second
 * implementation of it — it is the library plus the one case markdown gets wrong,
 * and the bracket set that markdown declares for itself (see notation.ts).
 *
 * Taking it whole is defensible because of a case it already gets right: it
 * refuses to open a quote when the character before the caret is a word
 * character, so `don't` stays `don't`. In a prose editor that is the keystroke
 * that matters most, and a version written here would have shipped `don''t`
 * before rediscovering the rule.
 */

/**
 * A backtick typed onto the end of a run of backticks stays literal.
 *
 * **Measured, not guessed.** With plain `closeBrackets`, typing ``` ``` ``` on a
 * line mid-document produced four backticks: the first pairs, the second skips
 * over the closer, and the third pairs *again* because the library's
 * `probablyInString` check resolves against a tree where an inline-code run
 * elsewhere in the document makes the position look like open string. On the very
 * last line of a document the same three keystrokes came out correct, which is
 * exactly the kind of position-dependent behaviour that reads as a flake.
 *
 * The consequence is not cosmetic. A fence with a language could not be typed at
 * all — `editor-fence-continuation.spec.ts` has the whole story, and its subject
 * is that an incomplete fence's row must stay on screen while someone types it.
 *
 * The rule is stated in terms of what the writer is doing rather than in terms of
 * fences: a run of backticks is either a fence or a multi-backtick inline
 * delimiter, and in both cases the run is being *built*. A closer inserted into
 * the middle of one is never what was meant.
 *
 * Deliberately silent when `closeBrackets` would skip over a closer it inserted —
 * that is what makes typing `` `x` `` end with one pair rather than three
 * backticks — and silent for a selection, which is the wrap the report asked for.
 * Both are cases where declining and letting the library act is the whole answer,
 * so this handler stays a veto rather than becoming a second pairing engine.
 */
const literalBacktickRun = EditorView.inputHandler.of((view, from, to, insert) => {
  if (insert !== "`" || from !== to) return false;

  const doc = view.state.doc;
  // Next first: a closer waiting to be skipped is the library's case, not ours.
  if (doc.sliceString(from, from + 1) === "`") return false;
  if (doc.sliceString(from - 1, from) !== "`") return false;

  view.dispatch({
    changes: { from, to, insert: "`" },
    selection: { anchor: from + 1 },
    userEvent: "input.type",
    scrollIntoView: true,
  });
  return true;
});

/**
 * Pair brackets, quotes and backticks, and wrap a selection when one is typed.
 *
 * Installed for every document rather than only markdown: a `.ts` file wants
 * bracket pairing more than prose does, and §6.2 says a code file differs only in
 * that it is not treated as markdown. What *is* markdown-specific is which
 * characters pair, and that is language data — notation.ts declares it.
 *
 * The veto goes first so it can decline into `closeBrackets` rather than the other
 * way round; input handlers run in extension order until one claims the input.
 */
export function autoPairing(): Extension {
  return [
    literalBacktickRun,
    closeBrackets(),
    /*
     * Backspace between a pair deletes both. Not optional: the moment a keystroke
     * inserts a character nobody typed, one Backspace has to be able to take it
     * back.
     *
     * After the §6.1 structure keys in editor.ts, though the two cannot collide —
     * `deleteBracketPair` declines unless the caret sits exactly between a matching
     * pair, which is never where a list marker or a quote marker is.
     */
    keymap.of(closeBracketsKeymap),
  ];
}
