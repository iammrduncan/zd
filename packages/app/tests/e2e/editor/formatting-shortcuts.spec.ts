import { expect, test, type Page } from "@playwright/test";

import { openEditor } from "./harness";

async function selectWord(page: Page, source = "word"): Promise<void> {
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(source);
  await page.evaluate(() => window.zdEditor!.setCaret(0));
  for (let index = 0; index < source.length; index += 1) {
    await page.keyboard.press("Shift+ArrowRight");
  }
}

test.beforeEach(async ({ page }) => openEditor(page));

test("Mod-B wraps the selected Markdown in strong notation", async ({ page }) => {
  await selectWord(page);
  await page.keyboard.press("ControlOrMeta+B");
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe("**word**");
});

test("Mod-I wraps the selected Markdown in emphasis notation", async ({ page }) => {
  await selectWord(page);
  await page.keyboard.press("ControlOrMeta+I");
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe("_word_");
});

test("Mod-Shift-C wraps the selected Markdown in inline-code notation", async ({ page }) => {
  await selectWord(page);
  await page.keyboard.press("ControlOrMeta+Shift+C");
  expect(await page.evaluate(() => window.zdEditor!.text())).toBe("`word`");
});

test("Mod-K turns a selected URL into an autolink", async ({ page }) => {
  await selectWord(page, "https://example.com");
  await page.keyboard.press("ControlOrMeta+K");

  expect(await page.evaluate(() => window.zdEditor!.text())).toBe("<https://example.com>");
});
