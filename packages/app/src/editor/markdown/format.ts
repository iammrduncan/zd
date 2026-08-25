import type { EditorView } from "@codemirror/view";

export type MarkdownFormat = "bold" | "italic" | "code" | "link";

interface Delimiters {
  readonly open: string;
  readonly close: string;
}

const DELIMITERS: Record<Exclude<MarkdownFormat, "link">, Delimiters> = {
  bold: { open: "**", close: "**" },
  italic: { open: "_", close: "_" },
  code: { open: "`", close: "`" },
};

function wrap(view: EditorView, delimiters: Delimiters): boolean {
  const range = view.state.selection.main;
  const selected = view.state.doc.sliceString(range.from, range.to);
  const before = range.from - delimiters.open.length;
  const after = range.to + delimiters.close.length;
  const alreadyWrapped =
    !range.empty &&
    before >= 0 &&
    after <= view.state.doc.length &&
    view.state.doc.sliceString(before, range.from) === delimiters.open &&
    view.state.doc.sliceString(range.to, after) === delimiters.close;

  if (alreadyWrapped) {
    view.dispatch({
      changes: [
        { from: before, to: range.from },
        { from: range.to, to: after },
      ],
      selection: {
        anchor: before,
        head: range.to - delimiters.open.length,
      },
      scrollIntoView: true,
      userEvent: "input.format",
    });
    return true;
  }

  const insert = `${delimiters.open}${selected}${delimiters.close}`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: {
      anchor: range.from + delimiters.open.length,
      head: range.from + delimiters.open.length + selected.length,
    },
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}

/** Apply one directly editable Markdown format without giving commands the EditorView. */
export function formatMarkdown(view: EditorView, format: MarkdownFormat): boolean {
  if (format !== "link") return wrap(view, DELIMITERS[format]);

  const range = view.state.selection.main;
  if (range.empty) return false;
  const selected = view.state.doc.sliceString(range.from, range.to);
  if (!/^https?:\/\/\S+$/iu.test(selected)) return false;

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: `<${selected}>` },
    selection: { anchor: range.to + 2 },
    scrollIntoView: true,
    userEvent: "input.format",
  });
  return true;
}
