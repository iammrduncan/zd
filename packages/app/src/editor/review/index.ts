/** Document-local review marks owned by the editor rather than a product surface. */
import { StateEffect, StateField, type Extension, type Text } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";

import "./styles.css";

export interface CommentTag {
  id: string;
  line: number;
  text: string;
}

export interface ReviewSelection {
  from: number;
  to: number;
  startLine: number;
  endLine: number;
  text: string;
  rect: { left: number; bottom: number };
}

interface ReviewCallbacks {
  activate(id: string): void;
  select(selection: ReviewSelection | null): void;
}

const replaceTags = StateEffect.define<readonly CommentTag[]>();

class CommentWidget extends WidgetType {
  constructor(
    readonly tag: CommentTag,
    readonly activate: (id: string) => void,
  ) {
    super();
  }

  eq(other: CommentWidget): boolean {
    return other.tag.id === this.tag.id && other.tag.text === this.tag.text;
  }

  toDOM(): HTMLElement {
    const button = document.createElement("button");
    button.className = "md-comment-tag";
    button.type = "button";
    button.textContent = this.tag.text;
    button.setAttribute("aria-label", `Comment: ${this.tag.text}`);
    button.addEventListener("click", () => this.activate(this.tag.id));
    return button;
  }
}

function decorations(
  doc: Text,
  tags: readonly CommentTag[],
  activate: (id: string) => void,
): DecorationSet {
  const ranges = tags.map((tag) => {
    const line = doc.line(Math.max(1, Math.min(tag.line, doc.lines)));
    return Decoration.widget({ widget: new CommentWidget(tag, activate), side: 1 }).range(line.to);
  });
  return Decoration.set(ranges, true);
}

function commentTagging(activate: (id: string) => void): Extension {
  return StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update: (current, transaction) => {
      const replacement = transaction.effects.find((effect) => effect.is(replaceTags));
      return replacement
        ? decorations(transaction.state.doc, replacement.value, activate)
        : current.map(transaction.changes);
    },
    provide: (value) => EditorView.decorations.from(value),
  });
}

/** Selection reporting and line-attached tags for an owning review workflow. */
export function reviewAnnotations(callbacks: ReviewCallbacks): Extension {
  const selections = ViewPlugin.fromClass(
    class {
      private generation = 0;
      private alive = true;

      update(update: ViewUpdate): void {
        if (update.selectionSet || (update.docChanged && !update.state.selection.main.empty)) {
          this.report(update.view);
        }
      }

      private report(view: EditorView): void {
        const generation = ++this.generation;
        queueMicrotask(() => {
          if (!this.alive || generation !== this.generation) return;
          const range = view.state.selection.main;
          if (range.empty) {
            callbacks.select(null);
            return;
          }

          const position = view.coordsAtPos(range.head, range.head === range.to ? 1 : -1);
          if (!position) {
            callbacks.select(null);
            return;
          }

          const end = Math.max(range.from, range.to - 1);
          callbacks.select({
            from: range.from,
            to: range.to,
            startLine: view.state.doc.lineAt(range.from).number,
            endLine: view.state.doc.lineAt(end).number,
            text: view.state.sliceDoc(range.from, range.to),
            rect: { left: position.left, bottom: position.bottom },
          });
        });
      }

      destroy(): void {
        this.alive = false;
        this.generation += 1;
        callbacks.select(null);
      }
    },
  );

  return [commentTagging(callbacks.activate), selections];
}

/** Replace every visible review tag in one editor. */
export function setCommentTags(view: EditorView, tags: readonly CommentTag[]): void {
  view.dispatch({ effects: replaceTags.of(tags) });
}
