import { describe, expect, it } from "vitest";

import { parseSmokeReport } from "../../../../release/wrapper/smoke.mjs";

describe("installed wrapper smoke reports", () => {
  it("accepts only a same-generation, same-session reload after one controller connects", () => {
    const source = [
      JSON.stringify({
        phase: "ready",
        controller: "one",
        shell: "show-workbench",
        retiredAuthority: "absent",
      }),
      JSON.stringify({ phase: "reloaded", sameGeneration: true, sameSession: true }),
    ].join("\n");

    expect(parseSmokeReport(source, "reloaded")).toEqual({
      phase: "reloaded",
      sameGeneration: true,
      sameSession: true,
    });
  });

  it("rejects malformed, failed, and weakened lifecycle evidence", () => {
    expect(() => parseSmokeReport("not-json", "ready")).toThrow("invalid");
    expect(() =>
      parseSmokeReport(JSON.stringify({ phase: "failed", stage: "shell-action" }), "ready"),
    ).toThrow("shell-action");
    expect(() =>
      parseSmokeReport(
        JSON.stringify({ phase: "reloaded", sameGeneration: true, sameSession: false }),
        "reloaded",
      ),
    ).toThrow("same host session");
    expect(() =>
      parseSmokeReport(JSON.stringify({ phase: "ready", controller: "one" }), "reloaded"),
    ).toThrow("missing phase");
  });
});
