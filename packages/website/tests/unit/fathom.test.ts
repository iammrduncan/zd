import { describe, expect, it, vi } from "vitest";

import { FATHOM_EVENTS, trackFathomClick } from "../../lib/fathom";

describe("website Fathom events", () => {
  it.each([
    ["https://github.com/iammrduncan/zd/releases/latest", FATHOM_EVENTS.download],
    ["https://github.com/iammrduncan/zd", FATHOM_EVENTS.github],
    ["https://x.com/iamMrDuncan", FATHOM_EVENTS.x],
    ["https://discord.gg/3Qs2uejUf9", FATHOM_EVENTS.discord],
    ["https://getzensuite.com/docs/tutorials/read-and-review-markdown/", FATHOM_EVENTS.docs],
  ])("classifies %s", (href, expected) => {
    const link = document.createElement("a");
    const label = document.createElement("span");
    link.href = href;
    link.append(label);
    const trackEvent = vi.fn();

    expect(
      trackFathomClick(label, "https://getzensuite.com", { trackEvent }),
    ).toBe(expected);
    expect(trackEvent).toHaveBeenCalledExactlyOnceWith(expected);
  });

  it("ignores ordinary internal and unrecognized external links", () => {
    const trackEvent = vi.fn();
    for (const href of ["https://getzensuite.com/", "https://example.com"]) {
      const link = document.createElement("a");
      link.href = href;
      expect(trackFathomClick(link, "https://getzensuite.com", { trackEvent })).toBeNull();
    }
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("still classifies a click before the analytics script is available", () => {
    const link = document.createElement("a");
    link.href = "https://discord.gg/3Qs2uejUf9";

    expect(trackFathomClick(link, "https://getzensuite.com")).toBe(FATHOM_EVENTS.discord);
  });
});
