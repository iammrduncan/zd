import { expect, test } from "@playwright/test";

/*
 * Finding F03: "Word Wrap needs an explicit enabled/disabled setting and a keyboard
 * shortcut. The setting, command, visible Shortcut Reference, and persistence
 * behavior must all agree." Vision §6.1: "Word wrap is an explicit setting with a
 * keyboard shortcut, and it persists. It is always available — there is no mode in
 * which wrapping stops being a choice."
 *
 * This is the live-toggle half. The setting surface and persistence are their own
 * task, and F03's own coverage note names the claim being made here: "The Word Wrap
 * shortcut changes the open editor immediately."
 *
 * Immediately is the part worth testing rather than assuming. Wrapping was a fixed
 * extension, and the cheap way to change it would have been to rebuild the editor —
 * which throws away the caret, the undo history, and the scroll position, so the
 * shortcut would work and cost you your place.
 */

const LONG_LINE = "same family, same size, same line height, same colour, same measure";

test.beforeEach(async ({ page }) => {
  // Narrow enough that the fixture's long prose lines genuinely have to wrap.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

/** How many visual rows the line containing `needle` occupies. */
async function rowsOf(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate((text) => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((element) =>
      (element.textContent ?? "").includes(text),
    );
    if (!line) return null;
    // Height over line-height, because a wrapped line is one element with several
    // rows in it — there is no per-row element to count.
    const height = line.getBoundingClientRect().height;
    const rowHeight = parseFloat(getComputedStyle(line).lineHeight);
    return Math.round(height / rowHeight);
  }, needle);
}

test("wrapping is on to begin with", async ({ page }) => {
  expect(await page.evaluate(() => window.zdEditor!.isWrapped())).toBe(true);
  // §5.3's measure is narrower than this viewport, so a 68-character line wraps.
  expect(await rowsOf(page, LONG_LINE)).toBeGreaterThan(1);
});

test("the shortcut turns wrapping off and the open document reflows at once", async ({ page }) => {
  const wrapped = await rowsOf(page, LONG_LINE);
  expect(wrapped, "the line was not wrapped to begin with").toBeGreaterThan(1);

  await page.keyboard.press("ControlOrMeta+Alt+z");

  expect(await page.evaluate(() => window.zdEditor!.isWrapped()), "the toggle did not run").toBe(
    false,
  );
  // F03's own words: the shortcut "changes the open editor immediately". No reload,
  // no remount, no second keypress.
  expect(await rowsOf(page, LONG_LINE), "the line still wraps").toBe(1);
});

test("the shortcut turns wrapping back on", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Alt+z");
  // Checked in the middle, deliberately. Asserting only the end state passes with a
  // toggle that does nothing at all, since wrapping starts and finishes on.
  expect(await rowsOf(page, LONG_LINE), "wrapping never went off").toBe(1);

  await page.keyboard.press("ControlOrMeta+Alt+z");

  expect(await page.evaluate(() => window.zdEditor!.isWrapped())).toBe(true);
  expect(await rowsOf(page, LONG_LINE), "wrapping did not come back").toBeGreaterThan(1);
});

test("toggling keeps the caret, the document, and the scroll position", async ({ page }) => {
  await page.locator(".cm-content").click();
  const before = await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line) => line.includes("same family, same size"));
    const at = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0) + 5;
    window.zdEditor!.setCaret(at);
    document.querySelector(".md-surface")!.scrollTop = 600;
    return { head: at, text: window.zdEditor!.text() };
  });
  await page.waitForTimeout(200);
  const anchoredAt = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((element) =>
      (element.textContent ?? "").includes("same family, same size"),
    );
    return Math.round(line!.getBoundingClientRect().top);
  });

  await page.keyboard.press("ControlOrMeta+Alt+z");
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((element) =>
      (element.textContent ?? "").includes("same family, same size"),
    );
    return {
      head: window.zdEditor!.selection().head,
      text: window.zdEditor!.text(),
      lineTop: Math.round(line!.getBoundingClientRect().top),
    };
  });

  /*
   * The whole reason this is a compartment. Rebuilding the view would have been the
   * shorter change and would have passed the reflow tests above while quietly losing
   * every one of these.
   *
   * Measured as where the caret's own line sits on screen, not as a `scrollTop`
   * number. Unwrapping makes every line shorter, so the content above the viewport
   * shrinks and the same `scrollTop` shows different text — keeping the number fixed
   * would be the jump rather than the absence of one. This asserted `scrollTop === 600`
   * until 2026-07-31 and passed only because the registry listened in the bubble phase
   * and CodeMirror scrolled the caret into view first, landing near 600 by coincidence.
   * Fixing that scroll jump is what exposed the assertion.
   */
  expect(after.head, "the caret moved").toBe(before.head);
  expect(after.text, "the document changed").toBe(before.text);
  expect(Math.abs(after.lineTop - anchoredAt), "the caret's line jumped on screen").toBeLessThan(
    40,
  );
});

test("the Reference lists it, so it is discoverable", async ({ page }) => {
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Period");

  const row = await page
    .locator(".zd-reference-row", { hasText: "wrap" })
    .first()
    .evaluate((element) => ({
      chord: element.querySelector(".zd-reference-chord")?.textContent?.trim() ?? "",
      available: element.getAttribute("data-available"),
    }));

  // F03 requires the command, the shortcut and the Reference to agree. §7.1 makes
  // the Reference render the registry, so listing it is the registry's doing — what
  // this checks is that the row is actually there and claims to work.
  expect(row.chord.toLowerCase(), "the row does not show the chord").toContain("z");
  expect(row.available, "word wrap is shown as unavailable").toBe("true");
});

/*
 * "when wordrap is off, stuff goes off the side of screen and I cannot scroll right
 * to see it" (feedback, 2026-07-31).
 *
 * Which made the toggle shipped the same day worse than useless in one direction: you
 * could stop lines wrapping and then not read what you had unwrapped.
 *
 * Measured before changing anything, at a width narrow enough that unwrapped lines
 * genuinely cannot fit. `.md-surface` had `scrollWidth` 746 against `clientWidth` 520,
 * so the content was there and overflowing — and `overflow-x: hidden` meant a reader
 * could not reach it. Setting `scrollLeft` from script moved it, which is the tell:
 * `hidden` still scrolls programmatically and denies it to the person.
 *
 * The surface is where this belongs rather than the column or CodeMirror's scroller.
 * A heading's `#` hangs outside the column with a negative margin (§6.1: notation
 * lives outside the prose column), so a scroll container on the column would clip the
 * markers at its left edge. The surface is wider than the column by the §5.3 inset,
 * and the markers hang into that inset.
 */

test("with wrapping off, the end of a long line can be reached", async ({ page }) => {
  // Narrower than the reading measure, so unwrapped lines must overflow.
  await page.setViewportSize({ width: 520, height: 800 });
  await page.keyboard.press("ControlOrMeta+Alt+z");
  await page.waitForTimeout(300);

  const reached = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const overflows = surface.scrollWidth > surface.clientWidth;

    // Scroll as far right as the surface allows, the way a reader would.
    surface.scrollLeft = surface.scrollWidth;
    await new Promise((done) => requestAnimationFrame(done));

    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((element) =>
      (element.textContent ?? "").includes("same family, same size"),
    )!;
    const box = line.getBoundingClientRect();
    const frame = surface.getBoundingClientRect();
    return {
      overflows,
      scrolled: Math.round(surface.scrollLeft),
      // The line's own right edge, inside the surface's box or beyond it.
      endVisible: box.right <= frame.right + 1,
      overflowX: getComputedStyle(surface).overflowX,
    };
  });

  expect(reached.overflows, "nothing overflowed, so this proves nothing").toBe(true);
  expect(reached.overflowX, "the surface refuses horizontal scrolling").not.toBe("hidden");
  expect(reached.scrolled, "the surface would not scroll sideways at all").toBeGreaterThan(0);
  // What the reader actually asked for: the text that ran off the side is readable.
  expect(reached.endVisible, "the end of the line still cannot be seen").toBe(true);
});

test("with wrapping on, the document never scrolls sideways", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 800 });
  await page.waitForTimeout(200);

  const sideways = await page.evaluate(async () => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    surface.scrollLeft = 400;
    await new Promise((done) => requestAnimationFrame(done));
    return {
      overflow: surface.scrollWidth - surface.clientWidth,
      left: Math.round(surface.scrollLeft),
    };
  });

  /*
   * The half that must not regress. §5.3's measure is the whole reading experience;
   * a surface that can drift sideways while every line already fits would be a new
   * way to lose your place, and `overflow-x: auto` only scrolls what overflows.
   */
  expect(sideways.overflow, "the wrapped document overflows its own width").toBeLessThanOrEqual(0);
  expect(sideways.left, "the wrapped document scrolled sideways").toBe(0);
});

test("scrolling sideways draws no scrollbar", async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 800 });
  await page.keyboard.press("ControlOrMeta+Alt+z");
  await page.waitForTimeout(300);

  const drawn = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    return {
      scrollbarWidth: getComputedStyle(surface).scrollbarWidth,
      // A drawn horizontal scrollbar takes height from the content box.
      stolen: surface.offsetHeight - surface.clientHeight,
    };
  });

  // §7.3 forbids an application scrollbar, track, thumb, indicator or paging
  // affordance on either axis. The OS overlay during a gesture is the platform's.
  expect(drawn.scrollbarWidth, "a scrollbar is drawn").toBe("none");
  expect(drawn.stolen, "a scrollbar is stealing layout height").toBe(0);
});

test("the choice survives a reload", async ({ page }) => {
  /*
   * §6.1: word wrap "is an explicit setting with a keyboard shortcut, and it
   * persists". DESIGN.md §7.6 says the same thing from the other end — it is "a
   * suite preference applied to every document", so the choice outlives both the
   * document it was made in and the window it was made in.
   *
   * The half of F03 that the live toggle did not cover: the first prototype's
   * setting reached the open editor and then forgot itself.
   */
  await page.keyboard.press("ControlOrMeta+Alt+z");
  expect(await page.evaluate(() => window.zdEditor!.isWrapped()), "the toggle did not run").toBe(
    false,
  );

  await page.reload();
  await page.locator(".cm-line").first().waitFor();

  expect(
    await page.evaluate(() => window.zdEditor!.isWrapped()),
    "the document came back wrapped after the setting was turned off",
  ).toBe(false);
  // Not just the flag — the document actually opened unwrapped.
  expect(await rowsOf(page, LONG_LINE), "the line wrapped again after a reload").toBe(1);
});

test("a reload with nothing stored opens wrapped", async ({ page }) => {
  // The control. Every assertion above would also pass on a surface that had
  // simply stopped wrapping, and §7.6 fixes the default at on.
  await page.reload();
  await page.locator(".cm-line").first().waitFor();

  expect(await page.evaluate(() => window.zdEditor!.isWrapped())).toBe(true);
  expect(await rowsOf(page, LONG_LINE)).toBeGreaterThan(1);
});

test("the preference reaches a document that was never toggled", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Alt+z");

  // §7.6's "applied to every document", which is the difference between a
  // preference and this editor's own state. Opening the *code* fixture is opening
  // a different document on the same surface.
  await page.goto("/dev/editor.html?doc=code");
  await page.locator(".cm-line").first().waitFor();

  expect(
    await page.evaluate(() => window.zdEditor!.isWrapped()),
    "a different document ignored the suite preference",
  ).toBe(false);
});
