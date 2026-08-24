import { expect, test } from "@playwright/test";

// Scaffold-level checks: the app boots, the design system is actually applied,
// and the bundled faces load. Reading, focus, and typography specs join these
// from session 1.2 onward.

test("boots the styled workbench at the root route", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("zd");

  const surface = page.locator('[data-centre-surface="home"] > .zd-workspace-home');
  await expect(surface, "the root route did not mount the project selector").toBeVisible();
  await expect(surface.getByRole("heading", { name: "Open a project" })).toBeVisible();
  await expect(surface.getByRole("button", { name: "Open Folder…" })).toBeVisible();

  const styled = await surface.evaluate((element) => {
    const notice = element.querySelector<HTMLElement>("p")!;
    const tokenProbe = document.createElement("div");
    tokenProbe.style.background = "var(--surface-canvas)";
    document.body.append(tokenProbe);
    const canvas = getComputedStyle(tokenProbe).backgroundColor;
    tokenProbe.remove();
    return {
      background: getComputedStyle(document.body).backgroundColor,
      canvas,
      height: element.getBoundingClientRect().height,
      noticeFamily: getComputedStyle(notice).fontFamily,
    };
  });
  expect(styled.background, "the workbench canvas token was not applied").toBe(styled.canvas);
  expect(styled.height, "the project selector did not fill the app window").toBeGreaterThan(0);
  expect(styled.noticeFamily).toContain("iA Writer Quattro");

  const [surfaceBox, emptyBox] = await Promise.all([
    surface.boundingBox(),
    surface.getByRole("heading", { name: "Open a project" }).boundingBox(),
  ]);
  expect(surfaceBox).not.toBeNull();
  expect(emptyBox).not.toBeNull();
  expect(emptyBox!.x).toBeCloseTo(surfaceBox!.x, 0);
  expect(emptyBox!.y).toBeGreaterThan(surfaceBox!.y);
});

test("applies the workbench design tokens rather than browser defaults", async ({ page }) => {
  await page.goto("/");

  const proseFamily = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--font-prose").trim(),
  );
  expect(proseFamily).toContain("iA Writer Quattro");

  // DESIGN.md §5.1: no synthetic bold, italic, or oblique.
  const synthesis = await page.evaluate(() => getComputedStyle(document.body).fontSynthesis);
  expect(synthesis).toBe("none");
});

test("loads the bundled iA Writer faces", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);

  const families = await page.evaluate(() =>
    [...document.fonts].map((face) => `${face.family}/${face.weight}/${face.style}`),
  );

  expect(families).toContain("iA Writer Quattro/400/normal");
  expect(families).toContain("iA Writer Quattro/400/italic");
  expect(families).toContain("iA Writer Quattro/700/normal");
  expect(families).toContain("iA Writer Mono/400/normal");
});

test("keeps Settings command-driven and out of the thread hierarchy", async ({ page }) => {
  await page.goto("/");
  const threads = page.locator('[data-region="threads"]');
  await expect(threads.locator("[data-diagnostic-settings]")).toHaveCount(0);
  await expect(threads.locator("[data-settings-trigger]")).toHaveCount(0);

  const primary = await page.evaluate(() =>
    /Mac|iP(hone|ad|od)/.test(navigator.platform) ? "Meta" : "Control",
  );
  await page.keyboard.press(`${primary}+,`);
  const sheet = page.locator("[data-workbench-settings]");

  await expect(sheet).toBeVisible();
  const attention = sheet.locator("[data-attention-settings]");
  await expect(attention).toBeVisible();
  await expect(attention.locator("[data-attention-status]")).toContainText("unavailable");
  await expect(attention.locator("[data-notifications-toggle]")).toBeDisabled();
  await expect(attention.locator("[data-sound-toggle]")).not.toBeChecked();
  await expect(attention.locator("[data-sound-volume]")).toHaveValue("50");

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});
