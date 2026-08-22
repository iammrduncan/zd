import type { EditorView } from "@codemirror/view";

import { showFindDecorations } from "./decorations";
import {
  DEFAULT_FIND_OPTIONS,
  findText,
  replacementFor,
  type FindMatch,
  type FindOptions,
} from "./matches";
import { markdownSourceVisibility } from "./markdown";
import "./find.css";

export interface FindSnapshot {
  readonly query: string;
  readonly options: FindOptions;
  readonly matches: readonly FindMatch[];
  readonly count: number;
  readonly position: number;
  readonly error: string | null;
  readonly limited: boolean;
  readonly indexing: boolean;
}

export type ReplaceStatus = "replaced" | "no-match" | "read-only" | "invalid";

export interface ReplaceResult {
  readonly status: ReplaceStatus;
  readonly count: number;
}

export interface EditorFind {
  open(): void;
  close(): boolean;
  isOpen(): boolean;
  search(query: string, options?: Partial<FindOptions>): FindSnapshot;
  snapshot(): FindSnapshot;
  next(): FindSnapshot;
  previous(): FindSnapshot;
  replaceNext(replacement: string): ReplaceResult;
  replaceAll(replacement: string): ReplaceResult;
  refresh(): FindSnapshot;
  queueRefresh(): void;
  destroy(): void;
}

interface FindSessionOptions {
  readonly markdown: boolean;
  readonly readOnly: boolean;
  readonly raw: () => boolean;
}

function button(label: string): HTMLButtonElement {
  const control = document.createElement("button");
  control.type = "button";
  control.textContent = label;
  return control;
}

function optionButton(label: string): HTMLButtonElement {
  const control = button(label);
  control.setAttribute("aria-pressed", "false");
  return control;
}

/** One CodeMirror-owned current-file Find/Replace session and its quiet surface. */
export function createEditorFind(
  host: HTMLElement,
  view: EditorView,
  config: FindSessionOptions,
): EditorFind {
  const layer = document.createElement("div");
  layer.className = "editor-find-layer";

  const panel = document.createElement("section");
  panel.className = "editor-find";
  panel.setAttribute("aria-label", "Find in current file");
  panel.hidden = true;

  const findRow = document.createElement("div");
  findRow.className = "editor-find-row";

  const queryInput = document.createElement("input");
  queryInput.className = "editor-find-query";
  queryInput.type = "text";
  queryInput.autocomplete = "off";
  queryInput.spellcheck = false;
  queryInput.setAttribute("aria-label", "Find");

  const count = document.createElement("output");
  count.className = "editor-find-count";
  count.setAttribute("aria-live", "polite");

  const previous = button("Previous");
  const next = button("Next");
  const caseSensitive = optionButton("Case");
  const wholeWord = optionButton("Word");
  const regularExpression = optionButton("Regex");
  findRow.append(queryInput, count, previous, next, caseSensitive, wholeWord, regularExpression);
  panel.append(findRow);

  let replacementInput: HTMLInputElement | null = null;
  let replaceNext: HTMLButtonElement | null = null;
  let replaceAll: HTMLButtonElement | null = null;
  if (!config.readOnly) {
    const replaceRow = document.createElement("div");
    replaceRow.className = "editor-find-row";
    replacementInput = document.createElement("input");
    replacementInput.className = "editor-find-replacement";
    replacementInput.type = "text";
    replacementInput.autocomplete = "off";
    replacementInput.spellcheck = false;
    replacementInput.setAttribute("aria-label", "Replace");
    replaceNext = button("Replace");
    replaceAll = button("Replace all");
    replaceRow.append(replacementInput, replaceNext, replaceAll);
    panel.append(replaceRow);
  }

  const error = document.createElement("p");
  error.className = "editor-find-error";
  error.setAttribute("role", "status");
  error.hidden = true;
  panel.append(error);
  layer.append(panel);
  host.prepend(layer);

  let query = "";
  let options = { ...DEFAULT_FIND_OPTIONS };
  let matches: readonly FindMatch[] = [];
  let active: number | null = null;
  let problem: string | null = null;
  let limited = false;
  let indexing = false;
  let opened = false;
  let returnFocus: HTMLElement | null = null;
  let generation = 0;
  let destroyed = false;
  let parseFrame: number | null = null;

  const snapshot = (): FindSnapshot => ({
    query,
    options: { ...options },
    matches,
    count: matches.length,
    position: active === null ? 0 : active + 1,
    error: problem,
    limited,
    indexing,
  });

  const render = () => {
    if (queryInput.value !== query) queryInput.value = query;
    caseSensitive.setAttribute("aria-pressed", String(options.caseSensitive));
    wholeWord.setAttribute("aria-pressed", String(options.wholeWord));
    regularExpression.setAttribute("aria-pressed", String(options.regularExpression));

    if (indexing) count.value = "Indexing…";
    else if (problem) count.value = "Invalid query";
    else if (matches.length === 0) count.value = query ? "No results" : "";
    else
      count.value = `${active === null ? 0 : active + 1} of ${matches.length}${limited ? "+" : ""}`;

    error.textContent = problem ?? "";
    error.hidden = problem === null;
    previous.disabled = indexing || matches.length === 0;
    next.disabled = indexing || matches.length === 0;
    if (replaceNext) replaceNext.disabled = indexing || matches.length === 0 || problem !== null;
    if (replaceAll) replaceAll.disabled = indexing || matches.length === 0 || problem !== null;
  };

  const selectActive = () => {
    if (active === null) return;
    const match = matches[active];
    if (!match) return;
    view.dispatch({
      selection: { anchor: match.from, head: match.to },
      scrollIntoView: true,
      userEvent: "select.search",
    });
  };

  const recompute = (navigate: boolean, anchor?: number): FindSnapshot => {
    generation++;
    if (parseFrame !== null) {
      cancelAnimationFrame(parseFrame);
      parseFrame = null;
    }
    const source = view.state.doc.toString();
    const visibility =
      config.markdown && query
        ? markdownSourceVisibility(view.state, config.raw())
        : { ranges: undefined, complete: true };
    const visible = visibility.ranges;
    indexing = !visibility.complete;
    const result = findText(source, query, options, visible);
    matches = result.matches;
    problem = result.error;
    limited = result.limited;

    if (matches.length === 0) active = null;
    else {
      const from = anchor ?? matches[active ?? 0]?.from ?? view.state.selection.main.head;
      const nextIndex = matches.findIndex((match) => match.to > from);
      active = nextIndex < 0 ? 0 : nextIndex;
    }

    showFindDecorations(view, matches, active);
    render();
    if (navigate) selectActive();

    if (indexing) {
      const requested = generation;
      parseFrame = requestAnimationFrame(() => {
        parseFrame = null;
        if (!destroyed && requested === generation) recompute(false, anchor);
      });
    }
    return snapshot();
  };

  const api: EditorFind = {
    open: () => {
      if (!opened) {
        opened = true;
        returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        panel.hidden = false;
        showFindDecorations(view, matches, active);
      }
      queryInput.focus();
      queryInput.select();
    },
    close: () => {
      if (!opened) return false;
      opened = false;
      panel.hidden = true;
      showFindDecorations(view, [], null);
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
      return true;
    },
    isOpen: () => opened,
    search: (nextQuery, changed = {}) => {
      query = nextQuery;
      options = { ...options, ...changed };
      active = null;
      return recompute(true);
    },
    snapshot,
    next: () => {
      if (matches.length === 0) return snapshot();
      active = active === null ? 0 : (active + 1) % matches.length;
      showFindDecorations(view, matches, active);
      render();
      selectActive();
      return snapshot();
    },
    previous: () => {
      if (matches.length === 0) return snapshot();
      active =
        active === null ? matches.length - 1 : (active - 1 + matches.length) % matches.length;
      showFindDecorations(view, matches, active);
      render();
      selectActive();
      return snapshot();
    },
    replaceNext: (replacement) => {
      if (config.readOnly) return { status: "read-only", count: 0 };
      recompute(false);
      if (problem) return { status: "invalid", count: 0 };
      if (active === null) return { status: "no-match", count: 0 };
      const match = matches[active]!;
      view.dispatch({
        changes: { from: match.from, to: match.to, insert: replacementFor(match, replacement) },
        userEvent: "input.replace",
      });
      recompute(false, match.from);
      return { status: "replaced", count: 1 };
    },
    replaceAll: (replacement) => {
      if (config.readOnly) return { status: "read-only", count: 0 };
      recompute(false);
      if (problem) return { status: "invalid", count: 0 };
      if (matches.length === 0) return { status: "no-match", count: 0 };
      const replacements = matches.map((match) => ({
        from: match.from,
        to: match.to,
        insert: replacementFor(match, replacement),
      }));
      view.dispatch({ changes: replacements, userEvent: "input.replace.all" });
      const replaced = replacements.length;
      recompute(false);
      return { status: "replaced", count: replaced };
    },
    refresh: () => recompute(false),
    queueRefresh: () => {
      const requested = ++generation;
      queueMicrotask(() => {
        if (!destroyed && requested === generation) recompute(false);
      });
    },
    destroy: () => {
      destroyed = true;
      generation++;
      if (parseFrame !== null) cancelAnimationFrame(parseFrame);
      layer.remove();
    },
  };

  queryInput.addEventListener("input", () => api.search(queryInput.value));
  queryInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) api.previous();
    else api.next();
  });
  previous.addEventListener("click", () => api.previous());
  next.addEventListener("click", () => api.next());
  caseSensitive.addEventListener("click", () =>
    api.search(query, { caseSensitive: !options.caseSensitive }),
  );
  wholeWord.addEventListener("click", () => api.search(query, { wholeWord: !options.wholeWord }));
  regularExpression.addEventListener("click", () =>
    api.search(query, { regularExpression: !options.regularExpression }),
  );
  replaceNext?.addEventListener("click", () => api.replaceNext(replacementInput?.value ?? ""));
  replaceAll?.addEventListener("click", () => api.replaceAll(replacementInput?.value ?? ""));
  replacementInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    api.replaceNext(replacementInput?.value ?? "");
  });

  render();
  return api;
}
