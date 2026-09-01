const PROTOCOL_VERSION = 1;
const MAX_PENDING_REQUESTS = 32;
const MAX_RETAINED_TIMINGS = 128;
const MAX_HOST_DURATION_MICROS = 60_000_000;
export const MAX_SERVED_MESSAGE_BYTES = 64 * 1024 * 1024;

export interface HostSocketEvent {
  readonly data?: unknown;
}

export interface HostSocket {
  addEventListener(type: string, listener: (event: HostSocketEvent) => void): void;
  send(data: string): void;
  close(): void;
}

export interface ServedRequestTiming {
  readonly requestId: string;
  readonly method: string;
  readonly roundTripMillis: number;
  readonly hostQueueMicros: number;
  readonly hostHandlerMicros: number;
  readonly hostSerializationMicros: number;
  /** Transport, encoding, and scheduling residual; never a cross-machine wall-clock subtraction. */
  readonly transportResidualMillis: number;
}

export interface ServedHostClient {
  request<Result>(method: string, params: object): Promise<Result>;
  recentTimings(): readonly ServedRequestTiming[];
  close(): void;
}

interface ConnectOptions {
  readonly origin: string;
  readonly secret: string;
  readonly socket?: (url: string) => HostSocket;
  readonly now?: () => number;
  readonly requestId?: () => string;
  readonly maxMessageBytes?: number;
}

interface PendingRequest {
  readonly method: string;
  readonly startedAt: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (problem: Error) => void;
}

function browserSocket(url: string): HostSocket {
  const socket = new WebSocket(url);
  return {
    addEventListener: (type, listener) => {
      if (type === "message") {
        socket.addEventListener("message", (event) => listener({ data: event.data }));
      } else {
        socket.addEventListener(type, () => listener({}));
      }
    },
    send: (data) => socket.send(data),
    close: () => socket.close(),
  };
}

function websocketUrl(origin: string): string {
  const url = new URL("/api/host", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function recordObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value));
}

function utf8LengthWithin(value: string, limit: number): boolean {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
    if (bytes > limit) return false;
  }
  return true;
}

function messageObject(data: unknown, maxMessageBytes: number): Record<string, unknown> | null {
  if (typeof data !== "string") return null;
  if (!utf8LengthWithin(data, maxMessageBytes)) return null;
  try {
    return recordObject(JSON.parse(data) as unknown);
  } catch {
    return null;
  }
}

function messageProblem(message: Record<string, unknown>): Error {
  const code = typeof message.code === "string" ? message.code : "protocol-error";
  const detail = typeof message.message === "string" ? message.message : "Host request failed";
  return new Error(`${code}: ${detail}`);
}

function duration(value: unknown): number | null {
  return Number.isSafeInteger(value) &&
    Number(value) >= 0 &&
    Number(value) <= MAX_HOST_DURATION_MICROS
    ? Number(value)
    : null;
}

class SocketClient implements ServedHostClient {
  readonly #socket: HostSocket;
  readonly #now: () => number;
  readonly #nextRequestId: () => string;
  readonly #maxMessageBytes: number;
  readonly #pending = new Map<string, PendingRequest>();
  readonly #timings: ServedRequestTiming[] = [];
  #closed = false;

  constructor(
    socket: HostSocket,
    now: () => number,
    nextRequestId: () => string,
    maxMessageBytes: number,
  ) {
    this.#socket = socket;
    this.#now = now;
    this.#nextRequestId = nextRequestId;
    this.#maxMessageBytes = maxMessageBytes;
  }

  request<Result>(method: string, params: object): Promise<Result> {
    if (this.#closed) return Promise.reject(new Error("the served host connection is closed"));
    if (this.#pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error("too many host requests are awaiting a response"));
    }
    const requestId = this.#nextRequestId();
    if (this.#pending.has(requestId)) {
      return Promise.reject(new Error("the host request ID was reused"));
    }
    const startedAt = this.#now();
    return new Promise<Result>((resolve, reject) => {
      this.#pending.set(requestId, {
        method,
        startedAt,
        // The caller's result type is checked by the closed adapter contract and protocol fixtures.
        resolve: (value) => resolve(value as Result),
        reject,
      });
      try {
        const serialized = JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          type: "request",
          requestId,
          method,
          params,
        });
        if (!utf8LengthWithin(serialized, this.#maxMessageBytes)) {
          throw new Error("the served host message exceeds its byte limit");
        }
        this.#socket.send(serialized);
      } catch (cause) {
        this.#pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  receive(message: Record<string, unknown>): void {
    const requestId = typeof message.requestId === "string" ? message.requestId : null;
    if (requestId === null) return;
    const pending = this.#pending.get(requestId);
    if (!pending) return;
    this.#pending.delete(requestId);
    if (message.protocolVersion !== PROTOCOL_VERSION) {
      pending.reject(new Error("the host response did not match its request"));
      return;
    }
    if (message.type === "error") {
      pending.reject(messageProblem(message));
      return;
    }
    if (message.type !== "response") {
      pending.reject(new Error("the host response type is invalid"));
      return;
    }
    if (message.method !== pending.method) {
      pending.reject(new Error("the host response did not match its request"));
      return;
    }
    const timing = recordObject(message.timing);
    const hostQueueMicros = duration(timing?.queueMicros);
    const hostHandlerMicros = duration(timing?.handlerMicros);
    const hostSerializationMicros = duration(timing?.serializationMicros);
    if (
      hostQueueMicros === null ||
      hostHandlerMicros === null ||
      hostSerializationMicros === null
    ) {
      pending.reject(new Error("the host timing record is invalid"));
      return;
    }
    const roundTripMillis = Math.max(0, this.#now() - pending.startedAt);
    const hostMillis = (hostQueueMicros + hostHandlerMicros + hostSerializationMicros) / 1_000;
    this.#timings.push({
      requestId,
      method: pending.method,
      roundTripMillis,
      hostQueueMicros,
      hostHandlerMicros,
      hostSerializationMicros,
      transportResidualMillis: Math.max(0, roundTripMillis - hostMillis),
    });
    if (this.#timings.length > MAX_RETAINED_TIMINGS) this.#timings.shift();
    pending.resolve(message.result);
  }

  recentTimings(): readonly ServedRequestTiming[] {
    return this.#timings.map((timing) => ({ ...timing }));
  }

  fail(problem: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    for (const pending of this.#pending.values()) pending.reject(problem);
    this.#pending.clear();
  }

  close(): void {
    this.fail(new Error("the served host connection was closed"));
    this.#socket.close();
  }
}

export function connectServedHostClient(options: ConnectOptions): Promise<ServedHostClient> {
  const socket = (options.socket ?? browserSocket)(websocketUrl(options.origin));
  const now = options.now ?? (() => performance.now());
  let sequence = 0;
  const requestId = options.requestId ?? (() => `request-${++sequence}`);
  const maxMessageBytes =
    Number.isSafeInteger(options.maxMessageBytes) && Number(options.maxMessageBytes) > 0
      ? Number(options.maxMessageBytes)
      : MAX_SERVED_MESSAGE_BYTES;
  const client = new SocketClient(socket, now, requestId, maxMessageBytes);

  return new Promise<ServedHostClient>((resolve, reject) => {
    let authenticated = false;
    let settled = false;
    const refuse = (problem: Error) => {
      client.fail(problem);
      socket.close();
      if (!settled) {
        settled = true;
        reject(problem);
      }
    };
    socket.addEventListener("open", () => {
      try {
        const serialized = JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          type: "authenticate",
          secret: options.secret,
        });
        if (!utf8LengthWithin(serialized, maxMessageBytes)) {
          throw new Error("the served authentication message exceeds its byte limit");
        }
        socket.send(serialized);
      } catch (cause) {
        refuse(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    socket.addEventListener("message", ({ data }) => {
      const message = messageObject(data, maxMessageBytes);
      if (!message || message.protocolVersion !== PROTOCOL_VERSION) {
        refuse(new Error("the served host returned an invalid protocol message"));
        return;
      }
      if (!authenticated) {
        if (message.type === "error") {
          refuse(messageProblem(message));
          return;
        }
        if (message.type !== "authenticated" || typeof message.sessionEpoch !== "string") {
          refuse(new Error("the served host did not authenticate this controller"));
          return;
        }
        authenticated = true;
        settled = true;
        resolve(client);
        return;
      }
      client.receive(message);
    });
    socket.addEventListener("error", () => refuse(new Error("the served host connection failed")));
    socket.addEventListener("close", () => {
      const problem = new Error("the served host connection closed");
      client.fail(problem);
      if (!settled) {
        settled = true;
        reject(problem);
      }
    });
  });
}
