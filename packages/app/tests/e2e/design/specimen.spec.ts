import { expect, test } from "@playwright/test";

// The specimen enumerates roles out of the stylesheet, which is what stops it
// drifting — but only if the enumeration actually finds them all. These lists
// are written out independently, from DESIGN.md rather than from the code, so a
// broken enumeration fails here instead of quietly showing a shorter page.

const TYPE_ROLES = [
  "prose",
  "prose-emphasis",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "code",
  "inline-code",
  "navigation",
  "supporting",
  "action",
];

const COLOUR_TOKENS = [
  "--surface-canvas",
  "--surface-sidebar",
  "--surface-transient",
  "--surface-selection",
  "--surface-code",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--text-link",
  "--line-quiet",
  "--line-focus",
  "--state-added",
  "--state-changed",
  "--state-deleted",
  "--state-error",
];

test("shows every DESIGN.md 5.2 type role, and only those", async ({ page }) => {
  await page.goto("/dev/specimen.html");

  const shown = await page
    .locator("[data-role]")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.role));

  expect(shown.sort()).toEqual([...TYPE_ROLES].sort());
});

test("shows every DESIGN.md 4.3 colour role, and only those", async ({ page }) => {
  await page.goto("/dev/specimen.html");

  const shown = await page
    .locator("[data-token]")
    .evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).dataset.token));

  expect(shown.sort()).toEqual([...COLOUR_TOKENS].sort());
});

test("reports resolved metrics rather than the unresolved calc chain", async ({ page }) => {
  await page.goto("/dev/specimen.html");

  const h1 = page.locator('[data-role="h1"] .specimen-metrics');
  await expect(h1).toHaveText("30 / 38 · 700");

  const prose = page.locator('[data-role="prose"] .specimen-metrics');
  await expect(prose).toHaveText("17 / 28 · 400");

  const emphasis = page.locator('[data-role="prose-emphasis"] .specimen-metrics');
  await expect(emphasis).toHaveText("17 / 28 · 400 italic");
});

test("the theme buttons switch the palette and return to following the system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/dev/specimen.html");

  const canvas = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  expect(await canvas()).toBe("rgb(25, 26, 25)");

  await page.getByRole("button", { name: "light" }).click();
  expect(await canvas()).toBe("rgb(250, 250, 247)");

  await page.getByRole("button", { name: "system" }).click();
  expect(await canvas()).toBe("rgb(25, 26, 25)");
});

test("resolves a real colour for every swatch", async ({ page }) => {
  await page.goto("/dev/specimen.html");

  const values = await page
    .locator("[data-token] .specimen-metrics")
    .evaluateAll((nodes) => nodes.map((n) => n.textContent ?? ""));

  expect(values).toHaveLength(COLOUR_TOKENS.length);
  for (const value of values) {
    // An unresolved token would paint transparent rather than an rgb triple.
    expect(value).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  }
});
