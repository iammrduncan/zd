import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    workbenchDocumentationFixture: {
      setCentreMode(mode: "overlap" | "side-by-side"): void;
    };
  }
}

test("assembles the implemented workbench used by product screenshots", async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();
  await expect(page.locator("[data-project-id]")).toHaveCount(4);
  await expect(page.locator('[data-project-id="project-zd"]')).toContainText("zd");
  await page.locator('[data-file-path="src"]').click();
  await expect(page.locator('[data-file-path="src/main.ts"]')).toHaveAttribute(
    "data-git-state",
    "changed",
  );
  await expect(page.locator(".cm-content")).toContainText("bootWorkbench");

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await expect(page.locator(".zd-workbench")).toHaveAttribute("data-centre-mode", "side-by-side");
  await expect(page.locator('[data-centre-surface="thread"]')).toBeVisible();
  await expect(page.locator('[data-centre-surface="file"]')).toBeVisible();
});
