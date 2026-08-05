import type { EditorView } from "@codemirror/view";

/**
 * A measurement whose write moves the document.
 *
 * **CodeMirror's measure phase runs every queued `read`, and then every queued
 * `write`.** That order is correct and necessary — it is what stops a read in one
 * plugin being invalidated by a write in another — but it has a consequence that
 * is easy to miss: by the time your `write` runs, other writes may already have
 * changed the layout your `read` measured.
 *
 * For a write that sets a class or stores a value, that costs nothing. For a write
 * that **scrolls**, it is compounding error. Each queued pair computes a delta
 * from a rect taken before any of the scrolling happened, and then applies it on
 * top of scrolling that already did.
 *
 * Measured, on the day Typewriter Mode was built: typing dispatches a transaction
 * per character, each one queued a measure, and the caret walked 400, 204, 624,
 * 44, 16, 812 down an 800px window instead of holding still.
 *
 * So a scrolling measure gets **one outstanding request at a time**, and that is
 * what this holds. Coalescing loses nothing: the measure phase runs after the DOM is
 * up to date for the whole batch, so the single read that survives sees the final
 * position — the only one worth acting on.
 *
 * **The surviving one is the newest, and it was the oldest until 2026-07-30.** That
 * looked equivalent, because "the read that survives sees the final position" is
 * true either way, and it is only equivalent while every caller wants the same
 * thing. Two callers here want different things: the edge return asks for the
 * caret's row on the reading anchor, the block jump asks for the block's centre
 * there.
 *
 * It cost a shipped regression. Alt+ArrowDown pressed while a return was still
 * pending had its request *dropped*; the return then declined, because the caret was
 * not at an edge after all; and nothing scrolled at all. The landed block finished
 * 97.5px off the anchor — exactly the delta the jump had asked for and never got.
 * Green under parallel load, where the return resolved before the press arrived, and
 * red alone every single time.
 *
 * Newest-wins is also the rule the persistent notice already uses, for the same
 * reason said differently: the newer message is the truer one. A request made later
 * knows about everything the earlier one knew and one thing more.
 *
 * A tiny object rather than a note in each file that needs it, because the rule
 * is invisible at the call site. Nothing about `view.requestMeasure({read, write})`
 * suggests that calling it twice in a frame is different from calling it once, and
 * the two places in this editor that scroll from a measure were each safe for a
 * *different* reason — one coalesced deliberately, one only because it happened to
 * be called exactly once. The second kind of safety is the kind that stops being
 * true when someone adds a caller.
 */
export interface ScrollingMeasure {
  /**
   * Measure, then move — replacing any request not yet measured.
   *
   * `read` runs in CodeMirror's measure phase, before the browser paints, so the
   * document has moved by the first rendered frame rather than a frame later.
   * Returning null from `read` skips the write, which is how a caller says "there
   * is nothing to measure here" — a surface with no height, a position with no
   * coordinates — without raising something the caller would have to handle.
   *
   * Asking twice in a frame is not the same as asking once: the second ask wins,
   * and only one measure is queued either way.
   */
  request<T>(read: (view: EditorView) => T | null, write: (measured: T) => void): void;
  /** Stop measuring. Any request already in flight does nothing when it lands. */
  stop(): void;
}

/** The pair a caller handed over, held until the measure phase asks for it. */
interface Job {
  read: (view: EditorView) => unknown;
  write: (measured: unknown) => void;
}

export function scrollingMeasure(view: EditorView): ScrollingMeasure {
  let pending: Job | null = null;
  let stopped = false;

  return {
    request(read, write) {
      if (stopped) return;

      const alreadyQueued = pending !== null;
      // Overwrite first, queue second. A later caller replaces the job the queued
      // measure will pick up, which is what makes newest-wins one assignment rather
      // than a cancellation.
      pending = { read: read as Job["read"], write: write as Job["write"] };
      if (alreadyQueued) return;

      view.requestMeasure({
        // Read whatever job is current *now*, not the one that queued this measure.
        read: () => {
          const job = pending!;
          return { job, measured: job.read(view) };
        },
        write: ({ job, measured }: { job: Job; measured: unknown }) => {
          pending = null;
          if (stopped || measured === null) return;
          job.write(measured);
        },
      });
    },

    stop() {
      stopped = true;
    },
  };
}
