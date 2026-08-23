import { expect, test } from "@playwright/test";

// Vision §6: "Everything that makes reading good stays true while you type. This
// is not a second mode." The render-only reference is gone, so this file holds
// the editor directly to the suite's prose role and reading measure.

const PROSE_FACES = async () => {
  await document.fonts.load('400 17px "iA Writer Quattro"');
  await document.fonts.load('700 17px "iA Writer Quattro"');
  await document.fonts.ready;
};

interface Type {
  family: string;
  size: string;
  weight: string;
  style: string;
  line: string;
  colour: string;
}

async function typeOf(page: import("@playwright/test").Page, selector: string): Promise<Type> {
  await page.locator(selector).first().waitFor();
  await page.evaluate(PROSE_FACES);

  return page.evaluate((sel) => {
    const style = getComputedStyle(document.querySelector(sel)!);
    return {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      style: style.fontStyle,
      line: style.lineHeight,
      colour: style.color,
    };
  }, selector);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
});

test("a line of the editor consumes the suite's prose role", async ({ page }) => {
  await page.goto("/dev/editor.html");
  const prose = ".cm-content > .cm-line:nth-of-type(3)";
  await page.locator(prose).click();
  const editing = await typeOf(page, prose);
  const role = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.cssText = `
      font-family: var(--type-prose-family);
      font-size: var(--type-prose-size);
      font-weight: var(--type-prose-weight);
      font-style: var(--type-prose-style);
      line-height: var(--type-prose-line);
      color: var(--text-primary);
    `;
    document.body.append(probe);
    const style = getComputedStyle(probe);
    const measured = {
      family: style.fontFamily,
      size: style.fontSize,
      weight: style.fontWeight,
      style: style.fontStyle,
      line: style.lineHeight,
      colour: style.color,
    };
    probe.remove();
    return measured;
  });

  expect(editing).toEqual(role);
});

test("the editor column holds the suite's reading measure", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();
  const measured = await page.evaluate(() => ({
    editing: document.querySelector(".md-editor")!.getBoundingClientRect().width,
    token: parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--reading-measure"),
    ),
  }));

  expect(measured.editing).toBeCloseTo(measured.token, 0);
});

test("the editor column is centred on the surface", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();

  const { leadIn, leadOut } = await page.evaluate(() => {
    const surface = document.querySelector(".md-surface")!.getBoundingClientRect();
    const column = document.querySelector(".md-editor")!.getBoundingClientRect();
    return { leadIn: column.left - surface.left, leadOut: surface.right - column.right };
  });

  expect(leadIn).toBeCloseTo(leadOut, 0);
});

test("the surface does the scrolling — the editor brings no second scroller", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();

  const measured = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const scroller = document.querySelector<HTMLElement>(".cm-scroller")!;
    return {
      scrollerOverflow: getComputedStyle(scroller).overflowY,
      scrollerScrolls: scroller.scrollHeight > scroller.clientHeight,
      surfaceScrolls: surface.scrollHeight > surface.clientHeight,
    };
  });

  // §7.3 allows exactly one scrolling plane and no scroll control on it. Two
  // nested scrollers would mean two scroll positions and a visible scrollbar.
  expect(measured.scrollerOverflow).toBe("visible");
  expect(measured.scrollerScrolls, "the editor is scrolling itself").toBe(false);
  expect(measured.surfaceScrolls, "nothing is scrolling at all").toBe(true);
});

test("the Markdown editor brings no IDE chrome of its own", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-line").first().waitFor();

  const chrome = await page.evaluate(() => ({
    gutters: document.querySelectorAll(".cm-gutters").length,
    panels: document.querySelectorAll(".cm-panels").length,
    activeLine: document.querySelectorAll(".cm-activeLine").length,
  }));

  // Markdown remains readerly: no line numbers, fold column, status panel, or
  // active-line wash. Code has a separate language-driven line-number contract.
  expect(chrome.gutters).toBe(0);
  expect(chrome.panels).toBe(0);
  expect(chrome.activeLine).toBe(0);
});

test("putting the caret in the document draws no focus ring", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await page.locator(".cm-content").click();

  const outline = await page.evaluate(() => {
    const editor = document.querySelector(".cm-editor")!;
    return {
      focused: editor.classList.contains("cm-focused"),
      style: getComputedStyle(editor).outlineStyle,
    };
  });

  expect(outline.focused, "the click did not reach the editor").toBe(true);
  expect(outline.style).toBe("none");
});

/**
 * Put the caret at the very start of the document.
 *
 * Clicking .cm-content lands the caret wherever the middle of the element
 * happens to be, and a bare Home is a document-scroll key on this platform, not
 * a line-start one — so a test that used either was typing into an unknown
 * position and passing on a line it never touched.
 */
async function caretAtStart(page: import("@playwright/test").Page) {
  await page.locator(".cm-line").first().click();
  await page.keyboard.press("ControlOrMeta+Home");
}

test("typing puts characters in the document", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await caretAtStart(page);

  await page.keyboard.type("Zen ");

  // The whole point of the session: a real caret in a real document, not a
  // rendered view that happens to look editable.
  const first = await page.evaluate(() => document.querySelector(".cm-line")!.textContent);
  expect(first).toBe("Zen # Typing in the document");
});

test("undo takes the typing back out", async ({ page }) => {
  await page.goto("/dev/editor.html");
  await caretAtStart(page);

  await page.keyboard.type("Zen ");
  expect(await page.evaluate(() => document.querySelector(".cm-line")!.textContent)).toBe(
    "Zen # Typing in the document",
  );

  await page.keyboard.press("ControlOrMeta+z");

  const first = await page.evaluate(() => document.querySelector(".cm-line")!.textContent);
  expect(first).toBe("# Typing in the document");
});
