import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { blockRange } from "./range";

export interface FocusRange {
  readonly from: number;
  readonly to: number;
}

export const WHOLE_TABLE_VIEWPORT_RATIO = 0.7;

/** A table is one reading block only while its complete rendered height stays comfortably visible. */
export function tableFitsFocusBlock(tableHeight: number, viewportHeight: number): boolean {
  return (
    Number.isFinite(tableHeight) &&
    Number.isFinite(viewportHeight) &&
    tableHeight >= 0 &&
    viewportHeight > 0 &&
    tableHeight <= viewportHeight &&
    tableHeight <= viewportHeight * WHOLE_TABLE_VIEWPORT_RATIO
  );
}

function topLevelTableAt(state: EditorState, pos: number): SyntaxNode | null {
  for (const side of [1, -1] as const) {
    let node = syntaxTree(state).resolveInner(pos, side);
    while (node.parent?.parent) node = node.parent;
    if (node.name === "Table") return node;
  }
  return null;
}

/** Rendered table rows, with the hidden delimiter source attached to the header row. */
export function tableFocusRows(state: EditorState, pos: number): readonly FocusRange[] | null {
  const table = topLevelTableAt(state, pos);
  if (!table) return null;
  const header = table.getChild("TableHeader");
  if (!header) return null;
  const body = table.getChildren("TableRow");
  const firstBody = body[0];
  const headerTo = firstBody
    ? state.doc.line(state.doc.lineAt(firstBody.from).number - 1).to
    : table.to;
  return [{ from: header.from, to: headerTo }, ...body.map(({ from, to }) => ({ from, to }))];
}

function tableElement(view: EditorView, from: number): HTMLTableElement | null {
  return view.contentDOM.querySelector<HTMLTableElement>(`table[data-table-from="${from}"]`);
}

function tableRange(state: EditorState, pos: number): FocusRange | null {
  const table = topLevelTableAt(state, pos);
  return table ? { from: table.from, to: table.to } : null;
}

/** Paragraph focus with the viewport-aware table rule layered onto parser-owned blocks. */
export function viewportBlockRange(view: EditorView, pos: number): FocusRange {
  const whole = tableRange(view.state, pos);
  if (!whole) return blockRange(view.state, pos);
  const surface = view.dom.closest<HTMLElement>(".md-surface");
  const table = tableElement(view, whole.from);
  if (!surface || !table) return whole;
  if (
    tableFitsFocusBlock(
      table.getBoundingClientRect().height,
      surface.getBoundingClientRect().height,
    )
  ) {
    return whole;
  }
  const rows = tableFocusRows(view.state, pos);
  return rows?.find(({ from, to }) => pos >= from && pos <= to) ?? whole;
}

/** The rendered box represented by a whole-table or table-row focus range. */
export function tableFocusElement(view: EditorView, range: FocusRange): HTMLElement | null {
  for (const candidate of view.contentDOM.querySelectorAll<HTMLTableElement>(
    "table[data-table-from][data-table-to]",
  )) {
    const from = Number(candidate.dataset.tableFrom);
    const to = Number(candidate.dataset.tableTo);
    if (range.from === from && range.to === to) return candidate;
    if (range.from < from || range.to > to) continue;
    const rows = tableFocusRows(view.state, from);
    const index = rows?.findIndex(
      ({ from: rowFrom, to: rowTo }) => rowFrom === range.from && rowTo === range.to,
    );
    if (index !== undefined && index >= 0) return candidate.rows.item(index);
  }
  return null;
}
