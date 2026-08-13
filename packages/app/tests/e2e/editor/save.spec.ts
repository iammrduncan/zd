import { expect, test } from "@playwright/test";

// Vision §6.3: "`cmd+s` saves. Writes are atomic. Unsaved state is visible
// without adding chrome."
//
// The atomic write is on the far side of the platform boundary and is tested
// against a real filesystem in src-tauri/src/fs.rs. What is testable in a
// browser — where there is deliberately no filesystem at all — is everything on
// this side of it: that the key reaches a handler with the right text, and that
// the editor knows whether what is on screen has been written yet.
//
// Dirty means "differs from what was last written", not "somebody typed". The
// difference is visible the moment you undo back to where you started, and a
// flag set on every keystroke gets that wrong.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
});

async function caretInTheTitle(page: import("@playwright/test").Page) {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+Home");
}

const dirty = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.isDirty());

const saves = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.zdEditor!.saves.length);

test("a freshly opened document is not unsaved", async ({ page }) => {
  expect(await dirty(page)).toBe(false);
});

test("typing makes it unsaved", async ({ page }) => {
  await caretInTheTitle(page);
  await page.keyboard.type("Zen ");

  expect(await dirty(page)).toBe(true);
});

test("cmd+s writes the document as it stands and clears the state", async ({ page }) => {
  await caretInTheTitle(page);
  await page.keyboard.type("Zen ");
  await page.keyboard.press("ControlOrMeta+s");

  const written = await page.evaluate(() => window.zdEditor!.saves.at(-1));
  expect(written?.startsWith("Zen # Typing in the document")).toBe(true);
  expect(await dirty(page)).toBe(false);
});

test("undoing back to the written text is not unsaved", async ({ page }) => {
  await caretInTheTitle(page);
  await page.keyboard.type("Zen ");
  expect(await dirty(page)).toBe(true);

  await page.keyboard.press("ControlOrMeta+z");

  // The whole reason this is a comparison rather than a flag: the document on
  // screen is byte-for-byte what is on disk, so there is nothing to save.
  expect(await dirty(page)).toBe(false);
});

test("editing after a save makes it unsaved again", async ({ page }) => {
  await caretInTheTitle(page);
  await page.keyboard.type("Zen ");
  await page.keyboard.press("ControlOrMeta+s");
  expect(await dirty(page)).toBe(false);

  await page.keyboard.type("more ");
  expect(await dirty(page)).toBe(true);
});

test("cmd+s does not reach the browser's own save dialog", async ({ page }) => {
  await caretInTheTitle(page);
  const before = await saves(page);
  await page.keyboard.press("ControlOrMeta+s");

  // The binding claims the key whether or not the document changed. In a webview
  // cmd+s is "save page as", and offering that over someone's document would be
  // worse than doing nothing.
  expect(await saves(page)).toBe(before + 1);
});
