import { expect, test } from "@playwright/test";

/*
 * With wrapping off, the last character of the longest line must not sit on the
 * edge of the window.
 *
 * Reported 2026-07-30: "if you turn off line wrap, there should still be some
 * margin on the right most screen so when you scroll right the last character
 * isn't at edge of screen making it hard to read."
 *
 * DESIGN.md §5.3 fixes a "main-surface horizontal inset: 64 px wide, 72 px
 * compact" — one inset, not a left one — and §7.3 has the
 * document on an uninterrupted plane, which a line touching the window frame is
 * not.
 *
 * **This is scroll extent, not a padding value.** Measured before building: at a
 * 600px window the surface reported `scrollWidth` 761 against a 729px-wide
 * content box, which is the 32px *leading* padding and nothing else. Scrolled
 * fully right, the content's right edge landed on 600 — the frame, exactly. So
 * the trailing inset is declared, occupies space in the box model, and is dropped
 * from the scrollable overflow region, which means it cannot be scrolled to.
 *
 * Measured on the TEXT through a `Range` rather than on `.cm-line`, whose box
 * fills the content width and would report the column's edge no matter where the
 * characters stop. That mistake once produced a phantom 14px error and a hunt for
 * a product bug that did not exist.
 */

/** The §5.3 inset this viewport resolves to, read from the token rather than retyped. */
async function inset(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--reading-inset-x")),
  );
}

/** How much clear space sits either side of the real text, right now. */
async function margins(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const frame = surface.getBoundingClientRect();

    let rightmost = -Infinity;
    let leftmost = Infinity;
    for (const line of document.querySelectorAll<HTMLElement>(".cm-line")) {
      if (!(line.textContent ?? "").trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(line);
      const box = range.getBoundingClientRect();
      if (box.width === 0) continue;
      rightmost = Math.max(rightmost, box.right);
      leftmost = Math.min(leftmost, box.left);
    }

    /*
     * The column's own leading edge, not the leftmost glyph. Notation markers
     * hang *outside* the column on a negative margin by design — §7.3's "the
     * reading column stays a clean straight line" — so the leftmost text on
     * screen is a `#`, not prose. The compact inset now keeps that marker inside
     * the frame, but the column edge remains the right control for this trailing
     * inset test.
     */
    const column = document.querySelector<HTMLElement>(".md-editor")!.getBoundingClientRect();

    return {
      after: frame.right - rightmost,
      before: column.left - frame.left,
      overflow: surface.scrollWidth - surface.clientWidth,
      atEnd: surface.scrollLeft,
    };
  });
}

/** Turn wrapping off and scroll as far right as the surface will go. */
async function unwrapAndScrollRight(page: import("@playwright/test").Page) {
  await page.keyboard.press("ControlOrMeta+Alt+z");
  expect(await page.evaluate(() => window.zdEditor!.isWrapped()), "the toggle did not run").toBe(
    false,
  );

  await page.evaluate(async () => {
    const nextFrame = () => new Promise((done) => requestAnimationFrame(done));

    // CodeMirror measures the newly unwrapped lines on animation frames. Scroll
    // only after that round trip has settled; otherwise the helper can scroll
    // to the old end and then compare it with a wider, newly measured extent.
    await nextFrame();
    await nextFrame();

    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    surface.scrollLeft = surface.scrollWidth;
    await nextFrame();
    await nextFrame();
  });
}

test.beforeEach(async ({ page }) => {
  /*
   * 600px wide on purpose. At 900 the fixture's longest line is still narrower
   * than the window with wrapping off, so there is nothing to scroll to and every
   * assertion below passes without measuring anything — which is how the first
   * version of this file passed the case it was written for by 30px of accident.
   */
  await page.setViewportSize({ width: 600, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();
});

test("scrolled fully right, the last character keeps the §5.3 inset", async ({ page }) => {
  await unwrapAndScrollRight(page);

  const { after, overflow, atEnd } = await margins(page);

  // The preconditions, stated rather than assumed. Without them "the text keeps
  // its inset" is trivially true of a document that never reached the edge.
  expect(overflow, "nothing overflows, so there is no trailing edge to test").toBeGreaterThan(0);
  expect(atEnd, "the surface did not scroll to its end").toBe(overflow);

  // One pixel of slack for subpixel shaping, and no more: the failure this covers
  // was the whole inset missing, not a rounding error.
  expect(
    after,
    "the longest line ran to the window frame with nothing past it",
  ).toBeGreaterThanOrEqual((await inset(page)) - 1);
});

test("the leading inset is there to begin with", async ({ page }) => {
  /*
   * The control. It says which half of the inset was actually missing — the
   * reported defect is the trailing edge specifically, and a fix that simply
   * shifted the whole column would satisfy the test above and break this one.
   */
  const { before } = await margins(page);

  expect(
    before,
    "the left inset is missing too, which is a different defect",
  ).toBeGreaterThanOrEqual((await inset(page)) - 1);
});

test("the compact inset keeps the widest heading marker inside the window", async ({ page }) => {
  for (let step = 1; step <= 12; step += 1) {
    if ((await page.locator(".md-line-h6").count()) > 0) break;
    await page.evaluate((n) => {
      document.querySelector<HTMLElement>(".md-surface")!.scrollTop = n * 400;
    }, step);
    await page.waitForTimeout(80);
  }
  await page.locator(".md-line-h6").waitFor();

  const geometry = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const heading = document.querySelector<HTMLElement>(".md-line-h6")!;
    const marker = heading.querySelector<HTMLElement>(".md-notation-mark")!;
    const paragraph = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
      (line) => !line.className.includes("md-line-"),
    )!;
    const markerText = document.createRange();
    markerText.selectNodeContents(marker);

    return {
      inset: parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--reading-inset-x"),
      ),
      markerBefore: markerText.getBoundingClientRect().left - surface.getBoundingClientRect().left,
      headingDent: marker.getBoundingClientRect().right - paragraph.getBoundingClientRect().left,
    };
  });

  expect(geometry.inset, "the selected wider compact inset is not active").toBe(72);
  expect(geometry.markerBefore, "the h6 marker crosses the window frame").toBeGreaterThanOrEqual(
    -1,
  );
  expect(
    Math.abs(geometry.headingDent),
    "keeping the marker visible dented the heading text edge",
  ).toBeLessThanOrEqual(1);
});

test("wrapping off moves the reading column to the leading inset", async ({ page }) => {
  /*
   * Reported 2026-08-03: "when a user toggles word wrap off, the left margin
   * should go towards the left of the screen, so that long lines don't
   * automatically go off the end of a screen."
   *
   * At this width the wrapped measure is narrower than the viewport and centres
   * itself. Keeping that extra auto margin after unwrapping spends usable width
   * before a long line has even reached the right edge. The §5.3 inset remains;
   * it is the centred-measure slack beyond that inset that must disappear.
   */
  await page.setViewportSize({ width: 900, height: 900 });
  await page.keyboard.press("ControlOrMeta+Alt+z");
  expect(await page.evaluate(() => window.zdEditor!.isWrapped()), "the toggle did not run").toBe(
    false,
  );
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );

  const { before } = await margins(page);
  const expected = await inset(page);

  expect(
    before,
    "the centred reading measure still wastes width on the left",
  ).toBeGreaterThanOrEqual(expected - 1);
  expect(before, "the unwrapped column did not move to the leading inset").toBeLessThanOrEqual(
    expected + 1,
  );
});

test("wrapping on is unchanged: nothing scrolls sideways", async ({ page }) => {
  /*
   * The other control, and the one that decides where the fix may live. §5.3's
   * measure is narrower than the window, so with wrapping on there is nothing to
   * reach and the trailing inset must not invent anything — extra scroll width in
   * the resting state is the document able to "drift sideways", which md.css says
   * in as many words it must not.
   */
  const { overflow } = await margins(page);

  expect(overflow, "the document can be scrolled sideways with wrapping on").toBeLessThanOrEqual(1);
});
