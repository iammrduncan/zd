import { describe, expect, it } from "vitest";

import { browserTestServer } from "../../../../../playwright.config";

describe("the Playwright server boundary", () => {
  it("starts its own server by default instead of trusting an unrelated process", () => {
    expect(browserTestServer({})).toEqual({
      port: 1420,
      url: "http://localhost:1420",
      reuseExistingServer: false,
    });
  });

  it("uses an explicit unoccupied port for parallel local work", () => {
    expect(browserTestServer({ ZD_E2E_PORT: "4179" })).toMatchObject({
      port: 4179,
      url: "http://localhost:4179",
    });
  });

  it("only reuses a server when the caller explicitly accepts that risk", () => {
    expect(browserTestServer({ ZD_E2E_REUSE_SERVER: "1" }).reuseExistingServer).toBe(true);
  });

  it.each(["", "0", "1023", "65536", "not-a-port"])('rejects the invalid port "%s"', (port) => {
    expect(() => browserTestServer({ ZD_E2E_PORT: port })).toThrow(/ZD_E2E_PORT/u);
  });
});
