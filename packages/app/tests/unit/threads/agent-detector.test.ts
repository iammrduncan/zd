import { describe, expect, it } from "vitest";

import {
  AGENT_DETECTOR_SCHEMA_VERSION,
  createSupportedAgentDetector,
  type ThreadAgent,
} from "@/threads";

const supported: Array<{ agent: ThreadAgent; version: string }> = [
  { agent: "codex", version: "0.149.x" },
  { agent: "claude-code", version: "2.1.x" },
  { agent: "opencode", version: "1.4.x" },
];

describe("the versioned supported-agent detector", () => {
  it.each(supported)("uses terminal control events for $agent $version", ({ agent, version }) => {
    const detector = createSupportedAgentDetector(agent)!;

    expect(detector.profile).toMatchObject({
      schemaVersion: AGENT_DETECTOR_SCHEMA_VERSION,
      adapterVersion: "terminal-control-v1",
      agent,
      supportedCliVersions: [version],
    });
    expect(detector.processStarted()).toMatchObject({ lifecycle: "idle", revision: 1 });
    expect(detector.observeInput(new TextEncoder().encode("write tests"))).toBeNull();
    expect(detector.observeInput(Uint8Array.of(13))).toMatchObject({
      lifecycle: "busy",
      revision: 2,
    });

    expect(detector.observeOutput(new TextEncoder().encode("done waiting complete"))).toBeNull();
    expect(detector.snapshot().lifecycle).toBe("busy");
    expect(detector.observeOutput(Uint8Array.of(7))).toMatchObject({
      lifecycle: "waiting",
      revision: 3,
    });
    expect(detector.observeOutput(Uint8Array.of(7))).toBeNull();
  });

  it("recognizes a split OSC notification and bounds incomplete control input", () => {
    const detector = createSupportedAgentDetector("codex")!;
    detector.processStarted();
    detector.observeInput(Uint8Array.of(13));

    expect(detector.observeOutput(new TextEncoder().encode("\u001b]9;Agent turn"))).toBeNull();
    expect(detector.observeOutput(new TextEncoder().encode(" complete\u001b\\"))).toMatchObject({
      lifecycle: "waiting",
    });

    detector.observeInput(Uint8Array.of(13));
    detector.observeOutput(Uint8Array.from({ length: 100_000 }, () => 65));
    expect(detector.snapshot().bufferedBytes).toBeLessThanOrEqual(4_096);
    expect(detector.snapshot().lifecycle).toBe("busy");
  });

  it("declines shell and unknown threads instead of inferring an agent", () => {
    expect(createSupportedAgentDetector("shell")).toBeNull();
    expect(createSupportedAgentDetector("unknown")).toBeNull();
  });
});
