import { syntaxTree } from "@codemirror/language";
import {
  Prec,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from "@codemirror/state";
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
 * Each rendered cell is a small plaintext editing boundary. Its input rewrites the
 * corresponding `TableCell` range in the CodeMirror document, so the table remains
 * readerly without becoming a second buffer that can drift from the Markdown.
 */

interface EditableCell {
  readonly from: number;
  readonly to: number;
  readonly source: string;
}

interface EditableTable {
  readonly from: number;
  readonly to: number;
  readonly header: readonly EditableCell[];
  readonly rows: readonly (readonly EditableCell[])[];
  readonly source: string;
}

interface MeasuredTableHeight {
  readonly from: number;
  readonly height: number;
}

/*
 * Carry the rendered block's height through a source edit.
 *
 * CodeMirror rebuilds the height-map node touched by a document change before it
 * measures the updated DOM. A block widget without an estimate starts that pass at
 * one prose line high. A rendered table is several lines high, so while one of its
 * cells owns focus CodeMirror preserves the external scroll anchor against that
 * temporary collapse and moves `.md-surface` by almost the table's full height.
 * The next measure restores the table height, but the scroll has already moved.
 *
 * The table DOM is present at the input boundary, so its current border-box is the
 * exact estimate for the next state. Mapping `from` keeps the effect in the new
 * document's coordinate space if a transaction ever changes content before it.
 */
const measuredTableHeight = StateEffect.define<MeasuredTableHeight>({
  map: ({ from, height }, changes) => ({ from: changes.mapPos(from, -1), height }),
});

type MarkdownTree = ReturnType<typeof syntaxTree>;
type MarkdownNode = ReturnType<MarkdownTree["resolve"]>;

function trimmedCell(state: EditorState, from: number, to: number): EditableCell {
  const source = state.doc.sliceString(from, to);
  const leading = source.match(/^\s*/u)?.[0].length ?? 0;
  const trailing = source.match(/\s*$/u)?.[0].length ?? 0;
  const contentFrom = from + leading;
  const contentTo = Math.max(contentFrom, to - trailing);
  return {
    from: contentFrom,
    to: contentTo,
    source: state.doc.sliceString(contentFrom, contentTo),
  };
}

/** Read editable cell ranges from parser-owned delimiters, including empty cells. */
function rowCells(state: EditorState, row: MarkdownNode): readonly EditableCell[] {
  const delimiters = row
    .getChildren("TableDelimiter")
    .filter(
      (delimiter) =>
        delimiter.to - delimiter.from === 1 &&
        state.doc.sliceString(delimiter.from, delimiter.to) === "|",
    );
  if (delimiters.length === 0) return [trimmedCell(state, row.from, row.to)];

  const ranges: EditableCell[] = [];
  let from = row.from;
  for (const delimiter of delimiters) {
    if (delimiter.from > from) ranges.push(trimmedCell(state, from, delimiter.from));
    else if (delimiter.from > row.from) ranges.push(trimmedCell(state, from, from));
    from = delimiter.to;
  }
  if (from < row.to) ranges.push(trimmedCell(state, from, row.to));
  return ranges;
}

function tableModel(state: EditorState, table: MarkdownNode): EditableTable | null {
  const header = table.getChild("TableHeader");
  if (!header) return null;
  const headerCells = rowCells(state, header);
  if (headerCells.length === 0) return null;
  const rows = table.getChildren("TableRow").map((row) => rowCells(state, row));
  return {
    from: table.from,
    to: table.to,
    header: headerCells,
    rows,
    source: state.doc.sliceString(table.from, table.to),
  };
}

function tableModelAt(state: EditorState, from: number): EditableTable | null {
  let found: EditableTable | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table" || node.from !== from) return;
      found = tableModel(state, node.node);
    },
  });
  return found;
}

function editableText(value: string): string {
  return value.replace(/\r?\n/gu, " ").replace(/\|/gu, "\\|");
}

function cellAt(table: EditableTable, row: number, column: number): EditableCell | null {
  const cells = row === 0 ? table.header : table.rows[row - 1];
  return cells?.[column] ?? null;
}

function sourceEdge(cell: HTMLTableCellElement, edge: "start" | "end"): number | null {
  const value = Number(edge === "start" ? cell.dataset.tableCellFrom : cell.dataset.tableCellTo);
  return Number.isSafeInteger(value) ? value : null;
}

/** A rendered `<table>` standing in for its source lines. */
class TableWidget extends WidgetType {
  private stopCrossCellSelection: (() => void) | null = null;

  constructor(
    private readonly table: EditableTable,
    private readonly measuredHeight = -1,
  ) {
    super();
  }

  get estimatedHeight(): number {
    return this.measuredHeight;
  }

  /**
   * Two widgets are the same widget when they came from the same source text.
   *
   * Without this CodeMirror rebuilds the DOM on every state change, which throws
   * away the table on each keystroke elsewhere in the document.
   */
  eq(other: TableWidget): boolean {
    return other.table.from === this.table.from && other.table.source === this.table.source;
  }

  private renderCell(
    element: HTMLTableCellElement,
    cell: EditableCell,
    view: EditorView,
    row: number,
    column: number,
  ): void {
    element.replaceChildren(renderInlineMarkdown(cell.source));
    element.setAttribute("contenteditable", "plaintext-only");
    element.setAttribute("aria-label", `Edit table cell, row ${row + 1}, column ${column + 1}`);
    element.dataset.tableRow = String(row);
    element.dataset.tableColumn = String(column);
    element.dataset.tableCellFrom = String(cell.from);
    element.dataset.tableCellTo = String(cell.to);

    element.addEventListener("input", () => {
      const tableElement = element.closest<HTMLTableElement>("table[data-table-from]");
      const from = Number(tableElement?.dataset.tableFrom);
      if (!Number.isSafeInteger(from)) return;
      const currentTable = tableModelAt(view.state, from);
      if (!currentTable) return;
      const currentCell = cellAt(currentTable, row, column);
      if (!currentCell) return;
      const insert = editableText(element.textContent ?? "");
      if (insert === currentCell.source) return;
      const height = tableElement?.getBoundingClientRect().height ?? -1;
      view.dispatch({
        changes: { from: currentCell.from, to: currentCell.to, insert },
        effects: height > 0 ? measuredTableHeight.of({ from: currentTable.from, height }) : [],
        userEvent: "input.table",
      });
    });
    element.addEventListener("blur", () => {
      const tableElement = element.closest<HTMLTableElement>("table[data-table-from]");
      const from = Number(tableElement?.dataset.tableFrom);
      if (!Number.isSafeInteger(from)) return;
      const currentTable = tableModelAt(view.state, from);
      const currentCell = currentTable ? cellAt(currentTable, row, column) : null;
      if (currentCell) element.replaceChildren(renderInlineMarkdown(currentCell.source));
    });
    element.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "a" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        const tableElement = element.closest<HTMLTableElement>("table[data-table-from]");
        const from = Number(tableElement?.dataset.tableFrom);
        const currentTable = Number.isSafeInteger(from) ? tableModelAt(view.state, from) : null;
        if (!currentTable) return;
        event.preventDefault();
        view.dispatch({
          selection: { anchor: currentTable.from, head: currentTable.to },
          scrollIntoView: true,
          userEvent: "select.table",
        });
        view.focus();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      element.blur();
    });
  }

  /**
   * Extend a pointer selection across the table's separate editing hosts.
   *
   * Native selection stops at one `contenteditable` cell. Once the pointer crosses
   * into another cell, the table owns the gesture: it paints the participating
   * cells, reports the matching source range to CodeMirror, and supplies their
   * rendered text to Copy. A gesture inside one cell remains native cell editing.
   */
  private bindCrossCellSelection(table: HTMLTableElement, view: EditorView): void {
    let anchor: HTMLTableCellElement | null = null;
    let current: HTMLTableCellElement | null = null;
    let crossing = false;

    const clear = (): void => {
      for (const cell of table.querySelectorAll<HTMLElement>("[data-table-selected]")) {
        delete cell.dataset.tableSelected;
      }
    };

    const paint = (): void => {
      if (!anchor || !current || anchor === current) return;
      const anchorFrom = sourceEdge(anchor, "start");
      const currentFrom = sourceEdge(current, "start");
      if (anchorFrom === null || currentFrom === null) return;

      const forward = anchorFrom < currentFrom;
      const sourceAnchor = sourceEdge(anchor, forward ? "start" : "end");
      const sourceHead = sourceEdge(current, forward ? "end" : "start");
      if (sourceAnchor === null || sourceHead === null) return;

      const cells = [...table.querySelectorAll<HTMLTableCellElement>("th, td")];
      const selectionFrom = Math.min(cells.indexOf(anchor), cells.indexOf(current));
      const selectionTo = Math.max(cells.indexOf(anchor), cells.indexOf(current));
      cells.forEach((cell, index) => {
        if (index >= selectionFrom && index <= selectionTo) {
          cell.dataset.tableSelected = "true";
        } else {
          delete cell.dataset.tableSelected;
        }
      });

      view.dispatch({
        selection: { anchor: sourceAnchor, head: sourceHead },
        scrollIntoView: false,
        userEvent: "select.pointer",
      });
    };

    const cleanup = (): void => {
      anchor = null;
      current = null;
      crossing = false;
      window.removeEventListener("mousemove", move, true);
      window.removeEventListener("mouseup", finish, true);
    };

    const move = (event: MouseEvent): void => {
      if (!anchor) return;
      const hit = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLTableCellElement>("th, td");
      if (!hit || !table.contains(hit)) return;
      current = hit;
      if (current !== anchor) crossing = true;
      if (!crossing) return;
      event.preventDefault();
      paint();
    };

    const finish = (event: MouseEvent): void => {
      if (crossing) {
        event.preventDefault();
        paint();
      }
      cleanup();
    };

    table.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const cell =
        event.target instanceof Element
          ? event.target.closest<HTMLTableCellElement>("th, td")
          : null;
      if (!cell || !table.contains(cell)) return;
      clear();
      anchor = cell;
      current = cell;
      crossing = false;
      window.addEventListener("mousemove", move, { capture: true, passive: false });
      window.addEventListener("mouseup", finish, { capture: true, passive: false });
    });

    table.addEventListener("copy", (event) => {
      const selected = [...table.querySelectorAll<HTMLTableCellElement>("[data-table-selected]")];
      if (selected.length === 0 || !event.clipboardData) return;

      event.preventDefault();
      const rows = new Map<HTMLTableRowElement, string[]>();
      for (const cell of selected) {
        const row = cell.closest("tr");
        if (!row) continue;
        const values = rows.get(row) ?? [];
        values.push(cell.innerText);
        rows.set(row, values);
      }
      event.clipboardData.setData(
        "text/plain",
        [...rows.values()].map((values) => values.join("\t")).join("\n"),
      );
    });

    const clearOutside = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || !table.contains(event.target)) clear();
    };
    view.dom.addEventListener("mousedown", clearOutside, true);
    this.stopCrossCellSelection = () =>
      view.dom.removeEventListener("mousedown", clearOutside, true);
  }

  toDOM(view: EditorView): HTMLElement {
    const table = document.createElement("table");
    /*
     * Marks everything inside as rendered markdown, so md.css reaches it. The
     * cells hold real `code` and `a` elements rather than CodeMirror's mark
     * classes, so without this they match neither surface's selectors and a code span
     * in a cell reads as ordinary prose — reported 2026-07-31, and true since the
     * cells first rendered their markup.
     */
    table.classList.add("md-rendered");
    table.dataset.tableFrom = String(this.table.from);
    table.dataset.tableTo = String(this.table.to);

    const head = table.createTHead().insertRow();
    this.table.header.forEach((cell, column) => {
      const th = document.createElement("th");
      this.renderCell(th, cell, view, 0, column);
      head.append(th);
    });

    const body = table.createTBody();
    this.table.rows.forEach((row, rowIndex) => {
      const tr = body.insertRow();
      row.forEach((cell, column) => {
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
        this.renderCell(td, cell, view, rowIndex + 1, column);
      });
    });

    this.bindCrossCellSelection(table, view);

    return table;
  }

  updateDOM(dom: HTMLElement): boolean {
    if (!(dom instanceof HTMLTableElement)) return false;
    const cells = [...dom.querySelectorAll<HTMLTableCellElement>("th, td")];
    const nextCells = [this.table.header, ...this.table.rows].flat();
    if (cells.length !== nextCells.length) return false;
    dom.dataset.tableFrom = String(this.table.from);
    dom.dataset.tableTo = String(this.table.to);
    cells.forEach((element, index) => {
      element.dataset.tableCellFrom = String(nextCells[index]!.from);
      element.dataset.tableCellTo = String(nextCells[index]!.to);
      if (element === document.activeElement) return;
      element.replaceChildren(renderInlineMarkdown(nextCells[index]!.source));
    });
    return true;
  }

  destroy(): void {
    this.stopCrossCellSelection?.();
    this.stopCrossCellSelection = null;
  }

  /**
   * Cell DOM owns editing events; the rest of the widget still maps pointer intent
   * to the table boundary for caret navigation and focus behavior.
   */
  ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest("[contenteditable]") !== null;
  }
}

function tableDecorations(
  state: EditorState,
  measuredHeights: ReadonlyMap<number, number> = new Map(),
): DecorationSet {
  // §7.4: raw mode reveals the literal source, and a rendered table and its pipes
  // cannot both be on screen. Returning nothing is the whole of it — the source was
  // never edited, so it is simply there again.
  if (isRaw(state)) return Decoration.none;

  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;

      const table = tableModel(state, node.node);
      if (!table) return;

      ranges.push(
        Decoration.replace({
          widget: new TableWidget(table, measuredHeights.get(table.from)),
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
    const measuredHeights = new Map<number, number>();
    for (const effect of transaction.effects) {
      if (effect.is(measuredTableHeight)) {
        measuredHeights.set(effect.value.from, effect.value.height);
      }
    }
    return tableDecorations(transaction.state, measuredHeights);
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    /*
     * A rendered table is one thing to step past.
     *
     * The widget's editable cells own native DOM carets and map their input back to
     * exact source ranges. CodeMirror still has no visual positions for the pipes
     * between those cells, so without this its caret can sit at an invisible source
     * offset — which is why Up from below a table landed above it, "no matter how
     * far below you are" (feedback, 2026-07-30). Atomic source navigation and cell
     * editing are complementary: one crosses the construct, the other edits it.
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
 * **One CodeMirror stop, at the range's start, and not an invisible source position
 * inside it.** A pointer can focus the rendered cell's own DOM caret; arrowing through
 * the surrounding document uses the source boundary, which is the same position the
 * block jump has always landed on.
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
