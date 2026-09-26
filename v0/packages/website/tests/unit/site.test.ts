import { describe, expect, it } from "vitest";

import websitePackage from "../../package.json";
import { RELEASE_LABEL, softwareApplicationJsonLd } from "../../lib/site";

describe("website release version", () => {
  it("uses the synchronized website package version", () => {
    expect(RELEASE_LABEL).toBe(`v${websitePackage.version}`);
    expect(softwareApplicationJsonLd.softwareVersion).toBe(websitePackage.version);
  });
});
