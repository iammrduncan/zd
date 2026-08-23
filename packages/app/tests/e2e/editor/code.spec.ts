import { expect, test } from "@playwright/test";

import { sameColour } from "../colour";
import { materializeEditorTarget, openEditor } from "./harness";

/*
 * A file that is not markdown — vision §6.2:
 *
 *   "Non-Markdown text opens at line one at the top of a full-width code plane.
 *    It uses type.code, a compact line-number gutter, all seven syntax roles
 *    from the active theme…"
 *
 * Reported as "html and ts parsed as markdown" (feedback, 2026-07-29). The harm
 * is worth naming precisely, because it is not that a `.ts` file went uncoloured:
 * markdown *rules were applied to source*. A `#` line became a 30px H1, brackets
 * became a link with its destination hidden, an identifier's underscores became
 * an italic run, and a row of dashes became a horizontal rule. The file was not
 * unstyled — it was rewritten on screen.
 *
 * Which extensions mean what is a pure function of a path and lives in
 * tests/unit/editor/language.test.ts. What needs a browser is whether the surface then
 * acts on the answer, and that is everything below.
 */

/** The fixture's markdown sample, and the same page opened on a `.ts` file. */
const MARKDOWN = "/dev/editor.html";
const CODE = "/dev/editor.html?doc=code";
const SYNTAX_ROLES = [
  "keyword",
  "type",
  "function",
  "string",
  "number",
  "comment",
  "punctuation",
] as const;

async function open(page: import("@playwright/test").Page, url: string) {
  await openEditor(page, { url });
}

test("a code file takes the mono family", async ({ page }) => {
  await open(page, CODE);

  const family = await page.evaluate(
    () => getComputedStyle(document.querySelector(".cm-content")!).fontFamily,
  );

  // §6.2's "rendered as code: mono family". The same §5.2 code role a fenced
  // block already takes — a `.rs` file and a rust fence must not be set in two
  // different faces.
  expect(family).toContain("iA Writer Mono");
});

test("a TypeScript file uses every shared syntax role in every built-in theme", async ({
  page,
}) => {
  await open(page, CODE);

  for (const category of SYNTAX_ROLES) {
    await expect(
      page.locator(".md-syn-" + category),
      "TypeScript is missing " + category + " highlighting",
    ).not.toHaveCount(0);
  }

  for (const theme of ["light", "dark", "dracula"] as const) {
    await page.evaluate(async (selected) => {
      const appearanceModule = "/src/design/appearance.ts";
      const { setTheme } = await import(appearanceModule);
      setTheme(selected);
    }, theme);
    const colours = await page.evaluate((roles) => {
      return roles.map((role) => {
        const syntax = document.querySelector<HTMLElement>(".md-syn-" + role)!;
        const probe = document.createElement("span");
        probe.style.color = "var(--syntax-" + role + ")";
        document.body.append(probe);
        const token = getComputedStyle(probe).color;
        probe.remove();
        return { role, rendered: getComputedStyle(syntax).color, token };
      });
    }, SYNTAX_ROLES);

    for (const colour of colours) {
      expect(
        sameColour(colour.rendered, colour.token),
        theme + " " + colour.role + " did not consume its shared syntax token",
      ).toBe(true);
    }
  }
});

test("a code file opens as a top-anchored IDE plane with line numbers", async ({ page }) => {
  await open(page, CODE);

  await expect(
    page.locator(".cm-lineNumbers .cm-gutterElement").filter({ hasText: /^1$/ }).first(),
  ).toHaveText("1");
  const geometry = await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(".md-surface")!;
    const column = document.querySelector<HTMLElement>(".md-editor")!;
    const firstLine = document.querySelector<HTMLElement>(".cm-line")!;
    const gutter = document.querySelector<HTMLElement>(".cm-gutters")!;
    const firstNumber = [...document.querySelectorAll<HTMLElement>(".cm-gutterElement")].find(
      (element) => element.textContent?.trim() === "1",
    )!;
    const surfaceBox = surface.getBoundingClientRect();
    const columnBox = column.getBoundingClientRect();
    const firstLineBox = firstLine.getBoundingClientRect();
    const firstNumberBox = firstNumber.getBoundingClientRect();
    const gutterStyle = getComputedStyle(gutter);
    const numberStyle = getComputedStyle(firstNumber);
    const probe = document.createElement("span");
    probe.style.color = "var(--text-muted)";
    probe.style.backgroundColor = "var(--surface-canvas)";
    document.body.append(probe);
    const probeStyle = getComputedStyle(probe);
    const canvas = probeStyle.backgroundColor;
    const muted = probeStyle.color;
    probe.remove();
    return {
      scrollTop: surface.scrollTop,
      firstLineOffset: firstLineBox.top - surfaceBox.top,
      lineNumberOffset: firstNumberBox.top - firstLineBox.top,
      columnInset: columnBox.left - surfaceBox.left,
      widthDifference: surfaceBox.width - columnBox.width,
      gutterBackground: gutterStyle.backgroundColor,
      gutterColour: gutterStyle.color,
      gutterFamily: numberStyle.fontFamily,
      gutterSize: numberStyle.fontSize,
      canvas,
      muted,
    };
  });

  expect(geometry.scrollTop).toBeCloseTo(0, 0);
  expect(geometry.firstLineOffset).toBeLessThanOrEqual(1);
  expect(geometry.lineNumberOffset).toBeCloseTo(0, 0);
  expect(geometry.columnInset).toBeCloseTo(0, 0);
  expect(geometry.widthDifference).toBeCloseTo(0, 0);
  expect(geometry.gutterFamily).toContain("iA Writer Mono");
  expect(geometry.gutterSize).toBe("14px");
  expect(sameColour(geometry.gutterBackground, geometry.canvas)).toBe(true);
  expect(sameColour(geometry.gutterColour, geometry.muted)).toBe(true);
});

test("the current code line is highlighted across the source and gutter", async ({ page }) => {
  await open(page, CODE);

  const caret = await page.evaluate(() => window.zdEditor!.text().indexOf("const retries = 3"));
  expect(caret).toBeGreaterThanOrEqual(0);
  await page.evaluate((at) => window.zdEditor!.setCaret(at), caret);

  const activeLine = page.locator(".cm-activeLine");
  const activeGutter = page.locator(".cm-activeLineGutter");
  await expect(activeLine).toHaveCount(1);
  await expect(activeLine).toContainText("const retries = 3");
  await expect(activeGutter).toHaveCount(1);

  const colours = await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>(".cm-activeLine")!;
    const gutter = document.querySelector<HTMLElement>(".cm-activeLineGutter")!;
    const probe = document.createElement("span");
    probe.style.background = "var(--surface-selection)";
    document.body.append(probe);
    const selection = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      line: getComputedStyle(line).backgroundColor,
      gutter: getComputedStyle(gutter).backgroundColor,
      selection,
    };
  });

  expect(sameColour(colours.line, colours.selection), "the source uses another wash").toBe(true);
  expect(sameColour(colours.gutter, colours.selection), "the gutter loses the current row").toBe(
    true,
  );
});

test("a markdown file still takes the prose family", async ({ page }) => {
  await open(page, MARKDOWN);

  const family = await page.evaluate(
    () => getComputedStyle(document.querySelector(".cm-content")!).fontFamily,
  );

  // The control. Without it, "code is mono" would also pass on a surface that had
  // simply been made mono everywhere.
  expect(family).toContain("iA Writer Quattro");
});

/*
 * The three constructs measured on both surfaces below.
 *
 * Every one of them is a trap the code sample actually contains — a `##` comment,
 * an identifier's underscores, and a template literal's backticks — and every one
 * is decorated near the *top* of the markdown fixture. That second requirement is
 * not cosmetic: CodeMirror virtualizes, so a construct near the end of the
 * markdown sample is not in the DOM at all even at a 9000px viewport, and a
 * control assertion about it would report zero for a feature that works
 * perfectly. The link, rule and table selectors were dropped from this list for
 * exactly that reason after the control caught them.
 *
 * Links are still covered — by their text, further down, which needs no class
 * name and cannot go stale.
 */
const CONSTRUCTS = {
  headings: '[class*="md-line-h"]',
  inlineCode: ".md-inline-code",
  emphasis: ".md-emphasis, .md-strong",
};

const decorationCounts = (page: import("@playwright/test").Page) =>
  page.evaluate((selectors) => {
    const editor = document.querySelector(".md-editor")!;
    return Object.fromEntries(
      Object.entries(selectors).map(([name, css]) => [name, editor.querySelectorAll(css).length]),
    ) as Record<string, number>;
  }, CONSTRUCTS);

test("no markdown construct is decorated in a code file", async ({ page }) => {
  await open(page, CODE);

  // Named one by one rather than counted in aggregate, so a failure says which
  // construct leaked rather than that some number was not zero.
  expect(await decorationCounts(page), "markdown was applied to source").toEqual({
    headings: 0,
    inlineCode: 0,
    emphasis: 0,
  });
});

test("the same constructs are decorated in the markdown file", async ({ page }) => {
  await open(page, MARKDOWN);

  /*
   * The assertion that stops the one above being vacuous. A renamed class or a
   * typo would make the code test pass on a surface that decorates markdown
   * perfectly well — the "an element is not a rendering" trap, seen from the
   * other direction: here the risk is asserting the *absence* of something that
   * was never findable in the first place.
   */
  const examples = [
    { name: "headings", selector: ".md-line-h2", text: "Notation" },
    { name: "inlineCode", selector: ".md-inline-code", text: "renderMarkdown" },
    { name: "emphasis", selector: ".md-emphasis", text: "this run" },
  ];
  for (const { name, selector, text } of examples) {
    const target = await materializeEditorTarget(
      page,
      page.locator(`.md-editor ${selector}`, { hasText: text }),
      `the markdown ${name} example`,
    );
    await expect(target).toBeVisible();
  }
});

test("a line that would be a heading stays literal source", async ({ page }) => {
  await open(page, CODE);

  const line = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".cm-content .cm-line")];
    const found = rows.find((row) => (row.textContent ?? "").includes("This is not a heading"));
    if (!found) return null;
    const style = getComputedStyle(found);
    return { text: found.textContent, fontSize: style.fontSize, className: found.className };
  });

  expect(line, "the sample line was not found on the surface").not.toBeNull();
  // The `##` is still there, and the row is body-sized rather than a heading.
  expect(line!.text).toContain("## This is not a heading");
  expect(parseFloat(line!.fontSize), "the comment was set as a heading").toBeLessThan(20);
});

test("a link in source keeps its brackets and its destination", async ({ page }) => {
  await open(page, CODE);

  const text = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".cm-content .cm-line")];
    return rows.find((row) => (row.textContent ?? "").includes("Neither is"))?.textContent ?? "";
  });

  // The worst of the reported cases: markdown hides a link's destination, so a
  // URL in source disappeared from the file being edited.
  expect(text).toContain("[this a link](https://example.com/not-a-link)");
});

test("the calm is unchanged — focus still targets a block", async ({ page }) => {
  await open(page, CODE);
  await page.locator(".cm-content").click();

  const focused = await page.evaluate(
    () => document.querySelectorAll('.cm-line[data-focus="target"]').length,
  );

  // §6.2: "The calm, the measure, the focus, and the theme are unchanged — what
  // differs is only that the file is not markdown." Focus is not markdown, so
  // turning markdown off must not have turned it off too.
  expect(focused, "focus stopped working in a code file").toBeGreaterThan(0);
});
