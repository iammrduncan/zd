import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  resolveServedHostExecutable,
  servedHostEnvironment,
  servedHostStateDirectory,
  servedHostTestTimeout,
} from "../../served/runtime";

describe("the served-host evidence runtime", () => {
  it("uses the source-tree console binary by default", () => {
    expect(
      resolveServedHostExecutable({
        environment: {},
        platform: "linux",
        repositoryRoot: "/work/zd",
      }),
    ).toBe(resolve("/work/zd/target/debug/zd"));
  });

  it("accepts only an absolute installed console path", () => {
    expect(
      resolveServedHostExecutable({
        environment: { ZD_SERVE_EXECUTABLE: "/tmp/install/usr/bin/zd" },
        platform: "linux",
        repositoryRoot: "/work/zd",
      }),
    ).toBe("/tmp/install/usr/bin/zd");
    expect(() =>
      resolveServedHostExecutable({
        environment: { ZD_SERVE_EXECUTABLE: "relative/usr/bin/zd" },
        platform: "linux",
        repositoryRoot: "/work/zd",
      }),
    ).toThrow("ZD_SERVE_EXECUTABLE must be an absolute path to zd");
  });

  it("isolates Linux state without breaking HOME-relative toolchains", () => {
    const environment = servedHostEnvironment(
      { HOME: "/home/test", PATH: "/bin" },
      "/tmp/zd-state",
      "linux",
    );

    expect(environment).toMatchObject({
      HOME: "/home/test",
      PATH: "/bin",
      XDG_CONFIG_HOME: "/tmp/zd-state",
      ZD_TEST_STATE_DIR: "/tmp/zd-state",
    });
  });

  it("isolates the macOS home used for Application Support state", () => {
    expect(servedHostEnvironment({ HOME: "/home/test" }, "/tmp/zd-state", "darwin")).toMatchObject({
      HOME: "/tmp/zd-state",
      XDG_CONFIG_HOME: "/tmp/zd-state",
    });
  });

  it("places fixtures in the state directory selected by each runtime", () => {
    expect(servedHostStateDirectory({}, "/tmp/state", "linux")).toBe("/tmp/state");
    expect(
      servedHostStateDirectory(
        { ZD_SERVE_EXECUTABLE: "/tmp/install/usr/bin/zd" },
        "/tmp/state",
        "linux",
      ),
    ).toBe("/tmp/state/com.zensuite.zd");
    expect(
      servedHostStateDirectory(
        { ZD_SERVE_EXECUTABLE: "/Applications/zd.app/Contents/Resources/bin/zd" },
        "/tmp/state",
        "darwin",
      ),
    ).toBe("/tmp/state/Library/Application Support/com.zensuite.zd");
  });

  it("allows a cold installed artifact more time without adding retries", () => {
    expect(servedHostTestTimeout({})).toBe(30_000);
    expect(servedHostTestTimeout({ ZD_SERVE_EXECUTABLE: "/tmp/install/usr/bin/zd" })).toBe(60_000);
  });
});
