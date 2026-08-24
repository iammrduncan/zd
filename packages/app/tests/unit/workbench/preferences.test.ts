import { afterEach, describe, expect, it, vi } from "vitest";

import {
  attentionSettings,
  clearShortcutBinding,
  diagnosticsEnabled,
  forgetPreferences,
  setAttentionAgentSound,
  setAttentionDesktopEnabled,
  setAttentionMuted,
  setAttentionSoundEnabled,
  setAttentionVolume,
  setDiagnosticsEnabled,
  setShortcutBinding,
  setWordWrap,
  shortcutBindings,
  setThemePreference,
  setSurfaceThemePreferences,
  surfaceThemePreferences,
  setThreadSecondaryLine,
  themePreference,
  threadSecondaryLine,
  wordWrap,
} from "@/workbench/preferences";

/* Workbench preference storage; browser behavior lives in the e2e editor tests. */

afterEach(() => {
  forgetPreferences();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("word wrap", () => {
  it("is on by default", () => {
    // §7.6 in as many words: "It is on by default." A reader who has never opened
    // Settings gets wrapping, and F03 is what happens when they get the opposite.
    expect(wordWrap()).toBe(true);
  });

  it("remembers being turned off", () => {
    setWordWrap(false);
    expect(wordWrap()).toBe(false);
  });

  it("remembers being turned back on", () => {
    setWordWrap(false);
    setWordWrap(true);
    expect(wordWrap()).toBe(true);
  });

  it("survives everything but storage being cleared", () => {
    setWordWrap(false);
    // A fresh module in a fresh window reads the same answer, which is the whole
    // claim: the value is in storage and not in a variable.
    forgetPreferences();
    expect(wordWrap()).toBe(false);
  });

  it("falls back to the default rather than trusting a value it did not write", () => {
    window.localStorage.setItem("zd.wordWrap", "perhaps");
    forgetPreferences();

    // Only the exact stored `false` turns wrapping off. Anything else — a older
    // build's format, a hand-edited value — means the default, because §7.6 gives
    // a default and not an error state.
    expect(wordWrap()).toBe(true);
  });
});

describe("local diagnostics", () => {
  it("is off by default", () => {
    expect(diagnosticsEnabled()).toBe(false);
  });

  it("remembers an explicit enable and disable", () => {
    setDiagnosticsEnabled(true);
    expect(diagnosticsEnabled()).toBe(true);

    setDiagnosticsEnabled(false);
    expect(diagnosticsEnabled()).toBe(false);
  });
});

describe("shortcut bindings", () => {
  it("persists validated command chords and clears one override", () => {
    setShortcutBinding("focus.toggle", { key: "k", mod: true, alt: true });
    forgetPreferences();

    expect(shortcutBindings()).toEqual({
      "focus.toggle": { key: "k", mod: true, alt: true },
    });

    clearShortcutBinding("focus.toggle");
    expect(shortcutBindings()).toEqual({});
  });

  it("ignores malformed stored chords", () => {
    window.localStorage.setItem(
      "zd.shortcutBindings.v1",
      JSON.stringify({ "focus.toggle": { key: "", mod: "yes" } }),
    );
    forgetPreferences();

    expect(shortcutBindings()).toEqual({});
  });
});

describe("theme selection", () => {
  it("defaults to following the system and persists a validated selection", () => {
    expect(themePreference()).toEqual({ selected: "system", lastValid: "current-light" });

    setThemePreference({ selected: "dark", lastValid: "dark" });
    forgetPreferences();

    expect(themePreference()).toEqual({ selected: "dark", lastValid: "dark" });
  });

  it("persists only safe theme overrides for known workbench surfaces", () => {
    setSurfaceThemePreferences({
      threads: "dracula",
      panels: "homebrew",
      code: "current-light",
      markdown: "dark",
      filePanel: "dracula",
      meta: "homebrew",
    });
    forgetPreferences();

    expect(surfaceThemePreferences()).toEqual({
      threads: "dracula",
      panels: "homebrew",
      code: "current-light",
      markdown: "dark",
      filePanel: "dracula",
      meta: "homebrew",
    });

    window.localStorage.setItem(
      "zd.surfaceThemes.v1",
      JSON.stringify({ threads: "https://bad.test", unknown: "dark", markdown: 12 }),
    );
    forgetPreferences();
    expect(surfaceThemePreferences()).toEqual({});
  });
});

describe("thread secondary line", () => {
  it("defaults to the running app and persists another valid choice", () => {
    expect(threadSecondaryLine()).toBe("app");

    setThreadSecondaryLine("directory");
    forgetPreferences();

    expect(threadSecondaryLine()).toBe("directory");
  });
});

describe("attention presentation", () => {
  it("defaults desktop presentation and completion sound off", () => {
    expect(attentionSettings()).toEqual({
      desktopEnabled: false,
      soundEnabled: false,
      muted: false,
      volume: 0.5,
      agentSounds: { codex: "subtle", "claude-code": "gentle", opencode: "bright" },
    });
  });

  it("persists permission intent, mute, bounded volume, and per-agent sounds", () => {
    setAttentionDesktopEnabled(true);
    setAttentionSoundEnabled(true);
    setAttentionMuted(true);
    setAttentionVolume(4);
    setAttentionAgentSound("codex", "bright");

    expect(attentionSettings()).toEqual({
      desktopEnabled: true,
      soundEnabled: true,
      muted: true,
      volume: 1,
      agentSounds: { codex: "bright", "claude-code": "gentle", opencode: "bright" },
    });
  });

  it("falls back from invalid persisted sound and volume values", () => {
    window.localStorage.setItem("zd.attentionVolume", "loud");
    window.localStorage.setItem("zd.attentionSound.codex", "custom-file");
    forgetPreferences();

    expect(attentionSettings().volume).toBe(0.5);
    expect(attentionSettings().agentSounds.codex).toBe("subtle");
  });
});

describe("unit storage harness", () => {
  it("provides the browser Storage methods preferences use", () => {
    expect(window.localStorage.getItem("verification.probe")).toBeNull();

    window.localStorage.setItem("verification.probe", "stored");
    expect(window.localStorage.getItem("verification.probe")).toBe("stored");

    window.localStorage.removeItem("verification.probe");
    expect(window.localStorage.getItem("verification.probe")).toBeNull();

    // Deliberately leave one value behind. The next test proves the shared
    // afterEach/beforeEach boundary removes it rather than this suite doing so.
    window.localStorage.setItem("verification.left-behind", "yes");
  });

  it("starts isolated from the preceding test", () => {
    expect(window.localStorage.getItem("verification.left-behind")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });
});

describe("when storage will not have it", () => {
  it("reads the default rather than throwing", () => {
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new Error("storage is disabled");
    });

    // A blocked webview or a private window. The caller has no failure to handle
    // because there is no outcome that leaves it without an answer.
    expect(() => wordWrap()).not.toThrow();
    expect(wordWrap()).toBe(true);
  });

  it("still honours the choice for the rest of the session", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage is full");
    });

    expect(() => setWordWrap(false)).not.toThrow();

    /*
     * The reason the store keeps its own copy. Without it a failed write would be
     * undone by the very next read, so the toggle would appear not to work at all
     * rather than merely not to persist — a much worse failure than the one that
     * actually happened.
     */
    expect(wordWrap()).toBe(false);
  });
});
