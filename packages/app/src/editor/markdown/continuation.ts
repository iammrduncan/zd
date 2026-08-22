/** Markdown-specific structure continuation for the shared editor owner. */
import { markdownKeymap } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, StateCommand } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { keymap } from "@codemirror/view";

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
    }),
  );
  return true;
};

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
      { key: "Enter", run: leaveBlockquote },
    ]),
    keymap.of(markdownKeymap),
  ];
}
