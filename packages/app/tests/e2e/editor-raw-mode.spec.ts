import { expect, test } from "@playwright/test";

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
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  // Every construct this spec asserts about, waited for by name. Lezer parses
  // incrementally, so "the table is up" says nothing about whether the links near
  // the end of the document have been decorated yet.
  await page.locator(".md-editor table").waitFor();
  await page.locator(".md-link-label").first().waitFor();
  await page.locator(".md-syn-keyword").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
});

const onScreen = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.querySelector<HTMLElement>(".cm-content")!.innerText);

test("it is off by default", async ({ page }) => {
  const text = await onScreen(page);

  // The rendered default, which every other render spec already asserts. Stated
  // here too because "off by default" is half of what the decision says.
  expect(text, "brackets are showing before the toggle").not.toContain("[its label]");
  expect(text, "a fence marker is showing before the toggle").not.toContain("```");
  await expect(page.locator(".md-editor table"), "no table before the toggle").toHaveCount(1);
});

test("the toggle reveals every hidden construct at once", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);

  const text = await onScreen(page);

  // Everything in the *renders* list, in one place, because the decision names
  // them together: "brackets, destinations, pipes, fences, language tags".
  expect(text, "link brackets are still hidden").toContain("[its label](https://example.com/spec)");
  expect(text, "the fence and its language tag are still hidden").toContain("```rust");
  expect(text, "the table pipes are still hidden").toContain("| Construct | Resting state |");
  expect(text, "the delimiter row is still hidden").toContain("| --- | --- |");

  // A rendered table and its source cannot both be on screen.
  await expect(page.locator(".md-editor table"), "the table widget survived raw mode").toHaveCount(
    0,
  );
});

test("toggling again returns to the rendered default", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press(RAW);
  await expect(page.locator(".md-editor table")).toHaveCount(0);

  await page.keyboard.press(RAW);
  await expect(page.locator(".md-editor table"), "the table did not come back").toHaveCount(1);
  // The link decorations come back on their own transaction, so wait for one of
  // them rather than reading the text the instant the table reappears.
  await page.locator(".md-link-label").first().waitFor();

  const text = await onScreen(page);
  expect(text, "brackets stayed revealed").not.toContain("[its label]");
  expect(text, "a fence marker stayed revealed").not.toContain("```");
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
