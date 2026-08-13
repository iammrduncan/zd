import { expect, test } from "@playwright/test";

// DESIGN.md §7.6: "Line means one laid-out visual line… Line targeting and
// painting use the rows of the actual shaped galley at the presented wrap width.
// Proportional glyph widths, mixed semantic styles, Markdown markers, CJK, and
// emoji may never fall back to a characters-per-line estimate. Other wrapped
// rows in the same paragraph remain context at the current Dim Level."
//
// Finding F04's regression name for this is
// `shaped_reading_focus_targets_one_real_proportional_visual_row`, and the whole
// point of it is that a row is a fact about the laid-out text, not an arithmetic
// guess about it. So every assertion here is geometric: what the engine actually
// painted, measured off the screen.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
  /*
   * Every assertion in this file is geometric, so every one of them depends on the
   * prose face having landed. Without this the fallback font lays the paragraph out,
   * Playwright computes a click box from it, the web font swaps, and the click lands
   * in a different line — the target came back painted in the H1 at the top of the
   * document, which is exactly the failure the comment on `owner` below describes.
   *
   * `document.fonts.ready` alone is not enough and never was: it resolves
   * immediately when nothing has requested the face yet. Ask for it by name first,
   * the way reading-surface.spec.ts does.
   */
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
  await page.evaluate(() => window.zdEditor!.setGranularity("line"));
});

/** The rectangles the target is painted across, top-left first. */
async function targetRows(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const marked = document.querySelector('.cm-line [data-focus="target"]');
    if (!marked) return null;
    const range = document.createRange();
    range.selectNodeContents(marked);
    return {
      text: marked.textContent ?? "",
      // Which line the row belongs to. Without this, every assertion below is
      // satisfied by a row in the wrong line entirely — which is what the first
      // version of this file did, while the implementation painted the heading
      // at the top of the document no matter where the caret went.
      owner: marked.closest(".cm-line")!.textContent ?? "",
      colour: getComputedStyle(marked).color,
      rects: [...range.getClientRects()].map((r) => ({
        top: Math.round(r.top),
        height: Math.round(r.height),
      })),
    };
  });
}

/**
 * Click into a line and wait until the painted row is actually in it.
 *
 * The row is *measured*, not derived: `requestMeasure` reads it in CodeMirror's own
 * measure phase and a microtask carries the answer back as a transaction, so it
 * lands the frame after the click by design. Until then the painted row is
 * whatever it was before — on a fresh page that is the H1 at position 0, so reading
 * one tick too early asserted about the top of the document while the caret was in
 * the middle of it. The failure read as "focus does not follow the caret" and it
 * was this: four tests in this file clicked and then read in the same breath.
 *
 * Polled on the claim rather than slept for a fixed number of frames, so a genuine
 * regression fails here for the same reason the assertion after it would.
 */
async function clickAndSettle(
  page: import("@playwright/test").Page,
  line: import("@playwright/test").Locator,
  options?: { position: { x: number; y: number } },
) {
  const whole = await line.textContent();
  await line.click(options);
  await expect
    .poll(async () => (await targetRows(page))?.owner, {
      message: "the painted row never arrived in the clicked line",
    })
    .toBe(whole);
  return whole;
}

test("the target is one row, not the whole source line", async ({ page }) => {
  // The fixture's first paragraph is a long soft-wrapped one.
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  const whole = await clickAndSettle(page, line);

  const painted = await targetRows(page);
  expect(painted, "nothing was marked as the target").not.toBeNull();
  expect(painted!.owner, "the target landed in a different line").toBe(whole);
  expect(painted!.rects.length, "the target spans more than one row").toBe(1);
  expect(painted!.text.length, "the target is the entire source line").toBeLessThan(whole!.length);
  // §7.6: the target "restores full role contrast only across that row", so the
  // row has to actually be brighter than the line it sits in.
  expect(painted!.colour).not.toBe(await line.evaluate((el) => getComputedStyle(el).color));
});

test("the row is the one the caret is in, and moving down changes it", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  await clickAndSettle(page, line, { position: { x: 20, y: 4 } });
  const first = await targetRows(page);

  // Down moves the caret one *visual* row under wrapping, which is exactly the
  // unit in question.
  await page.keyboard.press("ArrowDown");

  /*
   * Waited for, not assumed. The row is *measured* — `requestMeasure` reads it in
   * CodeMirror's own measure phase and a microtask carries the answer back as a
   * transaction — so it lands a frame after the keypress by design, not by
   * slowness. Reading straight after the press asserted on the previous row about
   * half the time, and the failure read as "focus does not follow the caret".
   *
   * Polling on the claim rather than sleeping a fixed number of frames: the thing
   * being waited for is "the painted row changed", which is what the assertion
   * below is about, so a timeout here fails for the same reason the assertion
   * would.
   */
  await expect
    .poll(async () => (await targetRows(page))?.text, {
      message: "the painted row never moved off the one the caret started in",
    })
    .not.toBe(first!.text);

  const second = await targetRows(page);

  expect(first!.owner, "the target did not start in the clicked line").toBe(
    await line.textContent(),
  );
  expect(second!.text).not.toBe(first!.text);
  expect(second!.rects[0]!.top, "the target did not move down a row").toBeGreaterThan(
    first!.rects[0]!.top,
  );
});

test("the painted row is exactly the row the engine laid out", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  await clickAndSettle(page, line, { position: { x: 20, y: 4 } });

  const measured = await page.evaluate(() => {
    const marked = document.querySelector('.cm-line [data-focus="target"]')!;
    const owner = marked.closest(".cm-line")!;

    // Every row the engine shaped for this line, straight off the layout.
    const lineRange = document.createRange();
    lineRange.selectNodeContents(owner);
    const rows = [...lineRange.getClientRects()].map((r) => Math.round(r.top));

    const targetRange = document.createRange();
    targetRange.selectNodeContents(marked);
    const painted = [...targetRange.getClientRects()].map((r) => Math.round(r.top));

    return { rows, painted };
  });

  // The claim §7.6 makes: the target is one of the rows the engine produced at
  // the presented wrap width — not a range that happens to look about right.
  // A characters-per-line estimate would land between two of these.
  expect(measured.rows.length, "the fixture line stopped wrapping").toBeGreaterThan(1);
  expect(measured.painted).toHaveLength(1);
  expect(measured.rows).toContain(measured.painted[0]);
});

test("other rows of the same paragraph stay context", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  await clickAndSettle(page, line, { position: { x: 20, y: 4 } });

  const owner = await page.evaluate(() => {
    const marked = document.querySelector('.cm-line [data-focus="target"]')!;
    return marked.closest(".cm-line")!.getAttribute("data-focus");
  });

  // §7.6 spells this out, and it is the difference between line granularity and
  // paragraph granularity: the rest of the caret's own line dims with everything
  // else rather than coming along for the ride.
  expect(owner).toBe("context");
});

test("anchor-following reading paints one shaped row without a caret", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  const whole = await line.textContent();

  await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const paragraph = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((row) =>
      row.textContent?.includes("Everything that makes reading good"),
    )!;
    const anchor = window.zdEditor!.anchorY();

    // Put the anchor inside the paragraph without ever placing a caret. Scrolling
    // is the reader's input in this state; a click would turn this back into the
    // editing case the tests above already cover.
    surface.scrollTop += paragraph.getBoundingClientRect().top - anchor + 4;
    for (let i = 0; i < 12; i += 1) {
      await new Promise((done) => requestAnimationFrame(done));
    }
  });

  await expect
    .poll(async () => (await targetRows(page))?.owner, {
      message: "the reading anchor never painted a row in the paragraph",
    })
    .toBe(whole);

  const reading = await page.evaluate(() => {
    const marked = document.querySelector('.cm-line [data-focus="target"]')!;
    const owner = marked.closest(".cm-line")!;
    const ownerRange = document.createRange();
    ownerRange.selectNodeContents(owner);
    const targetRange = document.createRange();
    targetRange.selectNodeContents(marked);

    return {
      hasCaret: window.zdEditor!.hasCaret(),
      ownerFocus: owner.getAttribute("data-focus"),
      ownerRows: ownerRange.getClientRects().length,
      targetRows: targetRange.getClientRects().length,
    };
  });

  expect(reading.hasCaret, "the test placed a caret and stopped measuring reading").toBe(false);
  expect(reading.ownerRows, "the fixture paragraph stopped wrapping").toBeGreaterThan(1);
  expect(reading.targetRows, "reading focus painted more than one shaped row").toBe(1);
  expect(reading.ownerFocus, "the other rows of the paragraph did not stay dimmed").toBe("context");
});

test("paragraph granularity still takes the whole block", async ({ page }) => {
  await page.evaluate(() => window.zdEditor!.setGranularity("paragraph"));
  const line = page.locator(".cm-line", { hasText: "Everything that makes reading good" }).first();
  await line.click();

  const marks = await page.evaluate(() => ({
    rows: document.querySelectorAll('.cm-line [data-focus="target"]').length,
    lines: document.querySelectorAll('.cm-line[data-focus="target"]').length,
  }));

  expect(marks.rows, "paragraph granularity painted a row").toBe(0);
  expect(marks.lines).toBeGreaterThan(1);
});
