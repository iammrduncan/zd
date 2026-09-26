import { syntaxTree } from "@codemirror/language";
/** Source ranges for editor focus blocks and sections. */
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

/**
 * The semantic block containing `pos` — what §7.6 means by paragraph
 * granularity.
 *
 * The whole list, not the item inside it. This used to stop at `ListItem`, on
 * the reasoning that a list is read item by item — but the reader never agreed:
 * its `focusableBlocks` returns the reading column's children, so a `<ul>` has
 * always been one target there. The same document focused two different ways
 * depending on which surface you were looking at, which §6 rules out in as many
 * words: the editor "is not a second mode". The reader's answer wins because it
 * is the one that shipped and the one that was read against for a week.
 *
 * A blank line belongs to no block at all, so it is its own target rather than
 * being silently attached to the paragraph above or below it.
 *
 * One block, with one exception: a paragraph and the code block directly under it
 * are one target. See `withLeadIn`.
 */
export function blockRange(state: EditorState, pos: number): { from: number; to: number } {
  // Forward first, then backward. Neither side is right on its own — see the note
  // on `topLevelAt`.
  const block = topLevelAt(state, pos, 1) ?? topLevelAt(state, pos, -1);
  if (block) return withLeadIn(block);

  const line = state.doc.lineAt(pos);
  return { from: line.from, to: line.to };
}

/** Fenced or indented. §7.6 pairs with a code block, not with a notation. */
const CODE_BLOCK = /^(?:FencedCode|CodeBlock)$/;

/**
 * A paragraph and the code block under it, as one range.
 *
 * §7.6, added 2026-07-30: "A paragraph immediately followed by a code block is
 * one paragraph-granularity target with it, in both directions." The sentence
 * that introduces a command and the command are one thing to read, and dimming
 * either while the other is lit takes away the half that explains the other.
 *
 * Reported twice against the same line of a README, the second time blocking. The
 * first report was measured and §7.6 was working exactly as written — so this is
 * a change to what *paragraph* means, and the spec says it before this does.
 *
 * Both directions rather than an arrow, because the pair is one thing. An arrow
 * would put the lead-in out as soon as the caret entered the fence, which is the
 * reported loss seen from the other end.
 *
 * Only a code block pairs. "The block after this one" as a general rule widens
 * until it reaches section granularity, which was already rejected as too wide —
 * two paragraphs in a row are two thoughts, and a fence is not prose at all, it is
 * the thing the prose was about.
 */
function withLeadIn(block: SyntaxNode): { from: number; to: number } {
  // Siblings here are the tree's top-level children, because `topLevelAt` only
  // ever returns a node whose parent is the root. A blank line is not a node, so
  // "immediately followed" means adjacent in the block sequence rather than
  // adjacent in the text.
  if (block.name === "Paragraph") {
    const below = block.nextSibling;
    if (below && CODE_BLOCK.test(below.name)) return { from: block.from, to: below.to };
  }

  if (CODE_BLOCK.test(block.name)) {
    const above = block.prevSibling;
    if (above && above.name === "Paragraph") return { from: above.from, to: block.to };
  }

  return { from: block.from, to: block.to };
}

/**
 * The top-level block touching `pos` when the tree is asked from `side`, or null.
 *
 * **Which side you ask from decides the answer, and each side is wrong somewhere.**
 * Side −1 at a line *start* resolves to whatever ended there, which is the line
 * before — continuation.ts hit that and every fence command declined until it was
 * a +1. Side +1 at a block *end* is the same mistake seen from the other end: it
 * resolves to whatever starts at that position, and at the end of a paragraph
 * nothing does, so the walk reaches the root having found no block at all.
 *
 * That second half is what "a sentence late in a paragraph takes focus while the
 * rest of it dims" was (feedback, 2026-07-29). The range fell through to the
 * caret's own line, and since the end of a paragraph is exactly where the caret
 * sits after every keystroke typed there, it was not an edge case in use.
 *
 * So: ask forward, and if that finds nothing, ask backward. Only one of the two
 * can be inside a block, because the position where both fail is a blank line —
 * which `blockRange` deliberately gives a target of its own.
 */
function topLevelAt(state: EditorState, pos: number, side: -1 | 1): SyntaxNode | null {
  let node = syntaxTree(state).resolveInner(pos, side);

  while (node.parent) {
    // The root has no parent, so a node whose parent has none is a top-level
    // block. Compared this way rather than against `topNode` because syntax
    // nodes are made on demand and two handles to the root are not the same
    // object.
    //
    // The node itself rather than its range, so `withLeadIn` can ask what kind of
    // block it is and what sits beside it. Returning a bare `{from, to}` here is
    // what would have made the pairing a second walk of the tree.
    if (!node.parent.parent) return node;
    node = node.parent;
  }

  return null;
}

/**
 * The nearest position that belongs to a block, for a position that may not.
 *
 * The anchor is one y coordinate, so a good deal of the time it lands in the blank
 * line between two blocks — and a markdown source has real blank lines where the
 * reader's DOM simply has margin. Focusing one means focusing nothing, on a surface
 * whose whole job is to dim everything that is not the target, so scrolling could
 * leave the document uniformly grey.
 *
 * The reader has always handled this. Its `blockAtY` returns "the block the anchor
 * sits in, or the nearest one when it lands in a gap", because a gap there is
 * between elements and cannot be an element. This is the editor asking the same
 * question of a document that happens to have a line there.
 *
 * Only for the anchor. `blockRange` gives a blank line its own target when the
 * *caret* is on one, deliberately — you are about to type there, and moving the
 * highlight to the paragraph above would take it away from where you are working.
 * The anchor has no intent behind it, so it snaps; the caret does not.
 *
 * Nearest by line distance, with the following block winning a tie, because reading
 * runs forwards and a single blank line between two paragraphs is the common case.
 */
export function nearestContentPos(state: EditorState, pos: number): number {
  const here = state.doc.lineAt(pos);
  if (here.text.trim() !== "") return pos;

  for (let distance = 1; distance <= state.doc.lines; distance += 1) {
    const after = here.number + distance;
    if (after <= state.doc.lines) {
      const line = state.doc.line(after);
      if (line.text.trim() !== "") return line.from;
    }
    const before = here.number - distance;
    if (before >= 1) {
      const line = state.doc.line(before);
      if (line.text.trim() !== "") return line.from;
    }
  }

  // A document of nothing but blank lines. The position it already has is as good
  // an answer as exists, and returning it keeps this from ever being a crash.
  return pos;
}

/** ATX and setext alike: the parser knows a setext heading even where nothing styles one yet. */
const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

function headingLevel(node: SyntaxNode): number | null {
  const match = HEADING.exec(node.name);
  return match ? Number(match[1]) : null;
}

/**
 * The section containing `pos` — §7.6: "a heading and its descendants up to the
 * next peer or higher heading".
 *
 * The same walk the reader's `targetBlocks` does, over the syntax tree's
 * top-level children instead of the reading column's element children. Not
 * shared with it, because the two are looking at genuinely different things: one
 * has rendered blocks and the other has parse nodes, and the only way to share
 * the code would be to invent a third representation for both to convert into.
 * What is shared is the rule, and it is stated once above.
 *
 * **This walk is not viewport-bounded, and that is known rather than overlooked.**
 * Audit finding L8: it collects every top-level block on each recompute, while
 * ADR 0003's budget is "work proportional to the viewport" and megabyte agent logs
 * are this product's stated diet. `nearestContentPos` above has the same shape on
 * a blank-heavy document.
 *
 * Left alone on purpose. AGENTS.md: "Never optimize without a real-world profile
 * showing the actual bottleneck" — and today section granularity is reachable only
 * through the dev fixture, so a profile of it would be a profile of nothing anyone
 * uses. The cheap answers are recorded so this is a decision rather than a
 * surprise: early-exit the walk once past the viewport, or memoize by tree
 * identity, since the tree is what the answer actually depends on. The moment to
 * take one is when §7.9's settings surface makes section granularity selectable
 * and a real document is slow.
 */
export function sectionRange(state: EditorState, pos: number): { from: number; to: number } {
  const blocks: SyntaxNode[] = [];
  for (let child = syntaxTree(state).topNode.firstChild; child; child = child.nextSibling) {
    blocks.push(child);
  }
  if (blocks.length === 0) return blockRange(state, pos);

  // A blank line between blocks is inside none of them, so it takes the section
  // of the block above — that is the section it reads as being part of, and
  // leaving it sectionless would blink focus off while crossing a paragraph gap.
  let index = blocks.findIndex((block) => pos >= block.from && pos <= block.to);
  if (index < 0) {
    index = 0;
    while (index + 1 < blocks.length && blocks[index + 1]!.from <= pos) index += 1;
  }

  // Back to the heading that owns this block. Content before the first heading
  // is its own section — a document's preamble belongs to no heading.
  let start = index;
  while (start > 0 && headingLevel(blocks[start]!) === null) start -= 1;

  // 7 is below every real heading, so a preamble ends at the first heading of
  // any level while an H2 section ends only at the next H2 or H1.
  const owning = headingLevel(blocks[start]!) ?? 7;

  let end = start;
  while (end + 1 < blocks.length) {
    const level = headingLevel(blocks[end + 1]!);
    if (level !== null && level <= owning) break;
    end += 1;
  }

  // A section that spans the whole document has no context to dim, so the
  // setting becomes visually inert. The reviewed choice is paragraph focus in
  // that case. Test the computed range rather than counting H1s: one title with
  // real H2 sections still has useful section targets.
  if (start === 0 && end === blocks.length - 1) return blockRange(state, pos);

  return { from: blocks[start]!.from, to: blocks[end]!.to };
}
