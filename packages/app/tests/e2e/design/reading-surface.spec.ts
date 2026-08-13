import { expect, test } from "@playwright/test";

import { tokenPx } from "../anchor";

const PROSE = (
  "The window is the document and the text sits on a calm plane. " +
  "Hierarchy comes from typography and space rather than from rules or boxes. " +
  "Nothing competes for attention, so a long reading session stays comfortable " +
  "on a retina panel and on a cheap external display alike. "
).repeat(6);

async function open(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/dev/editor.html");
  await page.locator(".md-editor .cm-line").first().waitFor();
}

async function layout(page: import("@playwright/test").Page) {
  return page.evaluate(async (prose) => {
    await document.fonts.load('400 17px "iA Writer Quattro"');
    await document.fonts.ready;

    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const column = document.querySelector<HTMLElement>(".md-editor")!;
    const probe = document.createElement("div");
    probe.style.cssText = `
      font-family:var(--type-prose-family);
      font-size:var(--type-prose-size);
      line-height:var(--type-prose-line)
    `;
    probe.textContent = prose;
    column.append(probe);
    const range = document.createRange();
    range.selectNodeContents(probe);
    const lines = range.getClientRects().length;
    const surfaceStyle = getComputedStyle(surface);
    const columnBox = column.getBoundingClientRect();
    const surfaceBox = surface.getBoundingClientRect();

    return {
      charsPerLine: prose.trim().length / lines,
      columnWidth: columnBox.width,
      insetLeft: parseFloat(surfaceStyle.paddingLeft),
      insetRight: parseFloat(surfaceStyle.paddingRight),
      spaceAbove: parseFloat(getComputedStyle(column).marginTop),
      spaceBelow: parseFloat(getComputedStyle(column).marginBottom),
      scrollbarWidth: surfaceStyle.scrollbarWidth,
      overflowY: surfaceStyle.overflowY,
      leadIn: columnBox.left - surfaceBox.left,
      leadOut: surfaceBox.right - columnBox.right,
      background: getComputedStyle(column).backgroundColor,
      border: getComputedStyle(column).borderTopWidth,
      shadow: getComputedStyle(column).boxShadow,
      scrolls: surface.scrollHeight > surface.clientHeight,
    };
  }, PROSE);
}

test("a prose line holds between 60 and 75 characters", async ({ page }) => {
  await open(page, 1100, 800);
  const measured = await layout(page);
  expect(measured.charsPerLine).toBeGreaterThanOrEqual(60);
  expect(measured.charsPerLine).toBeLessThanOrEqual(75);
});

test("the reading column stays inside the 480 to 640px envelope", async ({ page }) => {
  await open(page, 1400, 800);
  const measured = await layout(page);
  expect(measured.columnWidth).toBeGreaterThanOrEqual(480);
  expect(measured.columnWidth).toBeLessThanOrEqual(640);
});

test("the column is centred in the main region", async ({ page }) => {
  await open(page, 1400, 800);
  const measured = await layout(page);
  expect(measured.leadIn).toBeCloseTo(measured.leadOut, 0);
});

test("wide windows use the canonical 64px and 80px insets", async ({ page }) => {
  await open(page, 1100, 800);
  const measured = await layout(page);
  expect(measured.insetLeft).toBe(64);
  expect(measured.insetRight).toBe(64);
  expect(measured.spaceAbove - (await tokenPx(page, "--reading-gutter-leading"))).toBe(80);
});

test("compact windows use the marker-safe 72px inset and 56px top inset", async ({ page }) => {
  await open(page, 640, 800);
  const measured = await layout(page);
  expect(measured.insetLeft).toBe(72);
  expect(measured.insetRight).toBe(72);
  expect(measured.spaceAbove - (await tokenPx(page, "--reading-gutter-leading"))).toBe(56);
});

test("the marker-safe inset holds at the minimum window width", async ({ page }) => {
  await open(page, 400, 800);
  const measured = await layout(page);
  expect(measured.insetLeft).toBe(72);
  expect(measured.insetRight).toBe(72);
});

test("there is at least 120px of breathing room past the last line", async ({ page }) => {
  await open(page, 1100, 800);
  const measured = await layout(page);
  expect(
    measured.spaceBelow - (await tokenPx(page, "--reading-gutter-trailing")),
  ).toBeGreaterThanOrEqual(120);
});

test("the surface scrolls without drawing any scroll control", async ({ page }) => {
  await open(page, 1100, 400);
  const measured = await layout(page);
  expect(measured.scrolls, "content long enough to overflow").toBe(true);
  expect(measured.overflowY).toBe("auto");
  expect(measured.scrollbarWidth).toBe("none");
  const gutter = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    return surface.offsetWidth - surface.clientWidth;
  });
  expect(gutter, "a scrollbar is stealing layout width").toBe(0);
});

test("the reading column is not a card", async ({ page }) => {
  await open(page, 1100, 800);
  const measured = await layout(page);
  expect(measured.background).toBe("rgba(0, 0, 0, 0)");
  expect(measured.border).toBe("0px");
  expect(measured.shadow).toBe("none");
});

test("the window itself never scrolls — the surface does", async ({ page }) => {
  await open(page, 1100, 400);
  await layout(page);
  expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe("hidden");
});
