import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

/*
 * A file that is not markdown — vision §6.2:
 *
 *   "A non-markdown file opens on the same surface, rendered as code: mono
 *    family, no markdown parsing, language-appropriate highlighting. The calm,
 *    the measure, the focus, and the theme are unchanged — what differs is only
 *    that the file is not markdown, and it is not treated as if it were."
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

test("a TypeScript file uses the shared syntax palette", async ({ page }) => {
  await open(page, CODE);

  for (const category of ["keyword", "string", "comment"]) {
    await expect(
      page.locator(`.md-syn-${category}`),
      `TypeScript is missing ${category} highlighting`,
    ).not.toHaveCount(0);
  }
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
