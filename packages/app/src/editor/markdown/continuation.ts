/** Markdown-specific structure continuation for the shared editor owner. */
import { markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import {
  Annotation,
  EditorState,
  Transaction,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { EditorView, keymap } from "@codemirror/view";

import { isRaw } from "./raw";

/**
 * Structure that continues as you type it — vision §6.1.
 *
 * "Typing `>` and a space makes a blockquote; Enter continues it; a second Enter
 * leaves it." Reported twice, for blockquotes and for lists.
 *
 * `@codemirror/lang-markdown` does most of this and is used for it. What it does
 * not do is leave a blockquote: its own documentation says Enter "removes trailing
 * whitespace and **list** markers" from a line that holds nothing else, and a quote
 * marker is neither. Measured, a second Enter in a quote gives `>` and then another
 * `> ` line — the quote continuing forever, which is the reported complaint with the
 * continuation working.
 *
 * So one command is ours and the rest is the library's.
 */

/** A line holding nothing but blockquote markers and space. */
const ONLY_QUOTE_MARKERS = /^[\s>]*>[\s]*$/;

/** A parser-confirmed list item whose line contains no user text. */
const ONLY_EMPTY_LIST_ITEM = /^[\t ]*(?:[-+*]|\d{1,9}[.)])(?:[\t ]+\[[ xX]\])?[\t ]*$/;

/** An unordered marker and the spacing before the item's visible content. */
const UNORDERED_ITEM_PREFIX = /^[\t ]*[-+*][\t ]+(?:\[[ xX]\][\t ]+)?/u;

/** A structural fence edit that is allowed to cross a protected delimiter boundary. */
const fenceStructureEdit = Annotation.define<boolean>();

/**
 * A second Enter leaves the complete list, including from a nested empty item.
 *
 * CodeMirror's Markdown command demotes nested empty items one level at a time.
 * That is valid structural editing, but it contradicts this surface's established
 * two-Enter gesture and leaves invisible indentation behind. Once decorations make
 * that indentation atomic, the following key can continue a new nested marker and
 * produce the orphan gap reported in the demo.
 *
 * The regular expression only recognizes the empty-line shape. The syntax tree is
 * still the authority that says it is a list item, so a prose line containing `-`
 * or `1.` is never claimed accidentally.
 */
const leaveList: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to || !ONLY_EMPTY_LIST_ITEM.test(line.text)) return false;

  const markerOffset = line.text.search(/[-+*\d]/u);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(line.from + markerOffset, 1);
  while (node && node.name !== "ListItem") node = node.parent;
  if (!node) return false;

  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * A second Enter at the beginning of a split remainder leaves the list.
 *
 * Splitting `- before **after**` inside the emphasis correctly produces a new
 * item with `**after**` after its marker. The caret is then at that item's text
 * edge. CodeMirror's default action for another Enter inserts an empty item above
 * the untouched remainder, so repeated Return piles up blank bullets while the
 * text keeps moving down the page. At the text edge, the second press is the same
 * explicit leave gesture as Enter on an empty marker: remove this marker and keep
 * the remainder as prose.
 */
const leaveListAtContentStart: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  const prefix = UNORDERED_ITEM_PREFIX.exec(line.text)?.[0] ?? null;
  if (!prefix || range.head !== line.from + prefix.length) return false;
  if (line.text.slice(prefix.length).trim() === "") return false;

  dispatch(
    state.update({
      changes: { from: line.from, to: range.head, insert: "" },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/** Find the innermost list item containing a source position. */
function listItemAt(state: EditorState, pos: number): SyntaxNode | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node && node.name !== "ListItem") node = node.parent;
  return node;
}

/** The next marker for a sibling item, retaining bullet or ordered-list syntax. */
function nextListMarker(marker: string): string {
  const ordered = /^(\d{1,9})([.)])$/u.exec(marker);
  return ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : marker;
}

/**
 * Continue a list when its final item ends on an explicit source continuation.
 *
 * CodeMirror's Markdown command continues a marker line, but on a wrapped item
 * whose final source row has only indentation and prose it copies the indentation
 * and inserts no marker. That is precisely where a person still reads themselves
 * as being in the item. The parser identifies the enclosing item and its marker;
 * this command only owns that final continuation row and leaves all marker-line
 * cases to the library.
 */
const continueListFromContinuation: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to || line.text.trim() === "") return false;

  const item = listItemAt(state, range.head);
  const marker = item?.getChild("ListMark") ?? null;
  if (!item || !marker) return false;

  const markerLine = state.doc.lineAt(marker.from);
  const lastItemLine = state.doc.lineAt(Math.max(item.from, item.to - 1));
  if (markerLine.number === line.number || lastItemLine.number !== line.number) return false;

  const indentation = state.doc.sliceString(markerLine.from, marker.from);
  const markerText = nextListMarker(state.doc.sliceString(marker.from, marker.to));
  const afterMarker = markerLine.text.slice(marker.to - markerLine.from);
  const spacing = /^[\t ]+/u.exec(afterMarker)?.[0] ?? " ";
  const task = /^[\t ]+\[[ xX]\][\t ]+/u.test(afterMarker) ? "[ ] " : "";
  const prefix = `${indentation}${markerText}${spacing}${task}`;

  dispatch(
    state.update({
      changes: { from: line.to, insert: `\n${prefix}` },
      selection: { anchor: line.to + 1 + prefix.length },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * Enter on a blockquote line with nothing typed in it leaves the quote.
 *
 * "if nothing is typed and enter is pressed then it demotes it to a newline"
 * (feedback, 2026-07-29). A demotion in place, not a new line below: the marker
 * comes off the line the caret is already on, which is what the library does for a
 * list marker and so is what a reader has just been taught to expect.
 *
 * Declines in every other case, so it can sit ahead of `insertNewlineContinueMarkup`
 * without taking Enter away from it. A command that returns false lets the next
 * binding run, which is the whole reason the markdown keymap is safe to layer at
 * all.
 *
 * Nested quotes leave in one press rather than one level at a time. §6.1 says a
 * second Enter "leaves it" — the construct, not a layer of it — and needing three
 * presses to escape `> > ` is the kind of thing nobody predicts. `deleteMarkupBackward`
 * is still there for taking off exactly one level deliberately.
 */
const leaveBlockquote: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  // The caret has to be at the end of it. Anywhere else and Enter is splitting a
  // line the reader is still working on, whatever that line happens to contain.
  if (range.head !== line.to) return false;
  if (!ONLY_QUOTE_MARKERS.test(line.text)) return false;

  dispatch(
    state.update({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: { anchor: line.from },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * The fence markers of the `FencedCode` node containing `pos`, or null.
 *
 * Driven off `CodeMark` children rather than by matching backticks in the text, the
 * same way notation/rows.ts finds them to hide their rows — a fence can be tildes,
 * can be longer than three characters, and carries its language as a separate node.
 * The parser knows all of that already.
 *
 * **One mark means the fence is unclosed.** That is the fact both commands below turn
 * on, and it is the same fact notation/rows.ts uses to decide that an unclosed
 * fence's row must stay on screen.
 */
function fenceAt(
  state: EditorState,
  pos: number,
): { node: SyntaxNode; marks: SyntaxNode[] } | null {
  // Side 1, looking *forward* from `pos`. Both callers pass the start of a line, and
  // side -1 there resolves to whatever ends at that position — the line before, which
  // is outside the fence. Both commands silently declined on every fence in the
  // document until this was a 1.
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && node.name !== "FencedCode") node = node.parent;
  if (!node) return null;

  const marks: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "CodeMark") marks.push(child);
  }
  return marks.length > 0 ? { node, marks } : null;
}

/**
 * Enter at the end of an unclosed fence line closes the block.
 *
 * §6.1: "A fence and its optional language open a code block on Enter." Reported as
 * "after entering the triplebacktick and the code language (or not) and pressing
 * enter it should create a code block".
 *
 * This is not a convenience. An unclosed fence runs to the end of the document, so
 * the paragraphs below the one just typed all become code at once — the rest of the
 * file changes plane while someone is still typing the first line of a block.
 *
 * The closer repeats the opener's own characters, at the opener's own length. A fence
 * may be `~~~` or ````` ```` `````, and CommonMark requires the closer to match the
 * character and be at least as long — closing `~~~~` with ``` produces a block that
 * still never ends, which would be this command appearing to work and not working.
 */
const closeFence: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const line = state.doc.lineAt(range.head);
  if (range.head !== line.to) return false;

  const fence = fenceAt(state, line.from);
  // Already closed: Enter here is someone adding a line inside a finished block.
  if (!fence || fence.marks.length !== 1) return false;

  // The caret has to be on the opening line itself, not further down inside a block
  // whose closer has simply not been typed yet.
  const opener = fence.marks[0]!;
  if (state.doc.lineAt(opener.from).number !== line.number) return false;

  const marker = state.doc.sliceString(opener.from, opener.to);
  dispatch(
    state.update({
      changes: { from: line.to, insert: `\n\n${marker}` },
      // Between the two, which is the only place there is to type.
      selection: { anchor: line.to + 1 },
      scrollIntoView: true,
      userEvent: "input",
    }),
  );
  return true;
};

/**
 * Enter on the blank line just above a closing fence leaves the block.
 *
 * "double enter required to exit (just like typing in slack does)", and the blunter
 * report: "code block pressing enter twice does not leave the code block".
 *
 * The blank line the first Enter made is taken back rather than left behind. It was
 * scaffolding for the second press, not content, and a block that gains a trailing
 * empty line every time someone leaves it would be this command charging rent.
 *
 * Only from the line immediately above the closer. A blank line anywhere else inside
 * a fence is someone spacing out their code, and ejecting them from the block for it
 * would be worse than doing nothing.
 */
const leaveFence: StateCommand = ({ state, dispatch }) => {
  const range = state.selection.main;
  if (!range.empty) return false;

  const here = state.doc.lineAt(range.head);
  if (here.text.trim() !== "") return false;

  const fence = fenceAt(state, here.from);
  if (!fence || fence.marks.length < 2) return false;

  const closing = state.doc.lineAt(fence.marks.at(-1)!.from);
  if (closing.number !== here.number + 1) return false;
  // Nothing to stand on if the blank line is also the first line of the document.
  if (here.number <= 1) return false;

  const previous = state.doc.line(here.number - 1);
  const removed = here.to - previous.to;

  dispatch(
    state.update({
      changes: [
        // The scaffolding line, including the break that made it.
        { from: previous.to, to: here.to },
        // A line of one's own, after the block.
        { from: closing.to, insert: "\n" },
      ],
      // In the new document: the closer moved up by what was removed, and the caret
      // goes one past the break just inserted after it.
      selection: { anchor: closing.to - removed + 1 },
      scrollIntoView: true,
      userEvent: "input",
      annotations: fenceStructureEdit.of(true),
    }),
  );
  return true;
};

/**
 * Remove a complete fence that contains no code.
 *
 * This is the one rendered-mode deletion that intentionally owns delimiter
 * source. It removes the surrounding block boundaries as well, leaving the
 * ordinary single blank line that separated the neighboring prose.
 */
const removeEmptyFence: StateCommand = ({ state, dispatch }) => {
  if (isRaw(state)) return false;
  const range = state.selection.main;
  if (!range.empty) return false;

  const fence = fenceAt(state, range.head);
  if (!fence || fence.marks.length < 2) return false;
  const opening = state.doc.lineAt(fence.marks[0]!.from);
  const closing = state.doc.lineAt(fence.marks.at(-1)!.from);
  const contentFrom = Math.min(opening.to + 1, state.doc.length);
  if (state.doc.sliceString(contentFrom, closing.from).trim() !== "") return false;

  const previous = opening.number > 1 ? state.doc.line(opening.number - 1) : null;
  const next = closing.number < state.doc.lines ? state.doc.line(closing.number + 1) : null;
  const previousBlank = previous?.text.trim() === "";
  const nextBlank = next?.text.trim() === "";
  const from = previous ? (previousBlank ? previous.from : previous.to) : opening.from;
  const to = next ? (nextBlank ? next.to : next.from) : closing.to;
  const insert = previous && next ? "\n".repeat(2 - Number(previousBlank) - Number(nextBlank)) : "";
  dispatch(
    state.update({
      changes: { from, to, insert },
      selection: { anchor: from },
      scrollIntoView: true,
      userEvent: "delete",
      annotations: fenceStructureEdit.of(true),
    }),
  );
  return true;
};

/** Source ranges that make a complete fence remain a fence in rendered mode. */
function protectedFenceBoundaries(state: EditorState): readonly { from: number; to: number }[] {
  const boundaries: { from: number; to: number }[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return;
      const marks = node.node.getChildren("CodeMark");
      if (marks.length < 2) return;

      const opening = state.doc.lineAt(marks[0]!.from);
      const closing = state.doc.lineAt(marks.at(-1)!.from);
      boundaries.push({
        from: opening.from,
        to: Math.min(opening.to + 1, state.doc.length),
      });
      boundaries.push({
        from: closing.number > 1 ? state.doc.line(closing.number - 1).to : closing.from,
        to: Math.min(closing.to + 1, state.doc.length),
      });
    },
  });
  return boundaries;
}

/** Keep hidden delimiters structural unless Raw Mode explicitly reveals them. */
const protectRenderedFences = EditorState.transactionFilter.of((transaction) => {
  if (
    !transaction.docChanged ||
    isRaw(transaction.startState) ||
    transaction.annotation(fenceStructureEdit) ||
    !transaction.annotation(Transaction.userEvent)
  ) {
    return transaction;
  }

  const boundaries = protectedFenceBoundaries(transaction.startState);
  let crossesBoundary = false;
  transaction.changes.iterChangedRanges((fromA, toA) => {
    if (fromA === toA) return;
    if (boundaries.some(({ from, to }) => fromA < to && toA > from)) crossesBoundary = true;
  });
  return crossesBoundary ? [] : transaction;
});

/** Make a click in the lower inset mean “append inside this fence.” */
const fencePaddingPointer = EditorView.domEventHandlers({
  mousedown: (event, view) => {
    if (event.button !== 0) return false;
    const target =
      event.target instanceof Element ? event.target.closest<HTMLElement>(".cm-line") : null;
    if (!target?.classList.contains("md-line-code-last")) return false;
    const padding = parseFloat(getComputedStyle(target).paddingBlockEnd);
    const bounds = target.getBoundingClientRect();
    if (padding <= 0 || event.clientY < bounds.bottom - padding) return false;

    event.preventDefault();
    const line = view.state.doc.lineAt(view.posAtDOM(target));
    view.dispatch({
      selection: { anchor: line.to },
      scrollIntoView: true,
      userEvent: "select.pointer",
    });
    view.focus();
    return true;
  },
});

/**
 * Enter and Backspace for markdown structure.
 *
 * Ordering is the whole of it, twice over. `leaveBlockquote` goes ahead of the
 * library so it can claim the one case the library gets wrong, and both go ahead of
 * `defaultKeymap` so Enter reaches them first — while still falling through to a
 * plain newline in prose, because each declines rather than swallowing the key.
 *
 * These are text editing, not application commands, which is why they are a
 * CodeMirror keymap and not workbench registry entries. §7.1's one registry owns things
 * with a chord, a description, and a row in the Shortcut Reference; Enter has none
 * of those, and `defaultKeymap` has always been in this editor for the same reason.
 */
export function markdownStructure(): Extension {
  return [
    protectRenderedFences,
    fencePaddingPointer,
    /*
     * Leaving before continuing, in both pairs. Each of these claims exactly one
     * case and declines otherwise, so the order only decides who is *asked* first —
     * and the leave commands have to be asked first, because the case they claim
     * (a line holding nothing but markup) is a case the continue commands would
     * happily answer by adding more markup.
     */
    keymap.of([
      { key: "Enter", run: leaveFence },
      { key: "Enter", run: closeFence },
      { key: "Enter", run: leaveListAtContentStart },
      { key: "Enter", run: leaveList },
      { key: "Enter", run: leaveBlockquote },
      { key: "Enter", run: continueListFromContinuation },
      { key: "Backspace", run: removeEmptyFence },
    ]),
    keymap.of(markdownKeymap),
  ];
}
