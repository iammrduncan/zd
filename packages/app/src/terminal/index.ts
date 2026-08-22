/**
 * Frontend contract for native terminal sessions.
 *
 * The start request deliberately contains no path, executable, arguments, or
 * environment. Native code resolves these stable grant identities and starts
 * the user's shell inside the approved worktree.
 */

export const DEFAULT_TERMINAL_SCROLLBACK_ROWS = 10_000;
export const MAX_TERMINAL_SCROLLBACK_ROWS = 100_000;

const MAX_TERMINAL_GRID_DIMENSION = 1_000;
const MAX_TERMINAL_PIXEL_DIMENSION = 65_535;

export interface TerminalScope {
  readonly projectId: string;
  readonly worktreeId: string;
}

export interface TerminalViewport {
  readonly rows: number;
  readonly columns: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

export interface TerminalStartRequest extends TerminalScope {
  readonly viewport: TerminalViewport;
}

export interface TerminalSessionHandle extends TerminalScope {
  readonly sessionId: string;
}

export interface TerminalOutputBatch {
  readonly session: TerminalSessionHandle;
  /** Absolute byte offset of the first retained byte. */
  readonly offset: number;
  /** Bytes released before delivery because the native queue reached its limit. */
  readonly droppedBefore: number;
  readonly bytes: readonly number[];
}

export type TerminalExitReason = "exited" | "terminated" | "disposed";

export interface TerminalExitStatus {
  readonly reason: TerminalExitReason;
  readonly code: number | null;
  readonly signal: string | null;
}

/**
 * The interface consumed by a future terminal surface. Implementations may use
 * Tauri commands and channels, but cannot widen `start` into generic process
 * execution.
 */
export interface TerminalAdapter {
  start(request: TerminalStartRequest): Promise<TerminalSessionHandle>;
  write(session: TerminalSessionHandle, bytes: readonly number[]): Promise<void>;
  resize(session: TerminalSessionHandle, viewport: TerminalViewport): Promise<void>;
  read(session: TerminalSessionHandle): Promise<TerminalOutputBatch>;
  pollExit(session: TerminalSessionHandle): Promise<TerminalExitStatus | null>;
  terminate(session: TerminalSessionHandle): Promise<TerminalExitStatus>;
  dispose(session: TerminalSessionHandle): Promise<void>;
}

interface ViewportInput {
  readonly rows: number;
  readonly columns: number;
  readonly pixelWidth?: number;
  readonly pixelHeight?: number;
}

function boundedInteger(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export function terminalViewport(input: ViewportInput): TerminalViewport {
  return {
    rows: boundedInteger("rows", input.rows, 1, MAX_TERMINAL_GRID_DIMENSION),
    columns: boundedInteger("columns", input.columns, 1, MAX_TERMINAL_GRID_DIMENSION),
    pixelWidth: boundedInteger(
      "pixelWidth",
      input.pixelWidth ?? 0,
      0,
      MAX_TERMINAL_PIXEL_DIMENSION,
    ),
    pixelHeight: boundedInteger(
      "pixelHeight",
      input.pixelHeight ?? 0,
      0,
      MAX_TERMINAL_PIXEL_DIMENSION,
    ),
  };
}

export function createTerminalStartRequest(
  scope: TerminalScope,
  viewport: ViewportInput,
): TerminalStartRequest {
  return {
    projectId: scope.projectId,
    worktreeId: scope.worktreeId,
    viewport: terminalViewport(viewport),
  };
}

export function terminalSessionKey(session: TerminalSessionHandle): string {
  return `${session.projectId}\0${session.worktreeId}\0${session.sessionId}`;
}

export interface TerminalScrollbackSnapshot {
  /** A defensive copy; callers may transform it without mutating retained rows. */
  readonly rows: string[];
  readonly discardedRows: number;
}

/**
 * Bounded logical rows retained after a terminal emulator has parsed output.
 * Evicting whole strings avoids splitting Unicode scalar values or grapheme
 * clusters. The emulator remains responsible for wrapping and active-screen
 * state; this object owns only released scrollback rows.
 */
export class TerminalScrollback {
  readonly #maximumRows: number;
  #rows: string[] = [];
  #discardedRows = 0;

  constructor(maximumRows = DEFAULT_TERMINAL_SCROLLBACK_ROWS) {
    this.#maximumRows = boundedInteger(
      "scrollback rows",
      maximumRows,
      1,
      MAX_TERMINAL_SCROLLBACK_ROWS,
    );
  }

  append(rows: readonly string[]): void {
    if (rows.length >= this.#maximumRows) {
      this.#discardedRows += this.#rows.length + rows.length - this.#maximumRows;
      this.#rows = rows.slice(-this.#maximumRows);
      return;
    }

    const overflow = Math.max(0, this.#rows.length + rows.length - this.#maximumRows);
    this.#discardedRows += overflow;
    this.#rows = this.#rows.slice(overflow).concat(rows);
  }

  snapshot(): TerminalScrollbackSnapshot {
    return {
      rows: [...this.#rows],
      discardedRows: this.#discardedRows,
    };
  }
}
