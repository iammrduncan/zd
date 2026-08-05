import { expect, test } from "@playwright/test";

// DESIGN.md §7.3 gives the rule its resting state: "The
// one place a line is the content rather than decoration, so it is the same quiet
// hairline and nothing more — no shadow, no double border, no centred ornament."
//
// The 2026-07-29 decision puts rules in vision §6.1's *renders* list, so the dashes
// go and the line arrives.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.locator(".md-line-rule").waitFor();
});

test("the dashes are gone and a line is drawn", async ({ page }) => {
  const rule = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".md-line-rule")!;
    const style = getComputedStyle(line);
    return {
      text: line.innerText,
      borderWidth: style.borderTopWidth,
      borderStyle: style.borderTopStyle,
      borderColour: style.borderTopColor,
      shadow: style.boxShadow,
      bottomBorder: style.borderBottomWidth,
    };
  });

  expect(rule.text.trim(), "the literal dashes are still on screen").toBe("");
  expect(parseFloat(rule.borderWidth), "no hairline was drawn").toBeGreaterThan(0);
  // "the same quiet hairline and nothing more".
  expect(rule.borderStyle).toBe("solid");
  expect(rule.shadow, "the rule has a shadow").toBe("none");
  expect(parseFloat(rule.bottomBorder), "the rule is a double border").toBe(0);
});

test("the caret can still reach the rule's line", async ({ page }) => {
  // Unlike a table or a fence row, a rule keeps its line — the dashes are replaced,
  // not the row. So this is the one rendered construct whose source stays reachable
  // without raw mode, which is worth holding onto.
  await page.locator(".md-line-rule").click();
  const reached = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".md-line-rule");
    return line?.getAttribute("data-focus");
  });

  expect(reached, "clicking the rule did not put focus on it").not.toBeNull();
});

test("raw mode shows the dashes again", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+e");

  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );
  expect(onScreen, "the rule's source is still hidden under raw mode").toContain("---");
});

test("drawing the rule does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());
  expect(text, "the source lost its rule").toContain("\n---\n");
});
