import { expect, test } from "@playwright/test";

// A setext heading is `text` over `===` or `---`. The parser already knows it is a
// heading; the editor did not, so it read as a paragraph with a row of punctuation
// under it.
//
// Two claims. The text line takes the same reading typography an ATX heading of the
// same level takes — vision §6.1, and the same comparison every other heading spec
// makes against the reader. And the underline row is not drawn, decided 2026-07-29
// on the same reasoning DESIGN.md §5.2 gives for the hash: notation that is the size
// of prose beside a 30px heading reads as debris rather than as its notation, and an
// underline is a whole row of it.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  /*
   * Wait for *this* construct and for the faces.
   *
   * `.md-line-h1` is the ATX title at the top and says nothing about a setext
   * heading near the end — Lezer parses incrementally, and the isolated run of one
   * test measured before the decoration landed while the whole-file run happened to
   * be slow enough not to. Typography comparisons also need the faces loaded, the
   * way every other heading spec does.
   */
  // The *setext* heading, identified by its own text. `.md-line-h2` matches
  // `## Notation` near the top of the fixture and says nothing about whether the
  // setext decoration near the end has landed yet.
  await page.locator(".md-line-h1", { hasText: "A setext heading underlined" }).waitFor();
  await page.locator(".md-line-h2", { hasText: "A second level, underlined too" }).waitFor();
  await page.evaluate(async () => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.load('700 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
});

test("a setext heading takes its level's typography", async ({ page }) => {
  const setext = await page.evaluate(() => {
    const find = (needle: string) =>
      [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
        el.textContent?.includes(needle),
      );
    const one = find("A setext heading underlined");
    const two = find("A second level, underlined too");
    const read = (el: HTMLElement | undefined) =>
      el
        ? {
            classes: [...el.classList].filter((c) => c.startsWith("md-line-h")),
            size: getComputedStyle(el).fontSize,
            weight: getComputedStyle(el).fontWeight,
          }
        : null;
    return { one: read(one), two: read(two) };
  });

  expect(setext.one, "the first setext heading was not rendered").not.toBeNull();
  expect(setext.one!.classes, "a setext h1 is not marked as a heading").toEqual(["md-line-h1"]);
  expect(setext.two!.classes, "a setext h2 is not marked as a heading").toEqual(["md-line-h2"]);
});

test("it is typeset exactly like an ATX heading at the same level", async ({ page }) => {
  const measured = await page.evaluate(() => {
    const headings = [...document.querySelectorAll<HTMLElement>(".md-line-h2")];
    const setext = headings.find((el) =>
      el.textContent?.includes("A second level, underlined too"),
    )!;
    const atx = headings.find((el) => el.textContent?.startsWith("## "))!;
    const read = (line: HTMLElement) => {
      const style = getComputedStyle(line);
      return { family: style.fontFamily, size: style.fontSize, weight: style.fontWeight };
    };
    return { setext: read(setext), atx: read(atx) };
  });

  expect(measured.setext).toEqual(measured.atx);
});

test("the underline row is not drawn", async ({ page }) => {
  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );

  expect(onScreen, "the === underline is still on screen").not.toContain("===");
  // The heading's own text survived.
  expect(onScreen).toContain("A setext heading underlined");
  expect(onScreen).toContain("A second level, underlined too");
});

test("raw mode brings the underline back", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+e");

  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );
  expect(onScreen, "the underline is still hidden under raw mode").toContain("===");
});

test("hiding the underline does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());
  expect(text, "the source lost its setext underline").toContain("===");
});
