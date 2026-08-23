import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export interface MermaidFence {
  readonly from: number;
  readonly to: number;
  readonly source: string;
}

/** Resolve one complete, explicitly labelled Mermaid fence from the Markdown tree. */
export function mermaidFence(state: EditorState, node: SyntaxNode): MermaidFence | null {
  if (node.name !== "FencedCode") return null;

  const marks = node.getChildren("CodeMark");
  const info = node.getChild("CodeInfo");
  const content = node.getChild("CodeText");
  if (
    marks.length !== 2 ||
    !info ||
    state.doc.sliceString(info.from, info.to).trim().toLowerCase() !== "mermaid"
  ) {
    return null;
  }

  return {
    from: node.from,
    to: node.to,
    source: content ? state.doc.sliceString(content.from, content.to) : "",
  };
}
