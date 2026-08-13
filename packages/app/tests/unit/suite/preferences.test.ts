import { afterEach, describe, expect, it, vi } from "vitest";

import {
  forgetPreferences,
  onSspsEnabledChange,
  setSspsEnabled,
  setWordWrap,
  sspsEnabled,
  wordWrap,
} from "@/suite/preferences";

/*
 * Suite preferences — DESIGN.md §7.6's "suite preference applied to every
 * document" and vision §6.1's "it persists".
 *
 * Storage behaviour, measured on the store. That a *document* opens wrapped or
 * unwrapped after a reload is a browser claim and lives in
 * tests/e2e/editor/word-wrap.spec.ts.
 */

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

describe("SSPS", () => {
  it("is enabled until globally disabled", () => {
    expect(sspsEnabled()).toBe(true);

    setSspsEnabled(false);
    expect(sspsEnabled()).toBe(false);

    forgetPreferences();
    expect(sspsEnabled()).toBe(false);
  });

  it("notifies this window and follows a change from another window", () => {
    const changed = vi.fn();
    const stop = onSspsEnabledChange(changed);

    setSspsEnabled(false);
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "zd.sspsEnabled",
        newValue: "true",
        storageArea: window.localStorage,
      }),
    );

    expect(changed.mock.calls).toEqual([[false], [true]]);
    expect(sspsEnabled()).toBe(true);
    stop();
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
