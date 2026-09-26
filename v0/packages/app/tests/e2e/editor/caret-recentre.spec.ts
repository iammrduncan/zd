import { expect, test } from "@playwright/test";

import {
  beginEditorScrollTrace,
  endEditorScrollTrace,
  waitForEditorScrollToSettle,
} from "./harness";

/*
 * The caret comes back to the anchor when it reaches an edge — vision §4.1.
 *
 *   "the other scroll thing is that when you reach the bottom of a page and scroll down it
 *    shouldn't just scroll and move down from there it should smoothly return the caret
 *    back to center by scrolling that doc position to the center of the page again."
 *    (feedback, 2026-07-30, blocking)
 *
 * Measured before building, walking ArrowDown 45 times down a fresh document in an 800px
 * window: the caret climbs 96, 152, 208 … 768, and then from press 24 onward it sits at
 * 745–773 for every remaining press while `scrollTop` walks 409, 437, 465 … 1131. The
 * caret is glued to the bottom edge and the document slides past underneath it. That is
 * CodeMirror's scroll-into-view working exactly as designed — it puts the caret *barely*
 * on screen — and it is not what §4.1 wants, which is one place the eye reads from.
 *
 * **"Centre" in the report means the anchor.** §4.1 puts it "above the middle of the
 * window, roughly a third of the way down, where the eye rests when reading rather than
 * where a ruler would put it", and that ratio is the decision — the sentence was reworded
 * to follow it on 2026-07-30 rather than the other way round.
 *
 * Not typewriter mode, which is a toggle that pins *every* line (§7.6). This fires only at
 * an edge, so ordinary arrowing through the middle of the window moves nothing — which is
 * the second test here, and it is the one that stops this quietly becoming that.
 */

const VIEWPORT = { width: 1100, height: 800 };

async function open(page: import("@playwright/test").Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();
  await page.evaluate(() => window.zdEditor!.setCaret(0));
}

/**
 * Where the caret's row sits inside the surface, and where the anchor is.
 *
 * `caretY()` and not the DOM selection rect, and that was paid for. This surface has no
 * `.cm-cursor` element — the browser draws the caret and editor.css colours it with
 * `caret-color` — so the only DOM handle is a collapsed `Range`, and **a collapsed range
 * on a blank line reports no rect at all**. The press that triggers the return lands on
 * whatever line comes next, a markdown document is full of blank ones, and the
 * measurement went blind on exactly those. The view knows where the caret is the whole
 * time; asking it is the fix, the same way `anchorY()` is asked rather than restated.
 */
function caretInSurface() {
  const surface = document.querySelector<HTMLElement>(".md-surface")!;
  const box = surface.getBoundingClientRect();
  const caret = window.zdEditor!.caretY();

  return {
    caret: caret === null ? null : caret - box.top,
    anchor: window.zdEditor!.anchorY() - box.top,
    height: box.height,
    scrollTop: surface.scrollTop,
  };
}

/**
 * Put the caret on a real row below the middle without triggering the behavior under test.
 *
 * A pointer selection deliberately does not start an edge return: the pointer says where the
 * reader wants the caret. This makes it an honest short approach to the edge. Driving from the top
 * raced the product's return under full-suite load; by the time the test process observed the
 * bottom row, the browser had already completed the correct 500 ms journey.
 */
async function placeCaretNearBottom(page: import("@playwright/test").Page, height: number) {
  await page.locator(".md-surface").evaluate((surface: HTMLElement) => {
    const furthest = Math.max(0, surface.scrollHeight - surface.clientHeight);
    surface.scrollTop = Math.min(furthest, Math.round(surface.scrollHeight * 0.45));
  });
  await waitForEditorScrollToSettle(page);

  const point = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const box = surface.getBoundingClientRect();
    const candidates = [...document.querySelectorAll<HTMLElement>(".cm-line")]
      .map((line) => line.getBoundingClientRect())
      .filter(
        (line) =>
          line.width > 20 && line.top >= box.top + box.height * 0.65 && line.bottom <= box.bottom,
      );
    const line = candidates[candidates.length - 1];
    if (!line) return null;
    return { x: Math.min(line.right - 2, line.left + 32), y: line.top + line.height / 2 };
  });
  expect(point, "the setup found no visible text row").not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await waitForEditorScrollToSettle(page);

  const at = await page.evaluate(caretInSurface);
  expect(at.caret, "the pointer caret could not be measured").not.toBeNull();
  expect(at.caret, "the pointer setup missed the lower viewport").toBeGreaterThan(height * 0.65);
  expect(at.caret, "the pointer setup placed the caret below the surface").toBeLessThanOrEqual(
    height,
  );
}

/** Drive the next visual rows until the measured edge-return state has settled. */
async function triggerEdgeReturn(page: import("@playwright/test").Page, height: number) {
  for (let press = 0; press < 8; press += 1) {
    const head = await page.evaluate(() => window.zdEditor!.selection().head);
    await page.keyboard.press("ArrowDown");
    await expect
      .poll(() => page.evaluate(() => window.zdEditor!.selection().head), {
        message: "the edge-triggering ArrowDown press never moved the caret",
      })
      .toBeGreaterThan(head);
    await waitForEditorScrollToSettle(page);
    const at = await page.evaluate(caretInSurface);
    if (at.caret !== null && at.caret <= Math.round(height / 3) + 56) return true;
  }
  return false;
}

test("the caret returns to the anchor rather than sticking to the bottom edge", async ({
  page,
}) => {
  await open(page);
  const { height } = await page.evaluate(caretInSurface);

  await placeCaretNearBottom(page, height);

  /*
   * And now the claim: at the bottom of the page, pressing down again returns the caret
   * to the anchor instead of scrolling one line under a caret welded to the edge.
   *
   * Polled rather than slept, because the return is eased and how long that takes is the
   * easing's business — a timeout here fails for the same reason the assertion would.
   */
  expect(
    await triggerEdgeReturn(page, height),
    "the caret never came back from the bottom edge",
  ).toBe(true);
});

test("the return is eased rather than a cut", async ({ page }) => {
  await open(page);
  const { height } = await page.evaluate(caretInSurface);

  await placeCaretNearBottom(page, height);

  // Sample the surface every frame across the one press that triggers the return. The
  // whole difference between eased and cut lives in the frames between two positions,
  // and an assertion made after things settle cannot see it.
  await beginEditorScrollTrace(page);
  expect(
    await triggerEdgeReturn(page, height),
    "the eased return never reached the reading anchor",
  ).toBe(true);

  const samples = await endEditorScrollTrace(page);
  const frames = samples.map(({ top }) => top);
  const low = Math.min(...frames);
  const high = Math.max(...frames);

  expect(high - low, "the return did not move the surface").toBeGreaterThan(60);

  /*
   * A cut produces exactly two values however many frames are sampled. Three distinct
   * positions strictly between them is the difference between motion and a jump.
   *
   * Counted rather than timed: the focal-journey duration is the easing's own number,
   * and restating it here would make this a test of the constant rather than of the
   * behaviour.
   */
  const between = new Set(frames.filter((value) => value > low + 2 && value < high - 2));
  expect(
    between.size,
    `the return cut straight to the anchor: ${frames.map(Math.round).join(", ")}`,
  ).toBeGreaterThanOrEqual(3);

  /*
   * "bottom of screen caret warp to focal point to scroll page easing is too fast"
   * (feedback, 2026-07-31, blocking).
   *
   * Intermediate frames alone allowed the whole journey to finish in about a fifth of
   * a second, which still read as a warp over the roughly half-window distance. Measure
   * the visible journey from its first changed frame until it enters the two-pixel
   * resting band. This is the user's perceptual claim, while the generous lower bound
   * leaves frame scheduling and the exact easing curve as implementation details.
   */
  const moving = samples.filter(({ top }) => top > low + 2 && top < high - 2);
  const visibleMs = moving.length > 1 ? moving[moving.length - 1]!.at - moving[0]!.at : 0;
  expect(
    visibleMs,
    `the return still warped to the anchor in ${Math.round(visibleMs)}ms`,
  ).toBeGreaterThanOrEqual(280);
});

test("a selection scroll during the return cannot strand the caret away from the anchor", async ({
  page,
}) => {
  await open(page);
  await waitForEditorScrollToSettle(page);

  // CodeMirror may apply its own selection scroll after the return has already
  // written its first frame. Reproduce that ordering deterministically: wait for
  // the app-owned journey to move, then make the later editor scroll in the same
  // painted frame. Treating that write as a document-height correction translates
  // the destination and leaves the caret exactly this scroll distance off target.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        const surface = document.querySelector<HTMLElement>(".md-surface")!;
        surface.scrollTop = 350;
        const before = surface.scrollTop;
        window.zdEditor!.setCaret(0);

        const followJourney = () => {
          if (Math.abs(surface.scrollTop - before) <= 1) {
            requestAnimationFrame(followJourney);
            return;
          }
          surface.scrollTop += 70;
          resolve();
        };
        requestAnimationFrame(followJourney);
      }),
  );
  await waitForEditorScrollToSettle(page);

  const at = await page.evaluate(caretInSurface);
  expect(at.caret, "the selection scroll left no measurable caret").not.toBeNull();
  expect(
    Math.abs(at.caret! - at.anchor),
    "the selection scroll left the caret away from the reading anchor",
  ).toBeLessThanOrEqual(0.5);
});

test("arrowing through the middle of the window moves nothing", async ({ page }) => {
  await open(page);

  /*
   * Get the caret settled inside the window first, and that setup is itself a
   * measurement worth stating: `setCaret(0)` leaves the caret *above* the top of the
   * window, because the click in `open` scrolled the surface to 352 while the first line
   * sits behind the leading gutter at 272. So the caret starts at an edge, the return
   * fires, and a control that read it there would have been measuring the very behaviour
   * it exists to rule out.
   */
  await expect
    .poll(
      async () => {
        const before = await page.locator(".md-surface").evaluate((surface) => surface.scrollTop);
        await waitForEditorScrollToSettle(page);
        const at = await page.evaluate(caretInSurface);
        return {
          onAnchor: at.caret !== null && Math.abs(at.caret - at.anchor) <= 0.5,
          still: Math.abs(at.scrollTop - before) <= 0.1,
        };
      },
      { message: "the initial edge return never came to rest on the anchor" },
    )
    .toEqual({ onAnchor: true, still: true });

  // Now nowhere near an edge, so §7.6's "Typewriter Mode is a toggle" has to keep meaning
  // something: an ordinary press moves the caret, not the document.
  const before = await page.evaluate(caretInSurface);
  const beforeHead = await page.evaluate(() => window.zdEditor!.selection().head);
  for (let press = 0; press < 3; press += 1) await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => page.evaluate(() => window.zdEditor!.selection().head))
    .toBeGreaterThan(beforeHead);
  await waitForEditorScrollToSettle(page);
  const after = await page.evaluate(caretInSurface);

  expect(after.scrollTop, "an ordinary arrow press scrolled the document").toBe(before.scrollTop);
  expect(after.caret, "the caret did not move down the window").toBeGreaterThan(before.caret!);
});
