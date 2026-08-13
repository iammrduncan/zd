import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

// Vision §6.1: "Raw mode is a toggle, and it is off by default. It reveals the
// literal source of everything in the renders list — brackets, destinations, pipes,
// fences, language tags — for when you need to see the file exactly as it is
// written. Nothing else changes: same calm, same measure, same focus."
//
// DESIGN.md §7.4 adds that it is document-wide, and that "notation is never
// revealed by caret proximity, in either state; the toggle is the only thing that
// reveals". So this is the only escape hatch to the source of a rendered
// construct — today the caret cannot enter a table, a link destination, or a
// hidden fence row at all.

const RAW = "ControlOrMeta+e";

test.beforeEach(async ({ page }) => {
  await openEditor(page);
});

test("it is off by default", async ({ page }) => {
  const link = await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-link-label", { hasText: "its label" }),
    "the rendered fixture link",
  );
  await expect(link, "brackets are showing before the toggle").toHaveText("its label");

  const table = await materializeEditorTarget(
    page,
    page.locator(".md-editor table.md-rendered", { hasText: "Construct" }),
    "the rendered fixture table",
  );
  await expect(table, "no table before the toggle").toBeVisible();
});

test("the toggle reveals every hidden construct at once", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);

  // Everything in the *renders* list, in one place, because the decision names
  // them together: "brackets, destinations, pipes, fences, language tags".
  const link = await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "[its label](https://example.com/spec)" }),
    "the raw link source",
  );
  await expect(link, "link brackets are still hidden").toContainText(
    "[its label](https://example.com/spec)",
  );
  const fence = await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "```rust" }),
    "the raw Rust fence",
  );
  await expect(fence, "the fence and its language tag are still hidden").toHaveText("```rust");
  const table = await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "| Construct | Resting state |" }),
    "the raw table header",
  );
  await expect(table, "the table pipes are still hidden").toContainText(
    "| Construct | Resting state |",
  );
  const delimiter = await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "| --- | --- |" }),
    "the raw table delimiter",
  );
  await expect(delimiter, "the delimiter row is still hidden").toContainText("| --- | --- |");

  // A rendered table and its source cannot both be on screen.
  await expect(page.locator(".md-editor table"), "the table widget survived raw mode").toHaveCount(
    0,
  );
});

test("toggling again returns to the rendered default", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .cm-line", { hasText: "| Construct | Resting state |" }),
    "the raw table header",
  );
  await expect(page.locator(".md-editor table")).toHaveCount(0);

  await page.keyboard.press(RAW);
  const table = await materializeEditorTarget(
    page,
    page.locator(".md-editor table.md-rendered", { hasText: "Construct" }),
    "the restored rendered table",
  );
  await expect(table, "the table did not come back").toBeVisible();
  const link = await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-link-label", { hasText: "its label" }),
    "the restored rendered link",
  );
  await expect(link, "brackets stayed revealed").toHaveText("its label");
});

test("neither state changes the document", async ({ page }) => {
  const before = await page.evaluate(() => window.zdEditor!.text());

  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);
  const raw = await page.evaluate(() => window.zdEditor!.text());
  await page.keyboard.press(RAW);
  const after = await page.evaluate(() => window.zdEditor!.text());

  // The whole point of decorations over rewriting: a toggle that edited the buffer
  // would make §6.3's "cmd+s saves what is on screen" destroy the file.
  expect(raw, "toggling raw mode edited the buffer").toBe(before);
  expect(after, "toggling back edited the buffer").toBe(before);
});

test("it changes nothing but what is revealed", async ({ page }) => {
  const measure = () =>
    page.evaluate(() => {
      const column = document.querySelector<HTMLElement>(".md-editor")!;
      const prose = [...document.querySelectorAll<HTMLElement>(".cm-line")].find(
        (el) => !el.className.includes("md-line-") && (el.textContent ?? "").length > 40,
      )!;
      const style = getComputedStyle(prose);
      return {
        measure: Math.round(column.getBoundingClientRect().width),
        family: style.fontFamily,
        size: style.fontSize,
        lineHeight: style.lineHeight,
        focusStates: new Set(
          [...document.querySelectorAll<HTMLElement>(".cm-line")].map(
            (el) => el.dataset.focus ?? "none",
          ),
        ).size,
      };
    });

  const rendered = await measure();
  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);
  const revealed = await measure();

  // §6.1: "Nothing else changes: same calm, same measure, same focus." A raw mode
  // that also switched the whole document to mono would be a second mode, which is
  // exactly what §6 rules out.
  expect(revealed.measure, "the measure moved").toBe(rendered.measure);
  expect(revealed.family, "prose changed face").toBe(rendered.family);
  expect(revealed.size, "prose changed size").toBe(rendered.size);
  expect(revealed.lineHeight, "prose changed line height").toBe(rendered.lineHeight);
  expect(revealed.focusStates, "focus stopped distinguishing target from context").toBe(
    rendered.focusStates,
  );
});

test("the Reference lists it, so it is discoverable", async ({ page }) => {
  // Held, not pressed: the Reference is on screen only while the chord is down, so
  // `press` would open and close it inside one call. See shortcut-reference.spec.ts.
  await page.keyboard.down("ControlOrMeta");
  await page.keyboard.down("Period");

  // §7.1: the Reference renders the registry. A toggle nobody can find is a toggle
  // that does not exist — and this one is the only route to a rendered construct's
  // source.
  const sheet = (await page.locator(".zd-reference").textContent()) ?? "";
  expect(sheet.toLowerCase(), "raw mode is not in the Reference").toContain("raw");
});
