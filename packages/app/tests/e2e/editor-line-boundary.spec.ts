import { expect, test } from "@playwright/test";

/*
 * "cmd+left-arrow and cmd+right-arrow is buggy" (feedback, 2026-07-30).
 *
 * Vague on its own, so it was measured rather than guessed at. Most of what these keys
 * do is already right, and two things that look wrong are not:
 *
 *   - `cmd+right` stopping in the middle of a blockquote line is correct. That line
 *     wraps, and line-boundary motion is per visual row, which is what wrapping means.
 *   - `cmd+left` stopping after a heading's `# ` rather than before it is defensible:
 *     the reading column's left edge is the text edge and the hash hangs outside it.
 *
 * What is actually broken is that the keys do not **settle**. Measured over three
 * presses on a heading: offset 2, then 0, then 2 again. On an indented code block:
 * 3477, 3473, 3477. Press it twice and the caret is back where it started, which is
 * the whole of the report — a list item, whose marker is part of its text, is stable.
 *
 * The invariant is the fix and it needs no knowledge of markdown: a backward command
 * must never move the caret forward, and a forward one must never move it back. The
 * layout is what confuses the default commands here, because a heading's `#` is drawn
 * to the left of the content origin by a negative margin, so "the start of this visual
 * line" resolves to two different offsets depending on where you ask from.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();
});

/** Put the caret a few characters into the line holding `needle`. */
async function caretInto(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate((text) => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line) => line.includes(text));
    if (index < 0) throw new Error(`no source line contains ${text}`);
    const start = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + 8);
    return { line: index + 1, from: start, to: start + lines[index]!.length };
  }, needle);
}

const head = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.selection().head);

/*
 * Three lines with three different kinds of notation before their text: a heading whose
 * `#` is visible and hangs in the gutter, an indented code block whose four spaces are
 * hidden, and a list item whose marker is part of the text it marks. The last one was
 * already stable, and it is here so a fix that only moves the problem shows up.
 */
const LINES = [
  { what: "a heading", needle: "# Typing in the" },
  { what: "an indented code block", needle: "    zd md README.md" },
  { what: "a list item", needle: "- the source is what" },
];

for (const { what, needle } of LINES) {
  test(`cmd+left settles at the start of ${what}`, async ({ page }) => {
    await caretInto(page, needle);

    await page.keyboard.press("ControlOrMeta+ArrowLeft");
    const first = await head(page);
    await page.keyboard.press("ControlOrMeta+ArrowLeft");
    const second = await head(page);
    await page.keyboard.press("ControlOrMeta+ArrowLeft");
    const third = await head(page);

    // Never forward. That is the whole invariant, and it is what oscillation breaks.
    expect(second, "the second press moved the caret forward").toBeLessThanOrEqual(first);
    expect(third, "the third press moved the caret forward").toBeLessThanOrEqual(second);
    // And it has to come to rest rather than creep.
    expect(third, "the caret never settled").toBe(second);
  });

  test(`cmd+right settles at the end of ${what}`, async ({ page }) => {
    await caretInto(page, needle);

    await page.keyboard.press("ControlOrMeta+ArrowRight");
    const first = await head(page);
    await page.keyboard.press("ControlOrMeta+ArrowRight");
    const second = await head(page);

    expect(second, "the second press moved the caret backward").toBeGreaterThanOrEqual(first);
    expect(second, "the caret never settled").toBe(first);
  });
}

test("the keys still reach the line's own edges", async ({ page }) => {
  // A guard against fixing the oscillation by making the keys do nothing. This line
  // has no notation and does not wrap, so both edges are exactly the source line's.
  const line = await caretInto(page, "9. a single-digit step");

  await page.keyboard.press("ControlOrMeta+ArrowLeft");
  expect(await head(page), "cmd+left did not reach the line start").toBe(line.from);

  await page.keyboard.press("ControlOrMeta+ArrowRight");
  expect(await head(page), "cmd+right did not reach the line end").toBe(line.to);
});
