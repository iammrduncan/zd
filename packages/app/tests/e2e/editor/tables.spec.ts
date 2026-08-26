import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

// "tables are not tables, they are the raw markdown" — the loudest of the look
// complaints, and the one the 2026-07-29 decision puts squarely in the *renders*
// list: "tables draw as tables … Tables are the case that forced this: a raw pipe
// table is not something a person reads."
//
// DESIGN.md §5.2 gives the resting state: "Hairlines under the header and between
// rows carry the structure; there is no outer frame, no zebra striping, and no
// cell background."

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await materializeEditorTarget(
    page,
    page.locator(".md-editor table.md-rendered", { hasText: "Construct" }),
    "the fixture table",
  );
});

test("a table is a table, not a run of pipe lines", async ({ page }) => {
  const table = page.locator(".md-editor table");
  await expect(table, "no table element was rendered").toHaveCount(1);

  const shape = await table.evaluate((el: HTMLTableElement) => ({
    headers: [...el.querySelectorAll("th")].map((c) => c.textContent?.trim()),
    rows: el.querySelectorAll("tbody tr").length,
    firstRow: [...(el.querySelectorAll("tbody tr")[0]?.querySelectorAll("td") ?? [])].map((c) =>
      c.textContent?.trim(),
    ),
  }));

  expect(shape.headers).toEqual(["Construct", "Resting state"]);
  expect(shape.rows, "the fixture table changed shape").toBe(5);
  expect(shape.firstRow).toEqual(["Blockquote", "Indentation and one quiet hairline"]);
});

test("the pipes and the delimiter row are off the screen", async ({ page }) => {
  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );

  /*
   * `| ---`, not a bare `---`. The bare form was a proxy for "the delimiter row is
   * hidden" and it stopped being one the moment the fixture gained a horizontal
   * rule, whose source is legitimately `---`. A proxy that matches a different
   * construct is a test that fails for the wrong reason.
   */
  expect(onScreen, "the delimiter row is still visible").not.toContain("| ---");
  expect(onScreen, "pipes are still visible").not.toContain("| Construct");
  // The content survived being rendered.
  expect(onScreen).toContain("Hairlines only, no frame or striping");
});

test("rendering the table does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());

  // The same guard the link work needed, and for the same reason: §6.3 writes what
  // is on screen, so a decoration that edited the buffer would rewrite the file on
  // the next cmd+s.
  expect(text, "the source lost its pipes").toContain("| Construct | Resting state |");
  expect(text, "the source lost its delimiter row").toContain("| --- | --- |");
});

test("it carries hairlines only — no frame, striping, or cell fill", async ({ page }) => {
  const look = await page.locator(".md-editor table").evaluate((el: HTMLTableElement) => {
    const style = getComputedStyle(el);
    const cell = el.querySelector("td")!;
    const cellStyle = getComputedStyle(cell);
    const rows = [...el.querySelectorAll("tbody tr")].map(
      (r) => getComputedStyle(r).backgroundColor,
    );
    return {
      tableBorder: style.borderTopWidth,
      cellBottom: cellStyle.borderBottomWidth,
      cellTop: cellStyle.borderTopWidth,
      cellBackground: cellStyle.backgroundColor,
      rowBackgrounds: new Set(rows).size,
    };
  });

  expect(parseFloat(look.tableBorder), "the table has an outer frame").toBe(0);
  expect(parseFloat(look.cellBottom), "no hairline under the cell").toBeGreaterThan(0);
  expect(parseFloat(look.cellTop), "cells are boxed rather than ruled").toBe(0);
  expect(look.cellBackground, "cells have a fill").toBe("rgba(0, 0, 0, 0)");
  expect(look.rowBackgrounds, "rows are striped").toBe(1);
});

// The split half of the table task: cells held plain text, so a link or a code
// span inside one showed its literal source while the same markup rendered fine
// in the paragraph above it.

test("a cell renders its inline markup rather than showing the source", async ({ page }) => {
  const cells = await page.locator(".md-editor table").evaluate((el: HTMLTableElement) => {
    const find = (needle: string) =>
      [...el.querySelectorAll("td")].find((c) => c.textContent?.includes(needle));
    const code = find("--hairline");
    const link = find("rendered as one");
    return {
      codeHasElement:
        code?.querySelector("code") !== null && code?.querySelector("code") !== undefined,
      codeText: code?.textContent?.trim() ?? null,
      linkHasAnchor: link?.parentElement?.querySelector("a") !== null,
      linkCellText: link?.parentElement?.querySelector("td")?.textContent?.trim() ?? null,
    };
  });

  // A code span becomes a `code` element, so md.css's inline-code rule reaches it
  // — the same rule the prose above uses.
  expect(cells.codeHasElement, "a code span in a cell is still literal backticks").toBe(true);
  expect(cells.codeText, "the backticks are still on screen").toBe("--hairline");
});

test("undo and redo from a rendered cell operate on the shared Markdown history", async ({
  page,
}) => {
  const cell = page.locator('.md-editor table [data-table-row="3"][data-table-column="1"]');
  await cell.fill("Editable hairlines");
  await expect
    .poll(() => page.evaluate(() => window.zdEditor!.text()))
    .toContain("| Table | Editable hairlines |");
  await cell.click();

  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => page.evaluate(() => window.zdEditor!.text()))
    .toContain("| Table | Hairlines only, no frame or striping |");
  await expect(cell).toContainText("Hairlines only, no frame or striping");

  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(() => page.evaluate(() => window.zdEditor!.text()))
    .toContain("| Table | Editable hairlines |");
  await expect(cell).toContainText("Editable hairlines");
});

test("a link in a cell is an anchor with its label, not bracket source", async ({ page }) => {
  const link = await page.locator(".md-editor table").evaluate((el: HTMLTableElement) => {
    const anchor = el.querySelector("td a");
    return anchor ? { text: anchor.textContent?.trim(), href: anchor.getAttribute("href") } : null;
  });

  expect(link, "no anchor was rendered in a cell").not.toBeNull();
  expect(link!.text, "the label is wrong or the brackets survived").toBe("a link");
  expect(link!.href).toBe("https://example.com/cell");
});

test("raw HTML in a cell stays inert text", async ({ page }) => {
  // The reason cells were `textContent` to begin with. Cell content comes off disk
  // and is not ours; §7.3 keeps raw HTML inert, and the shared parser runs with
  // `html: false` so this is escaped rather than sanitised after the fact.
  const escaped = await page.evaluate(() => {
    const html = document.querySelector(".md-editor table")!.innerHTML;
    return { hasScript: html.includes("<script"), hasImg: html.includes("<img") };
  });

  expect(escaped.hasScript, "a script element reached the table").toBe(false);
  expect(escaped.hasImg, "an image element reached the table").toBe(false);
});

/*
 * "! rendered tables do not render internal contents markdown. so things like single
 * back tick code fences are ignored etc..." (feedback, 2026-07-31).
 *
 * Reported against a task marked done on 2026-07-29, and both are true. The cell's
 * *structure* is right — the backticks are gone and a real `code` element is there,
 * which the specs above check. What was missing is that nothing styles it, so a code
 * span in a cell reads as ordinary prose. "Ignored" is the accurate word for that.
 *
 * The cause is the divergence this project keeps producing: the reader styles real
 * `code` and `a` elements, the editor styles CodeMirror's `.md-inline-code` and
 * `.md-link-label` marks, and the table widget renders *reader* DOM inside the
 * *editor*. It matched neither selector list.
 *
 * So the specs above were not wrong, they were incomplete: they asserted the element
 * exists and never asked whether it looks like anything. An element is not a
 * rendering.
 */

test("a code span in a cell looks like code, not like prose", async ({ page }) => {
  const measured = await page.locator(".md-editor table").evaluate((table: HTMLTableElement) => {
    const code = [...table.querySelectorAll("code")].find((element) =>
      element.textContent?.includes("--hairline"),
    );
    if (!code) return null;
    const style = getComputedStyle(code);
    const prose = getComputedStyle(code.closest("td")!);
    return {
      family: style.fontFamily,
      proseFamily: prose.fontFamily,
      background: style.backgroundColor,
    };
  });

  expect(measured, "no code span in the table").not.toBeNull();
  // §5.2 gives inline code the mono family and a quiet `surface.code`. The same rule
  // the prose above the table uses — there is one inline-code role, not two.
  expect(measured!.family, "a code span in a cell is in the prose face").not.toBe(
    measured!.proseFamily,
  );
  expect(measured!.background, "a code span in a cell has no code surface").not.toBe(
    "rgba(0, 0, 0, 0)",
  );
});

test("a link in a cell reads as activatable", async ({ page }) => {
  /*
   * Focused first, and that is new. Until 2026-08-01 a table never dimmed at all
   * — it was a block widget, outside the `.cm-line[data-focus]` rules — so this
   * measured a cell that happened to sit at full contrast wherever the reader
   * was. Now that widgets dim with everything else, an out-of-focus link is
   * dimmed, which is what md.css already says in as many words: "a dimmed link is
   * still a link, but it is dimmed first".
   *
   * So the claim needs a *when*. Activatable means activatable at full contrast;
   * the dimmed case is focus/widget.spec.ts.
   */
  await page.locator(".cm-content").click();
  await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const row = lines.findIndex((line) => line.startsWith("| Construct |"));
    const start = lines.slice(0, row).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + 2);
  });
  await expect
    .poll(() => page.locator(".md-editor table").evaluate((t) => t.getAttribute("data-focus")))
    .toBe("target");

  const measured = await page.locator(".md-editor table").evaluate((table: HTMLTableElement) => {
    const anchor = table.querySelector("td a");
    if (!anchor) return null;
    const probe = document.createElement("span");
    probe.style.color = "var(--text-link)";
    document.body.append(probe);
    const link = getComputedStyle(probe).color;
    probe.remove();
    return { colour: getComputedStyle(anchor).color, link };
  });

  expect(measured, "no anchor in the table").not.toBeNull();
  // §4.3's colour table names `text.link` for activatable links, and a cell is not an
  // exception to that.
  expect(measured!.colour, "a link in a cell is not text.link").toBe(measured!.link);
});

test("a rendered cell edits the underlying Markdown without leaving reader mode", async ({
  page,
}) => {
  const cell = page.locator(".md-editor table td", { hasText: "Hairlines only" });

  await expect(cell).toHaveAttribute("contenteditable", "plaintext-only");
  await cell.fill("Editable hairlines");

  await expect(
    page.locator(".md-editor table td", { hasText: "Editable hairlines" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.zdEditor!.text()))
    .toContain("| Table | Editable hairlines |");
  await expect(page.locator(".md-editor table")).toHaveCount(1);
});

test("select all in a rendered cell selects the whole Markdown table", async ({ page }) => {
  const cell = page.locator(".md-editor table td", { hasText: "Hairlines only" });
  await cell.click();
  await page.keyboard.press("ControlOrMeta+A");

  const selected = await page.evaluate(() => {
    const text = window.zdEditor!.text();
    const from = text.indexOf("| Construct | Resting state |");
    const after = text.indexOf("\n\n## Mermaid", from);
    return { expected: { from, to: after }, actual: window.zdEditor!.selection() };
  });

  expect(selected.actual.from).toBe(selected.expected.from);
  expect(selected.actual.to).toBe(selected.expected.to);
});

test("a real pointer drag selects across rendered table cells", async ({ page }) => {
  const first = page.locator(".md-editor table td", { hasText: "Blockquote" });
  const last = page.locator(".md-editor table td", { hasText: "Hairlines only" });
  await page.locator(".md-editor table").scrollIntoViewIfNeeded();
  const [from, to] = await Promise.all([first.boundingBox(), last.boundingBox()]);
  expect(from, "the first table cell has no geometry").not.toBeNull();
  expect(to, "the destination table cell has no geometry").not.toBeNull();

  await page.mouse.move(from!.x + 3, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width - 3, to!.y + to!.height / 2, { steps: 16 });
  await page.mouse.up();

  const selected = await page.evaluate(() => ({
    visible: [...document.querySelectorAll<HTMLElement>("[data-table-selected='true']")].map(
      (cell) => cell.innerText,
    ),
    source: window.zdEditor!.selection(),
    text: window.zdEditor!.text(),
  }));
  expect(selected.source.from).toBeLessThanOrEqual(selected.text.indexOf("Blockquote"));
  expect(selected.source.to).toBeGreaterThanOrEqual(
    selected.text.indexOf("Hairlines only") + "Hairlines only".length,
  );
  expect(
    selected.visible.some((text) => text.includes("Hairlines only")),
    "the highlight never reached the destination cell",
  ).toBe(true);
  expect(selected.visible, "the highlight lost its starting cell").toContain("Blockquote");

  const copied = await last.evaluate((cell) => {
    const transfer = new DataTransfer();
    cell.dispatchEvent(
      new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: transfer }),
    );
    return transfer.getData("text/plain");
  });
  expect(copied, "copy omitted the first selected cell").toContain("Blockquote");
  expect(copied, "copy omitted the destination cell").toContain("Hairlines only");

  await page.locator(".md-line-h2", { hasText: "Mermaid" }).click();
  await expect(
    page.locator("[data-table-selected='true']"),
    "the old highlight remained",
  ).toHaveCount(0);
  await expect(
    page.locator(".md-editor table"),
    "the table disappeared after selection",
  ).toBeVisible();
});

test("cross-table selection has one paint owner and clears on an outside click", async ({
  page,
}) => {
  const first = page.locator(".md-editor table td", { hasText: "Blockquote" });
  const last = page.locator(".md-editor table td", { hasText: "Hairlines only" });
  await page.locator(".md-editor table").scrollIntoViewIfNeeded();
  const [from, to] = await Promise.all([first.boundingBox(), last.boundingBox()]);
  expect(from).not.toBeNull();
  expect(to).not.toBeNull();

  await page.mouse.move(from!.x + 3, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width - 3, to!.y + to!.height / 2, { steps: 12 });
  await page.mouse.up();

  const paint = await page.evaluate(() => {
    return {
      selectedCells: document.querySelectorAll("[data-table-selected='true']").length,
      nativeRanges: document.getSelection()?.rangeCount ?? 0,
    };
  });
  expect(paint.selectedCells).toBeGreaterThan(1);
  expect(paint.nativeRanges, "the browser painted a second selection over the selected cells").toBe(
    0,
  );

  await page.evaluate(() => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.textContent = "Outside editor";
    outside.dataset.outsideEditor = "true";
    document.body.append(outside);
  });
  await page.locator("[data-outside-editor]").click();
  await expect(page.locator("[data-table-selected='true']")).toHaveCount(0);
});

test("a multi-column table never stacks an unspaced header one character per line", async ({
  page,
}) => {
  const markdown = [
    "| Priority | Finding | Concrete evidence | Required outcome |",
    "| --- | --- | --- | --- |",
    "| P0 | Missing rows | The restored tree is incomplete. | Render every valid row. |",
  ].join("\n");
  await page.evaluate((text) => window.zdEditor!.setText(text), markdown);

  const header = page.locator(".md-editor th", { hasText: "Priority" });
  await expect(header).toBeVisible();
  const lineCount = await header.evaluate((cell) => {
    const range = document.createRange();
    range.selectNodeContents(cell);
    return range.getClientRects().length;
  });

  expect(lineCount).toBe(1);
});
