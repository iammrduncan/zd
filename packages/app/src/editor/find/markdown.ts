import { ensureSyntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";

import type { SourceRange } from "./matches";

export const MARKDOWN_PARSE_SLICE_MS = 12;

export interface MarkdownSourceVisibility {
  readonly ranges: readonly SourceRange[];
  readonly complete: boolean;
}

function normalized(ranges: readonly SourceRange[], length: number): SourceRange[] {
  const ordered = ranges
    .map(({ from, to }) => ({ from: Math.max(0, from), to: Math.min(length, to) }))
    .filter(({ from, to }) => to > from)
    .sort((left, right) => left.from - right.from || left.to - right.to);

  const result: SourceRange[] = [];
  for (const range of ordered) {
    const previous = result.at(-1);
    if (!previous || range.from > previous.to) {
      result.push(range);
      continue;
    }
    result[result.length - 1] = { from: previous.from, to: Math.max(previous.to, range.to) };
  }
  return result;
}

function subtract(
  ranges: readonly SourceRange[],
  exclusions: readonly SourceRange[],
  length: number,
): SourceRange[] {
  const cuts = normalized(exclusions, length);
  const result: SourceRange[] = [];

  for (const range of normalized(ranges, length)) {
    let cursor = range.from;
    for (const cut of cuts) {
      if (cut.to <= cursor) continue;
      if (cut.from >= range.to) break;
      if (cut.from > cursor) result.push({ from: cursor, to: Math.min(cut.from, range.to) });
      cursor = Math.max(cursor, cut.to);
      if (cursor >= range.to) break;
    }
    if (cursor < range.to) result.push({ from: cursor, to: range.to });
  }
  return result;
}

function directMarks(node: {
  readonly node: { readonly firstChild: SyntaxNodeLike | null };
}): SourceRange[] {
  const marks: SourceRange[] = [];
  for (let child = node.node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LinkMark" || child.name === "CodeMark") {
      marks.push({ from: child.from, to: child.to });
    }
  }
  return marks;
}

interface SyntaxNodeLike {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly nextSibling: SyntaxNodeLike | null;
}

/**
 * Real source ranges visible on the rendered Markdown surface.
 *
 * Tables and images replace their source, so their readable labels/cells are
 * explicitly added back. Long notation and destinations are subtracted. Raw
 * Mode is the identity mapping.
 */
export function markdownSourceVisibility(
  state: EditorState,
  raw: boolean,
): MarkdownSourceVisibility {
  const length = state.doc.length;
  if (raw || length === 0) {
    return { ranges: length === 0 ? [] : [{ from: 0, to: length }], complete: true };
  }

  // CodeMirror normally parses the viewport and a margin around it. Find needs
  // source honesty beyond that viewport, so it advances the same incremental
  // parse in a bounded slice. A caller schedules another frame when incomplete.
  const tree = ensureSyntaxTree(state, length, MARKDOWN_PARSE_SLICE_MS);
  if (!tree) return { ranges: [], complete: false };

  const replaced: SourceRange[] = [];
  const renderedSource: SourceRange[] = [];
  const hidden: SourceRange[] = [];

  tree.iterate({
    enter: (node) => {
      if (node.name === "Table") replaced.push({ from: node.from, to: node.to });
      if (node.name === "TableCell") renderedSource.push({ from: node.from, to: node.to });

      if (node.name === "Image") {
        replaced.push({ from: node.from, to: node.to });
        const marks = directMarks(node);
        if (marks.length >= 2 && marks[1]!.from > marks[0]!.to) {
          renderedSource.push({ from: marks[0]!.to, to: marks[1]!.from });
        }
        return;
      }

      if (node.name === "Link") {
        const marks = directMarks(node);
        if (marks.length >= 2) {
          hidden.push({ from: node.from, to: marks[0]!.to });
          hidden.push({ from: marks[1]!.from, to: node.to });
        }
        return;
      }

      if (node.name === "Autolink") {
        const marks = directMarks(node);
        if (marks.length >= 2) {
          hidden.push(marks[0]!, marks.at(-1)!);
        }
        return;
      }

      if (node.name === "HorizontalRule") {
        hidden.push({ from: node.from, to: node.to });
        return;
      }

      if (/^SetextHeading[12]$/.test(node.name)) {
        const underline = state.doc.lineAt(Math.max(node.from, node.to - 1));
        hidden.push({ from: underline.from, to: underline.to });
        return;
      }

      if (node.name === "FencedCode") {
        const marks = directMarks(node);
        if (marks.length >= 2) {
          const opening = state.doc.lineAt(marks[0]!.from);
          const closing = state.doc.lineAt(marks.at(-1)!.from);
          hidden.push(
            { from: opening.from, to: opening.to },
            { from: closing.from, to: closing.to },
          );
        }
        return;
      }

      if (node.name === "CodeBlock") {
        const first = state.doc.lineAt(node.from).number;
        const last = state.doc.lineAt(Math.max(node.from, node.to - 1)).number;
        for (let number = first; number <= last; number++) {
          const line = state.doc.line(number);
          const indent = /^ {1,4}/.exec(line.text)?.[0].length ?? 0;
          if (indent > 0) hidden.push({ from: line.from, to: line.from + indent });
        }
      }
    },
  });

  const base = subtract([{ from: 0, to: length }], replaced, length);
  const explicit = renderedSource.flatMap((range) => {
    const nested = replaced.filter(
      (candidate) => candidate.from >= range.from && candidate.to <= range.to,
    );
    return subtract([range], nested, length);
  });
  return {
    ranges: normalized(subtract([...base, ...explicit], hidden, length), length),
    complete: true,
  };
}

export function visibleMarkdownSourceRanges(
  state: EditorState,
  raw: boolean,
): readonly SourceRange[] {
  return markdownSourceVisibility(state, raw).ranges;
}
