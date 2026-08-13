import { describe, expect, it } from "vitest";

import type { EditorView } from "@codemirror/view";

import { scrollingMeasure } from "@/miniapps/md/editor/measure";

/*
 * The coalescing rule for a measurement whose write moves the document.
 *
 * One outstanding request at a time, because CodeMirror runs every queued `read` and
 * then every queued `write`: a second scrolling pair computes its delta from a rect
 * taken before the first one scrolled, and applies it on top of scrolling that already
 * happened. Measured the day Typewriter Mode was built — the caret walked 400, 204, 624,
 * 44, 16, 812 down an 800px window instead of holding still.
 *
 * **Which one survives is the part that was wrong.** It kept the first and dropped the
 * rest, on the reasoning that "the single read that survives sees the final position".
 * That is true of the *last* request just as much as the first, and it is only harmless
 * while every caller wants the same thing.
 *
 * The day two callers wanted different things it cost a shipped regression. The edge
 * return asks for the caret's row on the anchor; the block jump asks for the block's
 * centre there. Alt+ArrowDown pressed while a return was still pending had its request
 * dropped, the return then declined because the caret was not at an edge, and nothing
 * scrolled at all — the landed block finished 97.5px off the anchor, exactly the delta
 * the jump had asked for. Green under parallel load, where the return resolved before
 * the press arrived; red alone, every time.
 *
 * So: **the newer request replaces the older.** Same rule the persistent notice uses for
 * the same reason — the newer message is the truer one.
 *
 * A fake view rather than a real editor, because the whole claim is about which callback
 * survives to run. `requestMeasure` is the only thing touched, and running it by hand is
 * what makes the read and write phases separable enough to assert on.
 */

/** A view that queues measures and runs them on demand, read phase then write phase. */
function fakeView() {
  const queue: { read: (v: EditorView) => unknown; write: (m: unknown) => void }[] = [];

  const view = {
    requestMeasure(request: { read: (v: EditorView) => unknown; write: (m: unknown) => void }) {
      queue.push(request);
    },
  } as unknown as EditorView;

  return {
    view,
    /** What CodeMirror does: every read, then every write. */
    runMeasurePhase() {
      const taken = queue.splice(0, queue.length);
      const measured = taken.map((request) => request.read(view));
      taken.forEach((request, at) => request.write(measured[at]));
    },
    get depth() {
      return queue.length;
    },
  };
}

describe("a scrolling measure", () => {
  it("runs the newer request when two arrive before the measure phase", () => {
    const { view, runMeasurePhase } = fakeView();
    const measure = scrollingMeasure(view);
    const ran: string[] = [];

    measure.request(
      () => "first",
      (which) => ran.push(which),
    );
    measure.request(
      () => "second",
      (which) => ran.push(which),
    );

    runMeasurePhase();

    // Not `["first"]`, which is what it did until 2026-07-30. The block jump was the
    // second request, and being dropped is why nothing scrolled.
    expect(ran, "the newer request was dropped in favour of the older").toEqual(["second"]);
  });

  it("still queues only one measure however many times it is asked", () => {
    // The coalescing itself, which is the reason this object exists at all. Replacing
    // the request must not turn into queueing a second scrolling pair — that is the
    // compounding error the docstring measured.
    // Kept whole rather than destructured: `depth` is a getter, and spreading it
    // copies the number it held at spread time — which is zero, always, and reads
    // as a passing assertion about a queue nobody looked at.
    const fake = fakeView();
    const measure = scrollingMeasure(fake.view);

    for (let ask = 0; ask < 5; ask += 1) {
      measure.request(
        () => ask,
        () => {},
      );
    }

    expect(fake.depth, "each request queued its own measure").toBe(1);
    fake.runMeasurePhase();
  });

  it("takes a fresh request once the previous one has landed", () => {
    // Coalescing is per measure phase, not for the life of the editor. Without this a
    // single scroll would be the last one the document ever made.
    const { view, runMeasurePhase } = fakeView();
    const measure = scrollingMeasure(view);
    const ran: string[] = [];

    measure.request(
      () => "one",
      (which) => ran.push(which),
    );
    runMeasurePhase();

    measure.request(
      () => "two",
      (which) => ran.push(which),
    );
    runMeasurePhase();

    expect(ran).toEqual(["one", "two"]);
  });

  it("declines to write when the read says there is nothing to measure", () => {
    // Null is how a caller says "not applicable" — a surface with no height, a caret
    // with no coordinates — without raising something every caller would have to catch.
    const { view, runMeasurePhase } = fakeView();
    const measure = scrollingMeasure(view);
    let wrote = false;

    measure.request(
      () => null,
      () => {
        wrote = true;
      },
    );
    runMeasurePhase();

    expect(wrote).toBe(false);
  });

  it("does nothing once stopped", () => {
    const { view, runMeasurePhase } = fakeView();
    const measure = scrollingMeasure(view);
    let wrote = false;

    measure.request(
      () => "landed",
      () => {
        wrote = true;
      },
    );
    measure.stop();
    runMeasurePhase();

    expect(wrote, "a torn-down editor still scrolled").toBe(false);
  });
});
