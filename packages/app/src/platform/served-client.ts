const PROTOCOL_VERSION = 1;
const MAX_PENDING_REQUESTS = 32;
const MAX_RETAINED_TIMINGS = 128;
const MAX_HOST_DURATION_MICROS = 60_000_000;
const HEARTBEAT_INTERVAL_MILLIS = 10_000;
const MAX_BUFFERED_EVENTS = 256;
const MAX_RECONNECT_DELAY_MILLIS = 1_000;
const CONTROLLER_ID_BYTES = 16;
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
  onEvent(listener: (event: ServedHostEvent) => void): () => void;
  onSnapshot(listener: (snapshot: ServedSessionSnapshot) => void): () => void;
  recentTimings(): readonly ServedRequestTiming[];
  close(): void;
}

export type ServedEventName =
  | "fileTree.changed"
  | "fileTree.unavailable"
  | "terminal.outputReady"
  | "terminal.exited"
  | "session.resyncRequired";

export interface ServedHostEvent {
  readonly protocolVersion: 1;
  readonly type: "event";
  readonly sessionEpoch: string;
  readonly sequence: number;
  readonly event: ServedEventName;
  readonly payload: Readonly<Record<string, unknown>>;
}

export interface ServedSessionSnapshot {
  readonly sessionEpoch: string;
  readonly sequence: number;
  readonly resourceStatus: "active" | "lost";
  readonly watches: readonly unknown[];
  readonly terminals: readonly unknown[];
}

interface ConnectOptions {
  readonly origin: string;
  readonly secret: string | null;
  readonly socket?: (url: string) => HostSocket;
  readonly now?: () => number;
  readonly requestId?: () => string;
  readonly maxMessageBytes?: number;
}

interface PendingRequest {
  readonly generation: number;
  readonly method: string;
  readonly startedAt: number;
  readonly resolve: (value: unknown) => void;
  readonly reject: (problem: Error) => void;
}

interface ControllerReactivation {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
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

function createControllerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CONTROLLER_ID_BYTES));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

function stringField(record: Record<string, unknown>, name: string): string | null {
  return typeof record[name] === "string" && record[name].length > 0 ? String(record[name]) : null;
}

function safeSequence(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function servedEvent(message: Record<string, unknown>): ServedHostEvent | null {
  const sessionEpoch = stringField(message, "sessionEpoch");
  const sequence = safeSequence(message.sequence);
  const payload = recordObject(message.payload);
  const event = message.event;
  if (
    message.protocolVersion !== PROTOCOL_VERSION ||
    message.type !== "event" ||
    !sessionEpoch ||
    sequence === null ||
    sequence === 0 ||
    !payload ||
    ![
      "fileTree.changed",
      "fileTree.unavailable",
      "terminal.outputReady",
      "terminal.exited",
      "session.resyncRequired",
    ].includes(String(event))
  ) {
    return null;
  }
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: "event",
    sessionEpoch,
    sequence,
    event: event as ServedEventName,
    payload,
  };
}

function servedSnapshot(value: unknown): ServedSessionSnapshot | null {
  const snapshot = recordObject(value);
  if (!snapshot) return null;
  const sessionEpoch = stringField(snapshot, "sessionEpoch");
  const sequence = safeSequence(snapshot.sequence);
  if (
    !sessionEpoch ||
    sequence === null ||
    (snapshot.resourceStatus !== "active" && snapshot.resourceStatus !== "lost") ||
    !Array.isArray(snapshot.watches) ||
    !Array.isArray(snapshot.terminals)
  ) {
    return null;
  }
  return {
    sessionEpoch,
    sequence,
    resourceStatus: snapshot.resourceStatus,
    watches: [...snapshot.watches],
    terminals: [...snapshot.terminals],
  };
}

class ReconnectingSocketClient implements ServedHostClient {
  readonly #origin: string;
  readonly #secret: string | null;
  readonly #socketFactory: (url: string) => HostSocket;
  readonly #now: () => number;
  readonly #nextRequestId: () => string;
  readonly #maxMessageBytes: number;
  #controllerId = createControllerId();
  readonly #pending = new Map<string, PendingRequest>();
  readonly #timings: ServedRequestTiming[] = [];
  readonly #eventListeners = new Set<(event: ServedHostEvent) => void>();
  readonly #snapshotListeners = new Set<(snapshot: ServedSessionSnapshot) => void>();
  #socket: HostSocket | null = null;
  #generation = 0;
  #closed = false;
  #connected = false;
  #retired = false;
  #authenticatedOnce = false;
  #recovering = false;
  #sessionEpoch: string | null = null;
  #lastSequence = 0;
  #bufferedEvents: ServedHostEvent[] = [];
  #bufferOverflow = false;
  #reconnectAttempt = 0;
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  #heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  #heartbeatPending = false;
  #missedHeartbeats = 0;
  #reactivation: ControllerReactivation | null = null;
  #stopActivationListener: (() => void) | null = null;
  #initialResolve: ((client: ServedHostClient) => void) | null = null;
  #initialReject: ((problem: Error) => void) | null = null;

  constructor(options: ConnectOptions) {
    this.#origin = options.origin;
    this.#secret = options.secret;
    this.#socketFactory = options.socket ?? browserSocket;
    this.#now = options.now ?? (() => performance.now());
    let sequence = 0;
    this.#nextRequestId = options.requestId ?? (() => `request-${++sequence}`);
    this.#maxMessageBytes =
      Number.isSafeInteger(options.maxMessageBytes) && Number(options.maxMessageBytes) > 0
        ? Number(options.maxMessageBytes)
        : MAX_SERVED_MESSAGE_BYTES;
  }

  connect(): Promise<ServedHostClient> {
    return new Promise((resolve, reject) => {
      this.#initialResolve = resolve;
      this.#initialReject = reject;
      this.#openSocket();
    });
  }

  request<Result>(method: string, params: object): Promise<Result> {
    if (this.#closed) return Promise.reject(new Error("the served host connection is closed"));
    if (this.#reactivation) {
      return this.#reactivation.promise.then(() => this.request<Result>(method, params));
    }
    if (!this.#connected || this.#recovering) {
      return Promise.reject(new Error("the served host connection is temporarily unavailable"));
    }
    return this.#sendRequest<Result>(method, params);
  }

  onEvent(listener: (event: ServedHostEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onSnapshot(listener: (snapshot: ServedSessionSnapshot) => void): () => void {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  }

  recentTimings(): readonly ServedRequestTiming[] {
    return this.#timings.map((timing) => ({ ...timing }));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#connected = false;
    this.#retired = false;
    this.#stopListeningForActivation();
    this.#finishReactivation();
    this.#clearTimers();
    this.#rejectPending(new Error("the served host connection was closed"));
    this.#socket?.close();
    this.#socket = null;
  }

  #openSocket(): void {
    if (this.#closed) return;
    const generation = ++this.#generation;
    this.#connected = false;
    let socket: HostSocket;
    try {
      socket = this.#socketFactory(websocketUrl(this.#origin));
    } catch (cause) {
      this.#connectionFailed(generation, cause instanceof Error ? cause : new Error(String(cause)));
      return;
    }
    this.#socket = socket;
    let authenticated = false;
    socket.addEventListener("open", () => {
      if (generation !== this.#generation || this.#closed) return;
      try {
        const serialized = JSON.stringify(
          this.#secret === null
            ? {
                protocolVersion: PROTOCOL_VERSION,
                type: "authenticate-browser",
                controllerId: this.#controllerId,
              }
            : {
                protocolVersion: PROTOCOL_VERSION,
                type: "authenticate",
                secret: this.#secret,
                controllerId: this.#controllerId,
              },
        );
        if (!utf8LengthWithin(serialized, this.#maxMessageBytes)) {
          throw new Error("the served authentication message exceeds its byte limit");
        }
        socket.send(serialized);
      } catch (cause) {
        this.#fatal(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
    socket.addEventListener("message", ({ data }) => {
      if (generation !== this.#generation || this.#closed) return;
      const message = messageObject(data, this.#maxMessageBytes);
      if (!message || message.protocolVersion !== PROTOCOL_VERSION) {
        this.#fatal(new Error("the served host returned an invalid protocol message"));
        return;
      }
      if (!authenticated) {
        if (message.type === "error") {
          if (message.code === "controller-replaced" && this.#authenticatedOnce) {
            this.#retireController(generation, messageProblem(message));
          } else if (message.code === "controller-unavailable" && this.#authenticatedOnce) {
            socket.close();
            this.#connectionFailed(generation, messageProblem(message));
          } else {
            this.#fatal(messageProblem(message));
          }
          return;
        }
        const epoch = stringField(message, "sessionEpoch");
        const sequence = safeSequence(message.sequence);
        if (message.type !== "authenticated" || !epoch || sequence === null) {
          this.#fatal(new Error("the served host did not authenticate this controller"));
          return;
        }
        authenticated = true;
        this.#connected = true;
        if (!this.#authenticatedOnce) {
          this.#reconnectAttempt = 0;
          this.#authenticatedOnce = true;
          this.#sessionEpoch = epoch;
          this.#lastSequence = sequence;
          this.#initialResolve?.(this);
          this.#initialResolve = null;
          this.#initialReject = null;
          this.#startHeartbeat(generation);
        } else {
          void this.#recoverAfterAuthentication(epoch, generation);
        }
        return;
      }
      if (message.type === "error" && message.code === "controller-replaced") {
        this.#retireController(generation, messageProblem(message));
        return;
      }
      const event = servedEvent(message);
      if (event) {
        this.#receiveEvent(event);
      } else {
        this.#receiveResponse(message, generation);
      }
    });
    socket.addEventListener("error", () => {
      if (generation !== this.#generation || this.#closed) return;
      socket.close();
      this.#connectionFailed(generation, new Error("the served host connection failed"));
    });
    socket.addEventListener("close", () => {
      this.#connectionFailed(generation, new Error("the served host connection closed"));
    });
  }

  #sendRequest<Result>(method: string, params: object): Promise<Result> {
    if (this.#pending.size >= MAX_PENDING_REQUESTS) {
      return Promise.reject(new Error("too many host requests are awaiting a response"));
    }
    const socket = this.#socket;
    if (!socket || !this.#connected) {
      return Promise.reject(new Error("the served host connection is temporarily unavailable"));
    }
    const requestId = this.#nextRequestId();
    if (this.#pending.has(requestId)) {
      return Promise.reject(new Error("the host request ID was reused"));
    }
    const startedAt = this.#now();
    const generation = this.#generation;
    return new Promise<Result>((resolve, reject) => {
      this.#pending.set(requestId, {
        generation,
        method,
        startedAt,
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
        socket.send(serialized);
      } catch (cause) {
        this.#pending.delete(requestId);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  #receiveResponse(message: Record<string, unknown>, generation: number): void {
    const requestId = typeof message.requestId === "string" ? message.requestId : null;
    if (requestId === null) return;
    const pending = this.#pending.get(requestId);
    if (!pending || pending.generation !== generation) return;
    this.#pending.delete(requestId);
    if (message.type === "error") {
      pending.reject(messageProblem(message));
      return;
    }
    if (message.type !== "response" || message.method !== pending.method) {
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

  #receiveEvent(event: ServedHostEvent): void {
    if (this.#recovering) {
      if (this.#bufferedEvents.length >= MAX_BUFFERED_EVENTS) {
        this.#bufferedEvents = [];
        this.#bufferOverflow = true;
      } else if (!this.#bufferOverflow) {
        this.#bufferedEvents.push(event);
      }
      return;
    }
    if (event.sessionEpoch !== this.#sessionEpoch || event.sequence > this.#lastSequence + 1) {
      this.#bufferedEvents = [event];
      this.#recovering = true;
      void this.#recoverAfterAuthentication(event.sessionEpoch, this.#generation);
      return;
    }
    const applied = this.#applyEvent(event);
    if (applied && event.event === "session.resyncRequired") {
      this.#recovering = true;
      void this.#recoverFromSnapshot(this.#generation);
    }
  }

  #applyEvent(event: ServedHostEvent): boolean {
    if (event.sessionEpoch !== this.#sessionEpoch || event.sequence <= this.#lastSequence) {
      return false;
    }
    if (event.sequence !== this.#lastSequence + 1) return false;
    this.#lastSequence = event.sequence;
    for (const listener of this.#eventListeners) listener(event);
    return true;
  }

  async #recoverAfterAuthentication(epoch: string, generation: number): Promise<void> {
    if (generation !== this.#generation || this.#closed) return;
    this.#recovering = true;
    try {
      let needsSnapshot = this.#reactivation !== null;
      if (this.#sessionEpoch !== epoch) {
        this.#sessionEpoch = epoch;
        this.#lastSequence = 0;
        needsSnapshot = true;
      } else if (!needsSnapshot) {
        const resume = await this.#sendRequest<unknown>("session.resume", {
          sessionEpoch: epoch,
          afterSequence: this.#lastSequence,
        });
        const result = recordObject(resume);
        if (result?.status === "resync-required") {
          this.#applySnapshot(result.snapshot);
        } else if (result?.status === "replayed" && Array.isArray(result.events)) {
          const replay = result.events
            .map((event) => recordObject(event))
            .map((event) => (event ? servedEvent(event) : null));
          if (replay.some((event) => event === null)) {
            throw new Error("the served event replay is invalid");
          }
          for (const event of replay as ServedHostEvent[]) {
            if (
              event.sessionEpoch !== this.#sessionEpoch ||
              event.sequence !== this.#lastSequence + 1
            ) {
              throw new Error("the served event replay is not contiguous");
            }
            this.#applyEvent(event);
            if (event.event === "session.resyncRequired") needsSnapshot = true;
          }
        } else {
          throw new Error("the served resume result is invalid");
        }
      }
      await this.#settleRecovery(generation, needsSnapshot);
    } catch {
      this.#failRecovery(generation);
    }
  }

  async #recoverFromSnapshot(generation: number): Promise<void> {
    try {
      await this.#settleRecovery(generation, true);
    } catch {
      this.#failRecovery(generation);
    }
  }

  async #settleRecovery(generation: number, initialSnapshot: boolean): Promise<void> {
    let needsSnapshot = initialSnapshot;
    for (;;) {
      if (generation !== this.#generation || this.#closed) return;
      if (needsSnapshot || this.#bufferOverflow) {
        needsSnapshot = false;
        this.#bufferOverflow = false;
        this.#bufferedEvents = [];
        await this.#requestAndApplySnapshot();
        continue;
      }

      const buffered = this.#bufferedEvents.sort((left, right) => left.sequence - right.sequence);
      this.#bufferedEvents = [];
      for (const event of buffered) {
        if (event.sessionEpoch !== this.#sessionEpoch || event.sequence > this.#lastSequence + 1) {
          needsSnapshot = true;
          continue;
        }
        if (this.#applyEvent(event) && event.event === "session.resyncRequired") {
          needsSnapshot = true;
        }
      }
      if (needsSnapshot || this.#bufferOverflow || this.#bufferedEvents.length > 0) continue;
      break;
    }
    if (generation !== this.#generation || this.#closed) return;
    this.#reconnectAttempt = 0;
    this.#recovering = false;
    this.#connected = true;
    this.#startHeartbeat(generation);
    this.#retired = false;
    this.#finishReactivation();
  }

  #failRecovery(generation: number): void {
    if (generation !== this.#generation || this.#closed) return;
    this.#recovering = false;
    this.#socket?.close();
    this.#connectionFailed(generation, new Error("the served host session could not resume"));
  }

  async #requestAndApplySnapshot(): Promise<void> {
    const snapshot = await this.#sendRequest<unknown>("session.snapshot", {});
    this.#applySnapshot(snapshot);
  }

  #applySnapshot(value: unknown): void {
    const snapshot = servedSnapshot(value);
    if (!snapshot) throw new Error("the served session snapshot is invalid");
    this.#sessionEpoch = snapshot.sessionEpoch;
    this.#lastSequence = snapshot.sequence;
    for (const listener of this.#snapshotListeners) listener(snapshot);
  }

  #startHeartbeat(generation: number): void {
    if (this.#heartbeatTimer !== null) clearTimeout(this.#heartbeatTimer);
    this.#heartbeatPending = false;
    this.#missedHeartbeats = 0;
    this.#scheduleHeartbeat(generation);
  }

  #scheduleHeartbeat(generation: number): void {
    if (this.#closed || generation !== this.#generation) return;
    this.#heartbeatTimer = setTimeout(() => {
      this.#heartbeatTimer = null;
      if (this.#closed || generation !== this.#generation || this.#recovering) return;
      this.#missedHeartbeats += 1;
      if (this.#missedHeartbeats >= 3) {
        const socket = this.#socket;
        socket?.close();
        this.#connectionFailed(generation, new Error("the served host heartbeat timed out"));
        return;
      }
      if (!this.#heartbeatPending) {
        this.#heartbeatPending = true;
        void this.#sendRequest("session.heartbeat", {})
          .then(() => {
            if (this.#closed || generation !== this.#generation) return;
            this.#heartbeatPending = false;
            this.#missedHeartbeats = 0;
          })
          .catch(() => {
            if (this.#closed || generation !== this.#generation) return;
            const socket = this.#socket;
            socket?.close();
            this.#connectionFailed(generation, new Error("the served host heartbeat failed"));
          });
      }
      this.#scheduleHeartbeat(generation);
    }, HEARTBEAT_INTERVAL_MILLIS);
  }

  #connectionFailed(generation: number, problem: Error): void {
    if (generation !== this.#generation || this.#closed) return;
    this.#connected = false;
    this.#recovering = false;
    this.#heartbeatPending = false;
    this.#missedHeartbeats = 0;
    if (this.#heartbeatTimer !== null) {
      clearTimeout(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
    this.#rejectPending(problem);
    if (!this.#authenticatedOnce) {
      this.#fatal(problem);
      return;
    }
    this.#scheduleReconnect();
  }

  #scheduleReconnect(): void {
    if (this.#closed || this.#reconnectTimer !== null) return;
    if (this.#reconnectAttempt === 0) {
      this.#reconnectAttempt = 1;
      this.#openSocket();
      return;
    }
    const delay = Math.min(
      MAX_RECONNECT_DELAY_MILLIS,
      100 * 2 ** Math.min(this.#reconnectAttempt - 1, 4),
    );
    this.#reconnectAttempt += 1;
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null;
      this.#openSocket();
    }, delay);
  }

  #rejectPending(problem: Error): void {
    for (const pending of this.#pending.values()) pending.reject(problem);
    this.#pending.clear();
  }

  #retireController(generation: number, problem: Error): void {
    if (generation !== this.#generation || this.#closed) return;
    this.#generation += 1;
    this.#connected = false;
    this.#recovering = false;
    this.#retired = true;
    this.#clearTimers();
    this.#rejectPending(problem);
    const socket = this.#socket;
    this.#socket = null;
    socket?.close();
    this.#finishReactivation();
    this.#listenForActivation();
  }

  #listenForActivation(): void {
    if (this.#stopActivationListener !== null || typeof window === "undefined") return;
    const activate = () => this.#beginReactivation();
    const activateVisiblePage = () => {
      if (this.#pageIsActive()) this.#beginReactivation();
    };
    window.addEventListener("focus", activate);
    window.addEventListener("pointerdown", activate, true);
    window.addEventListener("click", activate, true);
    window.addEventListener("keydown", activate, true);
    document.addEventListener("visibilitychange", activateVisiblePage);
    this.#stopActivationListener = () => {
      window.removeEventListener("focus", activate);
      window.removeEventListener("pointerdown", activate, true);
      window.removeEventListener("click", activate, true);
      window.removeEventListener("keydown", activate, true);
      document.removeEventListener("visibilitychange", activateVisiblePage);
    };
  }

  #stopListeningForActivation(): void {
    this.#stopActivationListener?.();
    this.#stopActivationListener = null;
  }

  #pageIsActive(): boolean {
    return (
      typeof document !== "undefined" &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    );
  }

  #beginReactivation(): void {
    if (this.#closed || !this.#retired || this.#reactivation !== null) return;
    this.#stopListeningForActivation();
    this.#controllerId = createControllerId();
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((complete) => {
      resolve = complete;
    });
    this.#reactivation = { promise, resolve };
    this.#openSocket();
  }

  #finishReactivation(): void {
    const reactivation = this.#reactivation;
    this.#reactivation = null;
    reactivation?.resolve();
  }

  #fatal(problem: Error): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#connected = false;
    this.#retired = false;
    this.#stopListeningForActivation();
    this.#finishReactivation();
    this.#clearTimers();
    this.#rejectPending(problem);
    this.#socket?.close();
    this.#initialReject?.(problem);
    this.#initialResolve = null;
    this.#initialReject = null;
  }

  #clearTimers(): void {
    if (this.#reconnectTimer !== null) clearTimeout(this.#reconnectTimer);
    if (this.#heartbeatTimer !== null) clearTimeout(this.#heartbeatTimer);
    this.#reconnectTimer = null;
    this.#heartbeatTimer = null;
    this.#heartbeatPending = false;
    this.#missedHeartbeats = 0;
  }
}

export function connectServedHostClient(options: ConnectOptions): Promise<ServedHostClient> {
  return new ReconnectingSocketClient(options).connect();
}

type PairingRequest = (input: string, init: RequestInit) => Promise<Pick<Response, "status">>;

export async function pairServedBrowser(
  origin: string,
  secret: string,
  request: PairingRequest = (input, init) => fetch(input, init),
): Promise<void> {
  const endpoint = new URL("/api/pair", origin).toString();
  const response = await request(endpoint, {
    body: JSON.stringify({ protocolVersion: PROTOCOL_VERSION, secret }),
    cache: "no-store",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    method: "POST",
    redirect: "error",
  });
  if (response.status !== 204) {
    throw new Error("authentication-failed: The process secret was not accepted");
  }
}
