import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

/*
 * Auto-pairing — vision §6.1.
 *
 * Reported 2026-07-30: "we need auto pair. so if I type [ or { then it auto
 * creates the other side, if I highlight text and hit one it auto wraps the text.
 * Need this for back ticks and quotes etc."
 *
 * §6.1 says nothing about pairing, so nothing here contradicts the spec; it is a
 * behaviour the spec has no opinion on. What §6.1 *does* fix is the notation, and
 * that is why backticks are the interesting case rather than a rounding-out of the
 * list: single backticks are named as notation that "stays literal", so a pair of
 * them is a construct this surface renders, and typing one is how you start it.
 *
 * The implementation is `closeBrackets` from `@codemirror/autocomplete`, taken
 * whole. The two controls below are the reason that is defensible rather than
 * lazy: the hard case in a *prose* editor is the apostrophe, and the library
 * already refuses to pair one inside a word. A hand-rolled version would have had
 * to rediscover that, and would have shipped `don''t` first.
 */

/** The document as it stands, and where the caret and selection are. */
async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    text: window.zdEditor!.text(),
    selection: window.zdEditor!.selection(),
  }));
}

/**
 * Put the caret at the end of the source line holding `needle`, one match only.
 *
 * By computed offset rather than by clicking: a click lands on a shaped column and
 * this needs an exact position. Strict about one match, because locating by content
 * is fine for reading and treacherous for a spec that edits — one once matched a
 * fence two hundred lines from the one it meant.
 */
async function caretAtEndOf(page: import("@playwright/test").Page, needle: string) {
  const at = await page.evaluate((text) => {
    const lines = window.zdEditor!.text().split("\n");
    const found = lines
      .map((line, index) => ({ line, index }))
      .filter((row) => row.line.includes(text));
    if (found.length !== 1)
      throw new Error(`${found.length} lines contain ${JSON.stringify(text)}`);
    const number = found[0]!.index;
    const start = lines.slice(0, number).reduce((total, line) => total + line.length + 1, 0);
    return start + lines[number]!.length;
  }, needle);

  await page.evaluate((pos) => window.zdEditor!.setCaret(pos), at);
  return at;
}

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
});

test("typing an opening bracket creates the closing one", async ({ page }) => {
  const at = await caretAtEndOf(page, "the source is what is on screen");

  await page.keyboard.type("[");

  const after = await state(page);
  expect(after.text.slice(at, at + 2), "no closer was inserted").toBe("[]");
  expect(after.selection.head, "the caret is not between the pair").toBe(at + 1);
});

test("typing an opening brace creates the closing one", async ({ page }) => {
  // The other half of the report, named separately because the two go through
  // different entries of the bracket list and a config that dropped one would
  // still pass the other.
  const at = await caretAtEndOf(page, "a typeset bullet would be a second version");

  await page.keyboard.type("{");

  expect((await state(page)).text.slice(at, at + 2)).toBe("{}");
});

test("typing a backtick creates the closing one", async ({ page }) => {
  /*
   * The one the library does *not* do on its own. Its default bracket list is
   * `( [ { ' "` and markdown declares no list of its own, so this is the whole of
   * what this repo had to add — and §6.1 names the single backticks around inline
   * code as notation that stays literal, which makes it the pair a markdown writer
   * types most.
   */
  const at = await caretAtEndOf(page, "an item long enough to wrap has to come back");

  /*
   * After a space, which is where an inline-code run actually starts. Measured
   * first: typed straight onto the end of the word, `closeBrackets` declines and
   * inserts one backtick — it will not open a quote when the character before the
   * caret is a word character.
   *
   * That is the same rule the apostrophe control below depends on, and it is
   * right: a backtick typed hard against a letter is far more often *closing* an
   * inline-code run than opening one, and pairing it there would put a stray
   * backtick in the middle of every one.
   */
  await page.keyboard.type(" `");

  expect((await state(page)).text.slice(at, at + 3), "backticks are not in the bracket set").toBe(
    " ``",
  );
});

test("typing an opener over a selection wraps it and keeps it selected", async ({ page }) => {
  const at = await caretAtEndOf(page, "another nested item");

  // Six characters back over "d item", by exact character steps. Shift+ArrowLeft
  // walks characters; Shift+ArrowUp/Down would walk wrapped visual rows and the
  // selection would not be the range written down here.
  for (let step = 0; step < 6; step += 1) await page.keyboard.press("Shift+ArrowLeft");
  const before = await state(page);
  expect(before.text.slice(before.selection.from, before.selection.to)).toBe("d item");

  await page.keyboard.type("[");

  const after = await state(page);
  expect(after.text.slice(at - 6, at + 2), "the selection was replaced rather than wrapped").toBe(
    "[d item]",
  );
  // Still selected, and still the same words — §8's "a control does what it says":
  // wrapping that dropped the selection would make a second wrap impossible.
  expect(after.text.slice(after.selection.from, after.selection.to)).toBe("d item");
});

test("a selection can be wrapped in backticks", async ({ page }) => {
  const at = await caretAtEndOf(page, "the nested level advances exactly fourteen pixels");

  // Four back over "long", the last word of that source line.
  for (let step = 0; step < 4; step += 1) await page.keyboard.press("Shift+ArrowLeft");

  await page.keyboard.type("`");

  /*
   * The reported case in the writer's own words — "Need this for back ticks" — and
   * the one that turns a phrase into §6.1 inline code in one keystroke.
   *
   * Note this wraps where the test above would not: with a selection there is no
   * ambiguity about whether a backtick opens or closes, so the word-character rule
   * does not apply and should not.
   */
  expect((await state(page)).text.slice(at - 4, at + 2)).toBe("`long`");
});

test("an apostrophe inside a word is left alone", async ({ page }) => {
  /*
   * The control, and the reason taking the library whole is defensible. `'` is in
   * its default bracket set, so a naive pairing would turn every contraction in
   * every document into `don''t` — in a *prose* editor, on the most ordinary
   * keystroke there is.
   *
   * `closeBrackets` already refuses: it will not open a quote when the character
   * before the caret is a word character. This asserts the behaviour rather than
   * trusting the reading, because the reading is of a dependency and the next
   * version of it is not this one.
   */
  const at = await caretAtEndOf(page, "a double-digit step");

  await page.keyboard.type(" don't");

  expect((await state(page)).text.slice(at, at + 6), "the apostrophe was doubled").toBe(" don't");
});

test("a pair typed beside a rendered fence leaves the fence alone", async ({ page }) => {
  /*
   * The second control, and the one the task asked for by name: a fence's rows are
   * hidden by a block decoration and therefore an atomic range, and an insertion
   * next to one is exactly where the fence typing bug lived.
   *
   * Asserted on the document text and on the fence still being drawn, because
   * either half can break alone — a corrupted source renders nothing, and an
   * insertion that landed inside the hidden rows would leave the text intact while
   * the fence stopped being a fence.
   */
  const at = await caretAtEndOf(page, "The line below is a shell comment");
  const before = (await state(page)).text;

  await page.keyboard.type("[");

  const after = await state(page);
  expect(after.text.slice(at, at + 2)).toBe("[]");
  expect(after.text.length, "more than the pair was inserted").toBe(before.length + 2);
  expect(
    await page.locator(".md-editor .md-line-code").count(),
    "the fence stopped being drawn as code",
  ).toBeGreaterThan(0);
});

test("a run of backticks stays literal", async ({ page }) => {
  /*
   * The one case `closeBrackets` gets wrong on this surface, and the reason
   * pairing.ts exists at all.
   *
   * Measured 2026-07-30: with the library alone, typing ``` mid-document produced
   * **four** backticks — the first pairs, the second skips its own closer, and the
   * third pairs again because the library's in-a-string check resolves against a
   * tree where inline code elsewhere in the document makes the position look open.
   * On the last line of a document the same three keystrokes came out right, which
   * is the sort of position-dependent behaviour that reads as a flake.
   *
   * Stated here as the pairing rule rather than only in
   * `editor-fence-continuation.spec.ts`, which owns the consequence: a fence with a
   * language could not be typed at all.
   */
  const at = await caretAtEndOf(page, "The paragraph after it starts");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```rust");

  expect((await state(page)).text.slice(at + 1, at + 8), "the run grew a closer").toBe("```rust");
});

test("inline code still closes itself", async ({ page }) => {
  /*
   * The control for the veto above. "Decline every backtick after a backtick" would
   * pass that test and break this one: typing `` `x` `` has to end with one pair,
   * not with the closer skipped and a third backtick appended.
   */
  const at = await caretAtEndOf(page, "a three-digit step, whose text starts");

  await page.keyboard.type(" `x`");

  expect((await state(page)).text.slice(at, at + 4)).toBe(" `x`");
});
