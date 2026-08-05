import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { blockRange, sectionRange } from "@/miniapps/md/editor/focus-range";

/*
 * What §4.1 calls the focus target: the whole block the caret is in.
 *
 * Reported as "focus does not bind the whole block — a sentence late in a
 * paragraph takes focus while the rest of it dims" (feedback, 2026-07-29).
 *
 * `blockRange` is a pure function of a document and a position, so the honest
 * instrument is a state and a number rather than a browser: every position in a
 * block has to answer with that block, and a sweep over one paragraph states
 * exactly that and nothing about layout.
 */

const DOC = [
  "# Title",
  "",
  "A paragraph here should be indistinguishable from a paragraph in the reader —",
  "same family, same size, same line height, same colour, same measure. If it is",
  "not, the claim above is decoration rather than design.",
  "",
  "## Notation",
  "",
  "- one item",
  "- two item",
  "",
  "```sh",
  "npm run dev",
  "```",
  "",
  "Trailing paragraph at the very end of the document.",
].join("\n");

const state = EditorState.create({ doc: DOC, extensions: [markdown()] });

/** The from/to of the source lines `first` through `last`, inclusive. */
function span(first: number, last: number) {
  return { from: state.doc.line(first).from, to: state.doc.line(last).to };
}

/**
 * Every position from the start of the block to its end, inclusive.
 *
 * The end is the point of this: it is the one position the caret occupies every
 * time someone types at the end of a paragraph, presses End on its last line, or
 * clicks past the last character.
 */
function rangesAcross(block: { from: number; to: number }) {
  const seen = new Set<string>();
  for (let pos = block.from; pos <= block.to; pos += 1) {
    const range = blockRange(state, pos);
    seen.add(`${range.from},${range.to}`);
  }
  return [...seen];
}

describe("the focus target binds the whole block", () => {
  it("answers with the whole paragraph from every position in it", () => {
    const paragraph = span(3, 5);

    // One answer, and it is the paragraph. Written as the set of distinct answers
    // rather than as an assertion per position, so a failure names what the other
    // answer was instead of only where it happened.
    expect(rangesAcross(paragraph)).toEqual([`${paragraph.from},${paragraph.to}`]);
  });

  it("still answers with the paragraph at its very last position", () => {
    const paragraph = span(3, 5);

    /*
     * The reported case, stated on its own because the sweep above would go on
     * passing if this were the only position that broke and someone narrowed the
     * sweep later. Typing at the end of a paragraph puts the caret here after
     * every keystroke.
     */
    expect(blockRange(state, paragraph.to)).toEqual(paragraph);
  });

  it("answers with the whole list from every position in it", () => {
    const list = span(9, 10);

    // §7.6, settled 2026-07-29: "a whole list is one such block rather than one
    // item of it".
    expect(rangesAcross(list)).toEqual([`${list.from},${list.to}`]);
  });

  it("answers with the whole fence from every position in it", () => {
    const fence = span(12, 14);

    expect(rangesAcross(fence)).toEqual([`${fence.from},${fence.to}`]);
  });

  it("answers with the heading from both of its ends", () => {
    const heading = span(7, 7);

    expect(blockRange(state, heading.from)).toEqual(heading);
    expect(blockRange(state, heading.to)).toEqual(heading);
  });

  it("answers with the last block at the very end of the document", () => {
    const last = span(16, 16);

    // Nothing at all starts after this position, which is the extreme of the same
    // case: resolving forward from here has nowhere to land.
    expect(blockRange(state, state.doc.length)).toEqual(last);
  });

  it("leaves a fence introduced by a list alone", () => {
    const fence = span(12, 14);

    /*
     * The control for the pairing below, and it lives here rather than there
     * because this document is the one that has the shape: line 11 is a list, not
     * prose. Only a *paragraph* leads in. Without this, "pair with whatever is
     * above" would pass every assertion in the next block and quietly widen the
     * target for lists, headings, and blockquotes too.
     */
    expect(blockRange(state, fence.from)).toEqual(fence);
  });

  it("gives a blank line between blocks its own target", () => {
    const blank = state.doc.line(6);

    /*
     * Deliberate, and pinned so the fix above cannot quietly take it away. A
     * caret on a blank line has intent behind it — you are about to type there —
     * so attaching it to the paragraph above would move the highlight away from
     * where the work is. Only the *anchor* snaps out of blank lines, through
     * `nearestContentPos`.
     */
    expect(blockRange(state, blank.from)).toEqual({ from: blank.from, to: blank.to });
  });
});

describe("section focus in a one-section document", () => {
  it("falls back to the caret paragraph when one H1 owns the whole document", () => {
    const source = [
      "# One heading, one section",
      "",
      "The opening paragraph establishes the document before the caret.",
      "",
      "The middle paragraph holds the caret.",
      "",
      "The final paragraph shows how far section focus reaches.",
    ].join("\n");
    const oneSection = EditorState.create({ doc: source, extensions: [markdown()] });
    const middle = oneSection.doc.line(5);

    expect(sectionRange(oneSection, middle.from)).toEqual({
      from: middle.from,
      to: middle.to,
    });
  });

  it("keeps the owning section when a document has multiple sections", () => {
    const source = [
      "# Title",
      "",
      "## First section",
      "",
      "The first section paragraph.",
      "",
      "## Second section",
      "",
      "The second section paragraph.",
    ].join("\n");
    const multipleSections = EditorState.create({ doc: source, extensions: [markdown()] });

    expect(sectionRange(multipleSections, multipleSections.doc.line(5).from)).toEqual({
      from: multipleSections.doc.line(3).from,
      to: multipleSections.doc.line(5).to,
    });
  });
});

/*
 * The lead-in rule — DESIGN.md §7.6, added 2026-07-30.
 *
 * "A paragraph immediately followed by a code block is one paragraph-granularity
 * target with it, in both directions."
 *
 * Reported twice against the same line of README.md, the second time blocking:
 * "if its highlighted for focus the code block right below it should be
 * highlighted for focus". The first report was measured and §7.6 was working
 * exactly as written — a paragraph is one semantic block and a fence is a
 * different block — so this is a change to what *paragraph* means, and the spec
 * says it before this file does.
 *
 * A second document because the one above pins the unpaired cases and this one
 * would change four of its answers.
 */
const PAIRED = [
  "# Setup", // 1
  "", // 2
  "Needs [Node](https://nodejs.org) and [Rust](https://rust-lang.org/tools/install/).", // 3
  "", // 4
  "```sh", // 5
  "npm install", // 6
  "```", // 7
  "", // 8
  "A paragraph that introduces nothing.", // 9
  "", // 10
  "Another paragraph directly after it.", // 11
  "", // 12
  "Prose ahead of an indented block:", // 13
  "", // 14
  "    cargo build", // 15
  "", // 16
  "# Done", // 17
].join("\n");

const paired = EditorState.create({ doc: PAIRED, extensions: [markdown()] });

function pairedSpan(first: number, last: number) {
  return { from: paired.doc.line(first).from, to: paired.doc.line(last).to };
}

describe("a paragraph and the code block under it are one target", () => {
  it("takes the fence when the caret is in the lead-in paragraph", () => {
    expect(blockRange(paired, pairedSpan(3, 3).from)).toEqual(pairedSpan(3, 7));
  });

  it("takes the lead-in when the caret is in the fence", () => {
    /*
     * Both directions, because the rule is a pair rather than an arrow. Moving
     * the caret from the sentence into the command it describes should not put
     * out the sentence — that is the same loss the report named, seen from the
     * other end.
     */
    expect(blockRange(paired, pairedSpan(6, 6).from)).toEqual(pairedSpan(3, 7));
  });

  it("holds at both ends of the pair, not only in the middle", () => {
    /*
     * The ends are where this breaks. `topLevelAt` resolves forward first and
     * backward second, and the last position of a paragraph is exactly where the
     * caret sits after every keystroke typed there — a spec that passed for four
     * days by clicking into the middle of a paragraph is why this is stated.
     */
    const pair = pairedSpan(3, 7);
    expect(blockRange(paired, pair.from)).toEqual(pair);
    expect(blockRange(paired, pair.to)).toEqual(pair);
    expect(blockRange(paired, pairedSpan(3, 3).to)).toEqual(pair);
  });

  it("pairs an indented code block too", () => {
    // §7.6 says "a code block, fenced or indented". Four spaces is the same
    // construct wearing different notation, and the reader renders both as a
    // `<pre>`.
    expect(blockRange(paired, pairedSpan(13, 13).from)).toEqual(pairedSpan(13, 15));
  });

  it("leaves two paragraphs in a row as two targets", () => {
    // The rule that was rejected — "focus the block after this one" — passes
    // every assertion above and fails here, which is why this is a test and not a
    // comment.
    expect(blockRange(paired, pairedSpan(9, 9).from)).toEqual(pairedSpan(9, 9));
    expect(blockRange(paired, pairedSpan(11, 11).from)).toEqual(pairedSpan(11, 11));
  });

  it("still gives the blank line inside a pair its own target", () => {
    const blank = paired.doc.line(4);

    /*
     * The gap between the lead-in and its fence is now inside one target, and it
     * is still not part of it. A caret on a blank line has intent behind it, and
     * §7.6's pairing is about what you are *reading*, not about swallowing the
     * position you are about to type in.
     */
    expect(blockRange(paired, blank.from)).toEqual({ from: blank.from, to: blank.to });
  });

  it("leaves a fence with nothing above it alone", () => {
    const alone = EditorState.create({
      doc: ["```sh", "npm install", "```"].join("\n"),
      extensions: [markdown()],
    });

    // The null case. Looking backwards from the document's first block has to be
    // a no-op rather than a crash.
    expect(blockRange(alone, 0)).toEqual({ from: 0, to: alone.doc.length });
  });
});
