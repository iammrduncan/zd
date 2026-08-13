import { expect, test } from "@playwright/test";

import { materializeEditorTarget, openEditor } from "../harness";

/*
 * A paragraph and the code block directly beneath it: how much does focus take?
 *
 * Both, since 2026-07-30. DESIGN.md §7.6: "A paragraph immediately followed by a
 * code block is one paragraph-granularity target with it, in both directions."
 *
 * **This file used to assert the opposite, and that is the record rather than an
 * embarrassment.** It was written the day the shape was first reported — "either
 * it rendered in wrong line (I don't think so) or it should also bring the code
 * block up to focus as well when this line is highlighed cause they are right next
 * to each other" — and the measurement said both surfaces were doing exactly what
 * §7.6 said at the time: a paragraph is one semantic block and a fence is another.
 * So it shipped as coverage for a spec that was working.
 *
 * Then the same line of the same README was reported again, with a blocking bang:
 * "if its highlighted for focus the code block right below it should be
 * highlighted for focus." Twice is an answer. The spec changed, and these
 * assertions inverted with it — which is what a spec-derived test is supposed to
 * do, and is why they were written against §7.6 by name rather than against
 * whatever the code happened to produce.
 *
 * The two surfaces are still measured against each other on purpose. One construct
 * described twice and drifting is this codebase's recurring defect — the list-focus
 * split, the inline-code rule, the anchor's five copies — and "how much does focus
 * take" is the most load-bearing question either surface answers.
 */

/** The rows of the editing surface, with the focus state each one is painted in. */
async function editorRows(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".cm-content .cm-line")].map((row) => ({
      focus: row.getAttribute("data-focus"),
      text: row.textContent ?? "",
    })),
  );
}

/**
 * The focus state of the one row holding `text`.
 *
 * Strict about there being exactly one. Locating a row by its content is fine for
 * reading and treacherous for asserting — a spec once matched a fence two hundred
 * lines from the one it meant — so a second match is a failure here rather than a
 * silent first-wins.
 */
function rowState(rows: { focus: string | null; text: string }[], text: string) {
  const found = rows.filter((row) => row.text.includes(text));
  expect(found, `expected exactly one row containing ${JSON.stringify(text)}`).toHaveLength(1);
  return found[0]!.focus;
}

// The fixture's own instance of the reported shape: a two-line paragraph, a blank
// line, then a `sh` fence, all under one H2.
const PROSE = "The line below is a shell comment";
const INSIDE_FENCE = "# install and run";

// A paragraph in the same document whose next block is more prose, so "the block
// below joins the target" cannot pass by taking whatever comes next.
const UNPAIRED = "Everything that makes reading good";
const BELOW_UNPAIRED = "A paragraph here should be indistinguishable";

// The H2 that owns the lead-in and its fence, for the section-granularity claim.
const HEADING = "A hash is not always a heading";

test.describe("the editing surface", () => {
  test.beforeEach(async ({ page }) => {
    await openEditor(page);
    await materializeEditorTarget(
      page,
      page.locator(".md-editor .md-line-code", { hasText: INSIDE_FENCE }),
      "the fixture shell fence",
    );
    await page.locator(".cm-content").click();

    // Caret into the paragraph directly above the fence. By computed line number
    // rather than by a string, because this one edits nothing but the next reader
    // of the file will copy it.
    await page.evaluate((prose) => {
      const lines = window.zdEditor!.text().split("\n");
      const number = lines.findIndex((line) => line.startsWith(prose)) + 1;
      const start = lines.slice(0, number - 1).reduce((total, l) => total + l.length + 1, 0);
      window.zdEditor!.setCaret(start + 5);
    }, PROSE);
  });

  test("paragraph granularity takes the fence below with the lead-in", async ({ page }) => {
    const rows = await editorRows(page);

    expect(rowState(rows, PROSE), "the caret's own paragraph is not the target").toBe("target");
    expect(
      rowState(rows, INSIDE_FENCE),
      "the fence stayed dimmed under the sentence introducing it — §7.6 pairs them",
    ).toBe("target");
  });

  test("paragraph granularity keeps the lead-in lit from inside the fence", async ({ page }) => {
    /*
     * The other direction, and the half a caret actually reaches. Moving from the
     * sentence into the command it describes must not put the sentence out; an
     * arrow rather than a pair would do exactly that, and would still pass the
     * test above.
     */
    await page.evaluate((inside) => {
      const lines = window.zdEditor!.text().split("\n");
      const number = lines.findIndex((line) => line.startsWith(inside)) + 1;
      const start = lines.slice(0, number - 1).reduce((total, l) => total + l.length + 1, 0);
      window.zdEditor!.setCaret(start + 2);
    }, INSIDE_FENCE);

    const rows = await editorRows(page);

    expect(rowState(rows, INSIDE_FENCE)).toBe("target");
    expect(rowState(rows, PROSE), "the lead-in dimmed as soon as the caret entered the fence").toBe(
      "target",
    );
  });

  test("a paragraph with prose below it is still one block", async ({ page }) => {
    /*
     * The control, and the rule that was rejected. "Focus the block after this
     * one" passes both tests above and fails here — §7.6 pairs with a code block
     * specifically, because two paragraphs in a row are two thoughts.
     */
    await page.evaluate((prose) => {
      const lines = window.zdEditor!.text().split("\n");
      const number = lines.findIndex((line) => line.startsWith(prose)) + 1;
      const start = lines.slice(0, number - 1).reduce((total, l) => total + l.length + 1, 0);
      window.zdEditor!.setCaret(start + 5);
    }, UNPAIRED);

    await materializeEditorTarget(
      page,
      page.locator(".md-editor .cm-line", { hasText: UNPAIRED }),
      "the unpaired prose paragraph",
    );
    await expect.poll(async () => rowState(await editorRows(page), UNPAIRED)).toBe("target");

    const rows = await editorRows(page);

    expect(rowState(rows, UNPAIRED)).toBe("target");
    expect(
      rowState(rows, BELOW_UNPAIRED),
      "the paragraph below joined the target — §7.6 pairs with a code block, not with whatever is next",
    ).toBe("context");
  });

  test("section granularity still takes the whole section", async ({ page }) => {
    await page.evaluate(() => window.zdEditor!.setGranularity("section"));
    await expect.poll(async () => rowState(await editorRows(page), HEADING)).toBe("target");

    const rows = await editorRows(page);

    // Unchanged by the pairing, and worth keeping: the pair is a widening of what
    // *paragraph* means, not a fourth level, so section has to still be the wider
    // of the two or the vocabulary has collapsed.
    expect(rowState(rows, PROSE)).toBe("target");
    expect(rowState(rows, INSIDE_FENCE)).toBe("target");
    expect(rowState(rows, HEADING), "the owning heading's section did not reach").toBe("target");
  });
});
