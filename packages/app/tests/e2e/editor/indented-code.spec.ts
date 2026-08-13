import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

// A four-space indented block is code, and the editor read it as prose. §5.2 wants
// "one continuous rectangular plane spanning the full code measure and every row" —
// which the fenced form already gets, and this is the same construct written the
// other way.
//
// The reader is the bar, and markdown-it *strips* the four spaces when it builds
// `<pre><code>`. So matching it means the indent goes too: it is pure notation, it
// carries "this is code" and nothing else, and leaving it in would put indented code
// four spaces off the edge every fenced block starts on.

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-line-code", { hasText: "zd md README.md" }),
    "the indented code block",
  );
});

const indentedRows = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
    const first = lines.findIndex((el) => el.textContent?.includes("zd md README.md"));
    return lines.slice(first, first + 3).map((el) => ({
      text: el.textContent ?? "",
      classes: [...el.classList].filter((c) => c.startsWith("md-line-")),
      background: getComputedStyle(el).backgroundColor,
      family: getComputedStyle(el).fontFamily,
      left: el.getBoundingClientRect().left,
    }));
  });

test("every row of an indented block takes the code plane", async ({ page }) => {
  const rows = await indentedRows(page);

  for (const row of rows) {
    expect(row.classes, `"${row.text.trim()}" is not on the code plane`).toContain("md-line-code");
    expect(row.family.toLowerCase(), "the row is not in the mono family").toContain("mono");
  }
  // §5.2: one continuous plane over every row, so every row is the same paint.
  expect(new Set(rows.map((r) => r.background)).size, "the plane is striped").toBe(1);
  expect(rows[0]!.background, "the block has no plane").not.toBe("rgba(0, 0, 0, 0)");
});

test("the four-space marker is not drawn and relative indentation survives", async ({ page }) => {
  const rows = await indentedRows(page);

  // The marker goes; the shape of the code does not. `--focus section` is indented
  // two further spaces in the source and has to stay indented by two.
  expect(rows[0]!.text, "the four-space marker is still on screen").toBe("zd md README.md");
  expect(rows[1]!.text, "relative indentation inside the block was lost").toBe("  --focus section");
});

test("it starts on the same edge a fenced block does", async ({ page }) => {
  const edges = await page.evaluate(() => {
    const lines = [...document.querySelectorAll<HTMLElement>(".cm-line")];
    const indented = lines.find((el) => el.textContent?.includes("zd md README.md"))!;
    const fenced = lines.find((el) => el.textContent?.includes("npm run dev"))!;
    return {
      indented: indented.getBoundingClientRect().left,
      fenced: fenced.getBoundingClientRect().left,
    };
  });

  // The reason the indent is hidden rather than left in place: two ways of writing
  // the same construct must not sit at two different origins.
  expect(edges.indented, "indented code sits at a different origin from fenced").toBeCloseTo(
    edges.fenced,
    0,
  );
});

test("raw mode brings the four spaces back", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+e");

  await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "    zd md README.md" }),
    "the raw indented-code line",
  );

  const rows = await indentedRows(page);
  expect(rows[0]!.text, "the four-space marker is still hidden under raw mode").toBe(
    "    zd md README.md",
  );
});

test("hiding the indent does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());
  expect(text, "the source lost its indentation").toContain("\n    zd md README.md\n");
});
