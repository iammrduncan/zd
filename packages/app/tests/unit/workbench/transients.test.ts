import { describe, expect, it, vi } from "vitest";

import { TransientCoordinator } from "@/workbench/transients";

describe("workbench transient coordination", () => {
  it("replaces ordinary planes and protects safety decisions", () => {
    const transients = new TransientCoordinator();
    const closeSettings = vi.fn();
    const closeReference = vi.fn();
    const closeSafety = vi.fn();

    expect(transients.open("settings", "ordinary", closeSettings)).toBe(true);
    expect(transients.hasActive()).toBe(true);
    expect(transients.open("reference", "ordinary", closeReference)).toBe(true);
    expect(closeSettings).toHaveBeenCalledExactlyOnceWith(false);
    expect(transients.open("trash", "safety", closeSafety)).toBe(true);
    expect(closeReference).toHaveBeenCalledExactlyOnceWith(false);
    expect(transients.open("settings", "ordinary", closeSettings)).toBe(false);
    expect(transients.dismiss()).toBe(true);
    expect(closeSafety).toHaveBeenCalledExactlyOnceWith(true);
    expect(transients.hasActive()).toBe(false);
  });
});
