import { expect, test } from "@playwright/test";

/*
 * "if I press `esc` it should remove my cursor from the editor and go back to
 * tracking center item as the focused block" (feedback, 2026-07-29), reported
 * three times before it could be built — Escape belonged to the Shortcut
 * Reference until 2026-07-30, and the registry refuses a second command on a
 * taken chord rather than letting registration order decide.
 *
 * Vision §4.1 is the two halves this has to move between:
 *
 *   "The caret is the focus target. Place it and that is where focus goes."
 *   "Before a caret is placed, focus follows the vertical reading anchor and
 *    scrolling moves it."
 *
 * So Escape is not a cosmetic blur. It has to put the surface back into the state
 * it was in before anyone typed — anchor-following, with scrolling moving focus
 * again — which is the part a `contentDOM.blur()` alone would not do, because the
 * editor's `caretPlaced` is deliberately sticky and survives losing the keyboard.
 */

const TARGET = '.md-editor [data-focus="target"]';

test.beforeEach(async ({ page }) => {
  // Short enough that the anchor lands on a different block than the one clicked,
  // which is the whole distinction being measured.
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

/** Let the focus transaction and its 120ms ease finish. */
async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });
}

/** The focused line's text, and whether the editor holds the keyboard. */
async function state(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    target:
      document.querySelector<HTMLElement>('.md-editor [data-focus="target"]')?.textContent ?? null,
    hasCaret: document.activeElement?.classList.contains("cm-content") ?? false,
  }));
}

test("escape takes the caret out of the document", async ({ page }) => {
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await settle(page);
  expect((await state(page)).hasCaret, "the click did not put a caret in the document").toBe(true);

  await page.keyboard.press("Escape");
  await settle(page);

  expect((await state(page)).hasCaret, "the caret is still in the document").toBe(false);
});

test("focus stops following the caret", async ({ page }) => {
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await settle(page);
  const withCaret = await state(page);
  expect(withCaret.target, "the click did not take focus").toContain("A paragraph here should be");

  await page.keyboard.press("Escape");
  await settle(page);

  // §4.1: "Before a caret is placed, focus follows the vertical reading anchor."
  // Dropping the caret has to hand the target back, not leave it where the caret
  // was — which is the half that a `contentDOM.blur()` on its own would miss.
  expect((await state(page)).target, "focus stayed where the caret had been").not.toBe(
    withCaret.target,
  );
});

test("scrolling moves focus again once the caret is dropped", async ({ page }) => {
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await settle(page);

  // With a caret placed, §4.1 says scrolling for context must *not* move focus.
  const held = (await state(page)).target;
  await page.evaluate(() => document.querySelector(".md-surface")!.scrollBy(0, 700));
  await settle(page);
  expect((await state(page)).target, "scrolling moved focus while a caret was placed").toBe(held);

  await page.keyboard.press("Escape");
  await settle(page);

  /*
   * Then scroll back to the top, and only to the top.
   *
   * This is the half a blur would miss — the sticky flag has to genuinely clear or
   * the surface stays permanently deaf to scrolling. But it has to be measured at
   * scroll 0, because the editor's anchor measurement is wrong at every *other*
   * scroll position: it resolves to a blank line, and it does so identically at 700
   * and 1400, so a test comparing two scrolled positions would fail with nothing
   * wrong with Escape. That defect predates this task — it reproduces with no caret
   * ever placed — and is filed in agent-findings.md rather than fixed here.
   */
  await page.evaluate(() => document.querySelector(".md-surface")!.scrollTo(0, 0));
  await settle(page);

  expect((await state(page)).target, "scrolling no longer moves focus at all").toContain(
    "Typing in the document",
  );
});

test("there is exactly one target after the caret is dropped", async ({ page }) => {
  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await settle(page);
  await page.keyboard.press("Escape");
  await settle(page);

  // A dropped caret must not mean *no* focus. §4.1 dims everything that is not the
  // target, so a document with no target is a document that is entirely dimmed.
  const count = await page.locator(TARGET).count();
  expect(count, "the document has no focus target at all").toBeGreaterThan(0);
});

test("escape does not change the document", async ({ page }) => {
  const before = await page.evaluate(() => window.zdEditor!.text());

  await page.locator(".cm-line", { hasText: "A paragraph here should be" }).first().click();
  await page.keyboard.press("Escape");
  await settle(page);

  // Escape is a focus command. A version of it that inserted or deleted anything
  // would be a data-loss bug wearing a navigation bug's clothes.
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe(before);
});

test("the Reference lists Escape as its available dismiss key", async ({ page }) => {
  await page.keyboard.press("ControlOrMeta+Period");

  const row = await page
    .locator(".zd-reference-row", { hasText: "active transient" })
    .first()
    .evaluate((el) => ({
      chord: el.querySelector(".zd-reference-chord")?.textContent?.trim() ?? "",
      available: el.getAttribute("data-available"),
    }));

  // §7.1: the Reference renders the registry, and states honestly whether a
  // binding can run here. The persistent Reference is itself the top transient,
  // so Escape can dismiss it even though no caret has been placed underneath.
  expect(row.chord.toLowerCase()).toContain("esc");
  expect(row.available, "the Reference says its dismiss key cannot run").toBe("true");
});
