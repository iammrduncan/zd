import { afterEach, describe, expect, it, vi } from "vitest";

import {
  connectServedHostClient,
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
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "ordinary=; Max-Age=0; Path=/";
});

describe("served host client", () => {
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
    });
    expect(localStorage).toHaveLength(0);
    expect(document.cookie).toBe("ordinary=value");

    socket.emit("message", {
      data: JSON.stringify({
        protocolVersion: 1,
        type: "authenticated",
        sessionEpoch: "epoch-1",
      }),
    });
    await expect(connecting).resolves.toBeDefined();
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
});
