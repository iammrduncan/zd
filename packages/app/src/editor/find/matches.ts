export const MAX_FIND_QUERY_CODE_UNITS = 1_024;
export const MAX_FIND_MATCHES = 10_000;

export interface SourceRange {
  readonly from: number;
  readonly to: number;
}

export interface FindOptions {
  readonly caseSensitive: boolean;
  readonly wholeWord: boolean;
  readonly regularExpression: boolean;
}

export const DEFAULT_FIND_OPTIONS: FindOptions = {
  caseSensitive: false,
  wholeWord: false,
  regularExpression: false,
};

export interface FindMatch extends SourceRange {
  readonly text: string;
  readonly captures: readonly (string | undefined)[];
  readonly groups: Readonly<Record<string, string | undefined>> | null;
}

export interface FindResult {
  readonly matches: readonly FindMatch[];
  readonly error: string | null;
  readonly limited: boolean;
}

const WORD = /[\p{L}\p{N}_]/u;

function escapeExpression(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wholeWord(source: string, from: number, to: number): boolean {
  const before = from > 0 ? source[from - 1]! : "";
  const after = to < source.length ? source[to]! : "";
  return !WORD.test(before) && !WORD.test(after);
}

function rangeContaining(
  ranges: readonly SourceRange[] | undefined,
  from: number,
  to: number,
  start: number,
): { readonly found: boolean; readonly next: number } {
  if (!ranges) return { found: true, next: start };
  let index = start;
  while (index < ranges.length && ranges[index]!.to <= from) index++;
  const range = ranges[index];
  return { found: Boolean(range && from >= range.from && to <= range.to), next: index };
}

/**
 * Search one source string under strict result/query bounds.
 *
 * `visibleRanges` is the rendered Markdown contract. A reported match must fit
 * wholly inside one real visible source range; generated widget text is never
 * invented as a source position.
 */
export function findText(
  source: string,
  query: string,
  options: FindOptions,
  visibleRanges?: readonly SourceRange[],
): FindResult {
  if (query.length === 0) return { matches: [], error: null, limited: false };
  if (query.length > MAX_FIND_QUERY_CODE_UNITS) {
    return {
      matches: [],
      error: `Find queries are limited to ${MAX_FIND_QUERY_CODE_UNITS.toLocaleString("en-US")} characters.`,
      limited: false,
    };
  }

  let expression: RegExp;
  try {
    expression = new RegExp(
      options.regularExpression ? query : escapeExpression(query),
      `gu${options.caseSensitive ? "" : "i"}`,
    );
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return { matches: [], error: `Invalid regular expression — ${reason}`, limited: false };
  }

  const matches: FindMatch[] = [];
  let visibleIndex = 0;
  for (let match = expression.exec(source); match; match = expression.exec(source)) {
    const text = match[0];
    // A zero-width result cannot be highlighted as a real source range and lets
    // Replace all insert an unbounded number of copies. Decline it honestly.
    if (text.length === 0) {
      expression.lastIndex += 1;
      continue;
    }

    const from = match.index;
    const to = from + text.length;
    if (options.wholeWord && !wholeWord(source, from, to)) continue;

    const visible = rangeContaining(visibleRanges, from, to, visibleIndex);
    visibleIndex = visible.next;
    if (!visible.found) continue;

    matches.push({
      from,
      to,
      text,
      captures: match.slice(1),
      groups: match.groups ?? null,
    });
    if (matches.length === MAX_FIND_MATCHES) {
      return { matches, error: null, limited: true };
    }
  }

  return { matches, error: null, limited: false };
}

/** Expand the ordinary capture tokens without re-running a user expression. */
export function replacementFor(match: FindMatch, replacement: string): string {
  return replacement.replace(/\$(\$|&|[1-9][0-9]?|<[^>]+>)/g, (token, key: string) => {
    if (key === "$") return "$";
    if (key === "&") return match.text;
    if (key.startsWith("<")) return match.groups?.[key.slice(1, -1)] ?? token;

    const index = Number(key);
    if (index <= match.captures.length) return match.captures[index - 1] ?? "";

    // JavaScript treats `$10` as `$1` followed by `0` when only capture 1 exists.
    if (key.length === 2) {
      const first = Number(key[0]);
      if (first <= match.captures.length) return `${match.captures[first - 1] ?? ""}${key[1]}`;
    }
    return token;
  });
}
