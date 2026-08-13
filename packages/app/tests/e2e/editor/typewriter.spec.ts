import { expect, test } from "@playwright/test";

/*
 * Typewriter Mode — vision §6.1 and DESIGN.md §7.6.
 *
 *   "Typewriter mode is available as a toggle: the caret line holds its vertical
 *    position while the document moves under it." (§6.1)
 *
 *   "It pins that line at the vertical midpoint and moves the document beneath it
 *    after typing or caret movement. Manual scrolling is always allowed… Focus and
 *    Typewriter modes always identify the same current line." (§7.6)
 *
 * Every claim here is about where something sits after something else moved, so
 * all of it is in a browser. What is *not* here is the flag itself, which is a
 * `StateField` and a pure function — tests/unit/editor/typewriter.test.ts.
 *
 * The midpoint is the midpoint, deliberately, and not the reading anchor at a
 * third. §7.6 names both positions in the same paragraph as different numbers:
 * the anchor is where the eye rests reading, this is where a hand wants the line
 * it is typing.
 */

const VIEWPORT = { width: 1100, height: 800 };

async function open(page: import("@playwright/test").Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();
}

/** Turn the mode on through its real command, and confirm it took. */
async function typewriterOn(page: import("@playwright/test").Page) {
  await page.keyboard.press("ControlOrMeta+Alt+t");
  expect(
    await page.evaluate(() => window.zdEditor!.isTypewriter()),
    "the typewriter command did not run",
  ).toBe(true);
}

/** Put the caret partway down the document, well clear of both gutters. */
async function caretInTheMiddle(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const number = lines.findIndex((line) => line.startsWith("Notation is visible")) + 1;
    const start = lines.slice(0, number - 1).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + 4);
  });
}

/**
 * Where the caret is painted, and where the midpoint of the surface is.
 *
 * Read off the **native selection range**, and there is no choice about that:
 * this editor has no `drawSelection` extension, so there is no `.cm-cursor`
 * element anywhere — the browser draws the caret itself and editor.css colours it
 * with `caret-color`. A collapsed range still reports a rect, and it reports the
 * caret's *row* rather than its line, which is what matters on a wrapped line:
 * the line box here is 56px over two rows and the row is 22px.
 */
function caretAgainstMidpoint() {
  const surface = document.querySelector<HTMLElement>(".md-surface")!;

  const selection = window.getSelection();
  const rect =
    selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).cloneRange().getBoundingClientRect()
      : null;

  return {
    caret: rect && rect.height > 0 ? rect.top + rect.height / 2 : null,
    // Asked, not restated. `height / 2` here was a second copy of
    // `TYPEWRITER_RATIO`, which is the exact shape of the defect that once put
    // five hand-written copies of the reading anchor's ratio in the tree — every
    // one of them agreeing with itself and none with the product.
    midpoint: window.zdEditor!.typewriterY(),
    scrollTop: surface.scrollTop,
  };
}

/** How far the caret's row sits from the midpoint, in whole pixels. */
async function distanceFromMidpoint(page: import("@playwright/test").Page) {
  const { caret, midpoint } = await page.evaluate(caretAgainstMidpoint);
  return caret === null ? null : Math.round(Math.abs(caret - midpoint));
}

/**
 * Wait until the caret's row is on the midpoint.
 *
 * Polled on the claim itself rather than slept for, so a timeout fails for the
 * same reason the assertion would. The pin is a *measurement* — `requestMeasure`
 * reads the caret and a later phase writes the scroll — so it lands a frame after
 * the keystroke by design, and reading in the same breath measured the position
 * the document was in before it moved.
 */
async function settledOnMidpoint(page: import("@playwright/test").Page, message: string) {
  await expect.poll(() => distanceFromMidpoint(page), { message }).toBeLessThanOrEqual(2);
}

test("the caret's line is pinned to the midpoint", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);

  await settledOnMidpoint(page, "the caret's line never came to rest on the midpoint");
});

test("the caret holds its place while the document moves under it", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);

  await settledOnMidpoint(page, "the caret did not start pinned");
  const before = await page.evaluate(caretAgainstMidpoint);

  // Nine lines of it, so the document has to travel a long way to keep the caret
  // still. `type` and not `insertText`: this is about what happens *while* you
  // work, and insertText skips the intermediate states entirely.
  for (let line = 0; line < 9; line += 1) await page.keyboard.type("a new line\n");

  // §6.1's sentence, split into its two halves: the caret is still on the
  // midpoint, and the document is the thing that moved.
  await settledOnMidpoint(page, "the caret moved down the screen as text was added");

  const after = await page.evaluate(caretAgainstMidpoint);
  expect(after.scrollTop, "the document did not move beneath the caret").toBeGreaterThan(
    before.scrollTop,
  );
});

test("moving the caret re-pins without typing", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);

  await settledOnMidpoint(page, "the caret did not start pinned");
  const start = await page.evaluate(caretAgainstMidpoint);

  for (let press = 0; press < 12; press += 1) await page.keyboard.press("ArrowDown");

  // §7.6: "after typing or caret movement". Twelve rows down the document and the
  // caret is still on the midpoint, which means the document came up to meet it.
  await settledOnMidpoint(page, "arrowing down left the caret off the midpoint");

  const moved = await page.evaluate(caretAgainstMidpoint);
  expect(moved.scrollTop, "arrowing down did not move the document").toBeGreaterThan(
    start.scrollTop,
  );
});

test("manual scrolling is always allowed", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);

  await settledOnMidpoint(page, "the caret did not start pinned");
  const pinned = await page.evaluate(caretAgainstMidpoint);

  await page.evaluate(() => {
    document.querySelector<HTMLElement>(".md-surface")!.scrollTop += 400;
  });
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

  const scrolled = await page.evaluate(caretAgainstMidpoint);

  /*
   * §7.6 says this in as many words, and it is the reason the pin fires on typing
   * and caret movement rather than on every update. A mode that dragged the
   * document back the instant you scrolled would make reading ahead impossible —
   * the same distinction §4.1 draws for focus, applied to the scrollbar.
   */
  expect(scrolled.scrollTop, "the scroll was undone").toBe(pinned.scrollTop + 400);

  // And the next keystroke asks for the line back.
  await page.keyboard.type("x");
  await settledOnMidpoint(page, "the next keystroke did not bring the line back");
});

test("nothing is pinned until the mode is on", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);

  const before = await page.evaluate(caretAgainstMidpoint);
  for (let line = 0; line < 6; line += 1) await page.keyboard.type("a new line\n");
  const after = await page.evaluate(caretAgainstMidpoint);

  // The control. Without it every assertion above would also pass on a surface
  // that pinned the caret all the time, which is a different product.
  expect(after.caret, "the caret was pinned with the mode off").not.toBeCloseTo(before.caret!, 0);
});

test("focus and typewriter agree about the current line", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);
  for (let press = 0; press < 5; press += 1) await page.keyboard.press("ArrowDown");
  await settledOnMidpoint(page, "the caret never settled, so there is nothing to compare");

  const agree = await page.evaluate(() => {
    const caret = window.getSelection()!.getRangeAt(0).cloneRange().getBoundingClientRect();
    const target = [...document.querySelectorAll<HTMLElement>('.cm-line[data-focus="target"]')];
    // The focused block has to contain the row the caret is drawn on.
    return target.some((line) => {
      const box = line.getBoundingClientRect();
      return caret.top >= box.top - 1 && caret.bottom <= box.bottom + 1;
    });
  });

  // §7.6: "Focus and Typewriter modes always identify the same current line."
  expect(agree, "the focused block does not contain the pinned caret").toBe(true);
});

test("the caret never wanders while you type", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);
  await settledOnMidpoint(page, "the caret did not start pinned");

  const wandered: number[] = [];
  for (let line = 0; line < 9; line += 1) {
    await page.keyboard.type("a new line\n");
    // Read straight after the keystrokes, deliberately: no poll, no settle.
    wandered.push((await distanceFromMidpoint(page)) ?? 0);
  }

  /*
   * **This is the only assertion in the file that can see the compounding bug**,
   * and it exists because every other one could not.
   *
   * CodeMirror's measure phase runs every queued read and then every queued
   * write, so without the single-outstanding-request guarantee in measure.ts each
   * write applies a scroll delta computed from a rect taken before the previous
   * write scrolled. Measured with the guard removed, this trace reads
   * 260, 784, 16, 812, 44, 812, 44 — the caret slamming between the top and the
   * bottom of an 800px window on every keystroke.
   *
   * Every other test here polls until the caret settles, and the oscillation
   * *does* settle: once typing stops, one final measure lands it correctly. So
   * the whole defect lives in the transient, and an assertion made after things
   * come to rest is blind to it. That is exactly what happened — the guard shipped
   * on 2026-08-01 with six passing tests, none of which went red when it was
   * removed the next day.
   *
   * The band is two rows. A single row of lag is real and expected: read straight
   * after Enter, the caret measures 28px low, because the pin runs against the
   * layout before the new line is in it and corrects on the next frame. 400px is
   * not lag.
   */
  const worst = Math.max(...wandered);
  expect(
    worst,
    `the caret wandered off the midpoint while typing: ${wandered.join(", ")}`,
  ).toBeLessThan(60);
});

test("Enter eases the line back rather than cutting it back", async ({ page }) => {
  await open(page);
  await caretInTheMiddle(page);
  await typewriterOn(page);
  await settledOnMidpoint(page, "the caret did not start pinned");

  /*
   * "the line animation shifting up is not smooth enough. It should be a smoother
   * scroll up anytime text scrolls" (feedback, 2026-07-30, blocking).
   *
   * **This test used to assert the opposite**, and the history is the point. The
   * caret is one row low for exactly one painted frame after Enter — CodeMirror
   * updates the DOM synchronously in the key handler and applies scrolling on the
   * *next* animation frame, so the new line is painted before anything can
   * compensate. That frame is the library's; routing the scroll through
   * `EditorView.scrollIntoView({y: "center"})` instead produces an identical 28px
   * frame. Sampled per frame it read 0, **28**, 0, 0, 0…, and this file pinned it
   * at "at most one frame, at most one row" so the departure could not grow.
   *
   * Asked to look at it, the answer was that the frame itself does not read as a
   * judder — but that the *correction* does, because a 28px cut back to the
   * midpoint in one frame is a snap rather than the document moving. So the claim
   * is now about the shape of the return, and the one-row bound it inherited is
   * kept: an ease that overshoots would be worse than the cut it replaced.
   *
   * Two assertions, and the second is what stops "eased" becoming "late".
   */
  await page.evaluate(() => {
    (window as unknown as { zdFrames: (number | null)[] }).zdFrames = [];
    const record = () => {
      const frames = (window as unknown as { zdFrames: (number | null)[] }).zdFrames;
      const selection = window.getSelection();
      const rect =
        selection && selection.rangeCount > 0
          ? selection.getRangeAt(0).cloneRange().getBoundingClientRect()
          : null;
      frames.push(rect && rect.height > 0 ? rect.top + rect.height / 2 : null);
      if (frames.length < 20) requestAnimationFrame(record);
    };
    requestAnimationFrame(record);
  });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);

  const midpoint = await page.evaluate(() => window.zdEditor!.typewriterY());
  const frames = await page.evaluate(
    () => (window as unknown as { zdFrames: (number | null)[] }).zdFrames,
  );

  const drift = frames
    .filter((frame): frame is number => frame !== null)
    .map((frame) => Math.round(Math.abs(frame - midpoint)));

  expect(drift.length, "the frame recorder never saw the caret").toBeGreaterThan(5);

  /*
   * Eased: the return passes *through* the distance rather than crossing it in one
   * frame. A cut produces 28 and then 0; an ease produces a decay, and three
   * distinct positions strictly between the two is the difference between motion
   * and a snap. Counted rather than timed — the duration is the easing's own and
   * pinning it here would restate the implementation instead of the claim.
   */
  const off = drift.filter((frame) => frame > 4);
  const between = new Set(off.filter((frame) => frame < 24));
  expect(
    between.size,
    `the caret cut back to the midpoint rather than easing: ${drift.join(", ")}`,
  ).toBeGreaterThanOrEqual(3);

  /*
   * And still never late. The whole reason the browser's own `scroll-behavior:
   * smooth` was reverted here on 2026-07-30 is that its duration is long enough
   * for the next keystroke to arrive mid-animation, and nine lines walked the caret
   * 245px down the window. One row is the distance being travelled; anything past
   * it means the ease stopped tracking, which is the failure that matters.
   */
  expect(
    Math.max(0, ...off),
    `the caret went further than one row off the midpoint: ${drift.join(", ")}`,
  ).toBeLessThanOrEqual(32);

  // It arrives. An ease that settles short is a worse fault than a cut.
  expect(
    drift[drift.length - 1],
    `the caret never came to rest: ${drift.join(", ")}`,
  ).toBeLessThanOrEqual(2);
});

for (const key of ["Enter", "ArrowDown", "ArrowUp"] as const) {
  test(`holding ${key} keeps the document moving smoothly`, async ({ page }) => {
    await open(page);
    await caretInTheMiddle(page);
    await typewriterOn(page);
    await settledOnMidpoint(page, "the caret did not start pinned");

    await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(".md-surface")!;
      const samples: number[] = [];
      (window as unknown as { zdRepeatScroll: number[] }).zdRepeatScroll = samples;

      const record = () => {
        samples.push(surface.scrollTop);
        if (samples.length < 60) requestAnimationFrame(record);
      };
      requestAnimationFrame(record);
    });

    // Repeated keydown events are what the browser receives while a key is held.
    // Calling `down` again keeps the key depressed and marks the later events as
    // repeats, instead of turning this into separate key presses.
    for (let repeat = 0; repeat < 14; repeat += 1) {
      await page.keyboard.down(key);
      await page.waitForTimeout(30);
    }
    await page.keyboard.up(key);
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      const values = (window as unknown as { zdRepeatScroll: number[] }).zdRepeatScroll;
      const line = document.querySelector<HTMLElement>(".cm-line")!;
      const row = Number.parseFloat(getComputedStyle(line).lineHeight);
      return {
        deltas: values.slice(1).map((value, index) => value - values[index]!),
        distance: values[values.length - 1]! - values[0]!,
        row,
      };
    });

    expect(Math.abs(result.distance), `holding ${key} did not move the document`).toBeGreaterThan(
      result.row * 8,
    );

    const largestFrame = Math.max(...result.deltas.map(Math.abs));
    expect(
      largestFrame,
      `holding ${key} cut the document by a row in one frame: ${result.deltas.join(", ")}`,
    ).toBeLessThan(result.row * 0.9);
  });
}
