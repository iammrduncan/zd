import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import { isRaw, rawModeChanged } from "./raw";

/**
 * Whole rows of pure notation, taken off the screen.
 *
 * Two constructs so far, and they are the same subject at the altitude that
 * matters: a line whose entire content is notation, which should therefore not
 * occupy a row. A fenced block's opening and closing markers, and the `===` or
 * `---` under a setext heading.
 *
 * DESIGN.md §5.2: "Its opening and closing fences and the declared language tag
 * are not drawn once the block is formed; under Raw Mode they reappear and join
 * that same plane, font, and 22 px rhythm as the code between them."
 *
 * A **block** decoration, and it has to be. Replacing just the ``` characters
 * inline would leave the line behind — an empty row still carrying `surface.code`,
 * so every block would gain a blank band above and below it. §5.2 asks for "one
 * continuous rectangular plane spanning… every row", and a blank row is not one of
 * its rows. Removing the row means covering the line break, which is a block range,
 * which CodeMirror only accepts from a `StateField` — the same constraint tables
 * ran into.
 *
 * Its own file rather than joining table.ts: both are block decorations from a
 * StateField, but that is a shared *mechanism*, not a shared subject. A file named
 * for the mechanism would be a place any future block trick gets dropped into.
 * Fence markers and setext underlines *do* share a subject, which is why they share
 * this one.
 */

/**
 * The fence line, gone — including the line break that would otherwise leave an
 * empty row where it was.
 */
const HIDDEN_ROW = Decoration.replace({ block: true });

/**
 * The range that makes a line's row disappear: the break *before* it, plus the
 * line itself.
 *
 * The preceding break, never the following one. `[line.from, line.to + 1]` reads
 * like the obvious answer and is wrong — its end lands exactly on the next line's
 * first position, so that line is touched by the range and hidden as well. It cost
 * the first content row of every fenced block, which showed up as a missing comment
 * rather than as a missing fence.
 *
 * Taking the break before instead merges this line into the previous one, and since
 * everything of this line is inside the range, what is left on screen is the
 * previous line unchanged. The next line is never touched at all.
 */
function rowRange(state: EditorState, at: number): { from: number; to: number } | null {
  const line = state.doc.lineAt(at);

  // No preceding break to take on the document's first line. Leaving that fence
  // visible is better than eating the line after it.
  if (line.number <= 1) return null;

  return { from: state.doc.line(line.number - 1).to, to: line.to };
}

function notationRowDecorations(state: EditorState): DecorationSet {
  // §7.4: under raw mode the fences "reappear and join that same plane, font, and
  // 22 px rhythm as the code between them" — which is what happens on its own once
  // their rows are no longer hidden, because they already carry `md-line-code`.
  if (isRaw(state)) return Decoration.none;

  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      /*
       * A setext underline. The heading's own text keeps its row and its heading
       * role (notation.ts); this removes the row beneath it, which holds nothing
       * but `===` or `---`.
       *
       * Decided 2026-07-29, on the reasoning DESIGN.md §5.2 gives for the hash: a
       * marker sized like prose beside a 30px heading reads as debris rather than as
       * its notation, and an underline is a whole row of exactly that. Raw mode
       * brings it back, which is the escape hatch every other hidden construct uses.
       */
      if (/^SetextHeading[12]$/.test(node.name)) {
        const last = state.doc.lineAt(node.to);
        const underline = rowRange(state, last.from);
        if (underline) ranges.push(HIDDEN_ROW.range(underline.from, underline.to));
        return;
      }

      if (node.name !== "FencedCode") return;

      /*
       * Driven off `CodeMark` children rather than by matching backticks in the
       * text. A fence can be written with tildes, can be longer than three
       * characters, and its language tag is a separate node — the parser already
       * knows all of that, and a regular expression here would be a second, worse
       * answer to a question already answered.
       */
      const marks: { from: number; to: number }[] = [];
      for (let child = node.node.firstChild; child; child = child.nextSibling) {
        if (child.name === "CodeMark") marks.push({ from: child.from, to: child.to });
      }
      /*
       * Both marks or neither, and this check has to come before the opening row is
       * hidden rather than after it.
       *
       * An unclosed fence has one mark, and its row must stay: hiding the opening of
       * a block that never ends would swallow the line the caret is on while someone
       * is still typing it. §7.4: "Incomplete syntax remains editable plain text."
       *
       * That was the intent from the start and the guard was one statement too late,
       * so the opening row of an incomplete fence was hidden after all. It is worth
       * being precise about what that cost, because none of it looks like a hidden
       * row: the row is also an *atomic* range, so the caret was pushed off the line
       * the moment the third backtick landed, and the language typed next went onto
       * the line below. A fence with a language could not be typed at all — which
       * also put the Enter-to-open-a-block command out of reach of the only gesture
       * that leads to it.
       */
      if (marks.length < 2) return;

      const opening = rowRange(state, marks[0]!.from);
      if (opening) ranges.push(HIDDEN_ROW.range(opening.from, opening.to));

      const closing = rowRange(state, marks.at(-1)!.from);
      if (closing) ranges.push(HIDDEN_ROW.range(closing.from, closing.to));
    },
  });

  return Decoration.set(ranges, true);
}

/**
 * Hide every row that is only notation.
 *
 * Whole-document rather than viewport-scoped, for the reason table.ts records: a
 * block decoration changes the document's height, so computing it per viewport
 * would make the scroll position shift as blocks came into view.
 */
const notationRows = StateField.define<DecorationSet>({
  create: (state) => notationRowDecorations(state),
  update: (value, transaction) => {
    if (
      !transaction.docChanged &&
      !rawModeChanged(transaction.startState, transaction.state) &&
      syntaxTree(transaction.startState) === syntaxTree(transaction.state)
    ) {
      return value.map(transaction.changes);
    }
    return notationRowDecorations(transaction.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    /*
     * A removed row is not somewhere the caret can be.
     *
     * Every range in this field is a whole line that is not drawn, so without this
     * the caret can sit on a fence marker or a setext underline that is not on
     * screen — and Up or Down from the line beside it appears to do nothing, or to
     * move twice. Safe to hand the whole field here, unlike notation.ts: this field
     * holds nothing but replacements.
     */
    EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
  ],
});

/** Notation rows removed: fence markers and setext underlines. */
export function hiddenNotationRows(): Extension {
  return notationRows;
}
