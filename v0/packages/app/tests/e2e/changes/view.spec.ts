import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/dev/changes-performance.html");
});

test("renders a compact semantic virtual list for every Git state", async ({ page }) => {
  const rows = page.locator("[data-change-id]");
  await expect(rows.first()).toBeVisible();
  expect(await rows.count()).toBeLessThan(48);
  await expect(page.locator("[data-change-id='working-0']")).toHaveAttribute(
    "aria-label",
    /modified/u,
  );
  await expect(page.locator("[data-change-id='working-6']")).toHaveAttribute(
    "aria-label",
    /ignored/u,
  );
  expect(await rows.first().evaluate((row) => row.getBoundingClientRect().height)).toBe(20);
});

test("preserves filter and scroll while the persistent panel is hidden", async ({ page }) => {
  const filter = page.getByRole("searchbox", { name: "Filter changes" });
  const viewport = page.locator("[data-changes-viewport='working']");
  await filter.fill("modified");
  const before = await viewport.evaluate((element) => {
    element.scrollTop = 1_000;
    element.dispatchEvent(new Event("scroll"));
    return element.scrollTop;
  });
  await page.locator("#changes-performance > aside").evaluate((element: HTMLElement) => {
    element.hidden = true;
    element.hidden = false;
  });
  await expect(filter).toHaveValue("modified");
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(before);

  await filter.fill("file-09999");
  await expect(page.locator("[data-change-id='working-9999']")).toBeVisible();
});

test("compares history and opens explicitly identified read-only buffers", async ({ page }) => {
  const commits = page.locator("[data-commit-id]");
  await expect(commits).toHaveCount(50);
  await commits.nth(0).click();
  await commits.nth(1).click();
  const comparison = page.locator("[data-comparison-change-id='comparison-main']");
  await expect(comparison).toBeVisible();
  await comparison.click();

  const buffers = page.locator("[data-buffer-identity]");
  await expect(buffers).toHaveCount(2);
  await expect(buffers.nth(0)).toHaveAttribute("data-buffer-identity", "base-comparison-main");
  await expect(buffers.nth(1)).toHaveAttribute("data-buffer-identity", "head-comparison-main");
  await expect(page.locator(".cm-content")).toHaveCount(2);
  expect(
    await page
      .locator(".cm-content")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("contenteditable")),
      ),
  ).toEqual(["false", "false"]);
});
