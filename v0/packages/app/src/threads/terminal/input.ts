import type { TerminalKeyboardInput } from "./types";

const encoder = new TextEncoder();
const SPECIAL_KEYS: Readonly<Record<string, readonly number[]>> = Object.freeze({
  Enter: [13],
  Backspace: [127],
  Tab: [9],
  Escape: [27],
  ArrowUp: [27, 91, 65],
  ArrowDown: [27, 91, 66],
  ArrowRight: [27, 91, 67],
  ArrowLeft: [27, 91, 68],
  Home: [27, 91, 72],
  End: [27, 91, 70],
  Delete: [27, 91, 51, 126],
  PageUp: [27, 91, 53, 126],
  PageDown: [27, 91, 54, 126],
});

/** Map only terminal-owned keys. Meta chords remain available to the app and browser. */
export function terminalInputBytes(input: TerminalKeyboardInput): readonly number[] | null {
  if (input.metaKey) return null;
  const special = SPECIAL_KEYS[input.key];
  if (special) return [...special];

  if (input.ctrlKey && input.key.length === 1) {
    const code = input.key.toUpperCase().codePointAt(0)!;
    if (code >= 64 && code <= 95) return [code - 64];
    return null;
  }
  if (input.key.length !== 1) return null;

  const encoded = [...encoder.encode(input.key)];
  return input.altKey ? [27, ...encoded] : encoded;
}
