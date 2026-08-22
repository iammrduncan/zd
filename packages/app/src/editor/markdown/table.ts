import { syntaxTree } from "@codemirror/language";
import { Prec, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, keymap, WidgetType, type DecorationSet } from "@codemirror/view";

import { renderInlineMarkdown } from "./inline";
import { isRaw, rawModeChanged } from "./raw";

/**
 * Tables on the editing surface.
 *
 * "tables are not tables, they are the raw markdown" was the loudest of the look
 * complaints, and the 2026-07-29 decision puts tables in vision §6.1's *renders*
 * list by name: "Tables are the case that forced this: a raw pipe table is not
 * something a person reads."
 *
 * Its own file, and its own extension, for one hard reason: a table spans several
 * source lines, so replacing it means a **block** decoration, and CodeMirror
 * refuses those from a ViewPlugin — "Block decorations may not be specified via
 * plugins". They have to come from a `StateField`. Everything in notation.ts is an
 * inline decoration from a plugin and stays there; this is the one construct that
 * cannot live beside it.
 *
 * Read-only for now. The caret cannot enter a rendered table, and editing cells in
 * place is its own task (§4.2, phase 4). Until then a table is something you read
 * here and edit by other means — which is the same trade links already make.
 */

/** A rendered `<table>` standing in for its source lines. */
class TableWidget extends WidgetType {
  constructor(
    private readonly header: string[],
    private readonly rows: string[][],
    /** The source this was built from — the identity used to avoid rebuilding. */
    private readonly source: string,
  ) {
    super();
  }

  /**
   * Two widgets are the same widget when they came from the same source text.
   *
   * Without this CodeMirror rebuilds the DOM on every state change, which throws
   * away the table on each keystroke elsewhere in the document.
   */
  eq(other: TableWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const table = document.createElement("table");
    /*
     * Marks everything inside as rendered markdown, so md.css reaches it. The
     * cells hold real `code` and `a` elements rather than CodeMirror's mark
     * classes, so without this they match neither surface's selectors and a code span
     * in a cell reads as ordinary prose — reported 2026-07-31, and true since the
     * cells first rendered their markup.
     */
    table.classList.add("md-rendered");

    const head = table.createTHead().insertRow();
    for (const cell of this.header) {
      const th = document.createElement("th");
      th.append(renderInlineMarkdown(cell));
      head.append(th);
    }

    const body = table.createTBody();
    for (const row of this.rows) {
      const tr = body.insertRow();
      for (const cell of row) {
        /*
         * Rendered through the shared inline renderer, not assigned as text and
         * not assigned as HTML.
         *
         * Cell content comes off disk and is not ours, so the safety has to be at
         * the parse step rather than after it: `renderInlineMarkdown` runs the
         * surface's shared markdown-it with `html: false`, which escapes raw HTML,
         * validates link protocols, and replaces remote images before anything
         * can fetch them. Reusing it is also what makes a code span in a cell look
         * like a code span anywhere else — by construction, rather than by two
         * renderers happening to agree.
         */
        const td = tr.insertCell();
        td.append(renderInlineMarkdown(cell));
      }
    }

    return table;
  }

  /**
   * Let the editor ignore events inside the widget.
   *
   * True means "this is not editable content, do not try to map a position into
   * it". Selecting the table's text still works; typing into it does not, which is
   * the honest state until cell editing lands.
   */
  ignoreEvent(): boolean {
    return false;
  }
}

/** Split one `| a | b |` row into its cells. */
function cells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

/**
 * Is this the `| --- | :-- |` row?
 *
 * Pure notation — it carries the alignment and nothing a reader needs. Recognised
 * by shape rather than by asking the parser, because it is the one row whose
 * meaning is entirely structural.
 */
function isDelimiter(line: string): boolean {
  return /^\s*\|?[\s:-]*\|[\s:|-]*$/.test(line) && line.includes("-");
}

function tableDecorations(state: EditorState): DecorationSet {
  // §7.4: raw mode reveals the literal source, and a rendered table and its pipes
  // cannot both be on screen. Returning nothing is the whole of it — the source was
  // never edited, so it is simply there again.
  if (isRaw(state)) return Decoration.none;

  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;

      const source = state.doc.sliceString(node.from, node.to);
      const lines = source.split("\n").filter((line) => line.trim() !== "");
      if (lines.length < 2) return;

      const header = cells(lines[0]!);
      const rows = lines
        .slice(1)
        .filter((line) => !isDelimiter(line))
        .map(cells);

      ranges.push(
        Decoration.replace({
          widget: new TableWidget(header, rows, source),
          // The whole point, and the reason this needs a StateField: the range
          // crosses line boundaries, so it replaces blocks rather than inline text.
          block: true,
        }).range(node.from, node.to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

/**
 * Render every table in the document.
 *
 * A `StateField` rather than a `ViewPlugin`, and it therefore decorates the whole
 * document rather than only the visible ranges. That is a real cost on a very long
 * document and it is deliberate for now: a block decoration changes how tall the
 * document is, so computing it only for the viewport would make the scrollbar
 * jump as tables scrolled into view. §10's performance pass is the place to
 * revisit it, with a profile rather than a guess.
 */
const tables = StateField.define<DecorationSet>({
  create: (state) => tableDecorations(state),
  update: (value, transaction) => {
    // Recomputed when the text changes or when the parser finishes a region it
    // had not reached yet — the same incremental-parse case notation.ts handles.
    if (
      !transaction.docChanged &&
      !rawModeChanged(transaction.startState, transaction.state) &&
      syntaxTree(transaction.startState) === syntaxTree(transaction.state)
    ) {
      return value.map(transaction.changes);
    }
    return tableDecorations(transaction.state);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    /*
     * A rendered table is one thing to step past.
     *
     * The widget has no cursor positions of its own, so without this the caret can
     * be at an offset inside the pipes — which is why Up from below a table landed
     * above it, "no matter how far below you are" (feedback, 2026-07-30). Cell
     * editing will replace this with real positions inside the table; until then
     * stepping over it is the honest behaviour, and raw mode is how the source is
     * reached.
     *
     * **Still true, and no longer the whole story** (2026-07-30). One thing to step
     * past became one thing to step *over* entirely: measured, plain ArrowDown went
     * from line 83 to line 91 across a seven-line table in a single press. The
     * atomic range is right — it is what stops the caret landing at an offset with
     * no visual position — and `tableStops` below adds the boundary it left out.
     */
    EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
  ],
});

/** The rendered table covering `pos`, or null when there is not one. */
function tableAt(state: EditorState, pos: number): { from: number; to: number } | null {
  const drawn = state.field(tables, false);
  if (!drawn) return null;

  let found: { from: number; to: number } | null = null;
  drawn.between(pos, pos, (from, to) => {
    found = { from, to };
    return false;
  });
  return found;
}

/**
 * Vertical motion stops on a rendered table instead of stepping over it.
 *
 *   "tables still render weird and the caret never goes into them so they are never
 *    focused and it often skips them when going through doc" (feedback, 2026-07-30)
 *
 * Measured, and the report splits in two. option+arrow was already right — the block
 * jump walks *source* lines and a table's are not blank, so it lands on the table and
 * focus paints it. Plain ArrowDown was not: 83 → 91, the whole table in one press.
 *
 * Correct behaviour for a code editor, wrong for this one. §4.1 makes the caret the
 * focus target, so a construct the caret can never occupy is a construct that can
 * never be read at full contrast while you walk the document — which is the thing the
 * product is for.
 *
 * **One stop, at the range's start, and not a position inside it.** The interior has
 * no cursor positions and the atomic range above is deliberately keeping it that way
 * until cell editing exists; the start is a boundary rather than an interior, which is
 * the same position the block jump has always landed on.
 *
 * **Declines whenever the next line is not a table**, which is the `continuation.ts`
 * contract rather than `motion.ts`'s: several commands want the arrow keys, each
 * claims a different case, and everything this does not claim has to reach
 * `defaultKeymap` untouched. Claiming the key outright would mean reimplementing
 * vertical motion over wrapped rows, which is the library's job and not ours.
 *
 * Declines from *inside* the range too, which is what keeps the stop from being a
 * trap: the caret at the table's start arrows on to whatever follows.
 */
function tableStop(direction: 1 | -1) {
  return (view: EditorView): boolean => {
    const state = view.state;
    const range = state.selection.main;
    if (!range.empty) return false;

    // Already on the table: this press is the one that leaves it.
    if (tableAt(state, range.head)) return false;

    const line = state.doc.lineAt(range.head);
    const next = line.number + direction;
    if (next < 1 || next > state.doc.lines) return false;

    const crossing = tableAt(state, state.doc.line(next).from);
    if (!crossing) return false;

    view.dispatch({
      selection: { anchor: crossing.from },
      scrollIntoView: true,
      userEvent: "select",
    });
    return true;
  };
}

/**
 * The stops, as a keymap.
 *
 * Ahead of `defaultKeymap`, which is where ArrowUp and ArrowDown come from — and
 * plain arrows only. A shifted arrow is building a selection, and a selection that
 * jumped to a block boundary would not be the range the reader drew.
 *
 * `Prec.high` rather than an ordering in editor.ts, because this extension is
 * registered *after* `defaultKeymap` there and has to be: a table is a block
 * decoration, which only a `StateField` may provide, and that field sits with the
 * other markdown-only extensions. Splitting the keymap out to sit earlier in the list
 * would put one construct's behaviour in two places — the shape that made the command
 * registry drift. The precedence says the same thing where it can be read.
 */
function tableStops(): Extension {
  return Prec.high(
    keymap.of([
      { key: "ArrowDown", run: tableStop(1) },
      { key: "ArrowUp", run: tableStop(-1) },
    ]),
  );
}

/** Tables drawn as tables, and a caret that stops on them. */
export function markdownTables(): Extension {
  return [tables, tableStops()];
}
