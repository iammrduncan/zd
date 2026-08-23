import { expect, test } from "@playwright/test";

/*
 * A rendered table is a stop for the caret — vision §6.1 and §4.1.
 *
 *   "tables still render weird and the caret never goes into them so they are never
 *    focused and it often skips them when going through doc" (feedback, 2026-07-30)
 *
 * Measured before building, and the report splits cleanly in two:
 *
 *   - **option+arrow was already right.** The block jump lands on the table's first
 *     source line and focus paints it, because `jumpFocusBlock` walks *source* lines
 *     and a table's lines are not blank.
 *   - **plain ArrowDown was not.** From line 83 the caret went straight to line 91,
 *     stepping over all seven lines of the table in one press. §6.1 renders a table
 *     as a block widget — `Decoration.replace({block: true})` — and a replaced range
 *     has no positions inside it, so vertical motion has nowhere to land and CodeMirror
 *     correctly moves to the next place that does.
 *
 * Correct for a code editor, wrong for this one. §4.1 makes the caret the focus
 * target, and a construct the caret can never occupy is a construct that can never be
 * read at full contrast while you walk the document — the one thing the product is
 * for. So the table gets exactly one stop, at its start, and the next press leaves it.
 *
 * One stop and not a caret *inside* it: editing cells is the phase 4 table task, and
 * a caret that could enter a widget with nowhere to go would promise that early.
 */

const VIEWPORT = { width: 1100, height: 900 };

async function open(page: import("@playwright/test").Page) {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();
}

/** The fixture's table, by the source line it starts on. */
function tableLines() {
  const lines = window.zdEditor!.text().split("\n");
  const first = lines.findIndex((line) => line.startsWith("| Construct"));
  let last = first;
  while (last < lines.length && lines[last]!.trim().startsWith("|")) last += 1;
  return { first: first + 1, last };
}

/** Put the caret at the start of a one-based source line. */
async function caretOnLine(page: import("@playwright/test").Page, line: number) {
  await page.evaluate((number) => {
    const lines = window.zdEditor!.text().split("\n");
    let at = 0;
    for (let i = 0; i < number - 1; i += 1) at += lines[i]!.length + 1;
    window.zdEditor!.setCaret(at);
  }, line);
  await settle(page);
}

/** Two frames, so the press has been laid out before anything is read. */
function settle(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

const caretLine = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.selection().line);

test("arrowing down stops on the table instead of stepping over it", async ({ page }) => {
  await open(page);
  const table = await page.evaluate(tableLines);

  // The blank line directly above the table, which is where a reader walking the
  // document arrives from.
  await caretOnLine(page, table.first - 1);
  await page.keyboard.press("ArrowDown");
  await settle(page);

  /*
   * Measured before this shipped: 83 → 91, the whole table in one press. The claim is
   * that the caret is now somewhere *in* the table's source range, not that it is on
   * one exact line — which row a block widget's start resolves to is CodeMirror's to
   * choose, and pinning it would be asserting the library.
   */
  const landed = await caretLine(page);
  expect(
    landed,
    `arrowing down stepped over the table: line ${landed}, table is ${table.first}–${table.last}`,
  ).toBeGreaterThanOrEqual(table.first);
  expect(landed, "arrowing down went past the table").toBeLessThanOrEqual(table.last);
});

test("the table is the focus target once the caret is on it", async ({ page }) => {
  await open(page);
  const table = await page.evaluate(tableLines);

  await caretOnLine(page, table.first - 1);
  await page.keyboard.press("ArrowDown");
  await settle(page);

  /*
   * §4.1: "The caret is the focus target." The whole reason a stop is worth having is
   * that focus follows it — the report's "so they are never focused" is the half that
   * matters, and a stop nobody could see would answer the letter of it and not the
   * point.
   *
   * Asserted through the widget's host rather than a bare `table` selector, because
   * CodeMirror wraps every widget in its own zero-size `img.cm-widgetBuffer` and a raw
   * tag query inside `.md-editor` is a trap this repo has already paid for once.
   */
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          [...document.querySelectorAll<HTMLElement>(".cm-content > *")]
            // `matches`, not `querySelector`. `TableWidget.toDOM` returns the `<table>`
            // itself, so the widget host *is* the table rather than containing one —
            // a filter looking for a descendant finds nothing and reads as "the table
            // was never focused" when it never looked at the table at all.
            .filter((node) => node.matches("table"))
            .map((node) => node.getAttribute("data-focus"))
            .join(","),
        ),
      { message: "the table never became the focus target" },
    )
    .toBe("target");
});

test("editing a rendered table cell keeps the document viewport still", async ({ page }) => {
  await open(page);
  const table = await page.evaluate(tableLines);
  await caretOnLine(page, table.first);
  const cell = page.locator("table.md-rendered td").first();
  await expect(cell).toBeVisible();
  await cell.click();
  const surface = page.locator(".md-surface");
  const beforeText = await page.evaluate(() => window.zdEditor!.text());
  const samples = [await surface.evaluate((element) => element.scrollTop)];

  for (const key of ["A", "B", "C", "D"]) {
    await page.keyboard.press(key);
    await settle(page);
    samples.push(await surface.evaluate((element) => element.scrollTop));
  }

  expect(
    Math.max(...samples) - Math.min(...samples),
    `scroll samples: ${samples.join(", ")}`,
  ).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => window.zdEditor!.text())).not.toBe(beforeText);
  await expect(cell).toBeFocused();
});

test("the next press leaves the table", async ({ page }) => {
  await open(page);
  const table = await page.evaluate(tableLines);

  await caretOnLine(page, table.first - 1);
  await page.keyboard.press("ArrowDown");
  await settle(page);
  await page.keyboard.press("ArrowDown");
  await settle(page);

  // One stop, not a trap. A construct you can arrow into and not out of would be worse
  // than one you skip.
  const left = await caretLine(page);
  expect(left, `the caret is stuck on the table at line ${left}`).toBeGreaterThan(table.last);
});

test("arrowing up stops on it too", async ({ page }) => {
  await open(page);
  const table = await page.evaluate(tableLines);

  /*
   * The line directly below the table, walking back up. The same sentence read
   * backwards — a rule that held in one direction only would be a second idea about
   * what a stop is.
   *
   * Directly below and not two lines below, which is what this asked for until it was
   * read properly: from two lines away one press should land one line away, and a
   * spec expecting the table there would be asking the caret to skip a line to prove
   * it does not skip a table.
   */
  await caretOnLine(page, table.last + 1);
  await page.keyboard.press("ArrowUp");
  await settle(page);
  const landed = await caretLine(page);

  expect(
    landed,
    `arrowing up stepped over the table: line ${landed}, table is ${table.first}–${table.last}`,
  ).toBeGreaterThanOrEqual(table.first);
  expect(landed, "arrowing up did not reach the table").toBeLessThanOrEqual(table.last);
});
