import "@/design/index.css";

import type { TerminalAdapter, TerminalOutputBatch, TerminalSessionHandle } from "@/terminal";
import { mountTerminalThreadSurface, TerminalThreadSession } from "@/threads";

interface TerminalPerformanceFixture {
  readonly calls: string[];
  dispose(): void;
  mountInactive(count: number): number;
  resizeActive(width: number, height: number): Promise<number>;
  writeBurst(minimumBytes: number): Promise<number>;
}

declare global {
  interface Window {
    terminalPerformanceFixture: TerminalPerformanceFixture;
  }
}

const encoder = new TextEncoder();
const sessions: TerminalThreadSession[] = [];
const surfaces: ReturnType<typeof mountTerminalThreadSurface>[] = [];
const calls: string[] = [];
let sessionSequence = 0;

function createAdapter(): {
  readonly adapter: TerminalAdapter;
  readonly handle: TerminalSessionHandle;
  queue(contents: string): number;
} {
  sessionSequence += 1;
  const handle: TerminalSessionHandle = {
    sessionId: `performance-session-${sessionSequence}`,
    projectId: "performance-project",
    worktreeId: "performance-worktree",
  };
  let nextOffset = 0;
  let pending: number[] = [];
  const adapter: TerminalAdapter = {
    start: async () => handle,
    write: async () => undefined,
    resize: async (_session, viewport) => {
      calls.push(`resize:${handle.sessionId}:${viewport.columns}x${viewport.rows}`);
    },
    read: async (): Promise<TerminalOutputBatch> => {
      calls.push(`read:${handle.sessionId}`);
      const bytes = pending;
      pending = [];
      const batch = {
        session: handle,
        offset: nextOffset,
        droppedBefore: 0,
        bytes,
        readError: null,
      } satisfies TerminalOutputBatch;
      nextOffset += bytes.length;
      return batch;
    },
    pollExit: async () => {
      calls.push(`poll-exit:${handle.sessionId}`);
      return null;
    },
    terminate: async () => ({ reason: "terminated", code: null, signal: null }),
    dispose: async () => undefined,
  };
  return {
    adapter,
    handle,
    queue: (contents) => {
      pending = [...encoder.encode(contents)];
      return pending.length;
    },
  };
}

function mountTerminal(host: HTMLElement, visible: boolean) {
  const source = createAdapter();
  const session = TerminalThreadSession.attach(source.adapter, source.handle, {
    maximumRows: 1_000,
  });
  const surface = mountTerminalThreadSurface(host, session, {
    threadName: `Terminal ${sessionSequence}`,
    projectName: "Performance",
    worktreeLabel: "main",
  });
  surface.setVisible(visible);
  sessions.push(session);
  surfaces.push(surface);
  return { session, source, surface };
}

const fixtureHost = document.getElementById("terminal-performance");
if (!fixtureHost) throw new Error("terminal performance fixture host is missing");
fixtureHost.style.width = "800px";
fixtureHost.style.height = "520px";
const active = mountTerminal(fixtureHost, true);

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

window.terminalPerformanceFixture = {
  calls,
  dispose: () => {
    for (const surface of surfaces.splice(0)) surface.dispose();
    for (const session of sessions.splice(0)) void session.dispose();
  },
  mountInactive: (count) => {
    for (let index = 0; index < count; index += 1) {
      const host = document.createElement("section");
      host.style.width = "800px";
      host.style.height = "520px";
      fixtureHost.append(host);
      mountTerminal(host, false);
    }
    return surfaces.length - 1;
  },
  resizeActive: async (width, height) => {
    const before = calls.filter((call) =>
      call.startsWith(`resize:${active.source.handle.sessionId}:`),
    ).length;
    const started = performance.now();
    fixtureHost.style.width = `${width}px`;
    fixtureHost.style.height = `${height}px`;
    for (let frame = 0; frame < 120; frame += 1) {
      await nextFrame();
      const current = calls.filter((call) =>
        call.startsWith(`resize:${active.source.handle.sessionId}:`),
      ).length;
      if (current > before) return performance.now() - started;
    }
    throw new Error("terminal resize did not reach the scoped adapter");
  },
  writeBurst: async (minimumBytes) => {
    const row = "0123456789abcdef0123456789abcdef0123456789abcdef\r\n";
    const rows = Math.ceil(minimumBytes / encoder.encode(row).length);
    const byteLength = active.source.queue(`${row.repeat(rows)}TERMINAL_BURST_COMPLETE\r\n`);
    await active.session.refresh();
    return byteLength;
  },
};
