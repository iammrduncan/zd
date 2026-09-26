import { MAX_TERMINAL_SCROLLBACK_ROWS } from "@/terminal";
import type {
  TerminalSearchMatch,
  TerminalSearchOptions,
  TerminalTranscriptSnapshot,
} from "./types";

const MAX_SEARCH_QUERY_LENGTH = 4_096;

function boundedRows(maximumRows: number): number {
  if (
    !Number.isSafeInteger(maximumRows) ||
    maximumRows < 1 ||
    maximumRows > MAX_TERMINAL_SCROLLBACK_ROWS
  ) {
    throw new RangeError(
      `terminal transcript rows must be from 1 to ${MAX_TERMINAL_SCROLLBACK_ROWS}`,
    );
  }
  return maximumRows;
}

/**
 * Dependency-free transcript fallback. It decodes streams safely and keeps a
 * whole-row bound; a future terminal emulator can replace presentation while
 * this native/session boundary remains unchanged.
 */
export class TerminalTranscriptBuffer {
  readonly #decoder = new TextDecoder("utf-8", { fatal: false });
  readonly #maximumRows: number;
  #completeRows: string[] = [];
  #currentRow = "";
  #discardedRows = 0;

  constructor(maximumRows = 10_000) {
    this.#maximumRows = boundedRows(maximumRows);
  }

  append(bytes: ArrayLike<number>): void {
    const decoded = this.#decoder.decode(Uint8Array.from(bytes), { stream: true });
    this.#appendText(decoded);
  }

  finish(): void {
    this.#appendText(this.#decoder.decode());
  }

  #appendText(text: string): void {
    for (const character of text) {
      switch (character) {
        case "\n":
          this.#completeRows.push(this.#currentRow);
          this.#currentRow = "";
          break;
        case "\r":
          // A transcript cannot emulate a cursor. Treat carriage return as a
          // replacement of the active logical row instead of retaining every
          // progress update as scrollback.
          this.#currentRow = "";
          break;
        case "\b":
          this.#currentRow = [...this.#currentRow].slice(0, -1).join("");
          break;
        default:
          this.#currentRow += character;
      }
    }
    this.#trim();
  }

  #trim(): void {
    const totalRows = this.#completeRows.length + 1;
    const overflow = Math.max(0, totalRows - this.#maximumRows);
    if (overflow === 0) return;
    this.#completeRows.splice(0, overflow);
    this.#discardedRows += overflow;
  }

  snapshot(): TerminalTranscriptSnapshot {
    return {
      rows: [...this.#completeRows, this.#currentRow],
      discardedRows: this.#discardedRows,
    };
  }

  search(query: string, options: TerminalSearchOptions = {}): readonly TerminalSearchMatch[] {
    if (query.length === 0 || query.length > MAX_SEARCH_QUERY_LENGTH) return [];
    const needle = options.caseSensitive ? query : query.toLocaleLowerCase();
    const matches: TerminalSearchMatch[] = [];
    this.snapshot().rows.forEach((row, rowIndex) => {
      const haystack = options.caseSensitive ? row : row.toLocaleLowerCase();
      let from = 0;
      while (from <= haystack.length - needle.length) {
        const column = haystack.indexOf(needle, from);
        if (column < 0) break;
        matches.push({ row: rowIndex, column, length: query.length });
        from = column + Math.max(1, needle.length);
      }
    });
    return matches;
  }
}
