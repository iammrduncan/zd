import { expect, test } from "@playwright/test";

import { sameColour } from "./colour";

// `<https://…>` is the one link with no label to show, so nothing is hidden in its
// place — the address *is* the label. But the angle brackets are notation, and the
// 2026-07-29 decision leaves nothing in the *renders* list showing its delimiters.
//
// The link work missed this because lezer parses it as `Autolink`, a construct of
// its own, rather than as a `Link`. Same shape underneath: LinkMark, URL, LinkMark.

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.locator(".md-link-label").first().waitFor();
});

const autolinkLine = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const line = [...document.querySelectorAll<HTMLElement>(".cm-line")].find((el) =>
      el.textContent?.includes("autolink"),
    );
    if (!line) return null;
    const label = line.querySelector<HTMLElement>(".md-link-label");
    return {
      rendered: line.innerText,
      label: label?.textContent ?? null,
      colour: label ? getComputedStyle(label).color : null,
    };
  });

test("the angle brackets are gone and the address stays", async ({ page }) => {
  const auto = await autolinkLine(page);
  expect(auto, "the autolink line was not rendered").not.toBeNull();

  expect(auto!.rendered, "the opening angle bracket is still on screen").not.toContain("<https");
  expect(auto!.rendered, "the closing angle bracket is still on screen").not.toContain("autolink>");
  // Hiding the address would leave nothing at all — it is the label here.
  expect(auto!.rendered).toContain("https://example.com/autolink");
});

test("the address is marked as a link, not left as prose", async ({ page }) => {
  /*
   * Clicked via "its label", not "autolink". Both are in the same paragraph — the
   * Links section is one block over three source lines — so either should make the
   * whole block the target. Clicking the autolink's own line did not: the caret
   * landed elsewhere and the line stayed `context`, which made this test report a
   * colour bug when the real answer was "that line is dimmed, correctly".
   */
  await page.locator(".cm-line", { hasText: "its label" }).first().click();
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    for (let i = 0; i < 20; i += 1) await frame();
  });

  const auto = await autolinkLine(page);
  const token = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--text-link)";
    document.body.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  });

  expect(auto!.label, "the address is not marked").toBe("https://example.com/autolink");
  expect(sameColour(auto!.colour!, token), "the address is not text.link").toBe(true);
});

test("raw mode brings the brackets back", async ({ page }) => {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+e");

  const onScreen = await page.evaluate(
    () => document.querySelector<HTMLElement>(".cm-content")!.innerText,
  );
  expect(onScreen, "the angle brackets are still hidden under raw mode").toContain(
    "<https://example.com/autolink>",
  );
});

test("hiding the brackets does not change the document", async ({ page }) => {
  const text = await page.evaluate(() => window.zdEditor!.text());
  expect(text, "the source lost its angle brackets").toContain("<https://example.com/autolink>");
});
