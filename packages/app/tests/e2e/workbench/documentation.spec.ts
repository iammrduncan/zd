import { expect, test } from "@playwright/test";

declare global {
  interface Window {
    workbenchDocumentationFixture: {
      setCentreMode(mode: "overlap" | "side-by-side"): void;
      createFile(relativePath: string): void;
    };
  }
}

test("assembles the implemented workbench used by product screenshots", async ({ page }) => {
  await page.goto("/dev/workbench.html");
  await expect(page.locator('html[data-workbench-ready="true"]')).toBeAttached();
  const navigation = page.locator('[data-region="threads"]');
  const navigationHeader = navigation.locator(".zd-project-toolbar");
  await expect(navigation).toHaveAttribute("aria-label", "Projects");
  await expect(navigation.getByRole("heading", { name: "PROJECTS" })).toHaveCount(1);
  await expect(navigationHeader.getByRole("heading", { name: "PROJECTS" })).toBeVisible();
  await expect(navigationHeader.getByRole("button", { name: "Open project folder" })).toHaveText(
    "Open",
  );
  await expect(
    navigation.locator("[data-settings-trigger]"),
    "Settings leaked into Threads",
  ).toHaveCount(0);
  await expect(page.locator("[data-project-id]")).toHaveCount(4);
  await expect(page.locator('[data-project-id="project-zd"]')).toContainText("zd");
  await page.locator('[data-file-path="src"]').click();
  await expect(page.locator('[data-file-path="src/main.ts"]')).toHaveAttribute(
    "data-git-state",
    "changed",
  );
  await expect(page.locator(".cm-content")).toContainText("bootWorkbench");
  await expect(
    page
      .locator(".current-file .cm-lineNumbers .cm-gutterElement")
      .filter({ hasText: /^1$/ })
      .first(),
  ).toBeVisible();
  const codeOpening = await page.locator(".current-file .editor-buffer").evaluate((surface) => {
    const firstLine = surface.querySelector<HTMLElement>(".cm-line")!;
    return {
      scrollTop: surface.scrollTop,
      firstLineOffset: firstLine.getBoundingClientRect().top - surface.getBoundingClientRect().top,
    };
  });
  expect(codeOpening.scrollTop).toBeCloseTo(0, 0);
  expect(codeOpening.firstLineOffset).toBeLessThanOrEqual(1);

  await page.evaluate(() => {
    window.workbenchDocumentationFixture.setCentreMode("side-by-side");
  });
  await expect(page.locator(".zd-workbench")).toHaveAttribute("data-centre-mode", "side-by-side");
  await expect(page.locator('[data-centre-surface="thread"]')).toBeVisible();
  await expect(page.locator('[data-centre-surface="file"]')).toBeVisible();
});
