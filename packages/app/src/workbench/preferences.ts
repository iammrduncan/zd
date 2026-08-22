/**
 * Durable workbench preferences.
 *
 * `localStorage` keeps the browser fixtures and packaged webview on the same
 * behavior. Reads and writes fall back to the in-session map when storage is
 * unavailable, so a preference always has a usable answer.
 */

/**
 * The in-session truth, and the fallback when storage will not have it.
 *
 * Without this a failed write would be silently undone by the next read, so the
 * toggle would appear not to work at all rather than merely not to persist.
 */
const session = new Map<string, string>();

const WORD_WRAP = "zd.wordWrap";
const DIAGNOSTICS_ENABLED = "zd.diagnosticsEnabled";

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

/** Local diagnostic evidence is an explicit opt-in and therefore defaults off. */
export function diagnosticsEnabled(): boolean {
  return read(DIAGNOSTICS_ENABLED) === "true";
}

/** Remember whether the next workbench session should collect local diagnostics. */
export function setDiagnosticsEnabled(enabled: boolean): void {
  write(DIAGNOSTICS_ENABLED, String(enabled));
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
