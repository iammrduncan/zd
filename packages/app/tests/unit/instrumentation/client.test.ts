import { describe, expect, it, vi } from "vitest";

import {
  createInstrumentationClient,
  type DiagnosticStatus,
  type DiagnosticTransport,
} from "@/instrumentation";

const disabled: DiagnosticStatus = {
  enabled: false,
  sessionId: null,
  backgroundSampling: false,
  problem: null,
};

const enabled: DiagnosticStatus = {
  enabled: true,
  sessionId: "diagnostic-session-1",
  backgroundSampling: true,
  problem: null,
};

function transport(): DiagnosticTransport {
  return {
    enable: vi.fn(async () => enabled),
    disable: vi.fn(async () => disabled),
    record: vi.fn(async () => ({ recorded: true, problem: null })),
  };
}

describe("instrumentation client lifecycle", () => {
  it("does not create a transport, read a clock, or emit work while off", async () => {
    const native = transport();
    const factory = vi.fn(() => native);
    const clock = vi.fn(() => 12);
    const client = createInstrumentationClient(factory, clock);

    expect(client.snapshot()).toEqual(disabled);
    expect(
      await client.record({
        recordType: "event",
        operation: "workbench.launch",
        outcome: "ok",
      }),
    ).toEqual({ recorded: false, problem: null });
    expect(client.startSpan("file.open")).toBeNull();
    expect(factory).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
    expect(native.record).not.toHaveBeenCalled();
  });

  it("creates one transport only after explicit enable and flushes it on disable", async () => {
    const native = transport();
    const factory = vi.fn(() => native);
    const client = createInstrumentationClient(factory);

    await expect(client.enable()).resolves.toEqual(enabled);
    await expect(client.enable()).resolves.toEqual(enabled);
    expect(factory).toHaveBeenCalledOnce();
    expect(native.enable).toHaveBeenCalledOnce();

    await expect(client.disable()).resolves.toEqual(disabled);
    expect(native.disable).toHaveBeenCalledOnce();
    expect(client.snapshot()).toEqual(disabled);
  });

  it("sends only prepared records and closes a measured span once", async () => {
    const native = transport();
    const times = [10, 10.125];
    const client = createInstrumentationClient(
      () => native,
      () => times.shift() ?? 10.125,
    );
    await client.enable();

    const span = client.startSpan("file.open", {
      projectId: "project-a",
      logicalPath: "/Users/alice/secret.md",
    });
    expect(span).not.toBeNull();
    await span!.end("ok");
    await span!.end("failed");

    expect(native.record).toHaveBeenCalledOnce();
    expect(native.record).toHaveBeenCalledWith({
      recordType: "span",
      operation: "file.open",
      traceId: expect.stringMatching(/^trace-/),
      spanId: expect.stringMatching(/^span-/),
      durationUs: 125,
      outcome: "ok",
      context: {
        projectId: "project-a",
        logicalPath: { scope: "redacted", depth: 3, extension: "md" },
      },
    });
  });

  it("turns transport and validation failures into inspectable local state", async () => {
    const native = transport();
    vi.mocked(native.record).mockRejectedValueOnce(new Error("native boundary unavailable"));
    const client = createInstrumentationClient(() => native);
    await client.enable();

    await expect(
      client.record({ recordType: "event", operation: "contains spaces", outcome: "ok" }),
    ).resolves.toEqual({
      recorded: false,
      problem: expect.stringContaining("operation"),
    });
    await expect(
      client.record({ recordType: "event", operation: "file.open", outcome: "ok" }),
    ).resolves.toEqual({
      recorded: false,
      problem: "diagnostic writer is unavailable",
    });
    expect(client.snapshot().problem).toBe("diagnostic writer is unavailable");
  });

  it("stops accepting new records before waiting for the writer to close", async () => {
    let release!: () => void;
    const native = transport();
    vi.mocked(native.disable).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(disabled);
        }),
    );
    const client = createInstrumentationClient(() => native);
    await client.enable();

    const stopping = client.disable();
    await expect(
      client.record({ recordType: "event", operation: "file.open", outcome: "ok" }),
    ).resolves.toEqual({ recorded: false, problem: null });
    expect(native.record).not.toHaveBeenCalled();

    release();
    await stopping;
  });
});
