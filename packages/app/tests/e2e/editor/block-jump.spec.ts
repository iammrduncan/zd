import { expect, test } from "@playwright/test";

import {
  beginEditorScrollTrace,
  endEditorScrollTrace,
  openEditor,
  waitForEditorScrollToSettle,
} from "./harness";

/*
 * "we should use short cut option+arrow-keys to jump down to the next 'focus block'…
 * if I just hit arrow key it goes line by line, if I hit option+arrow-keys right now it
 * does jump but its more editor jump than zd md focus block jump" (feedback,
 * 2026-08-01).
 *
 * Measured before building: option+down moved the caret one *source* line at a time —
 * 8, 9, 10, 11, 12 from a start on line 7 — so it crossed the middle of a paragraph
 * three times before leaving it. The paragraph on lines 7 to 9 is one focus block.
 *
 * The point of the request is the definition, not the chord. A jump that used
 * CodeMirror's own idea of a paragraph would be a second answer to a question §4.1 has
 * already answered, and this codebase's recurring defect is exactly that: the same
 * construct described twice and drifting. So these commands ask `blockRange` and
 * `sectionRange` — the functions focus itself uses — and inherit the selectable
 * granularity for free.
 *
 * The fixture's blocks near the top, which every assertion below is anchored to:
 *
 *   3–5   a paragraph
 *   7–9   a paragraph
 *   11    the `## Notation` heading
 *   13–14 a paragraph
 *   16+   a list
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
});

/** Put the caret partway into source line `number`, one-based. */
async function caretOn(page: import("@playwright/test").Page, number: number, into = 5) {
  await page.evaluate(
    ({ line, offset }) => {
      const lines = window.zdEditor!.text().split("\n");
      const start = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
      window.zdEditor!.setCaret(start + Math.min(offset, lines[line - 1]!.length));
    },
    { line: number, offset: into },
  );
}

const caretLine = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.selection().line);

test("option+down lands on the next block, not the next line", async ({ page }) => {
  await caretOn(page, 7);

  await page.keyboard.press("Alt+ArrowDown");

  /*
   * One press, one block. From inside the paragraph on 7–9 the next block is the
   * heading on 11 — the blank line on 10 is the gap between blocks and not a block, so
   * nothing should stop there.
   */
  expect(await caretLine(page), "the caret moved by a line rather than by a block").toBe(11);
});

test("pressing it repeatedly walks block by block", async ({ page }) => {
  await caretOn(page, 3);

  const visited: number[] = [];
  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("Alt+ArrowDown");
    visited.push(await caretLine(page));
  }

  // Paragraph 3–5 → paragraph 7–9 → heading 11 → paragraph 13–14 → list from 16.
  expect(visited, "the walk did not follow the fixture's blocks").toEqual([7, 11, 13, 16]);
});

test("a compact table that fits within 70 percent of the viewport stays one block", async ({
  page,
}) => {
  const lines = await page.evaluate(() => window.zdEditor!.text().split("\n"));
  const heading = lines.indexOf("## Tables") + 1;
  const header = lines.findIndex((line) => line.startsWith("| Construct |")) + 1;
  const afterTable = lines.indexOf("## Mermaid") + 1;
  await caretOn(page, heading);

  await page.keyboard.press("Alt+ArrowDown");
  expect(await caretLine(page)).toBe(header);
  await page.keyboard.press("Alt+ArrowDown");

  expect(await caretLine(page), "the compact table was split into row blocks").toBe(afterTable);
});

test("a table taller than 70 percent of the viewport advances one rendered row at a time", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.addStyleTag({ content: ".md-editor table tr { height: 120px; }" });
  const lines = await page.evaluate(() => window.zdEditor!.text().split("\n"));
  const heading = lines.indexOf("## Tables") + 1;
  const header = lines.findIndex((line) => line.startsWith("| Construct |")) + 1;
  const firstBodyRow = lines.findIndex((line) => line.startsWith("| Blockquote |")) + 1;
  expect(
    Math.min(heading, header, firstBodyRow),
    "the fixture table source is missing",
  ).toBeGreaterThan(0);
  await caretOn(page, heading);

  await page.keyboard.press("Alt+ArrowDown");
  expect(await caretLine(page), "the first jump did not enter the table header").toBe(header);
  await expect(page.locator(".md-editor table")).toBeVisible();
  await page.keyboard.press("Alt+ArrowDown");

  expect(await caretLine(page), "the tall table was treated as one viewport-sized block").toBe(
    firstBodyRow,
  );
  await page.evaluate(() => {
    if (!window.zdEditor!.isFocusMode()) window.zdEditor!.toggleFocus();
  });
  const rowFocus = await page
    .locator(".md-editor table tr")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-focus")));
  expect(rowFocus.slice(0, 3), "focus mode did not isolate the current rendered row").toEqual([
    "context",
    "target",
    "context",
  ]);
});

test("option+up walks back the same way", async ({ page }) => {
  await caretOn(page, 16);

  const visited: number[] = [];
  for (let press = 0; press < 3; press += 1) {
    await page.keyboard.press("Alt+ArrowUp");
    visited.push(await caretLine(page));
  }

  expect(visited, "backwards is not the mirror of forwards").toEqual([13, 11, 7]);
});

test("the caret lands at the start of the block it jumps to", async ({ page }) => {
  await caretOn(page, 3, 20);

  await page.keyboard.press("Alt+ArrowDown");

  const at = await page.evaluate(() => {
    const s = window.zdEditor!.selection();
    const lines = window.zdEditor!.text().split("\n");
    const start = lines.slice(0, s.line - 1).reduce((total, text) => total + text.length + 1, 0);
    return { head: s.head, lineStart: start };
  });

  // Not "somewhere in the next block" — its first position, so a second press is
  // predictable and the caret does not keep a column from the block it left.
  expect(at.head, "the caret landed inside the block rather than at its start").toBe(at.lineStart);
});

test("it settles at the ends of the document", async ({ page }) => {
  await caretOn(page, 1);
  await page.keyboard.press("Alt+ArrowUp");
  const atTop = await caretLine(page);
  await page.keyboard.press("Alt+ArrowUp");

  /*
   * The invariant `motion.ts` already holds for the line-boundary keys: a press that
   * cannot move must leave the caret exactly where it is, and must claim the key rather
   * than let `defaultKeymap` have a second go — that fall-through is what made cmd+left
   * oscillate on 2026-08-01.
   */
  expect(await caretLine(page), "the caret drifted at the top of the document").toBe(atTop);

  const last = await page.evaluate(() => window.zdEditor!.text().split("\n").length);
  await caretOn(page, last);
  await page.keyboard.press("Alt+ArrowDown");
  const atEnd = await caretLine(page);
  await page.keyboard.press("Alt+ArrowDown");
  expect(await caretLine(page), "the caret drifted at the end of the document").toBe(atEnd);
});

test("the jump does not change the document", async ({ page }) => {
  const before = await page.evaluate(() => window.zdEditor!.text());

  await caretOn(page, 7);
  for (let press = 0; press < 6; press += 1) await page.keyboard.press("Alt+ArrowDown");
  for (let press = 0; press < 6; press += 1) await page.keyboard.press("Alt+ArrowUp");

  // A motion command that edits is a data-loss bug wearing a navigation bug's clothes.
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe(before);
});

/*
 * The jump is listed in the Shortcut Reference — vision §7.1.
 *
 * Reported 2026-07-30: "It should be listed in the shortcuts listing." It could
 * not be, because the jump was a CodeMirror keymap rather than a registry command,
 * and §7.1 says "there is one shortcut registry. The Reference renders it; it is
 * not a hand-maintained list that drifts from reality" — so a binding outside the
 * registry is invisible to the Reference by construction, and the only other way to
 * show it would be the hand-maintained row that F16 is about.
 *
 * That settled the DECIDE the task carried. The line is not "is it text motion" —
 * it is whether someone would go looking for the key. Enter and Tab are keys doing
 * their obvious job in context and nobody looks them up; `cmd+arrow` is the
 * platform's own line-boundary motion, corrected here rather than invented. A
 * focus-block jump is a product feature with a name, and it is the one that got
 * reported missing.
 */

async function openReference(page: import("@playwright/test").Page) {
  await page.keyboard.press("ControlOrMeta+Period");
}

const JUMP_ROW = ".zd-reference .zd-reference-row";

test("the jump has a row in the Shortcut Reference", async ({ page }) => {
  await openReference(page);

  const row = page.locator(JUMP_ROW, { hasText: "next focus block" }).first();
  await expect(row, "the block jump is not listed at all").toHaveCount(1);

  const chord = (await row.locator(".zd-reference-chord").textContent())?.trim() ?? "";

  /*
   * Asserted as a modifier and a direction rather than against a literal label,
   * because the literal is `chordLabel`'s to decide and it renders per platform —
   * ⌥↓ on macOS, Alt+Down elsewhere. Re-deriving it here would be a second copy of
   * that function, which is the divergence this file's own header warns about.
   */
  expect(chord, "the row shows no modifier").toMatch(/⌥|Alt/);
  expect(chord, "the row shows no direction").toMatch(/↓|Down/);
});

test("the Reference says honestly that the jump needs a caret", async ({ page }) => {
  /*
   * §7.1: "A binding that cannot run in the current context is presented honestly
   * rather than displayed as working." Before a caret is placed, focus follows the
   * anchor and §4.1 makes placing one a one-way door — so a motion key must not
   * cross it on the reader's behalf, and the Reference has to say so rather than
   * list a key that would do something unasked.
   *
   * Its own page load, because every other test in this file clicks into the
   * document first and a caret, once placed, is sticky by design.
   */
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await openReference(page);

  const row = page.locator(JUMP_ROW, { hasText: "next focus block" }).first();
  await expect(row).toHaveAttribute("data-available", "false");
});

/*
 * A jump lands the block on the reading anchor — vision §4.1.
 *
 * Reported 2026-07-30: "if using that it should try to center the new block onto
 * the center focal point." Before this the jump dispatched `scrollIntoView: true`,
 * which is CodeMirror's "somewhere on screen" and leaves the block wherever it
 * already happened to be — so after every press the focus target and the position
 * focus is read from disagreed, which is the pairing §4.1 spends its whole opening
 * on: "Where a document opens and where focus is read from are the same position."
 *
 * Its own viewport, and that is the point rather than housekeeping. The rest of
 * this file runs at 9000px tall so every line is built at once — at that height the
 * fixture fits entirely on screen, nothing can scroll, and every assertion below
 * would pass without measuring anything.
 */

/** The text box of the current focus target, and where the anchor is. */
async function landing(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const targets = [
      ...document.querySelectorAll<HTMLElement>('.cm-content > [data-focus="target"]'),
    ];
    if (targets.length === 0) return null;

    /*
     * A `Range` over the text, not the line boxes. The product aligns what
     * `coordsAtPos` reports, which is where the *characters* are — and a heading
     * line carries §5.3's space as padding, so its box top is a rhythm value above
     * its first glyph. Measuring boxes here would read as a failure on exactly the
     * blocks that are correct.
     */
    let top = Infinity;
    let bottom = -Infinity;
    for (const target of targets) {
      const range = document.createRange();
      range.selectNodeContents(target);
      const box = range.getBoundingClientRect();
      if (box.height === 0) continue;
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }

    return {
      centre: (top + bottom) / 2,
      anchor: window.zdEditor!.anchorY(),
      text: targets.map((t) => t.textContent).join("\n"),
      scrollTop: surface.scrollTop,
      furthest: surface.scrollHeight - surface.clientHeight,
    };
  });
}

test("the block it lands on sits on the reading anchor", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();

  // From the first paragraph to the second: both plain prose, both far enough from
  // either end of the document that the surface can actually reach the anchor.
  await caretOn(page, 3);
  await page.keyboard.press("Alt+ArrowDown");

  /*
   * Polled on the claim rather than slept for a fixed twelve frames, which is what
   * this was until 2026-07-30. The jump eases now (§2, and `scrollBlockToAnchor`),
   * so the number of frames it takes to arrive is the browser's easing duration —
   * twelve was enough for an instant scroll and left this reading a position the
   * document was still travelling through, 9.5px short of the anchor.
   *
   * A frame count is a guess about how long something takes; the assertion's own
   * subject is the thing that was claimed. Polling it means a timeout fails for the
   * same reason the assertion would.
   */
  await expect
    .poll(
      async () => {
        const now = await landing(page);
        return now === null ? null : Math.abs(now.centre - now.anchor);
      },
      { message: "the landed block never came to rest on the reading anchor" },
    )
    .toBeLessThanOrEqual(2);

  const at = await landing(page);
  expect(at, "nothing is focused after the jump").not.toBeNull();

  /*
   * The preconditions, stated. `scrollBoxTo` is a `scrollTop +=`, so at either end
   * of the scroll range the surface simply cannot reach the anchor and the claim
   * becomes untestable rather than false. Pinning that it was free to move is what
   * keeps this from passing on a document that never scrolled.
   */
  expect(at!.scrollTop, "the surface was clamped at the top").toBeGreaterThan(0);
  expect(at!.scrollTop, "the surface was clamped at the bottom").toBeLessThan(at!.furthest);

  expect(
    Math.abs(at!.centre - at!.anchor),
    `the landed block sits ${Math.round(at!.centre - at!.anchor)}px off the anchor: ${at!.text}`,
  ).toBeLessThanOrEqual(2);
});

test("typewriter block jumps ease and settle at the midpoint", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.locator(".cm-content").click();

  await caretOn(page, 3);
  await page.keyboard.press("ControlOrMeta+Alt+t");
  expect(await page.evaluate(() => window.zdEditor!.isTypewriter())).toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => Math.abs(window.zdEditor!.caretY()! - window.zdEditor!.typewriterY())),
      { message: "the caret did not start on the typewriter midpoint" },
    )
    .toBeLessThanOrEqual(2);

  const before = await page.locator(".md-surface").evaluate((surface) => surface.scrollTop);
  await beginEditorScrollTrace(page);

  // Paragraph 3–5 to paragraph 7–9 is several rows: large enough that the ordinary
  // typewriter nudge cuts immediately, which is the reported hop rather than an ease.
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => caretLine(page)).toBe(7);
  await waitForEditorScrollToSettle(page);
  const frames = (await endEditorScrollTrace(page)).map(({ top }) => top);
  const after = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    return {
      scrollTop: surface.scrollTop,
      row: document.querySelector<HTMLElement>(".cm-line")!.getBoundingClientRect().height,
      midpointDistance: Math.abs(window.zdEditor!.caretY()! - window.zdEditor!.typewriterY()),
    };
  });

  expect(after.scrollTop, "the document did not move beneath the caret").not.toBeCloseTo(before, 0);
  expect(
    after.midpointDistance,
    "the ordinary reading-anchor scroll pulled the caret away from the typewriter midpoint",
  ).toBeLessThanOrEqual(2);

  const low = Math.min(before, after.scrollTop);
  const high = Math.max(before, after.scrollTop);
  const between = new Set(
    frames.filter((position) => position > low + 1 && position < high - 1).map(Math.round),
  );
  expect(
    between.size,
    `the block jump hopped instead of easing: ${frames.map(Math.round).join(", ")}`,
  ).toBeGreaterThanOrEqual(3);

  const frameSteps = frames.slice(1).map((position, index) => Math.abs(position - frames[index]!));
  expect(
    Math.max(...frameSteps),
    `one frame hopped more than two rows: ${frames.map(Math.round).join(", ")}`,
  ).toBeLessThanOrEqual(after.row * 2);
});
