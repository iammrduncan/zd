import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  chordLabel,
  clearCommands,
  commands,
  dispatch,
  register,
  registerCommandObserver,
  releaseHeld,
  setCommandChord,
  type Command,
} from "@/workbench/shortcuts";

// DESIGN.md §7.1 and vision §7.1: "There is one shortcut registry. The Reference
// renders it; it is not a hand-maintained list that drifts from reality." And
// finding F16, the failure this exists to prevent: "Many shortcuts shown in the
// Shortcut Reference appear to do nothing. Every displayed binding must dispatch
// through the real production keyboard path to its named command."
//
// So the registry's whole job is that a listed entry and a working key are the
// same fact. These tests are that claim.

const key = (init: Partial<KeyboardEvent> & { key: string }) =>
  ({
    ...init,
    metaKey: init.metaKey ?? false,
    ctrlKey: init.ctrlKey ?? false,
    shiftKey: init.shiftKey ?? false,
    altKey: init.altKey ?? false,
    target: init.target ?? null,
    preventDefault: vi.fn(),
  }) as unknown as KeyboardEvent;

const save = (run = vi.fn(() => true)): Command => ({
  id: "document.save",
  chord: { key: "s", mod: true },
  description: "Save the document",
  run,
});

/**
 * Pretend to be macOS unless a test says otherwise.
 *
 * DESIGN.md §8 names it the primary platform, and `mod` resolves to Cmd there —
 * so every `metaKey: true` below is written in the platform's own terms rather
 * than in jsdom's, whose navigator reports neither.
 *
 * Through the navigator `currentPlatform()` actually reads, rather than by handing
 * `dispatch` a platform: a seam added for a test lets the test agree with itself
 * and not with the app.
 */
function onPlatform(platform: "mac" | "other"): void {
  vi.stubGlobal("navigator", {
    platform: platform === "mac" ? "MacIntel" : "Win32",
    userAgent: "",
  });
}

beforeEach(() => {
  clearCommands();
  onPlatform("mac");
});

afterEach(() => vi.unstubAllGlobals());

describe("the registry", () => {
  it("lists what was registered", () => {
    register(save());
    expect(commands().map((c) => c.id)).toEqual(["document.save"]);
  });

  it("gives back a way to remove a command again", () => {
    const remove = register(save());
    remove();
    expect(commands()).toEqual([]);
  });

  it("has no entry that does not resolve to a handler", () => {
    register(save());
    // F16 stated positively. A registry that can hold a description without a
    // handler is a registry that can display a shortcut that does nothing.
    for (const command of commands()) {
      expect(typeof command.run, `${command.id} has no handler`).toBe("function");
    }
  });

  it("refuses a second command on the same chord", () => {
    register(save());
    // Two handlers on one key means the Reference cannot say what the key does,
    // and which one wins becomes registration order — invisible and arbitrary.
    expect(() => register({ ...save(), id: "document.other" })).toThrow(/already/i);
  });

  it("rebinds one command and refuses a chord owned by another", () => {
    const run = vi.fn(() => true);
    register(save(run));
    register({
      id: "document.find",
      chord: { key: "f", mod: true },
      description: "Find",
      run: () => true,
    });

    expect(setCommandChord("document.save", { key: "k", mod: true, alt: true })).toEqual({
      updated: true,
    });
    expect(commands().find(({ id }) => id === "document.save")?.chord).toEqual({
      key: "k",
      mod: true,
      alt: true,
    });
    expect(dispatch(key({ key: "s", metaKey: true }))).toBe(false);
    expect(dispatch(key({ key: "˚", code: "KeyK", metaKey: true, altKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(setCommandChord("document.save", { key: "f", mod: true })).toMatchObject({
      updated: false,
      problem: expect.stringContaining("Find"),
    });
  });
});

describe("dispatch", () => {
  it("leaves a captured shortcut editor key for the recorder", () => {
    const run = vi.fn(() => true);
    register(save(run));
    const recorder = document.createElement("button");
    recorder.dataset.shortcutRecorder = "true";

    expect(dispatch(key({ key: "s", metaKey: true, target: recorder }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("publishes only commands that actually ran", () => {
    const observed = vi.fn();
    const detach = registerCommandObserver(observed);
    register(save());

    dispatch(key({ key: "s", metaKey: true }));
    dispatch(key({ key: "q", metaKey: true }));

    expect(observed).toHaveBeenCalledExactlyOnceWith("document.save");
    detach();
    dispatch(key({ key: "s", metaKey: true }));
    expect(observed).toHaveBeenCalledOnce();
  });

  it("runs the command whose chord matches", () => {
    const run = vi.fn(() => true);
    register(save(run));

    expect(dispatch(key({ key: "s", metaKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("leaves a key with no command alone", () => {
    register(save());
    expect(dispatch(key({ key: "q", metaKey: true }))).toBe(false);
  });

  it("leaves global bindings to the native registrar", () => {
    const run = vi.fn(() => true);
    register({
      id: "window.summon",
      chord: { key: " ", mod: true, shift: true },
      scope: "global",
      description: "Summon the workbench",
      run,
    });

    expect(dispatch(key({ key: " ", metaKey: true, shiftKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not treat a bare key as its modified chord", () => {
    const run = vi.fn(() => true);
    register(save(run));

    // Typing "s" into a document must never save it.
    expect(dispatch(key({ key: "s" }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not accept ctrl for mod on macOS", () => {
    /*
     * This asserted the opposite until 2026-07-30 — "accepts ctrl for mod as well
     * as meta, so one entry covers both platforms" — and the reasoning behind it
     * was that a Windows build could not then silently end up with no shortcuts.
     *
     * It was audit finding M1: on macOS `ctrl+s` is not save, and claiming it in
     * the capture phase took the platform's own emacs-style text-editing keys away
     * from the editor. One entry still covers both platforms; what changed is that
     * `mod` now *resolves* per platform instead of accepting either key on both.
     * The whole set of cases is at the bottom of this file.
     */
    const run = vi.fn(() => true);
    register(save(run));
    expect(dispatch(key({ key: "s", ctrlKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("matches the key case-insensitively", () => {
    const run = vi.fn(() => true);
    register(save(run));
    // Shift or caps lock changes event.key to "S" without changing the chord.
    expect(dispatch(key({ key: "S", metaKey: true, shiftKey: true }))).toBe(false);
    expect(dispatch(key({ key: "S", metaKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("does not run a command that says it is unavailable", () => {
    const run = vi.fn(() => true);
    register({ ...save(run), available: () => false });

    // §7.1: "A binding that cannot run in the current context is presented
    // honestly rather than displayed as working." Not running it is the half of
    // that promise the registry owns.
    expect(dispatch(key({ key: "s", metaKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("leaves the key to the platform when a handler declines", () => {
    const run = vi.fn(() => false);
    register(save(run));

    // A handler that returns false had nothing to do — the chord matched but the
    // command passed. The key must not be swallowed.
    expect(dispatch(key({ key: "s", metaKey: true }))).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("chordLabel", () => {
  it("writes the platform's own modifier", () => {
    expect(chordLabel({ key: "s", mod: true }, "mac")).toBe("⌘S");
    expect(chordLabel({ key: "s", mod: true }, "other")).toBe("Ctrl+S");
  });

  it("orders modifiers the same way every time", () => {
    expect(chordLabel({ key: "z", mod: true, alt: true }, "mac")).toBe("⌥⌘Z");
    expect(chordLabel({ key: "z", mod: true, alt: true }, "other")).toBe("Ctrl+Alt+Z");
  });

  it("names keys that are not single characters", () => {
    expect(chordLabel({ key: "ArrowDown" }, "mac")).toBe("↓");
    expect(chordLabel({ key: "ArrowDown" }, "other")).toBe("Down");
  });
});

describe("re-registering", () => {
  it("replaces a command with the same id rather than throwing", () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    register(save(first));
    register(save(second));

    // A window remounting registers its own commands again, with fresh closures
    // over a new editor. Treating that as a collision makes the second mount of
    // any remounted feature a crash.
    expect(commands()).toHaveLength(1);
    dispatch(key({ key: "s", metaKey: true }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });

  it("does not let a stale unregister remove the replacement", () => {
    const remove = register(save());
    const second = vi.fn(() => true);
    register(save(second));
    remove();

    expect(commands(), "the old unregister removed the new command").toHaveLength(1);
  });
});

describe("a held command", () => {
  /*
   * A chord can be momentary: it runs on keydown and is told when the hold ends.
   * That belongs here rather than in the surface it affects, because §7.1 allows
   * one place for a binding to live and a second keyup listener elsewhere would
   * split one binding across two owners.
   */
  const held = (release = vi.fn()): Command => ({
    id: "view.peek",
    chord: { key: "v", mod: true },
    description: "Peek at the alternate view",
    run: () => true,
    release,
  });

  it("is released when its own key goes up", () => {
    const release = vi.fn();
    register(held(release));

    dispatch(key({ key: "v", metaKey: true }));
    expect(release).not.toHaveBeenCalled();

    releaseHeld(key({ key: "v", metaKey: true }));
    expect(release).toHaveBeenCalledOnce();
  });

  it("is released when the modifier goes up first", () => {
    // The common case, and the one a keyup on the character alone would miss:
    // let go of Cmd before the period and the browser reports `key: "Meta"`.
    const release = vi.fn();
    register(held(release));

    dispatch(key({ key: "v", metaKey: true }));
    releaseHeld(key({ key: "Meta" }));

    expect(release).toHaveBeenCalledOnce();
  });

  it("is not released by an unrelated key going up", () => {
    const release = vi.fn();
    register(held(release));

    dispatch(key({ key: "v", metaKey: true }));
    releaseHeld(key({ key: "a" }));

    expect(release).not.toHaveBeenCalled();
  });

  it("is released once, however many keys go up", () => {
    // Both keys of the chord come up, in some order, every single time.
    const release = vi.fn();
    register(held(release));

    dispatch(key({ key: "v", metaKey: true }));
    releaseHeld(key({ key: "v" }));
    releaseHeld(key({ key: "Meta" }));

    expect(release).toHaveBeenCalledOnce();
  });

  it("does not hold a command that declined to run", () => {
    const release = vi.fn();
    register({ ...held(release), run: () => false });

    dispatch(key({ key: "v", metaKey: true }));
    releaseHeld(key({ key: "Meta" }));

    expect(release).not.toHaveBeenCalled();
  });

  it("leaves a command with no release alone", () => {
    const run = vi.fn(() => true);
    register(save(run));

    dispatch(key({ key: "s", metaKey: true }));
    releaseHeld(key({ key: "Meta" }));

    expect(run).toHaveBeenCalledOnce();
  });
});

describe("an alt chord on macOS", () => {
  /*
   * Option is a compose key. Option+Z does not deliver `key: "z"` with `altKey` set
   * — it delivers the character that composition produced, `key: "Ω"`, with
   * `code: "KeyZ"`. So a registry that compares `event.key` cannot match any chord
   * that uses Alt, on the platform §8 names as primary.
   *
   * This is finding F03's named first-prototype regression in this registry's terms:
   * `command_option_z_consumes_the_composed_text_event_before_the_editor_sees_it`.
   * It was hit once already, in the version of this app that shipped.
   */
  const wrap = (run = vi.fn(() => true)): Command => ({
    id: "document.wrap",
    chord: { key: "z", mod: true, alt: true },
    description: "Word wrap",
    run,
  });

  it("matches the composed character by its physical key", () => {
    const run = vi.fn(() => true);
    register(wrap(run));

    // Exactly what macOS delivers for Cmd+Option+Z.
    dispatch(key({ key: "Ω", code: "KeyZ", metaKey: true, altKey: true }));

    expect(run).toHaveBeenCalledOnce();
  });

  it("still matches when the platform reports the letter", () => {
    // Windows and Linux deliver the letter itself, and so does a synthetic event.
    // On that platform `mod` is Ctrl, so this is the same chord reached the other
    // way rather than a second spelling of the mac one.
    onPlatform("other");
    const run = vi.fn(() => true);
    register(wrap(run));

    dispatch(key({ key: "z", code: "KeyZ", ctrlKey: true, altKey: true }));

    expect(run).toHaveBeenCalledOnce();
  });

  it("does not match a different physical key that composed to the same letter", () => {
    const run = vi.fn(() => true);
    register(wrap(run));

    dispatch(key({ key: "z", code: "KeyY", metaKey: true, altKey: true }));

    expect(run).not.toHaveBeenCalled();
  });

  it("leaves chords without alt matching on the character", () => {
    /*
     * Deliberately not code-based everywhere. A chord without Alt should follow the
     * character the reader actually typed, so `Mod-s` works on a layout where S is
     * not where a US keyboard puts it. Only Alt needs the physical key, because only
     * Alt changes the character out from under the chord.
     */
    const run = vi.fn(() => true);
    register(save(run));

    dispatch(key({ key: "s", code: "KeyO", metaKey: true }));

    expect(run).toHaveBeenCalledOnce();
  });
});

describe("the logical modifier resolves per platform", () => {
  /*
   * Audit finding M1: `const mod = event.metaKey || event.ctrlKey` matched either
   * physical modifier, so on macOS — the platform DESIGN.md §8 names primary —
   * `ctrl+e` matched the `mod+e` raw-mode chord, `ctrl+s` matched save, and
   * `ctrl+.` opened the Reference.
   *
   * macOS ships emacs-style `ctrl+a`, `ctrl+e`, `ctrl+k` as system-wide
   * text-editing keys and CodeMirror's `defaultKeymap` implements them — but this
   * registry listens in the **capture phase on `window`**, so it wins before the
   * editor ever sees the key. A Mac user pressing `ctrl+e` to reach the end of a
   * line toggled raw mode instead.
   *
   * A unit test rather than a browser one, for the reason already written above
   * about Alt and `Ω`: platform modifier composition is exactly what a harness
   * supplies rather than observes. Playwright's `ControlOrMeta` resolves to Meta on
   * macOS, so an e2e suite would go green on both sides of this defect while the
   * key was dead in the product.
   *
   * The platform comes from `currentPlatform()`, stubbed here through the navigator
   * it actually reads. Passing a platform into `dispatch` would have let these
   * tests agree with themselves and not with the app.
   */
  const raw = (run = vi.fn(() => true)): Command => ({
    id: "document.raw",
    chord: { key: "e", mod: true },
    description: "Raw mode",
    run,
  });

  const escape = (run = vi.fn(() => true)): Command => ({
    id: "document.dropCaret",
    chord: { key: "Escape" },
    description: "Drop the caret",
    run,
  });

  it("leaves ctrl alone on macOS, where it is a text-editing key", () => {
    const run = vi.fn(() => true);
    register(raw(run));

    // The reported case exactly: ctrl+e is end-of-line, not raw mode.
    expect(dispatch(key({ key: "e", ctrlKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("still answers cmd on macOS", () => {
    // The control. "Never match ctrl" is satisfied by a registry that matches
    // nothing at all, which is a worse defect than the one being fixed.
    const run = vi.fn(() => true);
    register(raw(run));

    expect(dispatch(key({ key: "e", metaKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("answers ctrl everywhere else", () => {
    onPlatform("other");
    const run = vi.fn(() => true);
    register(raw(run));

    expect(dispatch(key({ key: "e", ctrlKey: true }))).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it("leaves the Windows key alone, which is the same rule seen from the other side", () => {
    onPlatform("other");
    const run = vi.fn(() => true);
    register(raw(run));

    // `win+e` opens Explorer. Claiming it would be the mirror image of eating
    // ctrl+e on a Mac.
    expect(dispatch(key({ key: "e", metaKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("treats both modifiers held as a different chord from either one", () => {
    const run = vi.fn(() => true);
    register(raw(run));

    expect(dispatch(key({ key: "e", metaKey: true, ctrlKey: true }))).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("does not let a held modifier match a chord that has none", () => {
    /*
     * The case the obvious fix misses. Escape has no `mod`, so a rule phrased only
     * as "does the logical modifier match" is satisfied when the *other* physical
     * modifier is down — and `ctrl+Escape` would drop the caret on a Mac.
     *
     * Found by reading the predicate rather than by a report, which is why it is
     * stated here before anyone hits it.
     */
    const run = vi.fn(() => true);
    register(escape(run));

    expect(dispatch(key({ key: "Escape", ctrlKey: true }))).toBe(false);
    expect(dispatch(key({ key: "Escape" })), "plain Escape stopped working").toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });
});
