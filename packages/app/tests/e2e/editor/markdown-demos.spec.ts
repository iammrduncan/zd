import { readFileSync } from "node:fs";

import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { openEditor } from "./harness";

const DEMOS = {
  code: readFileSync(
    new URL("../../../../../docs/markdown-demos/code-fences.md", import.meta.url),
    "utf8",
  ),
  lists: readFileSync(
    new URL("../../../../../docs/markdown-demos/lists-and-quotes.md", import.meta.url),
    "utf8",
  ),
  typography: readFileSync(
    new URL("../../../../../docs/markdown-demos/typography.md", import.meta.url),
    "utf8",
  ),
} as const;

async function showDemo(page: Page, source: string): Promise<void> {
  await openEditor(page, { height: 900, width: 1100 });
  const content = page.locator(".cm-content");
  await content.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(source);
  await expect.poll(() => page.evaluate(() => window.zdEditor!.text())).toBe(source);
  await page.locator(".md-surface").evaluate((surface) => {
    surface.scrollTop = 0;
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function capture(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
}

test("the code demo gives every fenced passage an inner reading edge", async ({
  page,
}, testInfo) => {
  await showDemo(page, DEMOS.code);
  await capture(page, testInfo, "code-fences");

  const inset = await page
    .locator(".md-line-code", { hasText: "interface Note" })
    .evaluate((line) => parseFloat(getComputedStyle(line).paddingInlineStart));

  expect(inset, "fenced code starts against the code plane edge").toBeGreaterThan(0);
});

test("the typography demo renders strikethrough and keeps every heading marker clear of text", async ({
  page,
}, testInfo) => {
  await showDemo(page, DEMOS.typography);
  await capture(page, testInfo, "typography");

  const strike = page.locator(".md-strikethrough", { hasText: "strikethrough" });
  await expect(strike, "the GFM strikethrough run is not decorated").toHaveCount(1);
  expect(await strike.evaluate((run) => getComputedStyle(run).textDecorationLine)).toContain(
    "line-through",
  );

  const gaps = await page.locator(".md-notation-mark").evaluateAll((markers) =>
    markers.map((marker) => {
      const markerText = document.createRange();
      const text = marker.firstChild!;
      markerText.setStart(text, 0);
      markerText.setEnd(text, text.textContent!.trimEnd().length);
      const range = document.createRange();
      range.setStartAfter(marker);
      range.setEndAfter(marker.parentNode!);
      return range.getClientRects()[0]!.left - markerText.getBoundingClientRect().right;
    }),
  );
  expect(gaps).toHaveLength(6);
  for (const gap of gaps)
    expect(gap, "a heading marker touches its heading text").toBeGreaterThan(2);
});

test("the lists demo distinguishes completed tasks and keeps quoted list notation inside its rule", async ({
  page,
}, testInfo) => {
  await showDemo(page, DEMOS.lists);
  await capture(page, testInfo, "lists-and-quotes");

  const listHeights = await page
    .locator(".md-line-item")
    .evaluateAll((lines) =>
      lines
        .filter((line) => line.textContent?.includes("ordered item"))
        .map((line) => ({ text: line.textContent, height: line.getBoundingClientRect().height })),
    );
  const outerHeight = listHeights.find(({ text }) => text?.startsWith("1."))!.height;
  for (const row of listHeights) {
    expect(row.height, `literal indent made ${row.text} grow extra visual rows`).toBeCloseTo(
      outerHeight,
      0,
    );
  }

  const taskColours = await page.evaluate(() => {
    const completed = document.querySelector<HTMLElement>(".md-task-complete");
    const open = document.querySelector<HTMLElement>(".md-task-open");
    return {
      completed: completed ? getComputedStyle(completed).color : null,
      open: open ? getComputedStyle(open).color : null,
    };
  });
  expect(taskColours.completed, "the completed marker is not decorated").not.toBeNull();
  expect(taskColours.open, "the open marker is not decorated").not.toBeNull();
  expect(taskColours.completed).not.toBe(taskColours.open);

  const combined = page.locator(".md-line-quote.md-line-item", { hasText: "A list can be nested" });
  const geometry = await combined.evaluate((line) => {
    const quote = line.querySelector<HTMLElement>(".md-quote-mark")!;
    const list = line.querySelector<HTMLElement>(".md-line-marker")!;
    const lineLeft = line.getBoundingClientRect().left;
    return {
      quoteLeft: quote.getBoundingClientRect().left,
      quoteRight: quote.getBoundingClientRect().right,
      listLeft: list.getBoundingClientRect().left,
      lineLeft,
    };
  });
  expect(geometry.quoteLeft, "the quote marker escaped its hairline").toBeGreaterThanOrEqual(
    geometry.lineLeft,
  );
  expect(geometry.listLeft, "quote and list markers overlap").toBeGreaterThanOrEqual(
    geometry.quoteRight - 1,
  );
});

test("ordered-list typing, continuation, and Tab keep the caret with the inserted item", async ({
  page,
}) => {
  await showDemo(page, DEMOS.lists);
  const line = "3. Third ordered item";
  const at = DEMOS.lists.indexOf(line) + line.length;
  await page.evaluate((offset) => window.zdEditor!.setCaret(offset), at);

  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Inserted item");
  await page.keyboard.press("Tab");

  const state = await page.evaluate(() => ({
    selection: window.zdEditor!.selection(),
    text: window.zdEditor!.text(),
  }));
  expect(state.text).toContain("   4. Inserted item");
  expect(state.selection.head).toBe(state.text.indexOf("Inserted item") + "Inserted item".length);
});
