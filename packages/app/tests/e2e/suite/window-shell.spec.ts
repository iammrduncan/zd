import { expect, test } from "@playwright/test";

test("the empty top inset is a native window drag region", async ({ page }) => {
  await page.goto("/");

  const region = page.locator("[data-tauri-drag-region]");
  await expect(region).toHaveCount(1);

  const box = await region.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBe(0);
  expect(box!.y).toBe(0);
  expect(box!.width).toBe(viewport!.width);
  expect(box!.height).toBeGreaterThanOrEqual(24);

  const receivesPointer = await page.evaluate(
    ({ x, y }) => {
      return document.elementFromPoint(x, y)?.hasAttribute("data-tauri-drag-region") ?? false;
    },
    { x: viewport!.width / 2, y: box!.height / 2 },
  );
  expect(receivesPointer).toBe(true);
});
