import { expect, test } from "@playwright/test";

// Root shell behavior belongs to the workbench test family.

test("lays out the persistent workbench regions at their default geometry", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto("/");

  const threads = page.locator('[data-region="threads"]');
  const centre = page.locator('[data-region="centre"]');
  const files = page.locator('[data-region="files"]');
  await expect(threads).toBeVisible();
  await expect(centre).toBeVisible();
  await expect(files).toBeVisible();

  const [threadsBox, centreBox, filesBox] = await Promise.all([
    threads.boundingBox(),
    centre.boundingBox(),
    files.boundingBox(),
  ]);
  expect(threadsBox!.width).toBe(236);
  expect(filesBox!.width).toBe(280);
  expect(threadsBox!.x).toBeLessThan(centreBox!.x);
  expect(centreBox!.x).toBeLessThan(filesBox!.x);
  expect(centreBox!.width).toBeGreaterThanOrEqual(528);

  await expect(files.getByRole("tab", { name: "FILES" })).toHaveAttribute("aria-selected", "true");
  await expect(files.getByRole("tab", { name: "CHANGES" })).toHaveAttribute(
    "aria-selected",
    "false",
  );
});

test("keeps the file tree visible at the native window's default width", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");

  const files = page.locator('[data-region="files"]');
  await expect(files).toBeVisible();
  await expect(files.getByRole("tab", { name: "FILES" })).toHaveAttribute("aria-selected", "true");
});

test("resizes both navigation panes at the native window width", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto("/");

  const threads = page.locator('[data-region="threads"]');
  const centre = page.locator('[data-region="centre"]');
  const files = page.locator('[data-region="files"]');
  const threadsResizer = page.locator('[data-resizer="threads"]');
  const filesResizer = page.locator('[data-resizer="files"]');
  const beforeThreads = await threads.boundingBox();
  const beforeFiles = await files.boundingBox();
  const threadsDivider = await threadsResizer.boundingBox();
  expect(beforeThreads).not.toBeNull();
  expect(beforeFiles).not.toBeNull();
  expect(threadsDivider).not.toBeNull();

  await page.mouse.move(
    threadsDivider!.x + threadsDivider!.width / 2,
    threadsDivider!.y + threadsDivider!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(threadsDivider!.x + 32, threadsDivider!.y + threadsDivider!.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => (await threads.boundingBox())!.width)
    .toBeGreaterThan(beforeThreads!.width + 24);

  const filesDivider = await filesResizer.boundingBox();
  expect(filesDivider).not.toBeNull();
  await page.mouse.move(
    filesDivider!.x + filesDivider!.width / 2,
    filesDivider!.y + filesDivider!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(filesDivider!.x - 32, filesDivider!.y + filesDivider!.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => (await files.boundingBox())!.width)
    .toBeGreaterThan(beforeFiles!.width + 20);

  await expect.poll(async () => (await centre.boundingBox())!.width).toBeGreaterThanOrEqual(528);
});

test("applies responsive regions in the specified suppression order", async ({ page }) => {
  await page.setViewportSize({ width: 1260, height: 800 });
  await page.goto("/");

  const shell = page.locator(".zd-workbench");
  const threads = page.locator('[data-region="threads"]');
  const centre = page.locator('[data-region="centre"]');
  const files = page.locator('[data-region="files"]');

  await expect(threads).toHaveCSS("width", "236px");
  await expect(files).toHaveCSS("width", "280px");

  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(files).toBeVisible();
  await expect(threads).toBeVisible();
  const [compactThreads, compactCentre, compactFiles] = await Promise.all([
    threads.boundingBox(),
    centre.boundingBox(),
    files.boundingBox(),
  ]);
  expect(compactThreads!.width).toBeGreaterThanOrEqual(184);
  expect(compactThreads!.width).toBeLessThan(236);
  expect(compactFiles!.width).toBeGreaterThanOrEqual(220);
  expect(compactFiles!.width).toBeLessThan(280);
  expect(compactCentre!.width).toBeGreaterThanOrEqual(528);

  await page.setViewportSize({ width: 920, height: 800 });
  await expect(files).toBeHidden();
  await expect(threads).toBeVisible();

  await page.setViewportSize({ width: 760, height: 800 });
  await expect(threads).toBeVisible();
  await expect(threads).toHaveCSS("width", "56px");

  await page.setViewportSize({ width: 600, height: 800 });
  await expect(threads).toBeHidden();
  await expect(shell.locator('[data-region="centre"]')).toHaveCSS("width", "600px");
});

test("responsive overlap keeps the focused centre surface and releases hidden focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();

  const shell = page.locator(".zd-workbench");
  const files = page.locator('[data-region="files"]');
  const fileSurface = page.locator('[data-centre-surface="file"]');
  const threadSurface = page.locator('[data-centre-surface="thread"]');

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await expect(fileSurface).toBeVisible();
  await expect(threadSurface).toBeVisible();

  await page.locator('[data-project-id="project-zd"] .zd-project-heading').hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();
  await page.setViewportSize({ width: 1150, height: 800 });
  await expect(threadSurface).toBeVisible();
  await expect(fileSurface).toBeHidden();

  await page.getByRole("treeitem", { name: "README.md, Markdown file, modified" }).click();
  await expect(shell).toHaveAttribute("data-focus-region", "file");
  await expect(threadSurface).toBeHidden();
  await expect(fileSurface).toBeVisible();

  await files.getByRole("tab", { name: "FILES" }).focus();
  await page.setViewportSize({ width: 920, height: 800 });
  await expect(files).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest('[data-region="files"]')))
    .toBeNull();
});

test("the thin top chrome reserves a native window drag region", async ({ page }) => {
  await page.goto("/");

  const region = page.locator("[data-tauri-drag-region]");
  const shell = page.locator(".zd-workbench");
  await expect(region).toHaveCount(1);

  const box = await region.boundingBox();
  const shellBox = await shell.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(shellBox).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
  expect(box!.width).toBe(viewport!.width);
  expect(box!.height).toBeGreaterThanOrEqual(24);
  expect(shellBox!.y).toBe(box!.height);
  expect(shellBox!.height).toBe(viewport!.height - box!.height);

  const chrome = await region.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, border: style.borderBottomWidth };
  });
  expect(chrome.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(chrome.border).toBe("1px");

  const receivesPointer = await page.evaluate(
    ({ x, y }) => {
      return document.elementFromPoint(x, y)?.hasAttribute("data-tauri-drag-region") ?? false;
    },
    { x: viewport!.width / 2, y: box!.height / 2 },
  );
  expect(receivesPointer).toBe(true);
});
