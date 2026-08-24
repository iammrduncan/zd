import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  forgetWorkbenchSettingsPreferences,
  parseWorkbenchSettings,
  saveWorkbenchSettings,
  workbenchSettingsPreferences,
} from "@/workbench/settings-preferences";

describe("versioned workbench Settings preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    forgetWorkbenchSettingsPreferences();
  });

  it("rejects unknown schemas and clamps every bounded value", () => {
    expect(parseWorkbenchSettings({ schemaVersion: 2 }).schemaVersion).toBe(1);
    const parsed = parseWorkbenchSettings({
      schemaVersion: 1,
      appearance: { warmth: 9, proseSize: 100, codeSize: 1, headingScale: 4 },
      reading: { focusDim: -2, granularity: "word" },
      workbench: { threadsWidth: 2, filesWidth: 900, centreSplit: 4 },
    });
    expect(parsed.appearance).toEqual({
      warmth: 1,
      proseSize: 28,
      codeSize: 12,
      headingScale: 1.25,
    });
    expect(parsed.reading.focusDim).toBe(0);
    expect(parsed.reading.granularity).toBe("paragraph");
    expect(parsed.workbench).toMatchObject({
      threadsWidth: 184,
      filesWidth: 360,
      centreSplit: 0.7,
    });
  });

  it("keeps a failed write active for the session and reports it locally", () => {
    const preferences = parseWorkbenchSettings({ schemaVersion: 1, appearance: { warmth: 0.5 } });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage blocked");
    });
    expect(saveWorkbenchSettings(preferences)).toContain("storage blocked");
    expect(workbenchSettingsPreferences().appearance.warmth).toBe(0.5);
  });
});
