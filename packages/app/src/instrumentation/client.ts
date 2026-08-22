import {
  prepareDiagnosticRecord,
  type DiagnosticContextInput,
  type DiagnosticOutcome,
  type DiagnosticRecordInput,
  type PreparedDiagnosticRecord,
} from "./schema";

export interface DiagnosticStatus {
  readonly enabled: boolean;
  readonly sessionId: string | null;
  readonly backgroundSampling: boolean;
  readonly problem: string | null;
}

export interface DiagnosticWriteOutcome {
  readonly recorded: boolean;
  readonly problem: string | null;
}

export interface DiagnosticTransport {
  enable(): Promise<DiagnosticStatus>;
  disable(): Promise<DiagnosticStatus>;
  record(record: PreparedDiagnosticRecord): Promise<DiagnosticWriteOutcome>;
}

export interface DiagnosticSpan {
  end(outcome: DiagnosticOutcome): Promise<DiagnosticWriteOutcome>;
}

export interface InstrumentationClient {
  snapshot(): DiagnosticStatus;
  enable(): Promise<DiagnosticStatus>;
  disable(): Promise<DiagnosticStatus>;
  record(input: DiagnosticRecordInput): Promise<DiagnosticWriteOutcome>;
  startSpan(operation: string, context?: DiagnosticContextInput): DiagnosticSpan | null;
}

const OFF: DiagnosticStatus = Object.freeze({
  enabled: false,
  sessionId: null,
  backgroundSampling: false,
  problem: null,
});

const NOT_RECORDED: DiagnosticWriteOutcome = Object.freeze({ recorded: false, problem: null });

function safeFailure(problem: string): DiagnosticStatus {
  return { ...OFF, problem };
}

/**
 * The zero-cost switch above the native writer. Its factory is deliberately lazy:
 * an ordinary off-by-default run cannot construct a writer, timer, or sampler.
 */
export function createInstrumentationClient(
  transportFactory: () => DiagnosticTransport,
  monotonicNow = () => performance.now(),
): InstrumentationClient {
  let transport: DiagnosticTransport | null = null;
  let status = OFF;
  let accepting = false;
  let desiredEnabled = false;
  let identity = 0;
  let transition = Promise.resolve();

  function native(): DiagnosticTransport {
    transport ??= transportFactory();
    return transport;
  }

  function serialize(task: () => Promise<DiagnosticStatus>): Promise<DiagnosticStatus> {
    const result = transition.then(task, task);
    transition = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  const client: InstrumentationClient = {
    snapshot: () => status,

    enable() {
      desiredEnabled = true;
      return serialize(async () => {
        if (!desiredEnabled) return status;
        if (status.enabled) {
          accepting = true;
          return status;
        }
        try {
          status = await native().enable();
          accepting = desiredEnabled && status.enabled;
        } catch {
          accepting = false;
          status = safeFailure("diagnostic writer could not start");
        }
        return status;
      });
    },

    disable() {
      desiredEnabled = false;
      accepting = false;
      return serialize(async () => {
        if (!transport) return status;
        try {
          status = await transport.disable();
        } catch {
          status = safeFailure("diagnostic writer could not close cleanly");
        }
        return status;
      });
    },

    async record(input) {
      if (!accepting || !transport) return NOT_RECORDED;
      const prepared = prepareDiagnosticRecord(input);
      if (!prepared.ok) return { recorded: false, problem: prepared.problem };
      try {
        const outcome = await transport.record(prepared.value);
        if (outcome.problem) status = { ...status, problem: outcome.problem };
        return outcome;
      } catch {
        const problem = "diagnostic writer is unavailable";
        status = { ...status, problem };
        return { recorded: false, problem };
      }
    },

    startSpan(operation, context) {
      if (!accepting) return null;
      const started = monotonicNow();
      identity += 1;
      const suffix = identity.toString(16).padStart(8, "0");
      let ended = false;
      return {
        async end(outcome) {
          if (ended) return NOT_RECORDED;
          ended = true;
          const elapsedMs = Math.max(0, monotonicNow() - started);
          return client.record({
            recordType: "span",
            operation,
            traceId: `trace-${suffix}`,
            spanId: `span-${suffix}`,
            durationUs: Math.round(elapsedMs * 1_000),
            outcome,
            ...(context ? { context } : {}),
          });
        },
      };
    },
  };
  return client;
}

/** An honest local boundary for fixtures that are intentionally detached from a desktop shell. */
export function createUnavailableInstrumentationClient(
  problem = "local diagnostics are unavailable in this fixture",
): InstrumentationClient {
  return createInstrumentationClient(() => ({
    enable: async () => ({ ...OFF, problem }),
    disable: async () => OFF,
    record: async () => NOT_RECORDED,
  }));
}
