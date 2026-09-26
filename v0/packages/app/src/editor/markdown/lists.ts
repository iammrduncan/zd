/** Markdown list indentation for the shared editor owner. */
import { syntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState, Extension, StateCommand } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { keymap } from "@codemirror/view";

/**
 * Tab and Shift-Tab move a list item in and out a level — vision §6.1.
 *
 * "Structure continues as you type it, the way a chat composer does." Reported as
 * "tab and shift tab indent and outdent list items including a multi item
 * selection" (feedback, 2026-07-29).
 *
 * Two decisions carry this file.
 *
 * **The unit is the previous sibling's content column, not a fixed number of
 * spaces.** CommonMark nests an item under the one above it only when the item
 * reaches that item's *content* column — which is 2 after `- `, 3 after `9. `, and
 * 4 after `10. `. A fixed two-space unit under a `9. ` marker produces a second
 * list rather than a nested one: markdown that parses cleanly, renders wrongly,
 * and reads exactly like the feature working. `@codemirror/commands` ships
 * `indentMore`, which is line-based and unit-based and would do precisely that,
 * which is why none of this is that function.
 *
 * **The subject is an item, not a line.** A `ListItem` node already spans its
 * continuation lines and any list nested inside it, so shifting the item shifts
 * all of them and the item stays one item. Indenting only the marker's line would
 * strand the continuation at the old column, where it stops being part of the
 * item at all.
 */

/** The innermost `ListItem` containing `pos`, or null if it is not in a list. */
function itemAt(state: EditorState, pos: number): SyntaxNode | null {
  // Side 1 for the same reason continuation.ts uses it: at a line start, side -1
  // resolves to whatever *ended* there, which is the line before.
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node && node.name !== "ListItem") node = node.parent;
  return node;
}

/** How far the item's own marker is indented. */
function markerColumn(state: EditorState, item: SyntaxNode): number {
  return item.from - state.doc.lineAt(item.from).from;
}

/**
 * The column an item's content starts in — where a child's marker has to reach.
 *
 * Measured from the parser's own `ListMark` and then across the spaces after it,
 * rather than assumed to be two. The marker is `-` or `9.` or `10.`, and the gap
 * after it is whatever the author typed.
 */
function contentColumn(state: EditorState, item: SyntaxNode): number {
  const line = state.doc.lineAt(item.from);
  const mark = item.firstChild;
  if (!mark || mark.name !== "ListMark") return markerColumn(state, item);

  let column = mark.to - line.from;
  while (column < line.text.length && line.text[column] === " ") column += 1;
  return column;
}

/** The item directly above this one at the same level, or null if it is the first. */
function siblingAbove(item: SyntaxNode): SyntaxNode | null {
  for (let node = item.prevSibling; node; node = node.prevSibling) {
    if (node.name === "ListItem") return node;
  }
  return null;
}

/** The item this one is nested inside, or null at the outermost level. */
function itemAbove(item: SyntaxNode): SyntaxNode | null {
  let node: SyntaxNode | null = item.parent;
  while (node && node.name !== "ListItem") node = node.parent;
  return node;
}

/**
 * Every list item the selection touches, with any item that is inside another one
 * dropped.
 *
 * Dropping the inner ones is what keeps a multi-item indent from flattening: a
 * parent's range already covers its children, so shifting the parent carries them
 * along at their existing relative depth. Shifting both would move the children
 * twice.
 *
 * Asked from each line's first non-space character rather than from its start,
 * so a continuation line resolves to the item it belongs to — pressing Tab
 * halfway through a wrapped item should indent that item, not nothing.
 */
function itemsInSelection(state: EditorState): SyntaxNode[] {
  const found = new Map<number, SyntaxNode>();

  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let number = first; number <= last; number += 1) {
      const line = state.doc.line(number);
      const indent = line.text.length - line.text.trimStart().length;
      const item = itemAt(state, line.from + indent);
      if (item) found.set(item.from, item);
    }
  }

  const all = [...found.values()];
  return all.filter((item) => !all.some((other) => other.from < item.from && other.to >= item.to));
}

/** The source lines an item occupies, continuation and nested children included. */
function linesOf(state: EditorState, item: SyntaxNode): { first: number; last: number } {
  const first = state.doc.lineAt(item.from).number;
  const end = state.doc.lineAt(item.to);
  // An item's range can stop exactly on the start of the following line. That line
  // is the next block's, not this item's.
  const last = end.from === item.to && item.to > item.from ? end.number - 1 : end.number;
  return { first, last: Math.max(first, last) };
}

/**
 * Move one item by `delta` columns, as a change per line.
 *
 * Blank lines are left alone. Padding one out to keep a rectangle would be adding
 * trailing whitespace to a line whose emptiness is the thing separating two
 * blocks.
 */
function shift(state: EditorState, item: SyntaxNode, delta: number): ChangeSpec[] {
  if (delta === 0) return [];

  const changes: ChangeSpec[] = [];
  const { first, last } = linesOf(state, item);

  for (let number = first; number <= last; number += 1) {
    const line = state.doc.line(number);
    if (line.text.trim() === "") continue;

    if (delta > 0) {
      changes.push({ from: line.from, insert: " ".repeat(delta) });
    } else {
      const indent = line.text.length - line.text.trimStart().length;
      const remove = Math.min(-delta, indent);
      if (remove > 0) changes.push({ from: line.from, to: line.from + remove });
    }
  }

  return changes;
}

/**
 * Tab and Shift-Tab over whatever list items the selection touches.
 *
 * Declines when the selection is in no list at all, and that is deliberate rather
 * than incidental. CodeMirror leaves Tab unbound by default so the keyboard can
 * leave a text surface, DESIGN.md §9 claims keyboard-only editing, and Escape
 * drops the caret without giving up focus — so Tab is the way out, and taking it
 * document-wide to serve lists would trap the keyboard everywhere else.
 *
 * Inside a list it always claims the key, even when nothing moves. The first item
 * of a list has nothing to nest under and an outermost item has nowhere to go out
 * to; in both cases the answer is that the key does nothing, not that focus leaps
 * out of the document in the middle of an edit.
 */
export function moveItems(direction: "in" | "out"): StateCommand {
  return ({ state, dispatch }) => {
    const items = itemsInSelection(state);
    if (items.length === 0) return false;

    const changes: ChangeSpec[] = [];
    for (const item of items) {
      const column = markerColumn(state, item);

      let delta: number;
      if (direction === "in") {
        const sibling = siblingAbove(item);
        // No sibling above means no item to become a child of, and CommonMark has
        // no way to write a list whose first item is already nested.
        delta = sibling ? Math.max(0, contentColumn(state, sibling) - column) : 0;
      } else {
        const parent = itemAbove(item);
        delta = Math.min(0, (parent ? markerColumn(state, parent) : 0) - column);
      }

      changes.push(...shift(state, item, delta));
    }

    if (changes.length === 0) return true;

    // No explicit selection: the changes are leading-whitespace edits at the front
    // of each line, so mapping through them keeps the caret where the text it was
    // sitting in went.
    dispatch(state.update({ changes, userEvent: "input.indent" }));
    return true;
  };
}

/**
 * Tab and Shift-Tab for list structure.
 *
 * A CodeMirror keymap rather than a workbench registry entry, on the same reasoning as
 * `markdownStructure`: §7.1's registry owns things with a chord, a description, and
 * a row in the Shortcut Reference, and Tab has none of those. It is text editing.
 */
export function listIndentation(): Extension {
  return keymap.of([
    { key: "Tab", run: moveItems("in") },
    { key: "Shift-Tab", run: moveItems("out") },
  ]);
}
