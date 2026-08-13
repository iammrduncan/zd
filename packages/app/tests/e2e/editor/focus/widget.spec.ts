import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "../harness";

/*
 * A block widget dims with everything else — vision §4.1.
 *
 * "The part you are reading stays at full contrast while everything else is
 * visibly dimmed." Reported as "tables are always high contrast and never dimmed
 * even when they are not in focus. in render mode" (feedback, 2026-08-01).
 *
 * **Measured before building.** The table carried no `data-focus` attribute at
 * all and painted `rgb(36, 37, 34)` — byte for byte the *target* colour — while
 * the context lines around it sat at `color(srgb 0.702 0.706 0.684)`. So it was
 * not merely undimmed: it was the brightest thing on screen, wherever you were
 * reading.
 *
 * The cause is structural. A table is `Decoration.replace({ block: true })`, so
 * CodeMirror renders it as a *sibling* of `.cm-line` rather than inside one —
 * and every dim rule is scoped to `.cm-line[data-focus=…]`. A line decoration
 * cannot reach it, because the lines it would have applied to are the ones the
 * widget replaced.
 *
 * This file is about the class, not the table. Any block widget is outside the
 * lines by construction, so the next one inherits the fix rather than the bug.
 */

/**
 * Scroll until a block widget is built. Once, not on every read.
 *
 * Separated from `readWidget` deliberately: the first version swept the document
 * inside the polled function, so every poll restarted the scroll *and* the dim
 * transition with it, and a colour that settles in 120ms never settled at all.
 * The measurement was re-creating the condition it was waiting on.
 */
async function revealWidget(page: import("@playwright/test").Page) {
  await materializeEditorTarget(
    page,
    page.locator(".md-editor table"),
    "the rendered construct table",
  );
}

/** How the widget is painted right now, and what the prose beside it resolves to. */
async function readWidget(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const table = document.querySelector<HTMLElement>(".md-editor table");
    if (!table) return null;

    const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
    const context = lines.find((line) => line.getAttribute("data-focus") === "context");

    return {
      focus: table.getAttribute("data-focus"),
      colour: getComputedStyle(table.querySelector("td") ?? table).color,
      contextColour: context ? getComputedStyle(context).color : null,
    };
  });
}

test.beforeEach(async ({ page }) => {
  await openEditor(page, { height: 700 });
});

test("a block widget out of focus is marked as context", async ({ page }) => {
  await revealWidget(page);
  const painted = await readWidget(page);

  expect(painted, "no table was built by the sweep").not.toBeNull();
  // The attribute is what the dim rules key on, so its absence is the defect
  // itself rather than a proxy for it.
  expect(painted!.focus, "the widget carries no focus state at all").toBe("context");
});

test("a block widget out of focus is painted the context colour", async ({ page }) => {
  await revealWidget(page);
  const painted = await readWidget(page);

  expect(painted!.contextColour, "no context line to compare against").not.toBeNull();

  /*
   * The consequence, and the half a reader actually sees. Asserted against the
   * colour the *lines* around it resolve to rather than a literal — §4.1 makes
   * the dim a user setting, so a number here would be a second copy of it.
   *
   * Polled rather than read once, because the dim eases over §6.3's duration and
   * a colour mid-transition serialises as `oklab(…)` instead of `color(srgb …)`.
   * Reading immediately caught exactly that. Polling on the claim itself means a
   * widget that never dims fails by timing out, for the same reason the
   * assertion would.
   */
  await expect
    .poll(
      async () => {
        const current = await readWidget(page);
        return current?.colour === current?.contextColour;
      },
      {
        message: "the widget never came to rest at the context colour",
      },
    )
    .toBe(true);
});

test("a block widget the caret is in takes full contrast", async ({ page }) => {
  /*
   * The control. Both assertions above are satisfied by a widget that is dimmed
   * permanently, which would be the same defect pointing the other way — §4.1
   * dims everything that is *not* the target, and a table you are working in is
   * the target.
   */
  await revealWidget(page);
  await page.locator(".cm-content").click();
  await page.evaluate(() => {
    const text = window.zdEditor!.text();
    const lines = text.split("\n");
    const row = lines.findIndex((line) => line.startsWith("| Construct |"));
    const start = lines.slice(0, row).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + 2);
  });

  await expect
    .poll(async () => (await readWidget(page))?.focus, {
      message: "the caret's own table never became the target",
    })
    .toBe("target");
});
