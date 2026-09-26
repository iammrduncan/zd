import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/*
 * The reading anchor's position is one decision held in two languages.
 *
 * `ANCHOR_RATIO` in editor/focus/anchor.ts decides which block is focused. The leading
 * and trailing gutters in tokens.css decide whether the first and last blocks can
 * be scrolled to it at all. Get them out of step and nothing throws: the document
 * looks right, and the last block simply cannot be focused, ever.
 *
 * That is not hypothetical. The gutters were a symmetrical 50vh, written when the
 * anchor was the midpoint, and moving the ratio to 1/3 would have left every
 * document's last block a third of a screen short. This test is the thing that
 * makes the coupling loud, since CSS cannot read the constant and a runtime read
 * in the scroll path buys a forced style flush to avoid a comment.
 *
 * A browser test cannot replace it. The gutter only bites at the very top and
 * bottom of a document, so an e2e spec has to remember to look there — and the
 * reachability spec in focus-scroll.spec.ts does, but only for the one fixture at
 * the one viewport it runs at.
 */

const SRC = resolve(process.cwd(), "packages/app/src");

/** `--name: 34vh;` → 34 */
function vhToken(css: string, name: string): number {
  const found = new RegExp(`^\\s*${name}:\\s*([\\d.]+)vh;`, "m").exec(css);
  if (!found) throw new Error(`${name} is not defined in vh in tokens.css`);
  return Number(found[1]);
}

describe("the reading anchor and its gutters", () => {
  const tokens = readFileSync(join(SRC, "design/tokens.css"), "utf8");
  const focus = readFileSync(join(SRC, "editor/focus/anchor.ts"), "utf8");

  const ratio = (() => {
    const found = /const ANCHOR_RATIO = ([\d.]+) \/ ([\d.]+);/.exec(focus);
    if (!found) throw new Error("ANCHOR_RATIO is not a plain fraction in editor/focus/anchor.ts");
    return Number(found[1]) / Number(found[2]);
  })();

  const leading = vhToken(tokens, "--reading-gutter-leading");
  const trailing = vhToken(tokens, "--reading-gutter-trailing");

  it("puts the anchor in the upper half, where the eye rests", () => {
    // The correction that produced all of this: §4.1's "centre of the screen"
    // means where you are reading, not where a ruler would put it.
    expect(ratio).toBeGreaterThan(0.25);
    expect(ratio).toBeLessThan(0.45);
  });

  it("leaves room above for the first block to reach the anchor", () => {
    // The first block starts a leading gutter down the scrollable extent, so it
    // can only rise to the anchor if that gutter is at least the anchor's own
    // distance from the top of the window.
    expect(leading, "the first block cannot reach the anchor").toBeGreaterThanOrEqual(ratio * 100);
  });

  it("leaves room below for the last block to reach the anchor", () => {
    // The failure the symmetrical 50vh would have shipped.
    expect(trailing, "the last block cannot reach the anchor").toBeGreaterThanOrEqual(
      (1 - ratio) * 100,
    );
  });

  it("does not buy that room with a screenful of blank", () => {
    // Rounded outward from thirds, so a little slack is expected and a lot is a
    // scroll extent you can get lost in.
    expect(leading + trailing).toBeLessThanOrEqual(105);
  });

  it("has no symmetrical gutter token left to fall back on", () => {
    // The old `--reading-gutter`. A leftover definition would let a stylesheet go
    // on consuming the midpoint assumption while passing the token guard.
    expect(tokens).not.toMatch(/^\s*--reading-gutter:/m);
  });
});
