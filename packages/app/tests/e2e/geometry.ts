import type { Page } from "@playwright/test";

/* Measure painted text rather than a line box, which includes CodeMirror padding. */

/**
 * The union of the rects the engine painted `selector`'s text across.
 *
 * A `Range` over the node's contents rather than the element's own box, so
 * padding, margin, and borders are all excluded by construction rather than by
 * subtracting them afterwards — a subtraction would need to know which surface it
 * was on, which is the knowledge this helper exists to remove from callers.
 *
 * Several rects when the text wraps, so `top` and `bottom` are the outermost of
 * them. That makes `centre` the middle of the whole run rather than of its first
 * row, which is what "where the block sits" means for a block that wraps.
 */
export async function textBox(
  page: Page,
  selector: string,
): Promise<{ top: number; bottom: number; centre: number; height: number }> {
  return page.evaluate((css) => {
    const block = document.querySelector(css);
    if (!block) throw new Error(`nothing matched ${css}`);

    const range = document.createRange();
    range.selectNodeContents(block);
    const rects = [...range.getClientRects()];
    if (rects.length === 0) throw new Error(`${css} paints no text`);

    const top = Math.min(...rects.map((rect) => rect.top));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    return { top, bottom, centre: (top + bottom) / 2, height: bottom - top };
  }, selector);
}

/**
 * The first block of whichever surface is loaded.
 *
 * The two selectors are different because the two surfaces genuinely are — a
 * reader block is an element and an editor block is a run of `.cm-line` divs.
 * Naming both here keeps a comparison spec from repeating the pair and from
 * quietly measuring the reader's `<p>` against the editor's *line*, which are not
 * the same unit.
 */
export const FIRST_BLOCK = ".cm-content .cm-line:first-child";
