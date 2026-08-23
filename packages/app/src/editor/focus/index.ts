import { EditorSelection, StateEffect, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import { anchorY, DEFAULT_GRANULARITY, scrollBoxToAnchor, type FocusGranularity } from "./anchor";
import type { ScrollMotion } from "./scroll";
import { scrollingMeasure, type ScrollingMeasure } from "../measure";
import { isTypewriter } from "../typewriter";
import { blockRange, nearestContentPos, sectionRange } from "./range";

/**
 * Focus on the editing surface. Vision §4.1 calls it the heart of the product.
 *
 * The reader already does this, and this is deliberately not a second
 * implementation of it: the state is written as the same `data-focus` attribute,
 * spent through the same tokens, and the vertical anchor is imported from the
 * reader rather than re-derived. What is genuinely different here is only the
 * input. §4.1:
 *
 *   "The caret is the focus target. Place it and that is where focus goes."
 *   "Before a caret is placed, focus follows the vertical anchor at the centre
 *    of the screen and scrolling moves it. Once the caret is in the document,
 *    scrolling for context leaves focus where it is — reading ahead is not the
 *    same as moving."
 *
 * So there are two inputs and they take turns, rather than competing: the anchor
 * has the target until a caret exists, and never again after that — unless the
 * caret is deliberately dropped, which is what `dropCaret` is for.
 */

/**
 * Take the caret out of the document and give the anchor the target back.
 *
 * Vision §4.1 has exactly two states and only one door between them: placing a
 * caret leaves anchor-following for good. Escape is the way back (feedback,
 * 2026-07-29, three times).
 *
 * An effect rather than a method on the plugin, for the reason raw mode is an
 * effect too: the flag has to clear *inside* a transaction so the decorations
 * recompute in the same update, and reaching into a `ViewPlugin` from outside to
 * set a field would leave the DOM a transaction behind the state.
 *
 * Note this is not the same thing as blurring. `caretPlaced` is sticky across blur
 * on purpose — "putting the mouse somewhere else is not the same as taking the
 * caret out of the document" — so a `contentDOM.blur()` alone would look right for
 * one frame and leave the surface permanently deaf to scrolling.
 */
export const dropCaret = StateEffect.define<null>();

const TARGET = Decoration.line({ attributes: { "data-focus": "target" } });
const CONTEXT = Decoration.line({ attributes: { "data-focus": "context" } });

/**
 * The one laid-out visual row, at line granularity.
 *
 * A mark rather than a line decoration because a wrapped source line is several
 * rows and only one of them is the target — §7.6: "other wrapped rows in the
 * same paragraph remain context at the current Dim Level."
 */
const TARGET_ROW = Decoration.mark({ attributes: { "data-focus": "target" } });

/**
 * How much of the document one target covers, read from the DOM exactly as the
 * reader reads it — the setting belongs to the surface, not to a module
 * variable, so two windows never share one.
 */
/**
 * Which granularity this surface is set to — §7.6's selectable line, paragraph, section.
 *
 * Exported so `motion.ts` can jump by the same unit focus paints, rather than forming a
 * second opinion about what a block is. That divergence is this codebase's recurring
 * defect: the list-focus split, the inline-code rule, the anchor's five copies.
 */
export function granularityOf(view: EditorView): FocusGranularity {
  const owner = view.dom.closest<HTMLElement>("[data-granularity]");
  return (owner?.dataset.granularity as FocusGranularity | undefined) ?? DEFAULT_GRANULARITY;
}

/** Change how much of the document one target covers. */
export function setGranularity(column: HTMLElement, granularity: FocusGranularity): void {
  column.dataset.granularity = granularity;
}

/**
 * The scrolling plane this editor sits on.
 *
 * §7.3 allows exactly one, and styles/markdown.css gives it to `.md-surface` — the
 * editor deliberately does not scroll itself, so its own scroll events never
 * fire and there is nothing else to listen to.
 */
function surfaceOf(view: EditorView): Element | null {
  return view.dom.closest(".md-surface");
}

const focus = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    /**
     * Sticky, and that is the whole of "scrolling for context leaves focus where
     * it is". Blur does not clear it either: putting the mouse somewhere else is
     * not the same as taking the caret out of the document.
     */
    caretPlaced = false;
    private queued = false;
    private dead = false;

    /**
     * The document position under the vertical anchor, measured rather than
     * computed here.
     *
     * It is cached because reading it means reading the layout, and CodeMirror
     * forbids that during an update — which is the only time decorations may
     * change. So the two are deliberately out of step: the anchor is measured in
     * an animation frame, and a transaction is what carries the answer back into
     * the update where it can be used. Starts at the document's first position,
     * which is where a freshly opened document is anyway.
     */
    private anchor = 0;

    /**
     * The visual row the origin sits in, at line granularity.
     *
     * Measured, never derived. §7.6: line targeting uses "the rows of the actual
     * shaped galley at the presented wrap width", and "proportional glyph
     * widths, mixed semantic styles, Markdown markers, CJK, and emoji may never
     * fall back to a characters-per-line estimate". The engine already shaped
     * this text to draw it, so the honest answer is to ask it where the row
     * broke rather than to keep a second model of the same thing and hope they
     * agree.
     */
    private row = { from: -1, to: -1 };
    private readonly detach: () => void;

    /*
     * Putting a block on the anchor is a measurement whose write moves the
     * document, which is the shape measure.ts exists for.
     *
     * It had exactly one caller when it was written — the opening scroll in this
     * constructor — and the note here said "safe because nobody calls it twice" is
     * the kind of safety that stops being true when someone does. Someone did, on
     * 2026-07-30: the focus-block jump asks for the same scroll on every press, and
     * holding the key produces one request per frame or faster. Coalescing was
     * already the guarantee rather than something that had to be remembered.
     */
    private readonly scrolling: ScrollingMeasure;

    constructor(private view: EditorView) {
      this.decorations = this.compute();
      this.scrolling = scrollingMeasure(view);
      this.remeasure();
      this.openOnAnchor();

      const surface = surfaceOf(view);
      const column = view.dom.closest<HTMLElement>(".md-editor");

      // The granularity lives in the DOM, so a change to it arrives as an
      // attribute change rather than as a transaction. Watching for it keeps the
      // setter a one-liner that writes the same dataset the reader's does.
      const watcher = column ? new MutationObserver(() => this.view.dispatch({})) : null;
      watcher?.observe(column!, { attributes: true, attributeFilter: ["data-granularity"] });

      if (!surface) {
        this.detach = () => watcher?.disconnect();
        return;
      }

      const onScroll = () => this.remeasure();
      surface.addEventListener("scroll", onScroll, { passive: true });
      this.detach = () => {
        watcher?.disconnect();
        surface.removeEventListener("scroll", onScroll);
      };
    }

    update(update: ViewUpdate) {
      this.view = update.view;
      // Either of these means a caret is now in the document: one is placing it,
      // the other is the surface being given the keyboard.
      if (update.selectionSet || (update.focusChanged && update.view.hasFocus)) {
        this.caretPlaced = true;
      }
      /*
       * Checked after the two above, and that order is load-bearing: dropping the
       * caret also moves the selection, so `selectionSet` is true in the very
       * transaction that asks for the caret to be dropped. The effect has to win,
       * or Escape sets the flag it just cleared.
       */
      for (const transaction of update.transactions) {
        for (const effect of transaction.effects) {
          if (!effect.is(dropCaret)) continue;
          this.caretPlaced = false;
          // The anchor has been ignored since the caret was placed, so it may be
          // stale by a whole document. Re-read it before it owns the target again.
          this.remeasure();
        }
      }
      // A resize moves the anchor without anyone scrolling.
      if (update.geometryChanged) this.remeasure();
      this.decorations = this.compute();
      this.measureRow();
      this.paintWidgets();
      if (update.selectionSet || update.docChanged) this.returnFromEdge(update);
    }

    /**
     * When the caret reaches an edge of the window, bring its row back to the anchor.
     *
     *   "when you reach the bottom of a page and scroll down it shouldn't just scroll
     *    and move down from there it should smoothly return the caret back to center by
     *    scrolling that doc position to the center of the page again" (feedback,
     *    2026-07-30, blocking).
     *
     * Measured walking ArrowDown down a fresh document in an 800px window: the caret
     * climbs 96, 152, 208 … 768 and then sits at 745–773 for every press after that,
     * while `scrollTop` walks 409, 437, 465 … 1131. CodeMirror's scroll-into-view is
     * doing its job — it puts the caret *barely* on screen — and the result is that the
     * document slides past under a caret welded to the bottom edge. §4.1 wants one place
     * the eye reads from, and that place is the anchor.
     *
     * **At an edge only, and that is what keeps it from being Typewriter Mode.** §7.6
     * makes typewriter a toggle that pins every line; this moves nothing while the caret
     * is anywhere in the middle of the window.
     *
     * Both edges, though only the bottom was reported. Arrowing up into the top edge is
     * the same sentence read backwards, and a rule that held in one direction only would
     * be a second idea about where the eye reads from.
     *
     * Three ways to decline, each for its own reason:
     *
     *   - Typewriter Mode is already pinning every line, and two things scrolling one
     *     surface is the compounding-correction shape that made the caret bounce.
     *   - A pointer selection, a block jump, or an edit owned by a rendered table cell.
     *     The table cell has the live DOM caret, so moving the document to follow the
     *     dormant CodeMirror selection would make the page jump on every keystroke.
     *     Clicking near the bottom of the window
     *     is the reader saying *there*, and answering by moving the document under their
     *     pointer is not what they asked for; the block jump is already putting
     *     something on the anchor and means the block rather than the caret's row.
     *   - No caret in the document yet, when the anchor still owns the target and
     *     scrolling is the reader's alone.
     */
    private returnFromEdge(update: ViewUpdate): void {
      if (this.dead || !this.caretPlaced) return;
      if (isTypewriter(update.state)) return;

      const deliberate = update.transactions.some(
        (transaction) =>
          transaction.isUserEvent("select.pointer") ||
          transaction.isUserEvent("select.blockjump") ||
          transaction.isUserEvent("input.table"),
      );
      if (deliberate) return;

      /*
       * `return` and not `smooth`, and that was measured rather than chosen. A
       * browser-managed smooth scroll is one animation the browser owns, and any direct
       * `scrollTop` write cancels it — CodeMirror writes exactly that, in its own
       * measure phase, for the same selection change that got here. Probed 2026-07-30:
       * the edge test returned true on every press at the bottom and the scroll never
       * happened at all. `return` writes `scrollTop` itself on every frame, so it
       * outlives that.
       */
      this.putOnAnchor((view) => {
        const surface = surfaceOf(view);
        if (!surface) return null;

        const head = view.state.selection.main.head;
        const caret = view.coordsAtPos(head);
        if (!caret) return null;

        /*
         * Two rows, not one, and the number was measured. One row is the distance
         * CodeMirror leaves, so a band of exactly one row catches the caret only on the
         * presses that land past it: walking down, the caret alternated between 770 and
         * 798 against a 772 threshold, every other press fell through, and the return
         * never happened. A band has to be wider than the thing it is catching.
         */
        const box = surface.getBoundingClientRect();
        const edge = (caret.bottom - caret.top) * 2;
        const atEdge = caret.top < box.top + edge || caret.bottom > box.bottom - edge;

        return atEdge ? { from: head, to: head } : null;
      }, "return");
    }

    destroy() {
      this.dead = true;
      this.scrolling.stop();
      this.detach();
    }

    /**
     * Give every block widget the focus state its neighbours got.
     *
     * §4.1 dims "everything else", and a block widget is part of everything else.
     * But `Decoration.replace({block: true})` renders outside the lines — the
     * widget is a *sibling* of `.cm-line`, not a child — so the line decorations
     * `compute()` produces cannot reach it. The lines they would have applied to
     * are precisely the ones the widget replaced.
     *
     * Measured before this existed: the fixture's table carried no `data-focus`
     * at all and painted `rgb(36, 37, 34)`, which is the *target* colour. It was
     * not merely undimmed, it was the brightest thing on screen wherever you were
     * reading, which is the exact inverse of what focus is for.
     *
     * Written onto the DOM rather than expressed as a decoration because there is
     * no decoration to express it with: the range is already spoken for by the
     * replacement. `posAtDOM` is the supported way back from an element to a
     * document position, so the plugin asks CodeMirror where the widget sits
     * rather than keeping its own map.
     *
     * Deliberately not a list of widget classes. Anything that is a child of the
     * content and is not a line is a widget by construction, so the next one
     * inherits this without anybody remembering it exists.
     */
    private paintWidgets(): void {
      if (this.dead) return;

      this.view.requestMeasure({
        read: (view) => {
          const granularity = granularityOf(view);
          const block =
            granularity === "section"
              ? sectionRange(view.state, this.origin())
              : blockRange(view.state, this.origin());

          const painted: { node: HTMLElement; focus: "target" | "context" }[] = [];
          for (const child of view.contentDOM.children) {
            if (!(child instanceof HTMLElement)) continue;
            if (child.classList.contains("cm-line")) continue;

            const from = view.posAtDOM(child);
            /*
             * Overlap rather than containment, and the same comparison
             * `compute()` makes for a line: a widget's own range is its start,
             * and a target that reaches it at all is a target it belongs to.
             */
            const inTarget = from >= block.from && from <= block.to;
            painted.push({ node: child, focus: inTarget ? "target" : "context" });
          }
          return painted;
        },
        write: (painted) => {
          if (this.dead) return;
          for (const { node, focus } of painted) {
            if (node.getAttribute("data-focus") !== focus) node.setAttribute("data-focus", focus);
          }
        },
      });
    }

    /**
     * Find the row the origin is in, and if it moved, say so in a transaction.
     *
     * `requestMeasure` rather than an animation frame: its read runs in
     * CodeMirror's own measure phase, before the browser paints. §6.3 gives
     * incoming focus the first rendered frame, and a plain rAF would spend that
     * frame measuring.
     *
     * The transaction that carries the answer back cannot be dispatched from
     * `write` — CodeMirror is still inside its update there and refuses. A
     * microtask is the smallest step that leaves it: it runs once the current
     * task finishes and still before the frame is painted, so the row lands in
     * the same frame the caret moved in. Dispatching from `write` directly threw
     * and left the target a whole transaction behind the caret, which looked
     * exactly like focus following the wrong thing.
     */
    private measureRow(): void {
      if (this.dead || granularityOf(this.view) !== "line") return;

      this.view.requestMeasure({
        read: (view) => {
          const at = EditorSelection.cursor(this.origin());
          return {
            from: view.moveToLineBoundary(at, false).head,
            to: view.moveToLineBoundary(at, true).head,
          };
        },
        write: (row) => {
          if (this.dead || (row.from === this.row.from && row.to === this.row.to)) return;
          this.row = row;
          queueMicrotask(() => {
            // Back into `update`, which is the only place decorations may change.
            if (!this.dead) this.view.dispatch({});
          });
        },
      });
    }

    /**
     * Scroll so a block sits on the reading anchor, in a measured frame.
     *
     * The one way this surface puts something where focus is read from — §4.1:
     * "Where a document opens and where focus is read from are the same position,
     * or the first pixel of scroll jumps focus several blocks at once." That
     * sentence is about opening, and it is equally about arriving: a jump that left
     * the block wherever it happened to be would put the target and the anchor into
     * exactly the disagreement it describes.
     *
     * `resolve` runs inside the measure phase rather than the range being passed
     * in, so a caller can decline once it sees the current state — the opening
     * scroll uses that to stand down if a caret arrived first.
     *
     * In a frame because it is a measurement: the block's box comes from
     * `coordsAtPos`, which needs the lines laid out and the prose face landed.
     */
    putOnAnchor(
      resolve: (view: EditorView) => { from: number; to: number } | null,
      motion: ScrollMotion = "instant",
    ): void {
      const surface = surfaceOf(this.view);
      if (!surface) return;

      this.scrolling.request(
        (view) => {
          /*
           * A surface with no height has no anchor to sit on, so there is nothing
           * to do rather than something to fail at. True of a detached or hidden
           * editor, and true under jsdom, where every box is zero and
           * `coordsAtPos` throws outright because a jsdom `Range` has no
           * `getClientRects`. Stating the precondition beats catching the
           * exception: the condition is real either way, and a `try` here would
           * also swallow a genuine measurement fault in a real browser.
           */
          if (surface.getBoundingClientRect().height === 0) return null;

          const block = resolve(view);
          if (!block) return null;

          const top = view.coordsAtPos(block.from);
          const bottom = view.coordsAtPos(block.to);
          if (!top || !bottom) return null;

          return { top: top.top, height: bottom.bottom - top.top };
        },
        (box) => {
          scrollBoxToAnchor(surface, box, motion);
          this.remeasure();
        },
      );
    }

    /**
     * Put the document's first block on the anchor, once, as the document opens.
     *
     * §4.1: "A document opens with its first block on the anchor, not at the top
     * of the window and not centred." The reader's `initFocus` has done this since
     * the anchor moved; this is the editing surface catching up.
     *
     * It was not simply missing before — it was *nearly* right by accident. The
     * surface opened at `scrollTop` 0 and the leading gutter pushed the first line
     * down 34vh, which is a hair below the 1/3 the anchor sits at, so the block
     * landed 119px low at a 900px window. Two numbers that happen to be close is
     * not the same as one number, and the gutter's job is to be the space this
     * scroll moves into, not to stand in for the scroll.
     *
     * Stands down if a caret arrived first — that would be someone already working
     * in the document, and §4.1 gives the caret the target for good.
     */
    private openOnAnchor(): void {
      this.putOnAnchor((view) => {
        if (this.caretPlaced) return null;
        // The first block, by the same definition focus paints — not the first
        // line, which is a different thing whenever the document opens on a
        // paragraph rather than a heading.
        return blockRange(view.state, 0);
      });
    }

    /**
     * Find the anchor's position and, if it moved, say so in a transaction.
     *
     * Coalesced to one measurement per frame. A trackpad produces scroll events
     * far faster than the screen refreshes, and §10 makes idle cost part of the
     * design — same reasoning, and same shape, as the reader's scroll handler.
     */
    private remeasure(): void {
      if (this.caretPlaced || this.queued) return;
      this.queued = true;

      requestAnimationFrame(() => {
        this.queued = false;
        if (this.dead || this.caretPlaced) return;

        const content = this.view.contentDOM.getBoundingClientRect();
        const surface = surfaceOf(this.view) ?? this.view.dom;
        // `false` asks for the nearest position rather than null when the anchor
        // falls in the gutters above or below the text — §7.3 puts real space
        // there, and focus should not blink out while crossing it.
        const next = this.view.posAtCoords({ x: content.left + 1, y: anchorY(surface) }, false);

        if (next === this.anchor) return;
        this.anchor = next;
        // An empty transaction, purely to get back into `update`, which is the
        // only place decorations are allowed to change.
        this.view.dispatch({});
      });
    }

    /**
     * Where focus is being asked from: the caret, or the anchor before there is one.
     *
     * The anchor is snapped to the nearest block and the caret is not — see
     * `nearestContentPos`. The two inputs differ in exactly this way because one
     * carries intent and the other is a coordinate.
     */
    private origin(): number {
      if (this.caretPlaced) return this.view.state.selection.main.head;
      return nearestContentPos(this.view.state, this.anchor);
    }

    private compute(): DecorationSet {
      const doc = this.view.state.doc;

      // At line granularity every line is context, including the caret's own —
      // the target is a row inside it, painted below. At the other
      // granularities the target is whole lines and there is no row.
      const granularity = granularityOf(this.view);
      const byRow = granularity === "line" && this.row.to > this.row.from;

      let block = { from: -1, to: -1 };
      if (!byRow) {
        block =
          granularity === "section"
            ? sectionRange(this.view.state, this.origin())
            : blockRange(this.view.state, this.origin());
      }
      const ranges = [];

      for (const { from, to } of this.view.visibleRanges) {
        const first = doc.lineAt(from).number;
        const last = doc.lineAt(to).number;
        for (let number = first; number <= last; number++) {
          const line = doc.line(number);
          // Overlap, not containment: the block's own first and last lines are
          // partly outside it once leading indentation is counted.
          const inTarget = line.from <= block.to && line.to >= block.from;
          ranges.push((inTarget ? TARGET : CONTEXT).range(line.from, line.from));
        }
      }

      if (byRow) ranges.push(TARGET_ROW.range(this.row.from, this.row.to));

      return Decoration.set(ranges, true);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Focus targeting for the editing surface. */
export function caretFocus(): Extension {
  return focus;
}

/**
 * Is there a caret in the document to drop?
 *
 * Not `view.hasFocus`. That is whether the surface holds the keyboard right now,
 * and §4.1's distinction is older than that: once a caret has been placed the
 * anchor never gets the target back on its own, whether or not the window is still
 * focused. So this is what Escape can act on, and what the Reference reads to say
 * honestly whether it can run here (§7.1).
 */
export function hasCaret(view: EditorView): boolean {
  return view.plugin(focus)?.caretPlaced ?? false;
}

/**
 * Scroll so `block` sits on the reading anchor.
 *
 * Reached through the plugin rather than reimplemented, for the reason this file
 * keeps having to be told: the anchor's ratio once had five hand-written copies,
 * every one self-consistent and none of them the product. The plugin owns the
 * coalesced scrolling measure and the remeasure that follows a scroll, and both
 * matter here — a held key asks for this faster than the screen refreshes.
 *
 * A no-op when the plugin is absent, which is a detached or torn-down view. A
 * caller asking a dead editor to scroll wants nothing to happen, not an error.
 *
 * **Eased**, where the opening placement through the same method is not. This is the
 * document travelling somewhere on a key press, and §2 wants that to read as motion —
 * measured before the change, a four-block jump went 248 → 692 between two consecutive
 * painted frames, which is a cut. Where the document *opens* is a position rather than
 * a journey; `scrollBoxTo` carries the distinction and why.
 */
export function scrollBlockToAnchor(view: EditorView, block: { from: number; to: number }): void {
  view.plugin(focus)?.putOnAnchor(() => block, "smooth");
}
