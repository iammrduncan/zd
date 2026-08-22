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

test("project-owned Settings controls local diagnostics without leaving the workbench", async ({
  page,
}) => {
  const threads = page.locator('[data-region="threads"]');
  const settings = threads.locator('[data-diagnostic-settings="true"]');

  await expect(threads.locator('[data-project-id="project-zd"] .zd-project-row')).toContainText(
    "zd",
  );
  expect(
    await threads.evaluate((region) => {
      const projects = region.querySelector(".zd-projects");
      const diagnostics = region.querySelector('[data-diagnostic-settings="true"]');
      return Boolean(projects && diagnostics && projects.compareDocumentPosition(diagnostics) & 4);
    }),
  ).toBe(true);

  await settings.locator("summary").click();
  const toggle = settings.getByRole("checkbox", { name: "Local diagnostics" });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(toggle).toBeChecked();
  await expect(settings.getByRole("status")).toHaveText("Recording locally.");

  await settings.getByRole("button", { name: "Reveal logs" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-diagnostics-revealed", "true");
});
