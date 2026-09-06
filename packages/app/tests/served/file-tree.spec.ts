import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./host.fixture";

async function unlock(page: Page, url: string, secret: string): Promise<void> {
  await page.goto(url);
  await page.getByLabel("Process secret").fill(secret);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".zd-workbench")).toBeVisible();
  await page.getByRole("tab", { name: "FILES", exact: true }).click();
}

async function expectOpenFile(page: Page, row: Locator, path: string, text: string): Promise<void> {
  await expect(row).toHaveAttribute("aria-current", "page");
  await expect(row).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".current-file-path")).toHaveText(path);
  await expect(page.locator('.editor-buffer[data-buffer-kind="editable"]')).toContainText(text);
}

test("left-click opens and closes folders and switches files after using the context menu", async ({
  page,
  servedHost,
}) => {
  await unlock(page, servedHost.url, servedHost.secret);
  const tree = page.getByRole("tree", { name: "Project files" });
  const docs = tree.locator('[data-file-path="docs"]');
  const inside = tree.locator('[data-file-path="docs/inside.md"]');
  const notes = tree.locator('[data-file-path="notes.md"]');

  await docs.click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  if ((await docs.getAttribute("aria-expanded")) === "true") await docs.click();
  await expect(inside).toHaveCount(0);
  for (let repeat = 0; repeat < 3; repeat += 1) {
    await docs.locator(".zd-file-tree-disclosure").click();
    await expect(docs).toHaveAttribute("aria-expanded", "true");
    await inside.locator(".zd-file-tree-name").click();
    await expectOpenFile(page, inside, "docs/inside.md", "inside");
    await notes.click();
    await expectOpenFile(page, notes, "notes.md", "Remote fixture");
    await expect(inside).toHaveAttribute("aria-selected", "false");
    await docs.locator(".zd-file-tree-name").click();
    await expect(docs).toHaveAttribute("aria-expanded", "false");
    await expect(inside).toHaveCount(0);
  }
});

test("keyboard navigation continues from a clicked folder", async ({ page, servedHost }) => {
  await unlock(page, servedHost.url, servedHost.secret);
  const tree = page.getByRole("tree", { name: "Project files" });
  const docs = tree.locator('[data-file-path="docs"]');
  await docs.click();
  await expect(docs).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(docs).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("ArrowRight");
  await expect(docs).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  const inside = tree.locator('[data-file-path="docs/inside.md"]');
  await expect(inside).toBeFocused();
  await page.keyboard.press("Enter");
  await expectOpenFile(page, inside, "docs/inside.md", "inside");
});

test("a host filesystem refresh does not swallow a left-click in progress", async ({
  page,
  servedHost,
}) => {
  await unlock(page, servedHost.url, servedHost.secret);
  const tree = page.getByRole("tree", { name: "Project files" });
  const docs = tree.locator('[data-file-path="docs"]');
  if ((await docs.getAttribute("aria-expanded")) === "true") await docs.click();

  for (const [path, activity] of [
    ["docs", "watch-folder-click.md"],
    ["docs/inside.md", "watch-file-click.md"],
  ] as const) {
    const row = tree.locator(`[data-file-path="${path}"]`);
    await row.locator(".zd-file-tree-name").hover();
    await page.mouse.down();
    try {
      await servedHost.createExternalFile(activity);
      await expect(tree.locator(`[data-file-path="${activity}"]`)).toBeVisible();
    } finally {
      await page.mouse.up();
    }
    if (path === "docs") await expect(docs).toHaveAttribute("aria-expanded", "true");
    else await expectOpenFile(page, row, path, "inside");
  }
});

test("modifier clicks select files without opening them and a plain click replaces the selection", async ({
  page,
  servedHost,
}) => {
  await unlock(page, servedHost.url, servedHost.secret);
  const tree = page.getByRole("tree", { name: "Project files" });
  const docs = tree.locator('[data-file-path="docs"]');
  if ((await docs.getAttribute("aria-expanded")) !== "true") await docs.click();
  const inside = tree.locator('[data-file-path="docs/inside.md"]');
  const notes = tree.locator('[data-file-path="notes.md"]');
  await inside.click();
  await expectOpenFile(page, inside, "docs/inside.md", "inside");
  await notes.click({ modifiers: ["ControlOrMeta"] });
  await expect(tree.locator('[aria-selected="true"]')).toHaveCount(2);
  await expect(inside).toHaveAttribute("aria-selected", "true");
  await expect(notes).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".current-file-path")).toHaveText("docs/inside.md");
  await notes.click({ modifiers: ["ControlOrMeta"] });
  await expect(notes).toHaveAttribute("aria-selected", "false");
  await expect(inside).toHaveAttribute("aria-selected", "true");
  await inside.click();
  await notes.click({ modifiers: ["Shift"] });
  await expect(tree.locator('[aria-selected="true"]')).toHaveCount(2);
  await expect(page.locator(".current-file-path")).toHaveText("docs/inside.md");
  await notes.click();
  await expectOpenFile(page, notes, "notes.md", "Remote fixture");
  await expect(tree.locator('[aria-selected="true"]')).toHaveCount(1);
});
