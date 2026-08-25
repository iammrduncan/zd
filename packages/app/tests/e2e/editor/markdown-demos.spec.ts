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
  index: readFileSync(
    new URL("../../../../../docs/markdown-demos/demo.md", import.meta.url),
    "utf8",
  ),
  diagrams: readFileSync(
    new URL("../../../../../docs/markdown-demos/diagrams.md", import.meta.url),
    "utf8",
  ),
  images: readFileSync(
    new URL("../../../../../docs/markdown-demos/images-and-links.md", import.meta.url),
    "utf8",
  ),
  tables: readFileSync(
    new URL("../../../../../docs/markdown-demos/tables.md", import.meta.url),
    "utf8",
  ),
  typography: readFileSync(
    new URL("../../../../../docs/markdown-demos/typography.md", import.meta.url),
    "utf8",
  ),
} as const;

const DEMO_IMAGE = readFileSync(
  new URL("../../../../../docs/user-facing-docs/assets/zd-workbench.png", import.meta.url),
);

async function showDemo(page: Page, source: string): Promise<void> {
  await openEditor(page, { height: 900, width: 1100 });
  await page.evaluate((text) => window.zdEditor!.setText(text), source);
  await expect.poll(() => page.evaluate(() => window.zdEditor!.text())).toBe(source);
  await page.locator(".cm-content").focus();
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

  expect(inset, "fenced code still has only the token-sized inner edge").toBeGreaterThanOrEqual(16);

  const vertical = await page.evaluate(() => {
    const first = [...document.querySelectorAll<HTMLElement>(".md-line-code")].find((line) =>
      line.textContent?.includes("interface Note"),
    );
    const last = [...document.querySelectorAll<HTMLElement>(".md-line-code")].find((line) =>
      line.textContent?.includes("console.log(note.title)"),
    );
    return {
      top: first ? parseFloat(getComputedStyle(first).paddingBlockStart) : 0,
      bottom: last ? parseFloat(getComputedStyle(last).paddingBlockEnd) : 0,
    };
  });
  expect(vertical.top, "the first code row has no top breathing room").toBeGreaterThanOrEqual(8);
  expect(vertical.bottom, "the last code row has no bottom breathing room").toBeGreaterThanOrEqual(
    8,
  );
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
  expect(gaps).toHaveLength(DEMOS.typography.match(/^#{1,6}\s/gmu)?.length ?? 0);
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

test("editing the last visible fence row stays inside until the second Enter", async ({ page }) => {
  await showDemo(page, DEMOS.code);
  const lastCodeRow = page.locator(".md-line-code", {
    hasText: "This fence should remain readable",
  });
  await lastCodeRow.scrollIntoViewIfNeeded();
  const bounds = await lastCodeRow.boundingBox();
  expect(bounds, "the final rendered code row has no geometry").not.toBeNull();
  // The lower padding is the reported boundary: clicking the glyph row's centre
  // bypasses the place where the caret was ejected through the hidden closer.
  await page.mouse.click(bounds!.x + 24, bounds!.y + bounds!.height - 2);
  const originalLine = await page.evaluate(() => window.zdEditor!.selection().line);

  await page.keyboard.press("Enter");
  const afterFirst = await page.evaluate((line) => {
    const source = window.zdEditor!.text().split("\n");
    const caret = window.zdEditor!.caretY();
    const insideCodePlane = [...document.querySelectorAll<HTMLElement>(".md-line-code")].some(
      (row) => {
        const bounds = row.getBoundingClientRect();
        return caret !== null && caret >= bounds.top && caret <= bounds.bottom;
      },
    );
    return {
      lines: source.slice(line - 1, line + 2),
      caretLine: window.zdEditor!.selection().line,
      insideCodePlane,
    };
  }, originalLine);
  expect(afterFirst.lines).toEqual([
    "This fence should remain readable even when no syntax grammar exists.",
    "",
    "```",
  ]);
  expect(afterFirst.caretLine).toBe(originalLine + 1);
  expect(afterFirst.insideCodePlane, "the first Enter visually ejected the caret").toBe(true);

  await page.keyboard.press("Enter");
  await page.keyboard.insertText("prose after the fence");
  const afterSecond = await page.evaluate(
    (line) =>
      window
        .zdEditor!.text()
        .split("\n")
        .slice(line - 1, line + 2),
    originalLine,
  );
  expect(afterSecond).toEqual([
    "This fence should remain readable even when no syntax grammar exists.",
    "```",
    "prose after the fence",
  ]);
});

test("double Enter on a nested unordered item leaves no orphan marker or indentation", async ({
  page,
}) => {
  await showDemo(page, DEMOS.lists);
  const item = page.locator(".md-line-item", { hasText: "A third level" });
  await item.click();
  await page.keyboard.press("End");
  const originalLine = await page.evaluate(() => window.zdEditor!.selection().line);

  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("prose after the nested list");

  const lines = await page.evaluate((line) => {
    const source = window.zdEditor!.text().split("\n");
    return source.slice(line - 1, line + 2);
  }, originalLine);
  expect(lines).toEqual([
    "    - A third level",
    "prose after the nested list",
    "- An item whose text is deliberately long enough to wrap and reveal whether continuation lines",
  ]);
});

for (const example of [
  {
    name: "nested ordered item",
    label: "Another nested ordered item",
    source: "   2. Another nested ordered item",
    next: "3. Third ordered item",
  },
  {
    name: "task item",
    label: "Open task",
    source: "- [ ] Open task",
    next: "",
  },
] as const) {
  test(`double Enter on a ${example.name} leaves the complete list`, async ({ page }) => {
    await showDemo(page, DEMOS.lists);
    const item = page.locator(".md-line-item", { hasText: example.label });
    await item.click();
    await page.keyboard.press("End");
    const originalLine = await page.evaluate(() => window.zdEditor!.selection().line);

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText(`prose after ${example.name}`);

    const lines = await page.evaluate((line) => {
      const source = window.zdEditor!.text().split("\n");
      return source.slice(line - 1, line + 2);
    }, originalLine);
    expect(lines).toEqual([example.source, `prose after ${example.name}`, example.next]);
  });
}

for (const example of [
  {
    name: "heading",
    demo: DEMOS.typography,
    selector: ".md-line-h2",
    label: "Heading level two",
    sourceLine: "## Heading level two",
  },
  {
    name: "styled prose",
    demo: DEMOS.typography,
    selector: ".cm-line",
    label: "This paragraph shows the normal prose",
    sourceLine: DEMOS.typography.split("\n")[2]!,
  },
  {
    name: "task item",
    demo: DEMOS.lists,
    selector: ".md-line-item",
    label: "Open task",
    sourceLine: "- [ ] Open task",
  },
  {
    name: "blockquote",
    demo: DEMOS.lists,
    selector: ".md-line-quote",
    label: "Markdown should remain comfortable",
    sourceLine: "> Markdown should remain comfortable to read while it is directly editable.",
  },
  {
    name: "fenced code",
    demo: DEMOS.code,
    selector: ".md-line-code",
    label: "interface Note",
    sourceLine: "interface Note {",
  },
  {
    name: "link",
    demo: DEMOS.images,
    selector: ".md-link-label",
    label: "A project-relative document",
    sourceLine: "- [A project-relative document](../DESIGN.md)",
    editedLine: "- [A project-relative document [audited]](../DESIGN.md)",
  },
] as const) {
  test(`a pointer edit and undo round-trip preserves the ${example.name}`, async ({ page }) => {
    await showDemo(page, example.demo);
    const before = await page.evaluate(() => window.zdEditor!.text());
    const target = page.locator(example.selector, { hasText: example.label }).first();

    await target.scrollIntoViewIfNeeded();
    await target.click();
    await page.keyboard.press("End");
    await page.keyboard.insertText(" [audited]");

    await expect
      .poll(() => page.evaluate(() => window.zdEditor!.text()))
      .toContain("editedLine" in example ? example.editedLine : `${example.sourceLine} [audited]`);
    if (example.name === "link") {
      expect(
        await page.evaluate(() => window.zdEditor!.openedLinks),
        "an ordinary editing click activated the link",
      ).toEqual([]);
    }

    await page.keyboard.press("ControlOrMeta+Z");
    await expect.poll(() => page.evaluate(() => window.zdEditor!.text())).toBe(before);
    await expect(target).toBeVisible();
  });
}

test("the demo index renders its navigation as a table of links", async ({ page }, testInfo) => {
  await showDemo(page, DEMOS.index);
  await capture(page, testInfo, "demo-index");

  await expect(page.locator("table.md-rendered tbody tr")).toHaveCount(6);
  await expect(page.locator("table.md-rendered a")).toHaveCount(6);
});

test("the tables demo renders all three specimens without exposing pipe source", async ({
  page,
}, testInfo) => {
  await showDemo(page, DEMOS.tables);
  await capture(page, testInfo, "tables");

  await expect(page.locator("table.md-rendered")).toHaveCount(3);
  expect(await page.locator(".cm-content").innerText()).not.toContain("| Surface");
});

test("the diagrams demo renders both Mermaid definitions", async ({ page }, testInfo) => {
  await showDemo(page, DEMOS.diagrams);
  await expect(page.locator('.md-mermaid-diagram[aria-label="Mermaid flowchart"]')).toBeVisible();
  await capture(page, testInfo, "diagrams-flowchart");

  const sequence = page.locator('.md-mermaid-diagram[aria-label="Mermaid sequence diagram"]');
  await sequence.scrollIntoViewIfNeeded();
  await expect(sequence).toBeVisible();
  await capture(page, testInfo, "diagrams-sequence");
});

test("the images and links demo renders local media, blocks remote media, and labels links", async ({
  page,
}, testInfo) => {
  await page.route("**/user-facing-docs/assets/zd-workbench.png", (route) =>
    route.fulfill({ body: DEMO_IMAGE, contentType: "image/png" }),
  );
  await showDemo(page, DEMOS.images);
  await capture(page, testInfo, "images-and-links");

  const localImage = page.locator('.md-image img[alt="The zd Markdown reader"]');
  await expect(localImage).toHaveCount(1);
  expect(
    await localImage.evaluate((image: HTMLImageElement) => image.naturalWidth),
    "the demo image is a broken browser-relative URL instead of resolved project media",
  ).toBeGreaterThan(0);
  await localImage.scrollIntoViewIfNeeded();
  await localImage.click();
  await expect(localImage, "the project-relative image disappeared after a click").toBeVisible();
  await expect(page.locator('.md-image-unavailable[data-image-status="loading"]')).toHaveCount(0);
  await expect(
    page.locator(".md-image-blocked", { hasText: "A remote diagram that must not load" }),
  ).toHaveCount(1);
  await expect(page.locator(".md-link-label")).toHaveCount(4);
});
