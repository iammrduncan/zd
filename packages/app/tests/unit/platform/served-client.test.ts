import { afterEach, describe, expect, it, vi } from "vitest";

import {
  connectServedHostClient,
  pairServedBrowser,
  type HostSocket,
  type HostSocketEvent,
} from "@/platform/served-client";

class FakeSocket implements HostSocket {
  readonly sent: string[] = [];
  readonly listeners = new Map<string, Array<(event: HostSocketEvent) => void>>();
  closed = false;

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: HostSocketEvent) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
  }

  emit(type: string, event: HostSocketEvent = {}): void {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "ordinary=; Max-Age=0; Path=/";
});

describe("served host client", () => {
  it("exchanges a process secret for a same-origin browser pairing", async () => {
    const request = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(
      async () => ({ status: 204 }) as Response,
    );

    await pairServedBrowser("http://remote-workbench:49151", "process-secret", request);

    expect(request).toHaveBeenCalledExactlyOnceWith("http://remote-workbench:49151/api/pair", {
      body: JSON.stringify({ protocolVersion: 1, secret: "process-secret" }),
      cache: "no-store",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
    });
    expect(JSON.stringify(request.mock.calls[0]?.[0])).not.toContain("process-secret");
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
  });

  it("authenticates a paired browser without putting a credential in JavaScript storage", async () => {
    document.cookie = "ordinary=value";
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://remote-workbench:49151",
      secret: null,
      socket: () => socket,
    });

    socket.emit("open");
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      protocolVersion: 1,
      type: "authenticate-browser",
      controllerId: expect.stringMatching(/^[0-9a-f]{32}$/u),
    });
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    expect(document.cookie).toBe("ordinary=value");

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    await expect(connecting).resolves.toBeDefined();
  });

  it("puts the process secret only in the first WebSocket frame", async () => {
    document.cookie = "ordinary=value";
    const sockets: FakeSocket[] = [];
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const created = new FakeSocket(url);
        sockets.push(created);
        return created;
      },
    });
    const socket = sockets[0]!;

    expect(socket.url).toBe("ws://127.0.0.1:49151/api/host");
    expect(socket.url).not.toContain("process-secret");
    expect(socket.sent).toEqual([]);
    socket.emit("open");
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      protocolVersion: 1,
      type: "authenticate",
      secret: "process-secret",
      controllerId: expect.stringMatching(/^[0-9a-f]{32}$/u),
    });
    expect(localStorage).toHaveLength(0);
    expect(document.cookie).toBe("ordinary=value");

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    await expect(connecting).resolves.toBeDefined();
  });

  it("uses the authenticated sequence as the initial live-event baseline", async () => {
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 7,
      }),
    });
    const client = await connecting;
    const events: number[] = [];
    client.onEvent((event) => events.push(event.sequence));

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 8,
        event: "terminal.outputReady",
        payload: {
          session: {
            sessionId: "session-1",
            projectId: "project-1",
            worktreeId: "worktree-1",
          },
        },
      }),
    });

    expect(events).toEqual([8]);
    expect(socket.sent.map((message) => JSON.parse(message).method).filter(Boolean)).toEqual([]);
    client.close();
  });

  it("correlates IDs and records monotonic round trip without host wall clocks", async () => {
    const times = [10, 25];
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      now: () => times.shift() ?? 25,
      requestId: () => "request-1",
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    const pending = client.request<{ readonly access: string }>("session.describe", {});
    expect(JSON.parse(socket.sent[1]!)).toEqual({
      protocolVersion: 1,
      type: "request",
      requestId: "request-1",
      method: "session.describe",
      params: {},
    });
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: "request-1",
        method: "session.describe",
        result: { access: "read-only" },
        timing: { queueMicros: 2_000, handlerMicros: 3_000, serializationMicros: 1_000 },
      }),
    });

    await expect(pending).resolves.toEqual({ access: "read-only" });
    expect(client.recentTimings()).toEqual([
      {
        requestId: "request-1",
        method: "session.describe",
        roundTripMillis: 15,
        hostQueueMicros: 2_000,
        hostHandlerMicros: 3_000,
        hostSerializationMicros: 1_000,
        transportResidualMillis: 9,
      },
    ]);
    expect(client.recentTimings()[0]).not.toHaveProperty("clientWallClock");
    expect(client.recentTimings()[0]).not.toHaveProperty("hostWallClock");
  });

  it("preserves a correlated host error envelope without requiring a response method", async () => {
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      requestId: () => "request-1",
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    const pending = client.request("session.describe", { unexpected: true });
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "error",
        requestId: "request-1",
        code: "invalid-params",
        message: "The request parameters are invalid",
      }),
    });

    await expect(pending).rejects.toThrow("invalid-params: The request parameters are invalid");
  });

  it("rejects authentication failures without issuing a host request", async () => {
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "wrong",
      socket: () => socket,
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "error",
        code: "authentication-failed",
        message: "The process secret was not accepted",
      }),
    });

    await expect(connecting).rejects.toThrow("authentication-failed");
    expect(socket.sent).toHaveLength(1);
    expect(socket.closed).toBe(true);
  });

  it("retires a replaced controller without reconnecting against the newer page", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    const socket = sockets[0]!;
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "error",
        code: "controller-replaced",
        message: "A newer controller replaced this page",
      }),
    });
    socket.emit("close");
    await vi.advanceTimersByTimeAsync(5_000);

    expect(socket.closed).toBe(true);
    expect(sockets).toHaveLength(1);
    await expect(client.request("session.describe", {})).rejects.toThrow(
      "served host connection is closed",
    );
  });

  it("bounds the number of client requests awaiting a response", async () => {
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      requestId: vi.fn().mockImplementation(() => `request-${socket.sent.length}`),
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    const pending = Array.from({ length: 32 }, () => client.request("session.describe", {}));
    await expect(client.request("session.describe", {})).rejects.toThrow("too many host requests");
    for (let index = 1; index <= pending.length; index += 1) {
      socket.emit("message", {
        data: JSON.stringify({
          protocolVersion: 1,
          type: "response",
          requestId: `request-${index}`,
          method: "session.describe",
          result: {},
          timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
        }),
      });
    }
    await expect(Promise.all(pending)).resolves.toHaveLength(32);
  });

  it("rejects oversized outbound and inbound messages at the client boundary", async () => {
    const socket = new FakeSocket("unused");
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      maxMessageBytes: 256,
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    await expect(
      client.request("file.writeText", { contentsBase64: "A".repeat(512) }),
    ).rejects.toThrow("message exceeds");
    expect(socket.sent).toHaveLength(1);

    socket.emit("message", { data: " ".repeat(257) });
    await expect(client.request("session.describe", {})).rejects.toThrow("connection is closed");
    expect(socket.closed).toBe(true);
  });

  it("reconnects with the in-memory secret and resumes events without duplicates", async () => {
    const sockets: FakeSocket[] = [];
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      requestId: () => `request-${++requestSequence}`,
    });
    const first = sockets[0]!;
    first.emit("open");
    first.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;
    const controllerId = JSON.parse(first.sent[0]!).controllerId as string;
    expect(controllerId).toMatch(/^[0-9a-f]{32}$/u);
    const events: number[] = [];
    client.onEvent((event) => events.push(event.sequence));
    first.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 1,
        event: "fileTree.changed",
        payload: { projectId: "project-1", worktreeId: "worktree-1", watchId: "watch-1" },
      }),
    });

    first.emit("close");
    expect(sockets).toHaveLength(2);
    const second = sockets[1]!;
    second.emit("open");
    expect(JSON.parse(second.sent[0]!)).toEqual({
      protocolVersion: 1,
      type: "authenticate",
      secret: "process-secret",
      controllerId,
    });
    second.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    expect(JSON.parse(second.sent[1]!)).toMatchObject({
      method: "session.resume",
      params: { sessionEpoch: "epoch-1", afterSequence: 1 },
    });
    second.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 3,
        event: "terminal.outputReady",
        payload: {
          session: { sessionId: "session-1", projectId: "project-1", worktreeId: "worktree-1" },
        },
      }),
    });
    const resume = JSON.parse(second.sent[1]!);
    second.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: resume.requestId,
        method: "session.resume",
        result: {
          status: "replayed",
          sessionEpoch: "epoch-1",
          currentSequence: 3,
          events: [
            {
              protocolVersion: 1,
              type: "event",
              sessionEpoch: "epoch-1",
              sequence: 2,
              event: "terminal.outputReady",
              payload: {
                session: {
                  sessionId: "session-1",
                  projectId: "project-1",
                  worktreeId: "worktree-1",
                },
              },
            },
          ],
        },
        timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
      }),
    });
    second.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 2,
        event: "terminal.outputReady",
        payload: {
          session: { sessionId: "session-1", projectId: "project-1", worktreeId: "worktree-1" },
        },
      }),
    });

    await vi.waitFor(() => expect(events).toEqual([1, 2, 3]));
    expect(localStorage).toHaveLength(0);
    expect(sessionStorage).toHaveLength(0);
    client.close();
  });

  it("requests an authoritative snapshot when the process epoch changes", async () => {
    const sockets: FakeSocket[] = [];
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      requestId: () => `request-${++requestSequence}`,
    });
    sockets[0]!.emit("open");
    sockets[0]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;
    const snapshots: unknown[] = [];
    client.onSnapshot((snapshot) => snapshots.push(snapshot));

    sockets[0]!.emit("close");
    const resumed = sockets[1]!;
    resumed.emit("open");
    resumed.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-2",
        sequence: 0,
      }),
    });
    const snapshotRequest = JSON.parse(resumed.sent[1]!);
    expect(snapshotRequest.method).toBe("session.snapshot");
    resumed.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: snapshotRequest.requestId,
        method: "session.snapshot",
        result: {
          sessionEpoch: "epoch-2",
          sequence: 0,
          resourceStatus: "lost",
          watches: [],
          terminals: [],
        },
        timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
      }),
    });

    await vi.waitFor(() => expect(snapshots).toHaveLength(1));
    expect(snapshots[0]).toMatchObject({ sessionEpoch: "epoch-2", resourceStatus: "lost" });
    client.close();
  });

  it("does not let a stale resume failure close a newer socket", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      requestId: () => `request-${++requestSequence}`,
    });
    sockets[0]!.emit("open");
    sockets[0]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    sockets[0]!.emit("close");
    sockets[1]!.emit("open");
    sockets[1]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    expect(JSON.parse(sockets[1]!.sent[1]!)).toMatchObject({ method: "session.resume" });

    sockets[1]!.emit("close");
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(3);
    await Promise.resolve();
    await Promise.resolve();

    expect(sockets[2]!.closed).toBe(false);
    client.close();
  });

  it("backs off when an authenticated socket repeatedly fails session recovery", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
      requestId: () => `request-${++requestSequence}`,
    });
    sockets[0]!.emit("open");
    sockets[0]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    sockets[0]!.emit("close");
    sockets[1]!.emit("open");
    sockets[1]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const resume = JSON.parse(sockets[1]!.sent[1]!);
    sockets[1]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: resume.requestId,
        method: "session.resume",
        result: { status: "invalid" },
        timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
      }),
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(99);
    expect(sockets).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sockets).toHaveLength(3);
    client.close();
  });

  it("buffers live events while a resync marker obtains an authoritative snapshot", async () => {
    const socket = new FakeSocket("unused");
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      requestId: () => `request-${++requestSequence}`,
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;
    const events: number[] = [];
    const snapshots: number[] = [];
    client.onEvent((event) => events.push(event.sequence));
    client.onSnapshot((snapshot) => snapshots.push(snapshot.sequence));

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 1,
        event: "session.resyncRequired",
        payload: {},
      }),
    });
    const snapshotRequest = JSON.parse(socket.sent[1]!);
    expect(snapshotRequest.method).toBe("session.snapshot");
    await expect(client.request("session.describe", {})).rejects.toThrow("temporarily unavailable");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 2,
        event: "fileTree.changed",
        payload: { projectId: "project-1", worktreeId: "worktree-1", watchId: "watch-1" },
      }),
    });
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: snapshotRequest.requestId,
        method: "session.snapshot",
        result: {
          sessionEpoch: "epoch-1",
          sequence: 1,
          resourceStatus: "active",
          watches: [],
          terminals: [],
        },
        timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
      }),
    });
    await vi.waitFor(() => expect(snapshots).toEqual([1]));
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "event",
        sessionEpoch: "epoch-1",
        sequence: 2,
        event: "fileTree.changed",
        payload: { projectId: "project-1", worktreeId: "worktree-1", watchId: "watch-1" },
      }),
    });

    await vi.waitFor(() => expect(events).toEqual([1, 2]));
    client.close();
  });

  it("sends one timed heartbeat at a time and records its round trip", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket("unused");
    let requestSequence = 0;
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: () => socket,
      now: () => Date.now(),
      requestId: () => `request-${++requestSequence}`,
    });
    socket.emit("open");
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    await vi.advanceTimersByTimeAsync(10_000);
    const heartbeat = JSON.parse(socket.sent[1]!);
    expect(heartbeat).toMatchObject({ method: "session.heartbeat", params: {} });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(socket.sent).toHaveLength(2);
    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "response",
        requestId: heartbeat.requestId,
        method: "session.heartbeat",
        result: { sessionEpoch: "epoch-1", sequence: 0 },
        timing: { queueMicros: 0, handlerMicros: 0, serializationMicros: 0 },
      }),
    });
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(JSON.parse(socket.sent[2]!)).toMatchObject({ method: "session.heartbeat" });
    expect(client.recentTimings().map(({ method }) => method)).toContain("session.heartbeat");
    client.close();
  });

  it("reconnects after three heartbeat intervals without a response", async () => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    const connecting = connectServedHostClient({
      origin: "http://127.0.0.1:49151",
      secret: "process-secret",
      socket: (url) => {
        const socket = new FakeSocket(url);
        sockets.push(socket);
        return socket;
      },
    });
    sockets[0]!.emit("open");
    sockets[0]!.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
        sequence: 0,
      }),
    });
    const client = await connecting;

    await vi.advanceTimersByTimeAsync(30_000);

    expect(sockets[0]!.closed).toBe(true);
    expect(sockets[0]!.sent.map((message) => JSON.parse(message).method).filter(Boolean)).toEqual([
      "session.heartbeat",
    ]);
    expect(sockets).toHaveLength(2);
    client.close();
  });
});
