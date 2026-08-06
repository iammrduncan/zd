/**
 * Suite preferences that outlive a window.
 *
 * DESIGN.md §7.6 calls Word Wrap "a suite preference applied to every document",
 * and vision §6.1 says it "persists". Both sentences are about the same thing: a
 * choice made once, in one document, is the choice every document opens with and
 * the choice the app opens with tomorrow.
 *
 * **In the suite and not in the mini app**, for the reason the shortcut registry
 * is: a preference that belonged to `zd md` would have to be made again in the
 * next tool, and §3's whole claim is that these are one suite rather than a
 * folder of programs.
 *
 * `localStorage` rather than a file through `platform.ts`. It is durable in a
 * webview and in a browser alike, which keeps the dev pages honest — a preference
 * that only persisted in the packaged app could not be looked at while building
 * one. Session 4.4 brings the Settings surface and may want a file behind it; the
 * accessors below are the seam that makes that a change to this file alone.
 *
 * Nothing here throws. Storage can be absent or refuse a write — a webview with
 * storage disabled, a private window — and a preference that cannot be saved must
 * still work for the rest of the session. So reads fall back to the default and
 * writes fall back to memory, which is exactly what "define errors out of
 * existence" means here: the caller has no failure to handle because there is no
 * outcome in which it is left without an answer.
 */

/**
 * The in-session truth, and the fallback when storage will not have it.
 *
 * Without this a failed write would be silently undone by the next read, so the
 * toggle would appear not to work at all rather than merely not to persist.
 */
const session = new Map<string, string>();

const WORD_WRAP = "zd.wordWrap";
const SSPS_ENABLED = "zd.sspsEnabled";
const SSPS_CHANGED = "zd:ssps-enabled";

function read(key: string): string | null {
  const remembered = session.get(key);
  if (remembered !== undefined) return remembered;

  try {
    return window.localStorage.getItem(key);
  } catch {
    // Storage exists as a property and throws on access — the documented shape of
    // a blocked webview. Nothing to report: the default is a complete answer.
    return null;
  }
}

function write(key: string, value: string): void {
  session.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Kept in memory above, so this session still behaves. Only tomorrow forgets.
  }
}

/**
 * Do lines wrap? §7.6: "It is on by default."
 *
 * A named accessor rather than `read("zd.wordWrap")` at each call site, so the key
 * exists once. Two call sites holding the same string is how a preference quietly
 * becomes two preferences.
 */
export function wordWrap(): boolean {
  // Only the exact stored `false` turns it off. An absent value, and anything
  // unrecognised left by an older build, both mean the default.
  return read(WORD_WRAP) !== "false";
}

/** Remember whether lines wrap, for every document and for next time. */
export function setWordWrap(on: boolean): void {
  write(WORD_WRAP, String(on));
}

/** Does this installation report its native windows as present to SSPS? */
export function sspsEnabled(): boolean {
  return read(SSPS_ENABLED) !== "false";
}

/** Persist the suite-wide SSPS choice and notify this window immediately. */
export function setSspsEnabled(on: boolean): void {
  write(SSPS_ENABLED, String(on));
  window.dispatchEvent(new CustomEvent<boolean>(SSPS_CHANGED, { detail: on }));
}

/** Follow SSPS preference changes from this window and every other open window. */
export function onSspsEnabledChange(handler: (on: boolean) => void): () => void {
  const local = (event: Event) => handler((event as CustomEvent<boolean>).detail);
  const stored = (event: StorageEvent) => {
    if (event.key !== SSPS_ENABLED) return;

    if (event.newValue === null) session.delete(SSPS_ENABLED);
    else session.set(SSPS_ENABLED, event.newValue);
    handler(event.newValue !== "false");
  };

  window.addEventListener(SSPS_CHANGED, local);
  window.addEventListener("storage", stored);
  return () => {
    window.removeEventListener(SSPS_CHANGED, local);
    window.removeEventListener("storage", stored);
  };
}

/**
 * Forget everything, for tests.
 *
 * The in-session map would otherwise outlive a `localStorage.clear()` and make one
 * test's choice the next test's default.
 */
export function forgetPreferences(): void {
  session.clear();
}
