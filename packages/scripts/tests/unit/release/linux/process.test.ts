import { describe, expect, it } from "vitest";

import { parseParentPid, parseTcpListeners } from "../../../../release/linux-process.mjs";

describe("Linux installed-wrapper process inspection", () => {
  it("reads process parentage independently of the spawning thread", () => {
    expect(parseParentPid("Name:\tzd\nState:\tS (sleeping)\nPPid:\t4321\n")).toBe(4321);
    expect(parseParentPid("Name:\tzd\nState:\tS (sleeping)\n")).toBeNull();
  });

  it("selects the one loopback listener owned by the host", () => {
    const table = [
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode",
      "   0: 0100007F:A1B2 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 4242 1",
      "   1: 00000000:1F90 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 8888 1",
      "",
    ].join("\n");

    expect(parseTcpListeners(table, new Set(["4242"]))).toEqual([41394]);
  });

  it("ignores non-listening, non-loopback, and unowned sockets", () => {
    const table = [
      "  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode",
      "   0: 0100007F:1234 00000000:0000 01 00000000:00000000 00:00000000 00000000 1000 0 1000 1",
      "   1: 0200007F:1234 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 1001 1",
      "   2: 0100007F:1234 00000000:0000 0A 00000000:00000000 00:00000000 00000000 1000 0 1002 1",
      "",
    ].join("\n");

    expect(parseTcpListeners(table, new Set(["1000", "1001"]))).toEqual([]);
  });
});
