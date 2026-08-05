import {
  cursorLineBoundaryBackward,
  cursorLineBoundaryForward,
  selectLineBoundaryBackward,
  selectLineBoundaryForward,
} from "@codemirror/commands";
import type { Extension } from "@codemirror/state";
import { keymap, type Command, type EditorView } from "@codemirror/view";

import { granularityOf, scrollBlockToAnchor } from "./focus";
import { blockRange, sectionRange } from "./focus-range";
import { isTypewriter } from "./typewriter";

/**
 * Cursor motion that settles — vision §6.1.
 *
 * "cmd+left-arrow and cmd+right-arrow is buggy" (feedback, 2026-07-30), and measuring
 * it found something narrower and stranger than the report suggests. The keys reach the
 * right places; they just do not stay there. Three presses of `cmd+left` on a heading
 * gave offset 2, then 0, then 2 again, and on an indented code block 3477, 3473, 3477.
 * Press twice and the caret is back where it started.
 *
 * The cause is in the layout rather than in markdown. A heading's `#` is drawn to the
 * left of the content origin by a negative margin (§6.1: notation lives outside the
 * prose column), and an indented block's four spaces are replaced. So "the start of
 * this visual line" is not one position — the engine answers differently depending on
 * which side of the notation it is asked from, and the default commands take that
 * answer at face value.
 *
 * A list item is stable, because its `-` is part of the text it marks rather than
 * something hanging outside it. That is the shape of the whole bug.
 */

/**
 * Wrap a motion command so it can only move the caret the way its name says.
 *
 * A view `Command` rather than a `StateCommand`, because line-boundary motion is a
 * question about the shaped layout — which row a position sits on — and only the view
 * knows that. It is also exactly why these commands can disagree with themselves.
 *
 * No knowledge of headings, fences or indents — a backward command must never move the
 * caret forward, and that is true of every document. Deliberately not a markdown-aware
 * fix: the notation involved is already described in three other files, and a fourth
 * opinion about which offsets are "really" the line start is how those files came to
 * disagree with each other in the first place.
 *
 * **Claims the key either way**, and that is load-bearing rather than tidy. Declining was
 * the first attempt and it did not work at all: `defaultKeymap` binds these same chords,
 * so returning false handed the press straight to the binding whose behaviour is the bug
 * and the caret moved forward anyway. A guard that lets the thing it guards against run
 * next is not a guard.
 *
 * The contract is therefore the opposite of `continuation.ts`, where declining is the
 * whole design. There, several commands want one key and each claims a different case.
 * Here there is one command per key and this wrapper *is* that command.
 */
function onlyMoves(direction: "backward" | "forward", command: Command): Command {
  return (view) => {
    const before = view.state.selection.main.head;
    // A command that declines has moved nothing, and the key is still ours — falling
    // through is precisely how the caret got moved forward.
    if (!command(view)) return true;

    const after = view.state.selection.main.head;
    const wrongWay = direction === "backward" ? after > before : after < before;
    if (!wrongWay) return true;

    /*
     * It moved the wrong way, and the transaction is already dispatched — a `Command`
     * cannot be asked what it would do without letting it do it. So put the caret back
     * in a transaction of its own.
     *
     * `scrollIntoView` is deliberately absent. The caret has not moved as far as anyone
     * can tell, and §4.1 does not want a key press that changes nothing to move the
     * document — that was the whole of the cmd+i scroll jump on 2026-07-31.
     */
    view.dispatch({ selection: { anchor: before } });
    return true;
  };
}

/**
 * The block the caret is in, by the same rule focus paints one.
 *
 * §7.6's granularity is selectable, so this asks whichever range function focus would
 * ask. At line granularity a "block" is the caret's own line, which makes option+arrow
 * behave like a plain arrow — said out loud rather than special-cased, because a jump
 * that silently used a different unit than the highlight would be the divergence this
 * whole file exists to avoid.
 */
function focusBlock(view: EditorView, at: number): { from: number; to: number } {
  const state = view.state;
  if (granularityOf(view) === "section") return sectionRange(state, at);
  if (granularityOf(view) === "line") {
    const line = state.doc.lineAt(at);
    return { from: line.from, to: line.to };
  }
  return blockRange(state, at);
}

/**
 * Move the caret to the start of the next or previous focus block.
 *
 * "we should use short cut option+arrow-keys to jump down to the next focus block"
 * (feedback, 2026-08-01). Before this, option+arrow moved one *source* line at a time,
 * so it stopped twice inside a three-line paragraph that focus treats as one block.
 *
 * Walks out of the current block and then past anything that is not a block at all — the
 * blank lines a markdown source puts between them. Those are the gaps between blocks and
 * the request says *block*, so nothing rests there. `nearestContentPos` in focus.ts makes
 * the same distinction for the anchor, for the same reason.
 *
 * Lands on the block's first position rather than keeping a column, so a second press is
 * predictable and the caret never arrives somewhere the previous block chose.
 *
 * **Not bound here.** This is a plain function rather than a keymap entry because the
 * chord lives in the suite registry — see the note on `settledMotion` below for the line
 * between the two. Claims nothing and swallows nothing; the registry decides that.
 *
 * Returns true either way, including at the ends of the document. A press that cannot
 * move is still an answered press: falling through would hand the chord to whatever
 * `defaultKeymap` does with it, and a jump that quietly became word-motion at the last
 * block would be worse than one that does nothing.
 */
export function jumpFocusBlock(view: EditorView, direction: "next" | "previous"): boolean {
  const state = view.state;
  const here = state.selection.main.head;
  const block = focusBlock(view, here);
  const step = direction === "next" ? 1 : -1;

  // Start from the edge of the block being left, so a caret in its middle does not
  // land back inside it.
  let line = state.doc.lineAt(direction === "next" ? block.to : block.from).number + step;

  while (line >= 1 && line <= state.doc.lines) {
    const candidate = state.doc.line(line);
    if (candidate.text.trim() !== "") {
      const target = focusBlock(view, candidate.from);
      view.dispatch({
        selection: { anchor: state.doc.lineAt(target.from).from },
        /*
         * `select.blockjump` and not a bare `select`, so the edge return in focus.ts can
         * stand down for it. Both want to put something on the anchor and they disagree
         * about *what*: this one means the block, the return means the caret's row.
         * Measured 2026-07-30 with the return claiming it too — the landed block finished
         * 97.5px off the anchor, because a paragraph's centre is not its first line.
         *
         * `isUserEvent("select")` still matches this, so nothing that reasons about
         * selection events in general has to learn a new name.
         */
        userEvent: "select.blockjump",
      });

      /*
       * Onto the anchor, not merely onto the screen.
       *
       * "if using that it should try to center the new block onto the center focal
       * point" (feedback, 2026-07-30). This was `scrollIntoView: true`, which is
       * CodeMirror's "somewhere visible" and therefore leaves a block that is
       * already on screen exactly where it was — so the focus target and the
       * position focus is read from disagreed after every press, which is the
       * disagreement §4.1 opens by ruling out.
       *
       * Deliberately instead of `scrollIntoView` rather than alongside it. Two
       * scroll sources for one key press is the compounding-correction shape that
       * made the typewriter caret bounce down the window on 2026-08-01, and the
       * second one would win a frame later for no reason anyone could see.
       */
      /*
       * Typewriter Mode owns the same selection change in typewriter.ts and puts
       * the caret's row on its midpoint. Asking for the reading anchor as well
       * gives one key press two destinations: the typewriter pin lands first,
       * then this focal-journey scroll pulls it hundreds of pixels away. That is
       * the reported hop and unreliability.
       *
       * One mode, one destination. Outside Typewriter Mode the block still
       * travels to the reading anchor exactly as before.
       */
      if (!isTypewriter(view.state)) scrollBlockToAnchor(view, target);
      return true;
    }
    line += step;
  }

  // Nothing further in that direction. The caret stays exactly where it is.
  return true;
}

/**
 * `cmd+left` and `cmd+right`, and their shifted selecting forms.
 *
 * `mac:` only, deliberately. Cmd+arrow means line boundary on macOS; elsewhere
 * Ctrl+arrow is word motion in `defaultKeymap`, and claiming it here would change what
 * that key does on Windows and Linux to fix a bug neither of them has.
 *
 * Bound ahead of `defaultKeymap`, which is where these chords come from — CodeMirror
 * maps them to the line-boundary commands on macOS. The wrappers hand the same commands
 * back when they behave and swallow the press when they would go backwards, so nothing
 * about which key does what changes here.
 *
 * **These stay keymap entries and the block jump does not** (settled 2026-07-30, on
 * "it should be listed in the shortcuts listing"). The line is not whether a chord moves
 * the caret — it is whether someone would go looking for the key.
 *
 * `cmd+arrow` is the platform's own line-boundary motion. Nobody looks it up, and what
 * is here is a *correction* to a binding macOS already taught rather than a command this
 * app invented, so a row saying "⌘← moves to the start of the line" would be telling a
 * reader something they arrived knowing. Same for Enter and Tab in `continuation.ts` and
 * `lists.ts`: keys doing their obvious job in context, with no chord to remember.
 *
 * A focus-block jump is the opposite — a product feature with a name, on a chord nothing
 * else on the platform would suggest. It is in the §7.1 registry, and `index.ts` is where
 * it is bound. §7.1 leaves no second option: "the Reference renders [the registry]; it is
 * not a hand-maintained list that drifts from reality", so a binding outside the registry
 * cannot appear in the Reference at all, and adding a row by hand is finding F16 itself.
 */
export function settledMotion(): Extension {
  return keymap.of([
    { mac: "Cmd-ArrowLeft", run: onlyMoves("backward", cursorLineBoundaryBackward) },
    { mac: "Cmd-ArrowRight", run: onlyMoves("forward", cursorLineBoundaryForward) },
    { mac: "Cmd-Shift-ArrowLeft", run: onlyMoves("backward", selectLineBoundaryBackward) },
    { mac: "Cmd-Shift-ArrowRight", run: onlyMoves("forward", selectLineBoundaryForward) },
  ]);
}
