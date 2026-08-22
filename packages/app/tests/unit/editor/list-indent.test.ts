import { markdown } from "@codemirror/lang-markdown";
import {
  EditorSelection,
  EditorState,
  type SelectionRange,
  type Transaction,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { moveItems } from "@/editor/markdown/lists";

/*
 * Tab and Shift-Tab on list items, measured on the state rather than on screen.
 *
 * These commands are a pure function of the document and the selection: text and
 * a parse tree in, a change set out. Nothing about them depends on layout, so a
 * browser adds only latency — and it takes something away, because a selection
 * spanning three items is one `EditorSelection.range` here and several
 * Shift+ArrowDown presses over *wrapped visual rows* there.
 *
 * That difference is not hypothetical. The e2e spec's multi-item case went on
 * passing after the ancestor-dropping filter was deleted, because arrowing down
 * over wrapped rows did not select what it appeared to. The nested case below
 * fails without that filter, which is what a test for it is meant to do.
 *
 * The e2e spec still earns its place: it is the only thing proving these commands
 * are bound to Tab and Shift-Tab at all, and that Tab in prose reaches the browser.
 */

const DOC = [
  "- first item",
  "- second item",
  "  - a nested item that runs long",
  "    and wraps onto another line",
  "  - another nested item",
  "- an item that wraps",
  "  onto a second line",
  "",
  "9. a single-digit step",
  "10. a double-digit step",
  "",
  "Just a paragraph.",
].join("\n");

/** Offset of the start of one-based `line`. */
function startOf(line: number): number {
  return DOC.split("\n")
    .slice(0, line - 1)
    .reduce((total, text) => total + text.length + 1, 0);
}

/** Run the command over `selection`, and report the document and whether it claimed the key. */
function move(direction: "in" | "out", selection: SelectionRange) {
  const state = EditorState.create({
    doc: DOC,
    selection: EditorSelection.create([selection]),
    extensions: [markdown()],
  });

  let doc = DOC;
  const claimed = moveItems(direction)({
    state,
    dispatch: (transaction: Transaction) => {
      doc = transaction.state.doc.toString();
    },
  });

  return { lines: doc.split("\n"), doc, claimed };
}

const caretOn = (line: number, column = 4) => EditorSelection.cursor(startOf(line) + column);

describe("Tab", () => {
  it("indents an item to its previous sibling's content column", () => {
    // Line 5 is `  - another nested item`; the item above it puts content at 4.
    const { lines, claimed } = move("in", caretOn(5));

    expect(claimed).toBe(true);
    expect(lines[4]).toBe("    - another nested item");
  });

  it("indents by the marker's width on an ordered list, not by a fixed two", () => {
    const { lines } = move("in", caretOn(10));

    // `9. ` puts content at column 3. Two spaces would leave this short of it, and
    // CommonMark would read a second list rather than a nested one — markdown that
    // parses, renders wrongly, and looks like the feature working.
    expect(lines[9]).toBe("   10. a double-digit step");
  });

  it("moves every line of an item that wraps", () => {
    const { lines } = move("in", caretOn(6));

    expect(lines[5]).toBe("  - an item that wraps");
    expect(lines[6], "the continuation line was left behind").toBe("    onto a second line");
  });

  it("indents from a continuation line, not only from the marker's line", () => {
    // The caret is on line 7, which carries no marker of its own.
    const { lines, claimed } = move("in", caretOn(7));

    expect(claimed).toBe(true);
    expect(lines[5]).toBe("  - an item that wraps");
  });

  it("does nothing to the first item of a list but still claims the key", () => {
    const { doc, claimed } = move("in", caretOn(1));

    expect(doc, "the first item indented into something that is not a list").toBe(DOC);
    // Claimed anyway: focus leaping out of the document mid-edit is worse than a
    // key that does nothing.
    expect(claimed).toBe(true);
  });

  it("declines in prose so Tab keeps its traversal meaning", () => {
    const { doc, claimed } = move("in", caretOn(12));

    expect(doc).toBe(DOC);
    expect(claimed, "Tab was swallowed outside a list").toBe(false);
  });

  it("indents a parent and its children as one, without moving the children twice", () => {
    const { lines } = move("in", EditorSelection.range(startOf(2), startOf(5) + 3));

    /*
     * The case the e2e spec could not reach. Without dropping items that sit inside
     * another selected item, the nested ones are shifted once by their parent's
     * change and again by their own, and the list comes out with its relative
     * nesting destroyed rather than preserved.
     */
    expect(lines.slice(1, 5)).toEqual([
      "  - second item",
      "    - a nested item that runs long",
      "      and wraps onto another line",
      "    - another nested item",
    ]);
  });

  it("leaves a blank line inside the selection unpadded", () => {
    const { lines } = move("in", EditorSelection.range(startOf(6), startOf(9) + 3));

    // Padding it out to keep a rectangle would add trailing whitespace to the line
    // whose emptiness is what separates two blocks.
    expect(lines[7]).toBe("");
  });
});

describe("Shift-Tab", () => {
  it("outdents a nested item to its parent's column", () => {
    const { lines } = move("out", caretOn(5));

    expect(lines[4]).toBe("- another nested item");
  });

  it("carries a nested item's own continuation line out with it", () => {
    const { lines } = move("out", caretOn(3));

    expect(lines[2]).toBe("- a nested item that runs long");
    expect(lines[3]).toBe("  and wraps onto another line");
  });

  it("leaves an outermost item alone and still claims the key", () => {
    const { doc, claimed } = move("out", caretOn(2));

    expect(doc).toBe(DOC);
    expect(claimed).toBe(true);
  });

  it("declines in prose", () => {
    const { claimed } = move("out", caretOn(12));

    expect(claimed, "Shift-Tab was swallowed outside a list").toBe(false);
  });

  it("undoes an indent exactly", () => {
    // Round trip, because the two commands compute their targets from different
    // ends — one from the sibling above, one from the parent — and nothing else
    // here would notice if those two answers stopped agreeing.
    const state = EditorState.create({
      doc: DOC,
      selection: EditorSelection.create([caretOn(5)]),
      extensions: [markdown()],
    });

    let indented = DOC;
    moveItems("in")({
      state,
      dispatch: (transaction: Transaction) => {
        indented = transaction.state.doc.toString();
      },
    });
    expect(indented).not.toBe(DOC);

    const next = EditorState.create({
      doc: indented,
      selection: EditorSelection.create([caretOn(5)]),
      extensions: [markdown()],
    });
    let back = indented;
    moveItems("out")({
      state: next,
      dispatch: (transaction: Transaction) => {
        back = transaction.state.doc.toString();
      },
    });

    expect(back).toBe(DOC);
  });
});
