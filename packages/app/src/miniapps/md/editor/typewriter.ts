import { StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, ViewPlugin, type ViewUpdate } from "@codemirror/view";

import { scrollBoxTo, type ScrollMotion } from "../scroll";
import { scrollingMeasure, type ScrollingMeasure } from "./measure";

/**
 * Typewriter Mode — vision §6.1, DESIGN.md §7.6.
 *
 *   "Typewriter mode is available as a toggle: the caret line holds its vertical
 *    position while the document moves under it." (§6.1)
 *
 *   "Typewriter Mode needs a caret, so it is available whenever there is one. It
 *    pins that line at the vertical midpoint and moves the document beneath it
 *    after typing or caret movement. Manual scrolling is always allowed… Focus and
 *    Typewriter modes always identify the same current line." (§7.6)
 *
 * The flag lives in editor state for the reasons raw.ts gives for its own: it is
 * per document, so two windows can differ, and a transaction is what carries a
 * change into the same update that acts on it.
 *
 * **Only on typing or caret movement.** That is the whole of "manual scrolling is
 * always allowed" — re-pinning on scroll would make the document impossible to
 * read ahead in, which is §4.1's distinction between reading ahead and moving,
 * applied to the scrollbar instead of to focus.
 */

/** The midpoint, and not the reading anchor. */
const TYPEWRITER_RATIO = 1 / 2;

/**
 * Viewport y of the line Typewriter Mode pins to.
 *
 * The counterpart of the reader's `anchorY`, and exported for the same reason: a
 * test that wants to know where the pinned line belongs must ask the module that
 * owns the number. `editor-typewriter.spec.ts` restated `height / 2` by hand when
 * it was written, which is the exact shape of the defect that put five
 * hand-written copies of `ANCHOR_RATIO` in the tree.
 */
export function typewriterY(surface: Element): number {
  const box = surface.getBoundingClientRect();
  return box.top + box.height * TYPEWRITER_RATIO;
}

/*
 * §7.6 names both positions in the same paragraph and they are different numbers:
 * the reading anchor sits "a third of the way down the window, not at its centre —
 * where the eye rests reading", and Typewriter Mode "pins that line at the vertical
 * midpoint". Not a contradiction and not a leftover — the anchor answers where you
 * are reading, this answers where a hand wants the line it is typing, and every
 * typewriter-mode editor worth copying puts it in the middle.
 *
 * Deliberately not a token and not a setting, for the reason `ANCHOR_RATIO` is
 * neither: §7's list of controls does not include it.
 */

/** Turn Typewriter Mode on or off. */
export const setTypewriter = StateEffect.define<boolean>();

const typewriter = StateField.define<boolean>({
  create: () => false,
  update(value, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(setTypewriter)) return effect.value;
    }
    return value;
  },
});

/**
 * Is the caret's line pinned?
 *
 * Defaults to false when the field is absent rather than throwing, exactly as
 * `isRaw` does — a missing extension should mean "not pinned", not "no editor".
 */
export function isTypewriter(state: EditorState): boolean {
  return state.field(typewriter, false) ?? false;
}

/**
 * The scrolling plane, which is the surface and not the editor.
 *
 * §7.3 allows exactly one scroller and styles/md.css gives it to `.md-surface`.
 * The same lookup focus.ts makes, and for the same reason: CodeMirror's own
 * scroller does not move here, so scrolling its ancestor is the only thing that
 * moves the document.
 */
function surfaceOf(view: EditorView): Element | null {
  return view.dom.closest(".md-surface");
}

const pinning = ViewPlugin.fromClass(
  class {
    /*
     * One outstanding request at a time, which is the whole of why this works
     * while you type rather than only when you stop. The reasoning is in
     * measure.ts, beside the guarantee rather than beside one of its users.
     */
    private readonly measure: ScrollingMeasure;
    private repeatingLineMove = false;

    private readonly noticeKeyDown = (event: KeyboardEvent) => {
      const movesLine =
        event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp";
      this.repeatingLineMove = movesLine && event.repeat;
    };

    private readonly noticeKeyUp = (event: KeyboardEvent) => {
      const movesLine =
        event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp";
      if (movesLine) this.repeatingLineMove = false;
    };

    constructor(private view: EditorView) {
      this.measure = scrollingMeasure(view);
      view.contentDOM.addEventListener("keydown", this.noticeKeyDown, true);
      view.contentDOM.addEventListener("keyup", this.noticeKeyUp, true);
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      if (!isTypewriter(update.state)) return;

      /*
       * Three things move the line and nothing else does: typing, moving the
       * caret, and switching the mode on. A scroll is none of them, which is what
       * keeps manual scrolling working — the document stays where it was put until
       * the next keystroke asks for the line back.
       */
      const switchedOn = update.transactions.some((transaction) =>
        transaction.effects.some((effect) => effect.is(setTypewriter) && effect.value),
      );
      if (!update.docChanged && !update.selectionSet && !switchedOn) return;

      /*
       * A focus-block jump is a deliberate journey across several rows, not the
       * row-sized correction made while typing. The ordinary nudge deliberately
       * cuts when asked to travel that far so it cannot lag behind key repeat;
       * that safety rule reads as a hop here. The focal-journey easing is safe
       * because motion.ts suppresses the reading-anchor scroll for this event,
       * leaving one writer and one destination.
       */
      const blockJump = update.transactions.some((transaction) =>
        transaction.isUserEvent("select.blockjump"),
      );
      this.pin(blockJump ? "smooth" : this.repeatingLineMove ? "follow" : "nudge");
    }

    destroy() {
      this.view.contentDOM.removeEventListener("keydown", this.noticeKeyDown, true);
      this.view.contentDOM.removeEventListener("keyup", this.noticeKeyUp, true);
      this.measure.stop();
    }

    /**
     * Put the caret's line on the midpoint.
     *
     * `requestMeasure` rather than an animation frame, for the reason focus.ts
     * gives: its read runs in CodeMirror's own measure phase, before the browser
     * paints, so the document has already moved by the first rendered frame. A
     * plain rAF would let the caret paint low and then jump, and §2 forbids
     * exactly that — "nothing flashes, jumps, or reflows while you work".
     *
     * This also lands *after* CodeMirror's own scroll-into-view for the same
     * selection change, which is what makes the two agree rather than fight: that
     * one puts the caret barely on screen, and this one then puts it where it
     * belongs, both before the frame is painted.
     */
    private pin(motion: ScrollMotion = "nudge"): void {
      const surface = surfaceOf(this.view);
      if (!surface) return;

      this.measure.request(
        (view) => {
          // A surface with no height has no midpoint, which is true of a hidden
          // editor and of jsdom, where every box is zero and `coordsAtPos` throws
          // outright. Null means "nothing to measure", and skips the write.
          if (surface.getBoundingClientRect().height === 0) return null;
          return view.coordsAtPos(view.state.selection.main.head);
        },
        (caret) => {
          /*
           * `nudge` and not `smooth`, and the difference was paid for.
           *
           * "the line animation shifting up is not smooth enough. It should be a
           * smoother scroll up anytime text scrolls" (feedback, 2026-07-30,
           * blocking) is about this scroll — a row-sized jump on every new line,
           * landing in one painted frame, which reads as a stutter rather than as
           * the document moving under the caret.
           *
           * The browser's own `"smooth"` was measured here first and reverted. One
           * Enter eased beautifully; nine lines typed in a row walked the caret
           * 28, 55, 83… 245px down the window and never caught up, because its
           * duration scales with the distance and a keystroke arrives long before
           * the animation finishes. `nudge` is short, and past one and a half rows
           * it places rather than easing — see `nudgeTo`, which carries the trace.
           *
           * §6.1's "the caret line holds its vertical position while the document
           * moves under it" is the sentence that decides it: the pinned line may
           * glide back over a few frames, and it may never fall behind.
           */
          scrollBoxTo(
            surface,
            { top: caret.top, height: caret.bottom - caret.top },
            typewriterY(surface),
            motion,
          );
        },
      );
    }
  },
);

/** Typewriter Mode: the flag, and the pinning that reads it. */
export function typewriterMode(): Extension {
  return [typewriter, pinning];
}
