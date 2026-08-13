import { expect, test } from "@playwright/test";

import { contrast } from "../colour";

// Vision §4.1 calls focus "the heart of the product", and gives the editing
// surface two rules the reader does not have:
//
//   "The caret is the focus target. Place it and that is where focus goes."
//   "Once the caret is in the document, scrolling for context leaves focus where
//    it is — reading ahead is not the same as moving."
//
// Both are behaviour over time, so both are measured here rather than in a unit
// test. What granularity does to the size of a target is at the foot of the file.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
});

/** The text of every line currently marked as the target. */
async function target(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('.cm-line[data-focus="target"]')].map((l) => l.textContent ?? ""),
  );
}

test("something is the target before anyone touches the document", async ({ page }) => {
  // §4.1: "Before a caret is placed, focus follows the vertical anchor at the
  // centre of the screen." A document that opens with nothing focused would
  // make the heart of the product opt-in.
  expect((await target(page)).length).toBeGreaterThan(0);
});

test("placing the caret moves focus to that block", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();

  const focused = await target(page);
  expect(focused.join(" ")).toContain("A paragraph here should be");
});

test("the target is the whole block, not just the caret's line", async ({ page }) => {
  // §7.6: "paragraph means one semantic block". The fixture's paragraphs run
  // over several source lines, and a caret in one of them focuses all of them.
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();

  const focused = await target(page);
  expect(focused.length).toBeGreaterThan(1);
  expect(focused.join(" ")).toContain("not, the claim above is decoration");
});

test("the whole block stays the target at the end of it, and while typing there", async ({
  page,
}) => {
  /*
   * "focus does not bind the whole block — a sentence late in a paragraph takes
   * focus while the rest of it dims" (feedback, 2026-07-29).
   *
   * The test above looked like it covered this and did not: it clicks into the
   * middle of a paragraph, and the middle always worked. Only the paragraph's
   * *last* position was wrong — which is the position the caret occupies after
   * every single keystroke typed at the end of a paragraph, so in use it was not
   * an edge case at all.
   *
   * Kept in the browser rather than folded into tests/unit/editor/focus/range.test.ts
   * because the claim here is about what is painted across several lines while
   * the document is being edited. The rule itself is measured on state there.
   */
  const last = page.locator(".cm-line", { hasText: "not, the claim above is decoration" }).first();
  await last.click();
  await page.keyboard.press("End");

  const atEnd = await target(page);
  expect(atEnd.length, "the target collapsed to the caret's own line").toBeGreaterThan(1);
  expect(atEnd.join(" "), "the first line of the paragraph dimmed").toContain(
    "A paragraph here should be",
  );

  await page.keyboard.type("!");

  const typing = await target(page);
  expect(typing.length, "the target collapsed once a character was typed").toBeGreaterThan(1);
  expect(typing.join(" ")).toContain("A paragraph here should be");
});

test("scrolling for context leaves the target where the caret is", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();
  const before = await target(page);

  await page.evaluate(() => {
    document.querySelector(".md-surface")!.scrollBy(0, 600);
  });
  await page.waitForTimeout(200);

  // Reading ahead is not the same as moving.
  expect(await target(page)).toEqual(before);
});

test("until a caret is placed, scrolling does move the target", async ({ page }) => {
  const before = await target(page);

  await page.evaluate(() => {
    document.querySelector(".md-surface")!.scrollBy(0, 600);
  });
  await page.waitForTimeout(200);

  expect(await target(page)).not.toEqual(before);
});

/**
 * Let the outgoing dim finish before reading a colour off the screen.
 *
 * §6.3 gives the outgoing focus change 120ms, so a colour sampled the instant
 * after a click is a frame of that ease rather than the resting state — which is
 * how a dim test can report that context is exactly as dark as its target.
 */
async function settled(page: import("@playwright/test").Page): Promise<void> {
  const ease = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--focus-ease-out").trim(),
  );
  await page.waitForTimeout(parseFloat(ease) * (ease.endsWith("ms") ? 1 : 1000) + 100);
}

test("context is dimmed toward the canvas, never hidden", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();
  await settled(page);

  const colours = await page.evaluate(() => ({
    target: getComputedStyle(document.querySelector('.cm-line[data-focus="target"]')!).color,
    context: getComputedStyle(document.querySelector('.cm-line[data-focus="context"]')!).color,
    canvas: getComputedStyle(document.body).backgroundColor,
  }));

  // The same two assertions the reader's own dim test makes, for the same reason
  // — §4.4 says context is "moved toward its owning surface", never hidden and
  // never made unreadable.
  expect(colours.context).not.toBe(colours.target);
  expect(contrast(colours.context, colours.canvas)).toBeLessThan(
    contrast(colours.target, colours.canvas),
  );
});

test("the outgoing change eases and the incoming one does not", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();

  const motion = await page.evaluate(() => {
    const read = (selector: string) => {
      const style = getComputedStyle(document.querySelector(selector)!);
      return { property: style.transitionProperty, duration: style.transitionDuration };
    };
    return {
      target: read('.cm-line[data-focus="target"]'),
      context: read('.cm-line[data-focus="context"]'),
    };
  });

  // §6.3's one piece of functional motion, and its asymmetry: a block becoming
  // the target "reaches full contrast in the first rendered frame", a block
  // becoming context eases out over the suite's single duration.
  expect(motion.target.duration).toBe("0s");
  expect(motion.context.property).toContain("color");
  expect(parseFloat(motion.context.duration)).toBeGreaterThan(0);
});

test("colour settings change immediately without borrowing focus motion", async ({ page }) => {
  const line = page.locator(".cm-line", { hasText: "A paragraph here should be" }).first();
  await line.click();
  await settled(page);

  const result = await page.evaluate(async () => {
    const appearanceModule = "/src/suite/appearance.ts";
    const { setFocusDim, setTheme } = await import(appearanceModule);
    const root = document.documentElement;
    const context = document.querySelector<HTMLElement>('.cm-line[data-focus="context"]')!;
    const duration = () => getComputedStyle(context).transitionDuration;

    setTheme("dark");
    const theme = {
      applied: root.dataset.theme,
      duration: duration(),
      suppressed: root.hasAttribute("data-applying-colour-setting"),
    };

    setFocusDim(0.2);
    const dim = {
      applied: root.style.getPropertyValue("--focus-dim"),
      duration: duration(),
      suppressed: root.hasAttribute("data-applying-colour-setting"),
    };

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const after = {
      duration: duration(),
      suppressed: root.hasAttribute("data-applying-colour-setting"),
    };

    return { theme, dim, after };
  });

  // DESIGN.md §6.3 reserves the duration token for a focus target becoming
  // context. Theme and Dim Level are mode/setting changes, so both are one frame.
  expect(result.theme).toEqual({ applied: "dark", duration: "0s", suppressed: true });
  expect(result.dim).toEqual({ applied: "0.2", duration: "0s", suppressed: true });
  expect(result.after.suppressed).toBe(false);
  expect(parseFloat(result.after.duration)).toBeGreaterThan(0);
});

// §7.6: "section means a heading and its descendants up to the next peer or
// higher heading." The reader has done this since focus landed; these are the
// same claim asked of the editing surface, because §6.1 says focus "works
// exactly as in §4.1, because it is the same surface".

test.describe("section granularity", () => {
  test.beforeEach(async ({ page }) => {
    // Tall enough that the whole section is in CodeMirror's viewport — a target
    // that is merely unrendered would read as a target that stops early.
    await page.setViewportSize({ width: 1100, height: 2400 });
    await page.goto("/dev/editor.html");
    await page.locator(".cm-line").first().waitFor();
    await page.evaluate(() => window.zdEditor!.setGranularity("section"));
  });

  test("a caret under a heading focuses the heading and everything beneath it", async ({
    page,
  }) => {
    await page.locator(".cm-line", { hasText: "Notation is visible but lives outside" }).click();
    const focused = (await target(page)).join("\n");

    // The owning H2 itself, and a deeper heading well below the caret.
    expect(focused, "the owning heading is not in the section").toContain("## Notation");
    expect(focused, "a nested subsection dropped out").toContain("### Every level");
    expect(focused, "the section stopped before its last descendant").toContain("###### Six steps");
  });

  test("a section stops at the next peer heading", async ({ page }) => {
    await page.locator(".cm-line", { hasText: "Notation is visible but lives outside" }).click();
    const focused = (await target(page)).join("\n");

    // The next H2 opens its own section, and the H1 above owns a different one.
    expect(focused, "the section ran past its next peer").not.toContain(
      "## A hash is not always a heading",
    );
    expect(focused, "the section swallowed the document title").not.toContain(
      "# Typing in the document",
    );
  });

  test("section covers more than paragraph does at the same caret", async ({ page }) => {
    const line = page.locator(".cm-line", { hasText: "Notation is visible but lives outside" });
    await line.click();
    const asSection = (await target(page)).length;

    await page.evaluate(() => window.zdEditor!.setGranularity("paragraph"));
    await line.click();
    const asParagraph = (await target(page)).length;

    // The setting has to actually do something. Before this task the editor
    // treated section and paragraph as the same thing, and every assertion
    // above passed at paragraph granularity too.
    expect(asSection).toBeGreaterThan(asParagraph);
  });
});

test("a caret in a list focuses the whole list, as the reader does", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 2400 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-item").first().waitFor();
  await page.evaluate(() => window.zdEditor!.setGranularity("paragraph"));
  await page.locator(".md-line-item").first().click();

  const focused = await target(page);

  // §6: the editor "is not a second mode". The reader makes one target of a
  // whole `<ul>` — focusableBlocks returns the reading column's children — and
  // the editor used to stop at the ListItem, so the same document focused two
  // different ways depending on which surface you were looking at.
  //
  // DESIGN.md §7.6 said "one semantic block/list item", which permits both and
  // is how they drifted; it now names the list.
  expect(focused.length, "only one line of the list took focus").toBeGreaterThan(1);
  expect(focused.join("\n"), "a later item dropped out of the target").toContain(
    "a typeset bullet would be a second version",
  );
});
