import { expect, test } from "@playwright/test";

// Scaffold-level checks: the app boots, the design system is actually applied,
// and the bundled faces load. Reading, focus, and typography specs join these
// from session 1.2 onward.

test("boots the styled md mini app at the root route", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("zd md");

  const surface = page.locator("#zd > .md-surface");
  await expect(surface, "the root route did not mount the md surface").toBeVisible();
  await expect(surface.locator(".md-document-error")).toContainText("No document open.");

  const styled = await surface.evaluate((element) => {
    const notice = element.querySelector<HTMLElement>(".md-document-error")!;
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
  expect(styled.background, "the suite canvas token was not applied").toBe(styled.canvas);
  expect(styled.height, "the md surface did not fill the app window").toBeGreaterThan(0);
  expect(styled.noticeFamily).toContain("iA Writer Quattro");
});

test("applies the suite design tokens rather than browser defaults", async ({ page }) => {
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
