import { describe, expect, it, vi } from "vitest";

import {
  TerminalThreadSession,
  TerminalTranscriptBuffer,
  terminalInputBytes,
  type TerminalThreadSnapshot,
} from "@/threads";
import type {
  TerminalAdapter,
  TerminalOutputBatch,
  TerminalSessionHandle,
  TerminalViewport,
} from "@/terminal";

const session: TerminalSessionHandle = {
  sessionId: "session-alpha",
  projectId: "project-alpha",
  worktreeId: "worktree-alpha",
};
const viewport: TerminalViewport = {
  rows: 24,
  columns: 80,
  pixelWidth: 640,
  pixelHeight: 384,
};

function output(
  bytes: readonly number[],
  offset = 0,
  overrides: Partial<TerminalOutputBatch> = {},
): TerminalOutputBatch {
  return {
    session,
    offset,
    droppedBefore: 0,
    bytes,
    readError: null,
    ...overrides,
  };
}

function fakeAdapter(batches: TerminalOutputBatch[] = []) {
  const adapter: TerminalAdapter & {
    start: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
    pollExit: ReturnType<typeof vi.fn>;
    terminate: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  } = {
    start: vi.fn(async () => session),
    write: vi.fn(async () => undefined),
    resize: vi.fn(async () => undefined),
    read: vi.fn(async () => batches.shift() ?? output([], 0)),
    pollExit: vi.fn(async () => null),
    terminate: vi.fn(async () => ({ reason: "terminated" as const, code: null, signal: null })),
    dispose: vi.fn(async () => undefined),
  };
  return adapter;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("the bounded terminal transcript", () => {
  it("decodes Unicode split across native reads without replacement characters", () => {
    const transcript = new TerminalTranscriptBuffer(4);
    const bytes = new TextEncoder().encode("one\n👩🏽‍💻 café\n日本語");

    transcript.append(bytes.slice(0, 7));
    transcript.append(bytes.slice(7, 13));
    transcript.append(bytes.slice(13));

    expect(transcript.snapshot()).toEqual({
      rows: ["one", "👩🏽‍💻 café", "日本語"],
      discardedRows: 0,
    });
  });

  it("evicts only complete oldest rows and bounds its defensive snapshot", () => {
    const transcript = new TerminalTranscriptBuffer(3);
    transcript.append(new TextEncoder().encode("one\ntwo\nthree\nfour"));

    const snapshot = transcript.snapshot();
    expect(snapshot).toEqual({ rows: ["two", "three", "four"], discardedRows: 1 });
    snapshot.rows.push("outside");
    expect(transcript.snapshot().rows).toEqual(["two", "three", "four"]);
  });

  it("searches retained text without widening the scrollback bound", () => {
    const transcript = new TerminalTranscriptBuffer(3);
    transcript.append(new TextEncoder().encode("Alpha alpha\nbeta\nalpha"));

    expect(transcript.search("alpha")).toEqual([
      { row: 0, column: 0, length: 5 },
      { row: 0, column: 6, length: 5 },
      { row: 2, column: 0, length: 5 },
    ]);
    expect(transcript.search("alpha", { caseSensitive: true })).toHaveLength(2);
    expect(transcript.search("ALPHA", { caseSensitive: true })).toHaveLength(0);
  });
});

describe("the terminal-backed thread session", () => {
  it("starts only from stable approved scope identities and publishes process lifecycle", async () => {
    const adapter = fakeAdapter();
    const lifecycle = vi.fn();
    const terminal = new TerminalThreadSession(
      adapter,
      { projectId: "project-alpha", worktreeId: "worktree-alpha" },
      { onLifecycle: lifecycle },
    );

    await terminal.start(viewport);

    expect(adapter.start).toHaveBeenCalledExactlyOnceWith({
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      viewport,
    });
    expect(adapter.start.mock.calls[0]![0]).not.toHaveProperty("command");
    expect(lifecycle).toHaveBeenNthCalledWith(1, {
      lifecycle: "starting",
      revision: 1,
      source: "process",
    });
    expect(lifecycle).toHaveBeenNthCalledWith(2, {
      lifecycle: "idle",
      revision: 2,
      source: "process",
    });
  });

  it("reads only when requested, validates the exact session, and reports dropped bytes", async () => {
    const bytes = [...new TextEncoder().encode("hello")];
    const adapter = fakeAdapter([output(bytes, 4, { droppedBefore: 4 })]);
    const terminal = TerminalThreadSession.attach(adapter, session, { maximumRows: 3 });

    expect(adapter.read).not.toHaveBeenCalled();
    await terminal.refresh();

    expect(adapter.read).toHaveBeenCalledExactlyOnceWith(session);
    expect(terminal.snapshot()).toMatchObject({
      rows: ["hello"],
      droppedBytes: 4,
      status: "running",
    });

    adapter.read.mockResolvedValueOnce(
      output([], 9, { session: { ...session, worktreeId: "other-worktree" } }),
    );
    await expect(terminal.refresh()).rejects.toThrow("different terminal session");
  });

  it("publishes raw PTY bytes and coalesces repeated output-ready refreshes", async () => {
    const waiting = deferred<TerminalOutputBatch>();
    const bytes = [...new TextEncoder().encode("\u001b[31mred\u001b[0m")];
    const adapter = fakeAdapter();
    adapter.read
      .mockImplementationOnce(() => waiting.promise)
      .mockResolvedValueOnce(output([], bytes.length));
    const terminal = TerminalThreadSession.attach(adapter, session);
    const outputBytes: number[][] = [];
    terminal.subscribeOutput((chunk) => outputBytes.push([...chunk]));

    const first = terminal.refresh();
    const second = terminal.refresh();
    const third = terminal.refresh();
    waiting.resolve(output(bytes));
    await Promise.all([first, second, third]);

    expect(adapter.read).toHaveBeenCalledTimes(2);
    expect(outputBytes).toEqual([bytes]);
  });

  it("never infers busy or waiting merely because output arrived", async () => {
    const adapter = fakeAdapter([output([...new TextEncoder().encode("done\n")])]);
    const lifecycle = vi.fn();
    const terminal = TerminalThreadSession.attach(adapter, session, { onLifecycle: lifecycle });

    await terminal.refresh();

    expect(lifecycle).not.toHaveBeenCalledWith(expect.objectContaining({ lifecycle: "waiting" }));
    expect(lifecycle).not.toHaveBeenCalledWith(expect.objectContaining({ lifecycle: "busy" }));
  });

  it("segments an output burst and yields between bounded renderer chunks", async () => {
    const bytes = Array.from({ length: 600_000 }, () => 97);
    const adapter = fakeAdapter([output(bytes)]);
    const yieldForOutput = vi.fn(async () => undefined);
    const terminal = TerminalThreadSession.attach(adapter, session, {
      maximumRows: 2,
      yieldForOutput,
    });

    await terminal.refresh();

    expect(yieldForOutput).toHaveBeenCalledTimes(2);
    expect(terminal.snapshot().rows[0]).toHaveLength(600_000);
  });

  it("writes bounded encoded input, resizes, searches, and publishes snapshots", async () => {
    const adapter = fakeAdapter([output([...new TextEncoder().encode("café\nCAFÉ")])]);
    const terminal = TerminalThreadSession.attach(adapter, session);
    const snapshots: TerminalThreadSnapshot[] = [];
    terminal.subscribe((snapshot) => snapshots.push(snapshot));

    await terminal.writeText("日本語");
    await terminal.resize(viewport);
    await terminal.refresh();

    expect(adapter.write).toHaveBeenCalledExactlyOnceWith(session, [
      ...new TextEncoder().encode("日本語"),
    ]);
    expect(adapter.resize).toHaveBeenCalledExactlyOnceWith(session, viewport);
    expect(terminal.search("café")).toHaveLength(2);
    expect(snapshots.at(-1)?.rows).toEqual(["café", "CAFÉ"]);
  });

  it("instruments operations with identities but never transcript or input content", async () => {
    const adapter = fakeAdapter([output([...new TextEncoder().encode("private output")])]);
    const instrumentation = vi.fn();
    const terminal = TerminalThreadSession.attach(adapter, session, {
      onInstrumentation: instrumentation,
    });

    await terminal.writeText("private input");
    await terminal.refresh();

    expect(instrumentation).toHaveBeenCalledWith({
      operation: "terminal.write",
      outcome: "ok",
      projectId: "project-alpha",
      worktreeId: "worktree-alpha",
      sessionId: "session-alpha",
    });
    expect(JSON.stringify(instrumentation.mock.calls)).not.toContain("private input");
    expect(JSON.stringify(instrumentation.mock.calls)).not.toContain("private output");
  });

  it("surfaces native read failure and performs explicit idempotent cleanup", async () => {
    const adapter = fakeAdapter([output([], 0, { readError: "reader stopped" })]);
    const lifecycle = vi.fn();
    const terminal = TerminalThreadSession.attach(adapter, session, { onLifecycle: lifecycle });

    await terminal.refresh();
    adapter.pollExit.mockResolvedValueOnce({ reason: "exited", code: 7, signal: null });
    await terminal.pollExit();
    await terminal.terminate();
    await terminal.dispose();
    await terminal.dispose();

    expect(terminal.snapshot().readError).toBe("reader stopped");
    expect(lifecycle).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycle: "failed", source: "process" }),
    );
    expect(adapter.terminate).toHaveBeenCalledExactlyOnceWith(session);
    expect(adapter.dispose).toHaveBeenCalledExactlyOnceWith(session);
  });
});

describe("terminal keyboard encoding", () => {
  it("encodes terminal keys but leaves application and copy shortcuts untouched", () => {
    expect(
      terminalInputBytes({ key: "Enter", ctrlKey: false, altKey: false, metaKey: false }),
    ).toEqual([13]);
    expect(
      terminalInputBytes({ key: "ArrowUp", ctrlKey: false, altKey: false, metaKey: false }),
    ).toEqual([27, 91, 65]);
    expect(terminalInputBytes({ key: "c", ctrlKey: true, altKey: false, metaKey: false })).toEqual([
      3,
    ]);
    expect(
      terminalInputBytes({ key: "c", ctrlKey: false, altKey: false, metaKey: true }),
    ).toBeNull();
  });
});
