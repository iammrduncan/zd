import { expect, test } from "@playwright/test";

import {
  beginEditorScrollTrace,
  endEditorScrollTrace,
  openEditor,
  waitForEditorScrollToSettle,
} from "./harness";

/*
 * Scrolls the surface makes on its own are eased — vision §2.
 *
 *   "the line animation shifting up is not smooth enough. It should be a smoother scroll
 *    up anytime text scrolls. iA Writers scroll is a good example of this." (feedback,
 *    2026-07-30, blocking)
 *
 * §2: "Nothing flashes, jumps, or reflows while you work. Motion is either immediate or
 * eased, never janky." A row-sized `scrollTop` write that lands in one painted frame is
 * neither of those — it is a jump small enough to read as a stutter rather than as
 * motion, which is what the report is describing.
 *
 * **The claim is about scrolls the app initiates, and only those.** A wheel or trackpad
 * gesture is the OS's own easing and second-guessing it would make the document feel
 * heavy under the hand. That distinction is not this file's to enforce — it is what
 * `scroll-behavior` means, and the test below drives an app scroll precisely because it
 * is the half that must change.
 *
 * Sampled per animation frame rather than polled to rest. The whole of the difference
 * between eased and instant lives in the frames between the two positions, and an
 * assertion made after things settle cannot see it — the same blindness that let the
 * typewriter oscillation ship green beside six passing tests.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
});

test("a block jump eases the document rather than cutting to it", async ({ page }) => {
  // The paragraph on lines 3–5 jumps to the paragraph on lines 7–9. Their centres
  // are far enough apart to make the journey visible without folding key repeat or
  // several coalesced destinations into this one-motion claim.
  await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const lineThree = lines.slice(0, 2).reduce((total, text) => total + text.length + 1, 0);
    window.zdEditor!.setCaret(lineThree + 5);
  });

  const before = await page.locator(".md-surface").evaluate((surface) => surface.scrollTop);
  await beginEditorScrollTrace(page);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => page.evaluate(() => window.zdEditor!.selection().line)).toBe(7);
  await expect
    .poll(() =>
      page
        .locator(".md-surface")
        .evaluate((surface, start) => Math.abs(surface.scrollTop - start), before),
    )
    .toBeGreaterThan(60);
  await waitForEditorScrollToSettle(page);

  const recorded = await endEditorScrollTrace(page);
  expect(recorded.length, "the frame recorder never ran").toBeGreaterThan(10);
  const frames = recorded.map(({ top }) => top);

  const start = frames[0]!;
  const end = frames[frames.length - 1]!;
  // Distance, not direction. Where the surface starts depends on where the opening click
  // left it, so a jump four blocks down the document can legitimately travel either way.
  expect(Math.abs(end - start), "the block jump did not scroll the surface at all").toBeGreaterThan(
    60,
  );

  const low = Math.min(start, end);
  const high = Math.max(start, end);

  /*
   * The assertion. An instant scroll produces exactly two values — where it was and
   * where it went — however many frames are sampled. An eased one passes through the
   * space between them, and a handful of distinct positions there is the difference
   * between motion and a cut.
   *
   * Counted rather than timed, because the duration is the browser's to choose and
   * pinning a number here would be asserting a version of Chromium rather than the
   * product.
   */
  const between = new Set(frames.filter((value) => value > low + 2 && value < high - 2));
  expect(
    between.size,
    `the surface cut straight to its destination: ${frames.join(", ")}`,
  ).toBeGreaterThanOrEqual(3);

  /*
   * The Option-arrow journey uses the same pace as the bottom-edge return. Both
   * bring the next reading position to the focal point, and the faster browser
   * smooth-scroll still read as a warp after the return had been slowed down.
   * Measure from the first changed frame through the last frame that is still
   * moving. The shared half-second return animation remains visibly moving here
   * for about 380ms; the browser's built-in smooth scroll finished in about 300ms.
   * Using movement rather than a fixed distance from the destination keeps the
   * claim stable across small layout differences in the two paragraphs.
   */
  const firstMoving = recorded.findIndex(({ top }) => Math.abs(top - start) > 0.01);
  let lastMoving = -1;
  for (let index = 1; index < recorded.length; index += 1) {
    if (Math.abs(recorded[index]!.top - recorded[index - 1]!.top) > 0.01) lastMoving = index;
  }
  const visibleMs =
    firstMoving >= 0 && lastMoving > firstMoving
      ? recorded[lastMoving]!.at - recorded[firstMoving]!.at
      : 0;
  expect(
    visibleMs,
    `the block jump still warped to the anchor in ${Math.round(visibleMs)}ms: ${recorded
      .map(({ at, top }) => `${Math.round(at)}:${Math.round(top)}`)
      .join(", ")}`,
  ).toBeGreaterThanOrEqual(350);

  // And it still arrives. An easing that undershoots is a worse bug than a cut.
  expect(frames[frames.length - 1], "the surface never settled").toBe(end);
});

test("successive block jumps do not catch and release", async ({ page }) => {
  await page.evaluate(() => window.zdEditor!.setCaret(0));

  /*
   * Walk honestly rather than planting an off-screen caret. The sixth jump leaves the
   * fixture's long list for the paragraph on line 25, which makes CodeMirror replace an
   * estimated height with measured layout during the focal journey.
   *
   * Measured before the fix: the target position survived a position → coordinates →
   * position round trip (1016 → 1016), while scrollTop went 979 → 1145 → 1022 and then
   * stayed there. The height correction was not a bad caret coordinate; it was an
   * internal scroll write that the ease mistook for a reader taking control.
   */
  for (let jump = 0; jump < 5; jump += 1) {
    const line = await page.evaluate(() => window.zdEditor!.selection().line);
    await page.keyboard.press("Alt+ArrowDown");
    await expect
      .poll(() => page.evaluate(() => window.zdEditor!.selection().line))
      .toBeGreaterThan(line);
    await waitForEditorScrollToSettle(page);
  }
  expect(await page.evaluate(() => window.zdEditor!.selection().line)).toBe(16);

  await beginEditorScrollTrace(page);
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => page.evaluate(() => window.zdEditor!.selection().line)).toBe(25);
  await waitForEditorScrollToSettle(page);

  const recorded = await endEditorScrollTrace(page);
  const start = recorded[0]!.top;
  const firstMoving = recorded.findIndex(({ top }) => Math.abs(top - start) > 0.01);
  let lastMoving = -1;
  for (let index = 1; index < recorded.length; index += 1) {
    if (Math.abs(recorded[index]!.top - recorded[index - 1]!.top) > 0.01) lastMoving = index;
  }
  const visibleMs =
    firstMoving >= 0 && lastMoving > firstMoving
      ? recorded[lastMoving]!.at - recorded[firstMoving]!.at
      : 0;

  expect(
    visibleMs,
    `the block jump caught after ${Math.round(visibleMs)}ms: ${recorded
      .map(({ at, top }) => `${Math.round(at)}:${Math.round(top)}`)
      .join(", ")}`,
  ).toBeGreaterThanOrEqual(350);
});

test("a direct scroll takes over from a block jump", async ({ page }) => {
  await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const lineThree = lines.slice(0, 2).reduce((total, text) => total + text.length + 1, 0);
    window.zdEditor!.setCaret(lineThree + 5);
  });

  const before = await page.locator(".md-surface").evaluate((surface) => surface.scrollTop);
  await page.keyboard.press("Alt+ArrowDown");
  await expect
    .poll(() =>
      page
        .locator(".md-surface")
        .evaluate((surface, start) => Math.abs(surface.scrollTop - start), before),
    )
    .toBeGreaterThan(2);
  await page.locator(".md-surface").hover();
  await page.mouse.wheel(0, 200);
  const taken = await waitForEditorScrollToSettle(page);
  await expect
    .poll(() => page.locator(".md-surface").evaluate((surface) => surface.scrollTop), {
      message: "the focal journey resumed after the reader scrolled directly",
    })
    .toBeCloseTo(taken, 0);
});
