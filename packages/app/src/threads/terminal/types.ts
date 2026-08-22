import type { TerminalExitStatus, TerminalViewport } from "@/terminal";
import type { SupportedAgentDetector } from "../agent-detector";
import type { TerminalEmulatorFactory } from "./emulator";
import type { ThreadLifecycleSignal } from "../types";

export type TerminalThreadStatus =
  "detached" | "starting" | "running" | "exited" | "failed" | "disposed";

export interface TerminalTranscriptSnapshot {
  readonly rows: string[];
  readonly discardedRows: number;
}

export interface TerminalSearchMatch {
  readonly row: number;
  readonly column: number;
  readonly length: number;
}

export interface TerminalSearchOptions {
  readonly caseSensitive?: boolean;
}

export interface TerminalThreadSnapshot extends TerminalTranscriptSnapshot {
  readonly status: TerminalThreadStatus;
  readonly sessionId: string | null;
  readonly droppedBytes: number;
  readonly readError: string | null;
  readonly exit: TerminalExitStatus | null;
  readonly viewport: TerminalViewport | null;
}

export type TerminalThreadOperation =
  | "terminal.start"
  | "terminal.read"
  | "terminal.write"
  | "terminal.resize"
  | "terminal.poll-exit"
  | "terminal.terminate"
  | "terminal.dispose";

export interface TerminalThreadInstrumentationEvent {
  readonly operation: TerminalThreadOperation;
  readonly outcome: "ok" | "failed";
  readonly projectId: string;
  readonly worktreeId: string;
  readonly sessionId?: string;
}

export interface TerminalThreadSessionOptions {
  readonly detector?: SupportedAgentDetector;
  readonly maximumRows?: number;
  /** Testable frame-yield seam used only between bounded output chunks. */
  readonly yieldForOutput?: () => Promise<void>;
  readonly onLifecycle?: (signal: ThreadLifecycleSignal) => void | Promise<void>;
  readonly onInstrumentation?: (event: TerminalThreadInstrumentationEvent) => void | Promise<void>;
}

export interface TerminalThreadMetadata {
  readonly threadName: string;
  readonly projectName: string;
  readonly worktreeLabel: string;
}

export interface TerminalThreadSurfaceOptions {
  readonly applicationOwnsKey?: (event: KeyboardEvent) => boolean;
  readonly createEmulator?: TerminalEmulatorFactory;
  readonly writeClipboard?: (text: string) => Promise<void>;
}

export interface TerminalKeyboardInput {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
}
