import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await page.locator(".current-file .cm-editor").waitFor();
});

test("the project terminal toggles, splits, survives project switches, and follows the active side", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  const terminal = page.locator("[data-project-terminal]");

  await expect(terminal).toBeHidden();
  await page.keyboard.press(`${primary}+j`);
  await expect(terminal).toBeVisible();
  await expect(
    terminal.locator(".zd-project-terminal-group:not([hidden]) .xterm-rows"),
  ).toContainText("npm run check");
  await expect(terminal).toHaveAttribute("data-terminal-project-id", "project-zd");
  await expect(terminal).toHaveAttribute("data-terminal-owner", "file");

  await terminal.evaluate((node) => {
    node.dataset.retained = "original-project-terminal";
  });
  await page.keyboard.press(`${primary}+d`);
  await expect(terminal.locator("[data-project-terminal-pane]")).toHaveCount(2);
  await page.keyboard.press(`${primary}+Shift+d`);
  await expect(terminal.locator("[data-project-terminal-pane]")).toHaveCount(1);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(pageErrors).toEqual([]);

  await page.keyboard.press(`${primary}+j`);
  await expect(terminal).toBeHidden();
  await page.keyboard.press(`${primary}+j`);
  await expect(terminal).toBeVisible();
  await expect(terminal).toHaveAttribute("data-retained", "original-project-terminal");

  await page.keyboard.press(`${primary}+2`);
  await expect(terminal).toHaveAttribute("data-terminal-project-id", "project-notes");
  await expect(
    terminal.locator(".zd-project-terminal-group:not([hidden]) .xterm-rows"),
  ).toContainText("agent-notes");
  await page.keyboard.press(`${primary}+1`);
  await expect(terminal).toHaveAttribute("data-terminal-project-id", "project-zd");
  await expect(terminal).toHaveAttribute("data-retained", "original-project-terminal");

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();
  await expect.poll(() => terminal.getAttribute("data-terminal-owner")).toBe("file");
  const [fileTerminalBox, fileSurfaceBox] = await Promise.all([
    terminal.boundingBox(),
    page.locator('[data-centre-surface="file"]').boundingBox(),
  ]);
  expect(fileTerminalBox).not.toBeNull();
  expect(fileSurfaceBox).not.toBeNull();
  expect(fileTerminalBox!.x).toBeCloseTo(fileSurfaceBox!.x, 0);
  expect(fileTerminalBox!.x + fileTerminalBox!.width).toBeCloseTo(
    fileSurfaceBox!.x + fileSurfaceBox!.width,
    0,
  );
  expect(fileTerminalBox!.y + fileTerminalBox!.height).toBeCloseTo(
    fileSurfaceBox!.y + fileSurfaceBox!.height,
    0,
  );

  await page.locator('[data-project-id="project-zd"] .zd-project-heading').hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();
  await expect.poll(() => terminal.getAttribute("data-terminal-owner")).toBe("thread");
  const [threadTerminalBox, threadSurfaceBox] = await Promise.all([
    terminal.boundingBox(),
    page.locator('[data-centre-surface="thread"]').boundingBox(),
  ]);
  expect(threadTerminalBox).not.toBeNull();
  expect(threadSurfaceBox).not.toBeNull();
  expect(threadTerminalBox!.x).toBeCloseTo(threadSurfaceBox!.x, 0);
  expect(threadTerminalBox!.x + threadTerminalBox!.width).toBeCloseTo(
    threadSurfaceBox!.x + threadSurfaceBox!.width,
    0,
  );
  expect(pageErrors).toEqual([]);
});
