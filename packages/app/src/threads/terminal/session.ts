import {
  createTerminalStartRequest,
  DEFAULT_TERMINAL_SCROLLBACK_ROWS,
  terminalSessionKey,
  type TerminalAdapter,
  type TerminalExitStatus,
  type TerminalScope,
  type TerminalSessionHandle,
  type TerminalViewport,
} from "@/terminal";
import { TerminalTranscriptBuffer } from "./transcript";
import type { AgentDetectorObservationV1 } from "../agent-detector";
import type {
  TerminalSearchMatch,
  TerminalSearchOptions,
  TerminalThreadInstrumentationEvent,
  TerminalThreadOperation,
  TerminalThreadSessionOptions,
  TerminalThreadSnapshot,
  TerminalThreadStatus,
} from "./types";
import type { ThreadLifecycle, ThreadLifecycleSignal } from "../types";

const MAX_WRITE_BYTES = 64 * 1_024;
const MAX_READ_BYTES = 16 * 1_024 * 1_024;
const OUTPUT_RENDER_CHUNK_BYTES = 256 * 1_024;
const MAX_PENDING_EMULATOR_BYTES = 4 * 1_024 * 1_024;

function validByte(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function assertBatchBytes(bytes: readonly number[]): void {
  if (bytes.length > MAX_READ_BYTES || !bytes.every(validByte)) {
    throw new RangeError("native terminal output batch is invalid or exceeds its bound");
  }
}

function defaultYieldForOutput(): Promise<void> {
  if (
    typeof requestAnimationFrame === "function" &&
    (typeof document === "undefined" || document.visibilityState === "visible")
  ) {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export class TerminalThreadSession {
  readonly #listeners = new Set<(snapshot: TerminalThreadSnapshot) => void>();
  readonly #outputListeners = new Set<(bytes: Uint8Array) => void>();
  readonly #transcript: TerminalTranscriptBuffer;
  readonly scrollbackRows: number;
  #disposed = false;
  #droppedBytes = 0;
  #exit: TerminalExitStatus | null = null;
  #handle: TerminalSessionHandle | null = null;
  #lifecycleRevision = 0;
  #nextOffset: number | null = null;
  #pendingOutput: Uint8Array[] = [];
  #pendingOutputBytes = 0;
  #readError: string | null = null;
  #refreshPromise: Promise<void> | null = null;
  #refreshQueued = false;
  #status: TerminalThreadStatus = "detached";
  #terminated = false;
  #viewport: TerminalViewport | null = null;
  #writeTail: Promise<void> = Promise.resolve();

  constructor(
    readonly adapter: TerminalAdapter,
    readonly scope: TerminalScope,
    readonly options: TerminalThreadSessionOptions = {},
  ) {
    this.#transcript = new TerminalTranscriptBuffer(options.maximumRows);
    this.scrollbackRows = options.maximumRows ?? DEFAULT_TERMINAL_SCROLLBACK_ROWS;
  }

  static attach(
    adapter: TerminalAdapter,
    handle: TerminalSessionHandle,
    options: TerminalThreadSessionOptions = {},
  ): TerminalThreadSession {
    const terminal = new TerminalThreadSession(
      adapter,
      { projectId: handle.projectId, worktreeId: handle.worktreeId },
      options,
    );
    terminal.#handle = { ...handle };
    terminal.#status = "running";
    terminal.#observeAgent(options.detector?.processStarted() ?? null);
    return terminal;
  }

  snapshot(): TerminalThreadSnapshot {
    return {
      ...this.#transcript.snapshot(),
      status: this.#status,
      sessionId: this.#handle?.sessionId ?? null,
      droppedBytes: this.#droppedBytes,
      readError: this.#readError,
      exit: this.#exit ? { ...this.#exit } : null,
      viewport: this.#viewport ? { ...this.#viewport } : null,
    };
  }

  subscribe(listener: (snapshot: TerminalThreadSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Raw PTY bytes for a terminal emulator; content is never persisted in root state. */
  subscribeOutput(listener: (bytes: Uint8Array) => void): () => void {
    this.#outputListeners.add(listener);
    if (this.#outputListeners.size === 1 && this.#pendingOutput.length > 0) {
      const pending = this.#pendingOutput;
      this.#pendingOutput = [];
      this.#pendingOutputBytes = 0;
      for (const chunk of pending) listener(chunk.slice());
    }
    return () => this.#outputListeners.delete(listener);
  }

  async start(viewport: TerminalViewport): Promise<TerminalSessionHandle> {
    if (this.#status !== "detached") throw new Error("terminal thread session is already attached");
    this.#status = "starting";
    this.#viewport = { ...viewport };
    this.#lifecycle("starting");
    this.#publish();
    try {
      const handle = await this.adapter.start(createTerminalStartRequest(this.scope, viewport));
      if (
        handle.projectId !== this.scope.projectId ||
        handle.worktreeId !== this.scope.worktreeId
      ) {
        throw new Error("native terminal attached a different approved scope");
      }
      this.#handle = { ...handle };
      this.#status = "running";
      this.#lifecycle("idle");
      this.#observeAgent(this.options.detector?.processStarted() ?? null);
      this.#record("terminal.start", "ok");
      this.#publish();
      return { ...handle };
    } catch (cause) {
      this.#status = "failed";
      this.#lifecycle("failed");
      this.#record("terminal.start", "failed");
      this.#publish();
      throw cause;
    }
  }

  refresh(): Promise<void> {
    if (this.#refreshPromise) {
      this.#refreshQueued = true;
      return this.#refreshPromise;
    }
    const run = async () => {
      do {
        this.#refreshQueued = false;
        await this.#refresh();
      } while (this.#refreshQueued && !this.#disposed);
    };
    this.#refreshPromise = run().finally(() => {
      this.#refreshPromise = null;
    });
    return this.#refreshPromise;
  }

  async #refresh(): Promise<void> {
    const handle = this.#attachedHandle();
    try {
      const batch = await this.adapter.read(handle);
      if (terminalSessionKey(batch.session) !== terminalSessionKey(handle)) {
        throw new Error("native output belongs to a different terminal session");
      }
      assertBatchBytes(batch.bytes);
      if (!Number.isSafeInteger(batch.offset) || batch.offset < 0) {
        throw new RangeError("native terminal output offset is invalid");
      }
      if (this.#nextOffset !== null && batch.offset < this.#nextOffset) {
        throw new Error("native terminal output arrived out of order");
      }
      const gap = this.#nextOffset === null ? 0 : batch.offset - this.#nextOffset;
      this.#droppedBytes += Math.max(gap, batch.droppedBefore);
      this.#nextOffset = batch.offset + batch.bytes.length;
      for (let offset = 0; offset < batch.bytes.length; offset += OUTPUT_RENDER_CHUNK_BYTES) {
        const end = Math.min(batch.bytes.length, offset + OUTPUT_RENDER_CHUNK_BYTES);
        const chunk = Uint8Array.from(batch.bytes.slice(offset, end));
        this.#transcript.append(chunk);
        this.#publishOutput(chunk);
        this.#observeAgent(this.options.detector?.observeOutput(chunk) ?? null);
        if (end < batch.bytes.length) {
          this.#publish();
          await (this.options.yieldForOutput ?? defaultYieldForOutput)();
        }
      }
      if (batch.readError) {
        this.#readError = batch.readError;
        this.#status = "failed";
        this.#lifecycle("failed");
      }
      this.#record("terminal.read", batch.readError ? "failed" : "ok");
      this.#publish();
    } catch (cause) {
      this.#record("terminal.read", "failed");
      throw cause;
    }
  }

  writeText(text: string): Promise<void> {
    return this.writeBytes(new TextEncoder().encode(text));
  }

  writeBytes(input: Uint8Array): Promise<void> {
    const bytes = input.slice();
    if (bytes.length === 0) return Promise.resolve();
    const work = this.#writeTail.then(async () => {
      const handle = this.#attachedHandle();
      try {
        for (let offset = 0; offset < bytes.length; offset += MAX_WRITE_BYTES) {
          await this.adapter.write(handle, [...bytes.slice(offset, offset + MAX_WRITE_BYTES)]);
        }
        this.#observeAgent(this.options.detector?.observeInput(bytes) ?? null);
        this.#record("terminal.write", "ok");
      } catch (cause) {
        this.#record("terminal.write", "failed");
        throw cause;
      }
    });
    this.#writeTail = work.catch(() => undefined);
    return work;
  }

  async resize(viewport: TerminalViewport): Promise<void> {
    const handle = this.#attachedHandle();
    try {
      await this.adapter.resize(handle, viewport);
      this.#viewport = { ...viewport };
      this.#record("terminal.resize", "ok");
      this.#publish();
    } catch (cause) {
      this.#record("terminal.resize", "failed");
      throw cause;
    }
  }

  search(query: string, options: TerminalSearchOptions = {}): readonly TerminalSearchMatch[] {
    return this.#transcript.search(query, options);
  }

  async pollExit(): Promise<TerminalExitStatus | null> {
    const handle = this.#attachedHandle();
    try {
      const exit = await this.adapter.pollExit(handle);
      if (exit) this.#applyExit(exit);
      this.#record("terminal.poll-exit", "ok");
      return exit ? { ...exit } : null;
    } catch (cause) {
      this.#record("terminal.poll-exit", "failed");
      throw cause;
    }
  }

  async terminate(): Promise<TerminalExitStatus | null> {
    if (this.#terminated || this.#disposed) return this.#exit ? { ...this.#exit } : null;
    const handle = this.#attachedHandle();
    this.#terminated = true;
    try {
      const exit = await this.adapter.terminate(handle);
      this.#applyExit(exit);
      this.#record("terminal.terminate", "ok");
      return { ...exit };
    } catch (cause) {
      this.#terminated = false;
      this.#record("terminal.terminate", "failed");
      throw cause;
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    const handle = this.#attachedHandle();
    try {
      await this.adapter.dispose(handle);
      this.#disposed = true;
      this.#outputListeners.clear();
      this.#pendingOutput = [];
      this.#pendingOutputBytes = 0;
      this.#transcript.finish();
      this.#status = "disposed";
      this.#record("terminal.dispose", "ok");
      this.#publish();
    } catch (cause) {
      this.#record("terminal.dispose", "failed");
      throw cause;
    }
  }

  #applyExit(exit: TerminalExitStatus): void {
    this.#exit = { ...exit };
    this.#transcript.finish();
    const failed = exit.reason === "exited" && exit.code !== null && exit.code !== 0;
    this.#status = failed ? "failed" : "exited";
    this.#lifecycle(failed ? "failed" : "exited");
    this.#publish();
  }

  #publishOutput(chunk: Uint8Array): void {
    if (this.#outputListeners.size > 0) {
      for (const listener of this.#outputListeners) listener(chunk.slice());
      return;
    }
    if (chunk.length >= MAX_PENDING_EMULATOR_BYTES) {
      this.#pendingOutput = [chunk.slice(-MAX_PENDING_EMULATOR_BYTES)];
      this.#pendingOutputBytes = MAX_PENDING_EMULATOR_BYTES;
      return;
    }
    this.#pendingOutput.push(chunk.slice());
    this.#pendingOutputBytes += chunk.length;
    while (this.#pendingOutputBytes > MAX_PENDING_EMULATOR_BYTES) {
      const released = this.#pendingOutput.shift();
      if (!released) break;
      this.#pendingOutputBytes -= released.length;
    }
  }

  #attachedHandle(): TerminalSessionHandle {
    if (!this.#handle || this.#disposed) throw new Error("terminal thread session is not attached");
    return this.#handle;
  }

  #observeAgent(observation: AgentDetectorObservationV1 | null): void {
    if (observation) this.#lifecycle(observation.lifecycle, "supported-agent");
  }

  #lifecycle(
    lifecycle: ThreadLifecycle,
    source: ThreadLifecycleSignal["source"] = "process",
  ): void {
    if (!this.options.onLifecycle) return;
    this.#lifecycleRevision += 1;
    void Promise.resolve(
      this.options.onLifecycle({
        lifecycle,
        revision: this.#lifecycleRevision,
        source,
      }),
    ).catch(() => undefined);
  }

  #record(operation: TerminalThreadOperation, outcome: "ok" | "failed"): void {
    if (!this.options.onInstrumentation) return;
    const event: TerminalThreadInstrumentationEvent = {
      operation,
      outcome,
      projectId: this.scope.projectId,
      worktreeId: this.scope.worktreeId,
      ...(this.#handle ? { sessionId: this.#handle.sessionId } : {}),
    };
    void Promise.resolve(this.options.onInstrumentation(event)).catch(() => undefined);
  }

  #publish(): void {
    const snapshot = this.snapshot();
    for (const listener of this.#listeners) listener(snapshot);
  }
}
