import { StateEffect, StateField, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import type { FindMatch } from "./matches";

interface FindDecorationUpdate {
  readonly matches: readonly FindMatch[];
  readonly active: number | null;
}

const replaceFindDecorations = StateEffect.define<FindDecorationUpdate>();
const MATCH = Decoration.mark({ class: "editor-find-match" });
const ACTIVE_MATCH = Decoration.mark({ class: "editor-find-match editor-find-match-active" });

function decorations({ matches, active }: FindDecorationUpdate): DecorationSet {
  const ranges: Range<Decoration>[] = matches.map((match, index) =>
    (index === active ? ACTIVE_MATCH : MATCH).range(match.from, match.to),
  );
  return Decoration.set(ranges, true);
}

const findDecorations = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    const replacement = transaction.effects.find((effect) => effect.is(replaceFindDecorations));
    return replacement ? decorations(replacement.value) : value.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function editorFindExtension(): Extension {
  return findDecorations;
}

export function showFindDecorations(
  view: EditorView,
  matches: readonly FindMatch[],
  active: number | null,
): void {
  view.dispatch({ effects: replaceFindDecorations.of({ matches, active }) });
}
