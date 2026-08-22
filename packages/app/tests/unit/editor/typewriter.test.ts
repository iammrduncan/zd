import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { isTypewriter, setTypewriter, typewriterMode } from "@/editor/typewriter";

/*
 * The Typewriter Mode flag — vision §6.1's "available as a toggle".
 *
 * State only. Where the caret ends up on screen is measured in
 * tests/e2e/editor/typewriter.spec.ts, because it is a claim about pixels after a
 * scroll and nothing here has a layout.
 */

const withMode = () => EditorState.create({ doc: "one\ntwo", extensions: [typewriterMode()] });

describe("the typewriter flag", () => {
  it("is off by default", () => {
    // §6.1 lists it as a toggle and never as a default. A document that opened
    // pinned would move under the first keystroke of every session.
    expect(isTypewriter(withMode())).toBe(false);
  });

  it("turns on and off through its effect", () => {
    const on = withMode().update({ effects: setTypewriter.of(true) }).state;
    expect(isTypewriter(on)).toBe(true);

    const off = on.update({ effects: setTypewriter.of(false) }).state;
    expect(isTypewriter(off)).toBe(false);
  });

  it("survives an edit that says nothing about it", () => {
    const on = withMode().update({ effects: setTypewriter.of(true) }).state;
    const typed = on.update({ changes: { from: 0, insert: "x" } }).state;

    // The mode is a mode: it lasts until it is turned off, not until the next
    // transaction.
    expect(isTypewriter(typed)).toBe(true);
  });

  it("reads as off when the extension was never installed", () => {
    /*
     * Every caller of this asks a state that may not carry the field — the same
     * guarantee `isRaw` gives. A missing extension should mean "not pinned", not
     * an exception that takes the whole surface down.
     */
    expect(isTypewriter(EditorState.create({ doc: "one" }))).toBe(false);
  });
});
