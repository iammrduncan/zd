import { expect, test } from "@playwright/test";

import { FIRST_BLOCK, textBox } from "../geometry";

/*
 * Where a document opens — vision §4.1:
 *
 *   "A document opens with its first block on the anchor, not at the top of the
 *    window and not centred. Where a document opens and where focus is read from
 *    are the same position, or the first pixel of scroll jumps focus several
 *    blocks at once."
 *
 * The reader has done this since `initFocus` landed. The editor did not: it
 * opened at `scrollTop` 0 and let the leading gutter push the first line down,
 * which put the block 119px below the anchor at a 900px window — measured before
 * the fix. Near enough to look deliberate, and wrong in the way §4.1 names.
 *
 * Nothing here recomputes the anchor. Both fixtures expose `anchorY()` from the
 * module that owns the ratio, because the last time a second copy of it existed
 * the tests agreed with each other and not with the product.
 */

/**
 * How far the first block's text sits from the anchor, in whole pixels.
 *
 * The measurement goes through `textBox`, which measures a range over the text
 * rather than the element's own box. That distinction is the whole reason this
 * spec's first version reported a 14px error that did not exist — the reasoning
 * is in geometry.ts, beside the helper, so the next comparison starts from it.
 */
async function offsetFromAnchor(page: import("@playwright/test").Page) {
  const box = await textBox(page, FIRST_BLOCK);
  const anchor = await page.evaluate(() => window.zdEditor!.anchorY());
  return Math.round(box.centre - anchor);
}

/** Where the surface is scrolled to right now. */
const scrollTop = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>(".md-surface")!.scrollTop);

async function openEditor(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
  // The opening scroll is a measurement, so it has to settle after the prose face
  // lands or it centres a box the fallback font sized.
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
}

test("the editor opens with its first block on the anchor", async ({ page }) => {
  await openEditor(page);

  await expect
    .poll(async () => Math.abs(await offsetFromAnchor(page)), {
      message: "the first block never came to rest on the anchor",
    })
    .toBeLessThanOrEqual(1);
});

test("the editor scrolls to do it, rather than relying on the gutter", async ({ page }) => {
  await openEditor(page);

  /*
   * The distinction that makes the test above a claim rather than a coincidence.
   * The leading gutter is 34vh and the anchor is at 1/3, so a surface that never
   * scrolls lands *near* the anchor by arithmetic accident and the two drift
   * apart the moment either number is edited. Opening is a scroll; the gutter is
   * the space that scroll moves into.
   */
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
});
