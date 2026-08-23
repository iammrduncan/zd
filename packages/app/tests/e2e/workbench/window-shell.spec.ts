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

test("manually collapses Projects to icons and restores its saved width", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();

  const shell = page.locator(".zd-workbench");
  const projects = page.locator('[data-region="threads"]');
  await page.locator('[data-project-id="project-zd"] .zd-project-heading').hover();
  await page.getByRole("button", { name: "New terminal in zd" }).click();

  const collapse = projects.getByRole("button", { name: "Collapse Projects pane" });
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveText("‹");
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  const [projectsBox, collapseBox] = await Promise.all([
    projects.boundingBox(),
    collapse.boundingBox(),
  ]);
  expect(projectsBox).not.toBeNull();
  expect(collapseBox).not.toBeNull();
  expect(
    projectsBox!.y + projectsBox!.height - (collapseBox!.y + collapseBox!.height),
  ).toBeLessThan(16);
  await expect(projects.locator(".zd-project-toolbar")).not.toContainText("Collapse");
  await expect(projects.locator(".zd-project-icon:visible")).toHaveCount(0);
  await collapse.focus();
  await page.keyboard.press("Enter");

  await expect(shell).toHaveAttribute("data-threads-visibility", "collapsed");
  await expect(projects).toHaveCSS("width", "56px");
  await expect(projects.getByRole("heading", { name: "PROJECTS" })).toBeHidden();
  await expect(projects.getByRole("button", { name: "Open project folder" })).toBeHidden();
  await expect(projects.locator(".zd-project-icon:visible")).toHaveCount(4);
  await expect(projects.locator(".zd-project-name:visible")).toHaveCount(0);
  await expect(projects.locator(".zd-thread-type-icon:visible")).toHaveCount(1);
  await expect(projects.locator(".zd-thread-labels:visible")).toHaveCount(0);

  const expand = projects.getByRole("button", { name: "Expand Projects pane" });
  await expect(expand).toHaveText("›");
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(shell).toHaveAttribute("data-threads-visibility", "full");
  await expect(projects).toHaveCSS("width", "236px");
  await expect(projects.getByRole("heading", { name: "PROJECTS" })).toBeVisible();
  await expect(projects.locator(".zd-project-name:visible")).toHaveCount(4);
  await expect(projects.locator(".zd-thread-labels:visible")).toHaveCount(1);
});

test("hides and restores Files and Changes from the top chrome", async ({ page }) => {
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.goto("/dev/workbench.html");
  const shell = page.locator(".zd-workbench");
  const files = page.locator('[data-region="files"]');

  const chrome = page.getByRole("toolbar", { name: "Window controls" });
  await expect(page.locator("[data-files-visibility-toggle]")).toHaveCount(0);
  await chrome.getByRole("button", { name: "Show or hide Files and Changes" }).click();
  await expect(shell).toHaveAttribute("data-files-visibility", "hidden");
  await expect(files).toBeHidden();

  await chrome.getByRole("button", { name: "Show or hide Files and Changes" }).click();
  await expect(shell).toHaveAttribute("data-files-visibility", "visible");
  await expect(files).toHaveCSS("width", "280px");
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

test("the top chrome exposes compact panel, Settings, and hotkey actions", async ({ page }) => {
  await page.goto("/dev/workbench.html");
  const chrome = page.locator(".zd-window-drag-region");

  await expect(chrome.getByRole("button", { name: "Show or hide Projects" })).toHaveText("[p]");
  await expect(chrome.getByRole("button", { name: "Show or hide Files and Changes" })).toHaveText(
    "[f]",
  );
  await expect(chrome.getByRole("button", { name: "Settings" })).toHaveText("[s]");
  await expect(chrome.getByRole("button", { name: "Keyboard shortcuts" })).toHaveText("[h]");

  const shell = page.locator(".zd-workbench");
  await chrome.getByRole("button", { name: "Show or hide Projects" }).click();
  await expect(shell).toHaveAttribute("data-threads-visibility", "hidden");
  await chrome.getByRole("button", { name: "Show or hide Projects" }).click();
  await expect(shell).toHaveAttribute("data-threads-visibility", "full");

  await chrome.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.keyboard.press("Escape");

  await chrome.getByRole("button", { name: "Keyboard shortcuts" }).click();
  await expect(page.getByRole("dialog", { name: "Shortcut Reference" })).toBeVisible();
});
