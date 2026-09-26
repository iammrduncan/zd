import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

/*
 * Before a caret exists, the editor focuses whatever the reading anchor sits in —
 * vision §4.1: "Before a caret is placed, focus follows the vertical reading
 * anchor and scrolling moves it."
 *
 * The anchor is a single y coordinate, so some of the time it lands in the gap
 * between two blocks. The reader has always handled that: `blockAtY` returns "the
 * block the anchor sits in, or the nearest one when it lands in a gap." The editor
 * did not — a markdown source has real blank lines between blocks, and focusing one
 * means focusing nothing at all, on a surface whose entire job is to dim everything
 * that is not the target. So scrolling could leave a document uniformly grey.
 *
 * This is the same class of defect as the list-focus divergence: one rule that each
 * surface answered differently, where §6 says the editor "is not a second mode".
 *
 * Note what is *not* changed here. `blockRange` deliberately gives a blank line its
 * own target when the **caret** is on one — you are typing there, and silently
 * focusing the paragraph above would be worse. The snap belongs to the anchor path
 * alone, because the anchor has no intent behind it.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
});

/**
 * Every scroll position's focus target, without ever placing a caret.
 *
 * Reports whether the target carries anything at all, rather than whether it has
 * text. A horizontal rule is a legitimate target with no text — the reader focuses
 * its `<hr>` and the editor focuses the row a rule is drawn on — so "no text" on its
 * own would have failed the reader at the one scroll position where its rule is at
 * the anchor, which is not a defect. The closed list of text-free constructs is `HR`
 * and `.md-line-rule`; anything else with neither text nor a child element is a
 * blank source line, and focusing one means focusing nothing.
 */
async function targetsWhileScrolling(page: import("@playwright/test").Page, selector: string) {
  const furthest = await page
    .locator(".md-surface")
    .evaluate((surface) => surface.scrollHeight - surface.clientHeight);
  const seen: { scrollTop: number; carries: boolean }[] = [];

  // Every 100px through the whole document, so a gap between blocks is hit
  // whatever the fixture's exact rhythm is rather than at a position picked to
  // make the test pass.
  for (let top = 0; top <= furthest; top += 100) {
    await page.locator(".md-surface").evaluate((surface, next) => {
      surface.scrollTop = next;
    }, top);
    await expect
      .poll(
        () =>
          page.evaluate((target) => {
            const element = document.querySelector<HTMLElement>(target);
            const isRule = element?.tagName === "HR" || element?.classList.contains("md-line-rule");
            // CodeMirror puts a <br> in an empty line; it is not readable content.
            const content = [...(element?.children ?? [])].filter(
              (child) => child.tagName !== "BR",
            );
            return Boolean(
              element && (element.textContent?.trim() !== "" || content.length > 0 || isRule),
            );
          }, selector),
        { message: `reading focus never reached readable content at scrollTop ${top}` },
      )
      .toBe(true);
    seen.push({ scrollTop: top, carries: true });
  }
  return seen;
}

test("the editor always focuses something readable, at every scroll position", async ({ page }) => {
  await openEditor(page, { height: 700 });

  const seen = await targetsWhileScrolling(page, '.md-editor [data-focus="target"]');
  const empty = seen.filter((row) => !row.carries);

  /*
   * §4.1 dims everything that is not the target, so a target with no text is a
   * document that is entirely dimmed with nothing at full contrast. Measured at
   * a 700px viewport this used to happen at scrollTop 700 and 1400 among others —
   * the anchor landing on a blank source line between two blocks.
   */
  expect(
    empty.map((row) => row.scrollTop),
    "the anchor focused a blank line, so nothing on screen is at full contrast",
  ).toEqual([]);
  expect(seen.length, "the document did not scroll, so nothing was measured").toBeGreaterThan(5);
});

test("a caret on a blank line still focuses that blank line", async ({ page }) => {
  await openEditor(page, { height: 700 });

  const blank = await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line, i) => i > 2 && line === "");
    const at = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(at);
    return index + 1;
  });
  await expect.poll(() => page.evaluate(() => window.zdEditor!.selection().line)).toBe(blank);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        targets: document.querySelectorAll('.md-editor [data-focus="target"]').length,
        text: document.querySelector('.md-editor [data-focus="target"]')?.textContent ?? "",
      })),
    )
    .toEqual({ targets: 1, text: "" });
  const onBlank = {
    line: blank,
    ...(await page.evaluate(() => ({
      caretLine: window.zdEditor!.selection().line,
      targets: document.querySelectorAll('.md-editor [data-focus="target"]').length,
      text: document.querySelector('.md-editor [data-focus="target"]')?.textContent ?? "",
    }))),
  };

  /*
   * The half that must not change. `blockRange` gives a blank line its own target
   * on purpose — with a caret there you are about to type, and quietly focusing the
   * paragraph above would move the highlight away from where you are working. Only
   * the anchor snaps, because only the anchor has no intent behind it.
   */
  expect(onBlank.caretLine, "the caret did not land on the blank line").toBe(onBlank.line);
  expect(onBlank.targets, "the blank line the caret is on is not the target").toBe(1);
  expect(onBlank.text, "focus snapped to a neighbouring block despite the caret").toBe("");
});
