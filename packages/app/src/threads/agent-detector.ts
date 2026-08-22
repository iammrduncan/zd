import type { ThreadAgent } from "./types";

export const AGENT_DETECTOR_SCHEMA_VERSION = 1 as const;
const AGENT_DETECTOR_BUFFER_BYTES = 4_096;
const ADAPTER_VERSION = "terminal-control-v1" as const;
const ESCAPE = String.fromCharCode(27);
const OSC_TERMINATOR = `${ESCAPE}\\`;

export type AgentDetectorLifecycle = "unknown" | "idle" | "busy" | "waiting";

export interface AgentDetectorProfileV1 {
  readonly schemaVersion: typeof AGENT_DETECTOR_SCHEMA_VERSION;
  readonly adapterVersion: typeof ADAPTER_VERSION;
  readonly agent: Exclude<ThreadAgent, "shell" | "unknown">;
  readonly supportedCliVersions: readonly string[];
}

export interface AgentDetectorObservationV1 extends AgentDetectorProfileV1 {
  readonly lifecycle: AgentDetectorLifecycle;
  readonly revision: number;
}

export interface AgentDetectorSnapshot extends AgentDetectorObservationV1 {
  readonly bufferedBytes: number;
}

export interface SupportedAgentDetector {
  readonly profile: AgentDetectorProfileV1;
  processStarted(): AgentDetectorObservationV1 | null;
  observeInput(bytes: Uint8Array): AgentDetectorObservationV1 | null;
  observeOutput(bytes: Uint8Array): AgentDetectorObservationV1 | null;
  snapshot(): AgentDetectorSnapshot;
}

const SUPPORTED_VERSIONS = Object.freeze({
  codex: ["0.149.x"],
  "claude-code": ["2.1.x"],
  opencode: ["1.4.x"],
} satisfies Record<Exclude<ThreadAgent, "shell" | "unknown">, readonly string[]>);

function hasOscNotification(buffer: string): boolean {
  for (const prefix of [`${ESCAPE}]9;`, `${ESCAPE}]777;notify;`]) {
    const start = buffer.lastIndexOf(prefix);
    if (start < 0) continue;
    const payload = buffer.slice(start + prefix.length);
    if (payload.length <= 2_048 && payload.includes(OSC_TERMINATOR)) return true;
  }
  return false;
}

class TerminalControlAgentDetector implements SupportedAgentDetector {
  readonly profile: AgentDetectorProfileV1;
  #buffer = "";
  #lifecycle: AgentDetectorLifecycle = "unknown";
  #revision = 0;

  constructor(agent: Exclude<ThreadAgent, "shell" | "unknown">) {
    this.profile = Object.freeze({
      schemaVersion: AGENT_DETECTOR_SCHEMA_VERSION,
      adapterVersion: ADAPTER_VERSION,
      agent,
      supportedCliVersions: Object.freeze([...SUPPORTED_VERSIONS[agent]]),
    });
  }

  processStarted(): AgentDetectorObservationV1 | null {
    return this.#transition("idle");
  }

  observeInput(bytes: Uint8Array): AgentDetectorObservationV1 | null {
    if (![...bytes].some((byte) => byte === 10 || byte === 13)) return null;
    return this.#transition("busy");
  }

  observeOutput(bytes: Uint8Array): AgentDetectorObservationV1 | null {
    const suffix = bytes.slice(-AGENT_DETECTOR_BUFFER_BYTES);
    this.#buffer = `${this.#buffer}${String.fromCharCode(...suffix)}`.slice(
      -AGENT_DETECTOR_BUFFER_BYTES,
    );
    if (this.#lifecycle !== "busy") return null;
    const bell = bytes.includes(7);
    const oscNotification = hasOscNotification(this.#buffer);
    if (!bell && !oscNotification) return null;
    this.#buffer = "";
    return this.#transition("waiting");
  }

  snapshot(): AgentDetectorSnapshot {
    return {
      ...this.profile,
      lifecycle: this.#lifecycle,
      revision: this.#revision,
      bufferedBytes: this.#buffer.length,
    };
  }

  #transition(lifecycle: AgentDetectorLifecycle): AgentDetectorObservationV1 | null {
    if (lifecycle === this.#lifecycle) return null;
    this.#lifecycle = lifecycle;
    this.#revision += 1;
    return { ...this.profile, lifecycle, revision: this.#revision };
  }
}

/**
 * A declared supported-agent thread may trust only terminal control events:
 * submitted input marks work busy, and BEL/OSC notification controls mark a
 * previously busy turn waiting. Printable output is never lifecycle authority.
 */
export function createSupportedAgentDetector(agent: ThreadAgent): SupportedAgentDetector | null {
  if (agent === "shell" || agent === "unknown") return null;
  return new TerminalControlAgentDetector(agent);
}
