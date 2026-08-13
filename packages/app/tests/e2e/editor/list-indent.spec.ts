import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

/*
 * Tab and Shift-Tab indent and outdent list items — vision §6.1, "structure
 * continues as you type it, the way a chat composer does" (feedback, 2026-07-29).
 *
 * The one decision worth stating up front: **the indent is the previous sibling
 * item's content column, not a fixed number of spaces.** CommonMark nests an item
 * under the one above only if it reaches that item's content column, and the
 * fixture is deliberately built to expose the difference — `- ` puts content at
 * column 2 and `10. ` puts it at column 4. Indenting a two-space unit under a
 * `9. ` marker produces a sibling list rather than a nested one: markdown that
 * parses, renders wrongly, and looks like the feature working.
 *
 * Tab is only claimed when the selection is actually in a list. Everywhere else it
 * keeps its traversal meaning — CodeMirror leaves Tab unbound by default for that
 * reason, and §9 claims keyboard-only editing, so swallowing it document-wide
 * would trap the keyboard on a surface whose only other way out is Escape.
 *
 * Six of these were red before the commands existed. The two that were not — the
 * first item of a list, and Shift-Tab at the outermost level — are green whenever
 * Tab does nothing at all, which was true before the feature and is the point of
 * writing them down: they are the cases where "does nothing" is the specification
 * rather than the absence of one, and they only start carrying weight once
 * everything around them moves.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
});

/** The source, split into lines — what a save would write. */
const lines = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.text().split("\n"));

/**
 * Put the caret `into` characters along the one line containing `text`.
 *
 * Located by content and then converted to a number, because a spec that *edits*
 * must not re-find its line after the edit — the text it matched on has moved.
 * Strict about a single match: an earlier spec matched a fence two hundred lines
 * from the one it meant.
 */
async function caretOn(page: import("@playwright/test").Page, text: string, into = 4) {
  const at = await page.evaluate(
    ({ needle, offset }) => {
      const all = window.zdEditor!.text().split("\n");
      const found = all.filter((line) => line.includes(needle));
      if (found.length !== 1) return { error: found.length };
      const number = all.findIndex((line) => line.includes(needle));
      const start = all.slice(0, number).reduce((total, line) => total + line.length + 1, 0);
      window.zdEditor!.setCaret(start + Math.min(offset, all[number]!.length));
      return { number };
    },
    { needle: text, offset: into },
  );
  expect(at.error, `${JSON.stringify(text)} does not identify exactly one line`).toBeUndefined();
  return at.number!;
}

test("Tab indents a list item to the column its previous sibling's content starts in", async ({
  page,
}) => {
  const at = await caretOn(page, "a typeset bullet");

  await page.keyboard.press("Tab");

  const after = await lines(page);
  // `- the source is what is on screen` puts its content at column 2, so that is
  // where this item's marker has to land to become its child.
  expect(after[at], "the item did not indent to its sibling's content column").toBe(
    "  - a typeset bullet would be a second version of the truth",
  );
});

test("an item that wraps across source lines moves as one item", async ({ page }) => {
  const at = await caretOn(page, "an item long enough to wrap");
  const before = await lines(page);

  await page.keyboard.press("Tab");

  const after = await lines(page);

  // Both lines, or it stops being one item: the marker line would nest and the
  // continuation would be left behind at the old column, which is a different
  // block. This is the whole reason the command works on items and not on lines.
  expect(after[at]).toBe(`  ${before[at]}`);
  expect(after[at + 1], "the continuation line was left behind").toBe(`  ${before[at + 1]}`);
});

test("an ordered item indents by its marker's width, not by a fixed two spaces", async ({
  page,
}) => {
  const at = await caretOn(page, "a three-digit step");

  await page.keyboard.press("Tab");

  const after = await lines(page);
  /*
   * `99. ` puts its content at column 4. Two spaces would leave this item short of
   * that, and CommonMark would read it as a new list rather than a nested one —
   * the markdown equivalent of an off-by-one that still parses.
   */
  expect(after[at], "a fixed indent unit was used instead of the sibling's column").toBe(
    "    100. a three-digit step, whose text starts exactly where the one above does",
  );
});

test("Shift-Tab outdents a nested item back to its parent's column", async ({ page }) => {
  const at = await caretOn(page, "another nested item");

  await page.keyboard.press("Shift+Tab");

  const after = await lines(page);
  expect(after[at], "the item did not return to its parent's column").toBe("- another nested item");
});

test("Shift-Tab at the outermost level leaves the item alone", async ({ page }) => {
  const at = await caretOn(page, "a typeset bullet");
  const before = await lines(page);

  await page.keyboard.press("Shift+Tab");

  // Nothing to outdent to. Doing nothing beats inventing a meaning for it, and
  // beats stripping the marker and silently turning the item into a paragraph.
  expect((await lines(page))[at]).toBe(before[at]);
});

test("Tab on the first item of a list changes nothing", async ({ page }) => {
  const at = await caretOn(page, "the source is what is on screen");
  const before = await lines(page);

  await page.keyboard.press("Tab");

  // There is no sibling above to become a child of. CommonMark has no way to
  // express a list whose first item is already nested, so the honest answer is
  // that the key does nothing here rather than producing indented text that is no
  // longer a list at all.
  expect((await lines(page))[at], "the first item indented into something else").toBe(before[at]);
});

test("a selection spanning several items indents all of them and keeps their nesting", async ({
  page,
}) => {
  const at = await caretOn(page, "an item with a nested list beneath it", 0);
  const before = await lines(page);

  // Selected the way a person would, rather than through a test-only hook: down
  // with shift held, across the parent item and both of its children.
  for (let press = 0; press < 4; press += 1) await page.keyboard.press("Shift+ArrowDown");

  await page.keyboard.press("Tab");

  const after = await lines(page);

  /*
   * Every line moved by the same two columns, so the parent is still the parent
   * and the children are still one level inside it.
   *
   * **This is not the test that catches flattening.** Deleting the
   * ancestor-dropping filter in lists.ts leaves this passing, because
   * Shift+ArrowDown walks *wrapped visual rows* and the selection does not end
   * where the line arithmetic here suggests. The case that goes red for it is in
   * tests/unit/editor/list-indent.test.ts, where the selection is stated as offsets.
   * What this one covers is that a real multi-line selection made from the
   * keyboard reaches the command at all.
   */
  for (let offset = 0; offset <= 3; offset += 1) {
    expect(after[at + offset], `line ${at + offset} did not shift with the rest`).toBe(
      `  ${before[at + offset]}`,
    );
  }
});

test("Tab outside a list is not claimed and still leaves the editor", async ({ page }) => {
  await caretOn(page, "Everything that makes reading good");
  const before = await lines(page);

  await page.keyboard.press("Tab");

  expect(await lines(page), "Tab edited a paragraph").toEqual(before);
});

test("Tab outside a list is left to the browser", async ({ page }) => {
  /*
   * The half that matters more than the document being unchanged. §9 claims
   * keyboard-only editing and CodeMirror leaves Tab unbound precisely so the
   * keyboard can get out of a text surface — Escape drops the caret but keeps the
   * surface focused, so Tab is the only way off it.
   *
   * Measured as `defaultPrevented` rather than as "focus moved". Focus moving
   * needs somewhere to move *to*, and this dev page has no other focusable
   * element, so that assertion would have been about the fixture rather than about
   * the editor — it failed here for exactly that reason before being rewritten.
   * Whether the key was consumed is the claim; where focus goes next is the
   * browser's business.
   */
  await caretOn(page, "Everything that makes reading good");
  await page.evaluate(() => {
    (window as unknown as { zdTab?: boolean[] }).zdTab = [];
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab") {
          // Read after the editor has had it, so this reports what the editor did.
          queueMicrotask(() =>
            (window as unknown as { zdTab: boolean[] }).zdTab.push(event.defaultPrevented),
          );
        }
      },
      false,
    );
  });

  await page.keyboard.press("Tab");

  const consumed = await page.evaluate(() => (window as unknown as { zdTab: boolean[] }).zdTab);
  expect(consumed, "the Tab keydown never reached the listener").toHaveLength(1);
  expect(consumed[0], "Tab was swallowed in prose, trapping the keyboard").toBe(false);
});
