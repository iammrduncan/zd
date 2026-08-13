import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "./harness";

/*
 * Emphasis, and the identifier that must not be mistaken for it.
 *
 * Finding F06: "For a name such as `HEADING_SENTINEL_01-rollout-plan`, Reading
 * Mode is correct, but Markdown Editing Mode styles the underscore-delimited text
 * as formatting." Vision §6.1 states the rule directly: "Underscores inside an
 * identifier stay literal. `HEADING_SENTINEL_01-rollout-plan` is a name, not
 * emphasis."
 *
 * **The identifier half of F06 did not reproduce, and could not be tested until
 * this commit.** Measured first: lezer parses intraword underscores exactly as
 * CommonMark requires, producing no emphasis node for `HEADING_SENTINEL_01`, for
 * `some_file_name.ts`, or for `--max_old_space_size=4096`. But the editor applied
 * no emphasis styling *at all*, so "the identifier is not emphasised" was true of
 * every run of text on the surface and a test for it could not fail.
 *
 * What was actually wrong was the other half: the reader italicises emphasis
 * through the shipped italic face and the editor left it as plain prose, so one
 * construct had two answers — and `--type-prose-emphasis-*` sat in tokens.css
 * consumed by nothing, exactly as `--text-link` did before links were built.
 *
 * So the contrast below is the point. A real emphasis run and an identifier in
 * the *same paragraph*, measured the same way: one is italic, the other is not.
 * Neither assertion can pass by the surface simply doing nothing.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.evaluate(async () => {
    await document.fonts.load('italic 400 17px "iA Writer Quattro"');
    await document.fonts.ready;
  });
  await materializeEditorTarget(
    page,
    page.locator(".md-editor .md-emphasis", { hasText: "this run" }),
    "the fixture emphasis run",
  );
});

/**
 * The computed style of the text node containing `text`, in the editor.
 *
 * A computed style rather than a class name or a DOM shape: §6.1 puts emphasis in
 * what a reader sees, and this file exists because an earlier surface had the
 * right elements and styled none of them. An element is not a rendering.
 */
async function styleOf(page: import("@playwright/test").Page, text: string) {
  return page.evaluate((needle) => {
    const walker = document.createTreeWalker(
      document.querySelector(".cm-content")!,
      NodeFilter.SHOW_TEXT,
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!(node.textContent ?? "").includes(needle)) continue;
      const style = getComputedStyle(node.parentElement!);
      return {
        fontStyle: style.fontStyle,
        fontWeight: style.fontWeight,
        fontFamily: style.fontFamily,
        found: node.parentElement!.className,
      };
    }
    return null;
  }, text);
}

test("a real emphasis run takes the italic face", async ({ page }) => {
  const emphasised = await styleOf(page, "this run");

  expect(emphasised, "the emphasis run was not found on the surface").not.toBeNull();
  expect(emphasised!.fontStyle, "emphasis is not italic in the editor").toBe("italic");
  // §5.2's own words: "Emphasis is the drawn italic face, never a slant applied to
  // the upright." A synthesized oblique would still report `italic` here, so the
  // family is asserted too — the italic face is a separate file in fonts.css.
  expect(emphasised!.fontFamily).toContain("iA Writer Quattro");
});

test("strong emphasis takes the bold weight", async ({ page }) => {
  const strong = await styleOf(page, "this stronger one");

  expect(strong, "the strong run was not found on the surface").not.toBeNull();
  expect(strong!.fontWeight, "strong emphasis is not bold in the editor").toBe("700");
});

test("strong containing emphasis resolves to the shipped upright Bold", async ({ page }) => {
  const editor = await styleOf(page, "and italic");

  expect(editor, "the nested emphasis run was not found on the surface").not.toBeNull();
  expect(editor!.fontWeight, "nested emphasis lost the Bold face").toBe("700");
  expect(editor!.fontStyle, "nested emphasis synthesized an unshipped slant").toBe("normal");
});

test("an intraword identifier is not emphasised", async ({ page }) => {
  const identifier = await styleOf(page, "HEADING_SENTINEL_01");

  /*
   * F06 itself. In the same paragraph as the emphasis run above and measured with
   * the same function, so this failing means the two were genuinely told apart —
   * not that the surface styles nothing.
   */
  expect(identifier, "the identifier was not found on the surface").not.toBeNull();
  expect(identifier!.fontStyle, "an identifier's underscores were read as emphasis").toBe("normal");
  expect(identifier!.fontWeight, "an identifier's underscores were read as strong").toBe("400");
});

test("the delimiters stay on screen", async ({ page }) => {
  // §6.1's *stays literal* list names "emphasis delimiters" alongside a heading's
  // hash and the backticks around inline code. Rendering the italic must not cost
  // the source that says why it is italic.
  const source = await page.evaluate(() => {
    const line = [...document.querySelectorAll(".cm-content .cm-line")].find((row) =>
      (row.textContent ?? "").includes("this stronger one"),
    );
    return line?.textContent ?? "";
  });

  expect(source).toContain("_this run_");
  expect(source).toContain("**this stronger one**");
});
