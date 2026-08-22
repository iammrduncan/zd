import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const FIXTURE = resolve(
  process.cwd(),
  "packages/app/tests/fixtures/instrumentation/v1/slow-and-growing",
);

interface StoredRecord {
  readonly schemaVersion: number;
  readonly sessionId: string;
  readonly sequence: number;
  readonly monotonicUs: number;
  readonly recordType: string;
  readonly operation?: string;
  readonly durationUs?: number;
  readonly cpuPercent?: number;
  readonly residentBytes?: number;
}

function records(): StoredRecord[] {
  return readFileSync(resolve(FIXTURE, "events-00001.ndjson"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as StoredRecord);
}

describe("the agent-readable diagnostic fixture", () => {
  it("has one closed versioned manifest and one monotonic record sequence", () => {
    const manifest = JSON.parse(readFileSync(resolve(FIXTURE, "manifest.json"), "utf8")) as Record<
      string,
      unknown
    >;
    const evidence = records();

    expect(manifest).toMatchObject({
      schemaVersion: 1,
      format: "zd-diagnostics",
      closedCleanly: true,
      monotonicUnit: "microseconds",
    });
    expect(evidence.map(({ sequence }) => sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(evidence.every(({ schemaVersion }) => schemaVersion === 1)).toBe(true);
    expect(evidence.every(({ sessionId }) => sessionId === manifest.sessionId)).toBe(true);
    expect(evidence.map(({ monotonicUs }) => monotonicUs)).toEqual(
      [...evidence.map(({ monotonicUs }) => monotonicUs)].sort((left, right) => left - right),
    );
  });

  it("reconstructs one slow action and one bounded memory-growth interval", () => {
    const evidence = records();
    const slow = evidence.find(
      ({ recordType, operation }) => recordType === "span" && operation === "file.open",
    );
    const samples = evidence.filter(({ recordType }) => recordType === "sample");

    expect(slow?.durationUs).toBe(240_000);
    expect(samples).toHaveLength(2);
    expect(samples[1]!.monotonicUs - samples[0]!.monotonicUs).toBe(30_000_000);
    expect(samples[1]!.residentBytes! - samples[0]!.residentBytes!).toBe(33_554_432);
    expect(samples.every(({ cpuPercent }) => Number.isFinite(cpuPercent))).toBe(true);
  });

  it("contains no content, environment values, or full paths", () => {
    const serialized = `${readFileSync(resolve(FIXTURE, "manifest.json"), "utf8")}\n${readFileSync(
      resolve(FIXTURE, "events-00001.ndjson"),
      "utf8",
    )}`;

    expect(serialized).not.toMatch(/\/Users\/|[A-Za-z]:\\/);
    expect(serialized).not.toMatch(/"(?:contents|environment|message|prompt|transcript)"/i);
    expect(serialized).not.toMatch(/token=|password=|secret=/i);
  });
});
