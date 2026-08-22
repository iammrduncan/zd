import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

const FIND = "ControlOrMeta+f";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("the shared Find command opens inside the editor without moving the viewport", async ({
  page,
}) => {
  const surface = page.locator(".md-surface");
  const before = await surface.evaluate((element) => element.scrollTop);

  await page.keyboard.press(FIND);

  const query = page.getByLabel("Find", { exact: true });
  await expect(query).toBeVisible();
  await expect(query).toBeFocused();
  await expect(surface).toHaveJSProperty("scrollTop", before);
  await expect(page.locator(".editor-find")).toHaveCSS("border-bottom-style", "solid");
  await expect(page.locator(".editor-find")).toHaveCSS("border-radius", "0px");
});

test("typing a query selects a real source range and next advances the result position", async ({
  page,
}) => {
  await page.keyboard.press(FIND);
  await page.getByLabel("Find", { exact: true }).fill("the");

  await expect
    .poll(async () => {
      const text = (await page.locator(".editor-find-count").textContent()) ?? "";
      return Number(/1 of (\d+)/.exec(text)?.[1] ?? 0);
    })
    .toBeGreaterThan(1);
  const countText = (await page.locator(".editor-find-count").textContent()) ?? "";
  const total = Number(/1 of (\d+)/.exec(countText)?.[1]);
  const first = await page.evaluate(() => window.zdEditor!.selection());
  expect(
    await page.evaluate(({ from, to }) => window.zdEditor!.text().slice(from, to), first),
  ).toBe("the");

  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(page.locator(".editor-find-count")).toHaveText(`2 of ${total}`);
  const second = await page.evaluate(() => window.zdEditor!.selection());
  expect(second.from).toBeGreaterThan(first.from);
});

test("rendered Markdown hides a destination from Find until Raw Mode", async ({ page }) => {
  await page.keyboard.press(FIND);
  await page.getByLabel("Find", { exact: true }).fill("https://example.com/spec");

  await expect(page.locator(".editor-find-count")).toHaveText("No results");

  await page.keyboard.press("ControlOrMeta+e");

  await expect(page.locator(".editor-find-count")).toHaveText("1 of 1");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const selection = await page.evaluate(() => window.zdEditor!.selection());
  expect(
    await page.evaluate(({ from, to }) => window.zdEditor!.text().slice(from, to), selection),
  ).toBe("https://example.com/spec");
});

test("Replace all is one CodeMirror undo step in a code file", async ({ page }) => {
  await openEditor(page, { url: "/dev/editor.html?doc=code" });
  const before = await page.evaluate(() => window.zdEditor!.text());

  await page.keyboard.press(FIND);
  await page.getByLabel("Find", { exact: true }).fill("const");
  await page.getByLabel("Replace", { exact: true }).fill("let");
  await page.getByRole("button", { name: "Replace all", exact: true }).click();

  expect(await page.evaluate(() => window.zdEditor!.text())).not.toContain("const");

  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+z");

  expect(await page.evaluate(() => window.zdEditor!.text())).toBe(before);
});

test("one Escape dismisses Find without also dropping the editor caret", async ({ page }) => {
  await page.locator(".cm-content").click();
  await expect.poll(() => page.evaluate(() => window.zdEditor!.hasCaret())).toBe(true);
  await page.keyboard.press(FIND);

  await page.keyboard.press("Escape");

  await expect(page.locator(".editor-find")).toBeHidden();
  expect(await page.evaluate(() => window.zdEditor!.hasCaret())).toBe(true);

  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => window.zdEditor!.hasCaret())).toBe(false);
});
