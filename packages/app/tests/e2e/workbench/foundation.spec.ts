import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await page.locator(".current-file .cm-editor").waitFor();
});

test("the root file surface owns editing, Find, save, and explicit Focus Mode", async ({
  page,
}) => {
  const editor = page.locator(".current-file .md-editor");
  const content = editor.locator(".cm-content");
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );

  await expect(editor).toHaveAttribute("data-language", "code");
  await expect(editor).toHaveAttribute("data-focus-mode", "false");
  await expect(content).toContainText("bootWorkbench(host, platform)");

  await content.click();
  await page.keyboard.press(`${primary}+f`);
  await expect(editor.locator(".editor-find")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(editor.locator(".editor-find")).toBeHidden();

  await page.keyboard.press(`${primary}+Shift+f`);
  await expect(editor).toHaveAttribute("data-focus-mode", "true");
  await page.keyboard.press(`${primary}+Shift+f`);
  await expect(editor).toHaveAttribute("data-focus-mode", "false");

  await content.press("End");
  await content.pressSequentially("\nexport const saved = true;");
  await page.keyboard.press(`${primary}+s`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-saved-text"))
    .toContain("export const saved = true;");
});

test("a file-tree selection takes the overlap centre back from an active thread", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.getByRole("button", { name: "New terminal in zd" }).click();
  const threadSurface = page.locator('[data-centre-surface="thread"]');
  const fileSurface = page.locator('[data-centre-surface="file"]');
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();

  await expect(fileSurface).toBeVisible();
  await expect(threadSurface).toBeHidden();
  await expect(fileSurface.locator(".cm-content")).toContainText("# README.md");
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(pageErrors).toEqual([]);
});

test("transient Settings controls local diagnostics without crowding Threads", async ({ page }) => {
  const threads = page.locator('[data-region="threads"]');

  await expect(threads.locator('[data-project-id="project-zd"] .zd-project-row')).toContainText(
    "zd",
  );
  await expect(threads.locator('[data-diagnostic-settings="true"]')).toHaveCount(0);

  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.press(`${primary}+,`);
  const settings = page.locator(
    '[data-workbench-settings="true"] [data-diagnostic-settings="true"]',
  );
  const toggle = settings.getByRole("checkbox", { name: "Local diagnostics" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(settings.getByRole("status")).toHaveText("Recording locally.");

  await settings.getByRole("button", { name: "Reveal logs" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-diagnostics-revealed", "true");
});
