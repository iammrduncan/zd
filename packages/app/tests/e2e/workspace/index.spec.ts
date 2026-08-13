import { expect, test } from "@playwright/test";

test("a folder opens as a markdown file sidebar and switches documents", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const plans = page.locator(".md-workspace-folder", { hasText: "plans" });
  const readme = page.locator('.md-workspace-file[title="README.md"]');
  const roadmap = page.locator('.md-workspace-file[title="plans/roadmap.md"]');
  await expect(page.locator(".md-workspace-tree > li > button")).toHaveText(["plans", "README.md"]);
  await expect(plans).toHaveAttribute("aria-expanded", "false");
  await expect(readme).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".cm-content")).toContainText("Workspace readme");
  await expect(roadmap).toBeHidden();

  await plans.click();
  await expect(plans).toHaveAttribute("aria-expanded", "true");
  await roadmap.click();

  await expect(roadmap).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".cm-content")).toContainText("Roadmap");
  await expect(page.locator(".md-workspace-sidebar")).toBeVisible();
});

test("the file tree panel resizes from its full-height separator", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const sidebar = page.locator(".md-workspace-sidebar");
  const separator = page.locator(".md-workspace-resizer");
  const before = await sidebar.boundingBox();
  const handle = await separator.boundingBox();
  expect(before).not.toBeNull();
  expect(handle).not.toBeNull();
  expect(handle!.height).toBeGreaterThan(700);

  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + 60, handle!.y + handle!.height / 2);
  await page.mouse.up();

  await expect
    .poll(async () => (await sidebar.boundingBox())!.width)
    .toBeGreaterThan(before!.width);
  await expect(separator).toHaveAttribute("role", "separator");
  await expect(separator).toHaveAttribute("aria-valuemax", "280");

  const afterDrag = (await sidebar.boundingBox())!.width;
  await separator.focus();
  await separator.press("ArrowLeft");
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(afterDrag);
});

test("the file tree starts below the macOS window controls", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const metrics = await page.locator(".md-workspace-sidebar").evaluate((sidebar) => {
    const firstRow = sidebar.querySelector<HTMLElement>(".md-workspace-tree > li > button")!;
    const sidebarStyle = getComputedStyle(sidebar);
    const rootStyle = getComputedStyle(document.documentElement);
    return {
      inset: Number.parseFloat(rootStyle.getPropertyValue("--transient-inset-top")),
      padding: Number.parseFloat(sidebarStyle.paddingTop),
      rowOffset: firstRow.getBoundingClientRect().top - sidebar.getBoundingClientRect().top,
    };
  });

  expect(metrics.padding).toBeGreaterThanOrEqual(metrics.inset);
  expect(metrics.rowOffset).toBeGreaterThanOrEqual(metrics.inset);
});

test("a folder context menu expands and collapses its subtree", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const plans = page.locator(".md-workspace-folder", { hasText: "plans" });
  const roadmap = page.locator('.md-workspace-file[title="plans/roadmap.md"]');
  await plans.click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Folder actions for plans" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Expand all" }).click();
  await expect(plans).toHaveAttribute("aria-expanded", "true");
  await expect(roadmap).toBeVisible();

  await plans.click({ button: "right" });
  await page.getByRole("menuitem", { name: "Collapse all" }).click();
  await expect(plans).toHaveAttribute("aria-expanded", "false");
  await expect(roadmap).toBeHidden();
});

test("a long file-tree row scrolls horizontally instead of being clipped", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const sidebar = page.locator(".md-workspace-sidebar");
  const longFile = page.locator(".md-workspace-file", {
    hasText: "this-is-a-long-document-name-that-exceeds-the-file-tree-panel-width.md",
  });
  await page.locator(".md-workspace-folder", { hasText: "plans" }).click();
  await expect(longFile).toBeVisible();
  await expect
    .poll(() => sidebar.evaluate((element) => element.scrollWidth > element.clientWidth))
    .toBe(true);

  await sidebar.evaluate((element) => {
    element.scrollLeft = element.scrollWidth;
  });
  await expect.poll(() => sidebar.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
});

test("selected text becomes a persistent line comment and consolidated feedback file", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto("/dev/workspace.html");

  const firstParagraph = page.locator(".cm-line", { hasText: "The first document" });
  await firstParagraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");

  const composer = page.locator(".md-comment-composer");
  await expect(composer).toBeVisible();
  await composer.locator("textarea").fill("Clarify this introduction\nand state the audience");
  await composer.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator(".md-comment-tag")).toHaveText(
    "Clarify this introduction and state the audience",
  );

  await page.reload();
  await expect(page.locator(".md-comment-tag")).toHaveText(
    "Clarify this introduction and state the audience",
  );

  await page.locator(".md-workspace-folder", { hasText: "plans" }).click();
  await page.locator(".md-workspace-file", { hasText: "roadmap.md" }).click();
  const secondParagraph = page.locator(".cm-line", { hasText: "The second document" });
  await secondParagraph.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.locator(".md-comment-composer textarea").fill("Add an owner");
  await page.getByRole("button", { name: "Add comment" }).click();

  await page.getByRole("button", { name: "View feedback" }).click();
  await expect(page.locator(".md-feedback-output")).toHaveText(
    [
      "[README.md][LN3:LN3] [The first document in the folder.] Clarify this introduction and state the audience",
      "[plans/roadmap.md][LN3:LN3] [The second document in the folder.] Add an owner",
    ].join("\n"),
  );
  await expect(page.getByText("zd-feedback.txt", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Delete comment: Add an owner" }).click();
  await expect(page.locator(".md-feedback-output")).toHaveText(
    "[README.md][LN3:LN3] [The first document in the folder.] Clarify this introduction and state the audience",
  );
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.locator(".md-comment-tag")).toHaveCount(0);
});

test("a compact window suppresses the sidebar without hiding the document", async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 800 });
  await page.goto("/dev/workspace.html");

  await expect(page.locator(".md-workspace-sidebar")).toBeHidden();
  await expect(page.locator(".cm-content")).toContainText("Workspace readme");
});
