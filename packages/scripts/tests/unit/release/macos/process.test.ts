import { describe, expect, it } from "vitest";

import { parseLsofListeners, parseProcessTable } from "../../../../release/macos-process.mjs";

describe("macOS installed-wrapper process inspection", () => {
  it("parses parentage without losing executable paths", () => {
    const table = [
      "  100     1 /tmp/install/zd.app/Contents/MacOS/zd-desktop /tmp/project",
      "  200   100 /tmp/install/zd.app/Contents/Resources/bin/zd __zd-wrapper-child",
      "",
    ].join("\n");

    expect(parseProcessTable(table)).toEqual([
      {
        command: "/tmp/install/zd.app/Contents/MacOS/zd-desktop /tmp/project",
        parentPid: 1,
        pid: 100,
      },
      {
        command: "/tmp/install/zd.app/Contents/Resources/bin/zd __zd-wrapper-child",
        parentPid: 100,
        pid: 200,
      },
    ]);
  });

  it("selects only IPv4 loopback listener ports", () => {
    expect(parseLsofListeners("p200\nn127.0.0.1:43123\nn*:9000\nn[::1]:8123\n")).toEqual([43123]);
  });
});
