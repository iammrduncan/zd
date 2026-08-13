import { expect, test } from "@playwright/test";

// "tables are not tables, they are the raw markdown" — the loudest of the look
// complaints, and the one the 2026-07-29 decision puts squarely in the *renders*
// list: "tables draw as tables … Tables are the case that forced this: a raw pipe
// table is not something a person reads."
//
// DESIGN.md §5.2 gives the resting state: "Hairlines under the header and between
// rows carry the structure; there is no outer frame, no zebra striping, and no
// cell background."

test.beforeEach(async ({ page }) => {
  // 9000 is headroom, not a fit. The fixture is ~3700px and grows every time a
  // construct is added; a viewport that merely fitted has silently stopped
  // rendering the bottom of the document four times now, each time failing specs
  // that had nothing to do with the change. A headless viewport costs nothing, so
  // this buys years rather than one more construct. The proper fix — scroll until
  // the wanted line is built — is a filed task.
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  /*
   * Wait for the decoration, not just for the first heading.
   *
   * Lezer parses incrementally, so a construct near the end of a long document is
   * on screen as plain text for a moment before its decoration lands. Waiting on
   * `.md-line-h1` says nothing about the last paragraph — and once the fixture
   * passed ~4000px that gap started failing these specs intermittently.
   */
  await page.locator(".md-editor table").first().waitFor();
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
   * the dimmed case is editor-widget-focus.spec.ts.
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
