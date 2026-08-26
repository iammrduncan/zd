import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";

import { isRaw, rawModeChanged } from "../markdown/raw";
import { renderMermaidDiagram } from "./render";
import { mermaidFence } from "./source";
import { openMermaidViewer } from "./viewer";

import "./styles.css";

export type MermaidDocumentMode = "markdown" | "standalone";

interface DiagramSource {
  readonly from: number;
  readonly to: number;
  readonly source: string;
}

class MermaidWidget extends WidgetType {
  constructor(private readonly source: string) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const figure = document.createElement("figure");
    figure.className = "md-mermaid-diagram md-rendered";
    const diagram = renderMermaidDiagram(this.source);
    if (diagram) {
      figure.setAttribute("aria-label", diagram.getAttribute("aria-label") ?? "Mermaid diagram");
      figure.append(diagram);
      const expand = document.createElement("button");
      expand.type = "button";
      expand.className = "md-mermaid-expand";
      expand.setAttribute("aria-label", "Expand Mermaid diagram");
      expand.textContent = "↗";
      expand.addEventListener("click", () => openMermaidViewer(this.source));
      figure.append(expand);
    } else {
      const source = document.createElement("pre");
      source.textContent = this.source;
      figure.append(source);
    }
    return figure;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function diagramSources(state: EditorState, mode: MermaidDocumentMode): readonly DiagramSource[] {
  if (mode === "standalone") {
    return state.doc.length > 0
      ? [{ from: 0, to: state.doc.length, source: state.doc.toString() }]
      : [];
  }

  const diagrams: DiagramSource[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      const fence = mermaidFence(state, node.node);
      if (fence) diagrams.push(fence);
    },
  });
  return diagrams;
}

function diagramDecorations(state: EditorState, mode: MermaidDocumentMode): DecorationSet {
  if (isRaw(state)) return Decoration.none;

  const ranges: Range<Decoration>[] = [];
  for (const diagram of diagramSources(state, mode)) {
    if (!renderMermaidDiagram(diagram.source)) continue;
    ranges.push(
      Decoration.replace({ widget: new MermaidWidget(diagram.source), block: true }).range(
        diagram.from,
        diagram.to,
      ),
    );
  }
  return Decoration.set(ranges, true);
}

/** Render Mermaid fences or a standalone Mermaid document from the same source-backed field. */
export function mermaidDiagrams(mode: MermaidDocumentMode): Extension {
  const diagrams = StateField.define<DecorationSet>({
    create: (state) => diagramDecorations(state, mode),
    update: (value, transaction) => {
      const parserChanged =
        mode === "markdown" && syntaxTree(transaction.startState) !== syntaxTree(transaction.state);
      if (
        !transaction.docChanged &&
        !rawModeChanged(transaction.startState, transaction.state) &&
        !parserChanged
      ) {
        return value.map(transaction.changes);
      }
      return diagramDecorations(transaction.state, mode);
    },
    provide: (field) => [
      EditorView.decorations.from(field),
      EditorView.atomicRanges.of((view) => view.state.field(field, false) ?? Decoration.none),
    ],
  });
  return diagrams;
}
