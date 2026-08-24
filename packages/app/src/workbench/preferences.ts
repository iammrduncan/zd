import {
  defaultAttentionSettings,
  isCompletionSound,
  type AttentionNotificationSettings,
  type CompletionSound,
  type SupportedAttentionAgent,
} from "@/notifications";
import type { Chord } from "./shortcuts";

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
const ATTENTION_DESKTOP = "zd.attentionDesktop";
const ATTENTION_SOUND = "zd.attentionSound";
const ATTENTION_MUTED = "zd.attentionMuted";
const ATTENTION_VOLUME = "zd.attentionVolume";
const SHORTCUT_BINDINGS = "zd.shortcutBindings.v1";
const THEME_SELECTION = "zd.themeSelection.v1";
const THREAD_SECONDARY_LINE = "zd.threadSecondaryLine.v1";
const PROJECT_DISCLOSURE = "zd.projectDisclosure.v1";

export type ThreadSecondaryLine = "app" | "directory" | "worktree";

function attentionSoundKey(agent: SupportedAttentionAgent): string {
  return `zd.attentionSound.${agent}`;
}

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

/** Desktop notification permission is requested only after this explicit choice. */
export function setAttentionDesktopEnabled(enabled: boolean): void {
  write(ATTENTION_DESKTOP, String(enabled));
}

/** Optional completion audio is deliberately off until explicitly enabled. */
export function setAttentionSoundEnabled(enabled: boolean): void {
  write(ATTENTION_SOUND, String(enabled));
}

export function setAttentionMuted(muted: boolean): void {
  write(ATTENTION_MUTED, String(muted));
}

export function setAttentionVolume(selectedVolume: number): void {
  const bounded = Number.isFinite(selectedVolume) ? Math.min(1, Math.max(0, selectedVolume)) : 0.5;
  write(ATTENTION_VOLUME, String(bounded));
}

export function setAttentionAgentSound(
  agent: SupportedAttentionAgent,
  sound: CompletionSound,
): void {
  write(attentionSoundKey(agent), sound);
}

/** One normalized answer for both Settings and the event-time coordinator. */
export function attentionSettings(): AttentionNotificationSettings {
  const defaults = defaultAttentionSettings();
  const rawVolume = read(ATTENTION_VOLUME);
  const storedVolume = rawVolume === null ? Number.NaN : Number(rawVolume);
  const volume = Number.isFinite(storedVolume)
    ? Math.min(1, Math.max(0, storedVolume))
    : defaults.volume;
  const sound = (agent: SupportedAttentionAgent): CompletionSound => {
    const stored = read(attentionSoundKey(agent));
    return isCompletionSound(stored) ? stored : defaults.agentSounds[agent];
  };
  return {
    desktopEnabled: read(ATTENTION_DESKTOP) === "true",
    soundEnabled: read(ATTENTION_SOUND) === "true",
    muted: read(ATTENTION_MUTED) === "true",
    volume,
    agentSounds: {
      codex: sound("codex"),
      "claude-code": sound("claude-code"),
      opencode: sound("opencode"),
    },
  };
}

function isChord(value: unknown): value is Chord {
  if (!value || typeof value !== "object") return false;
  const chord = value as Record<string, unknown>;
  return (
    typeof chord.key === "string" &&
    chord.key.length > 0 &&
    chord.key.length <= 32 &&
    [chord.mod, chord.shift, chord.alt].every(
      (modifier) => modifier === undefined || typeof modifier === "boolean",
    )
  );
}

/** Valid persisted window-command overrides, keyed by stable command id. */
export function shortcutBindings(): Readonly<Record<string, Chord>> {
  const stored = read(SHORTCUT_BINDINGS);
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([commandId, chord]) => commandId.length > 0 && commandId.length <= 128 && isChord(chord),
      ),
    );
  } catch {
    return {};
  }
}

export function setShortcutBinding(commandId: string, chord: Chord): void {
  write(SHORTCUT_BINDINGS, JSON.stringify({ ...shortcutBindings(), [commandId]: chord }));
}

export function clearShortcutBinding(commandId: string): void {
  const next = { ...shortcutBindings() };
  delete next[commandId];
  write(SHORTCUT_BINDINGS, JSON.stringify(next));
}

export interface ThemePreference {
  readonly selected: string;
  readonly lastValid: string;
}

/** Durable theme identity; catalog validation still belongs to the theme owner. */
export function themePreference(): ThemePreference {
  const stored = read(THEME_SELECTION);
  if (!stored) return { selected: "system", lastValid: "current-light" };
  try {
    const parsed = JSON.parse(stored) as Partial<ThemePreference>;
    if (
      typeof parsed.selected !== "string" ||
      parsed.selected.length === 0 ||
      parsed.selected.length > 64 ||
      typeof parsed.lastValid !== "string" ||
      parsed.lastValid.length === 0 ||
      parsed.lastValid.length > 64
    ) {
      return { selected: "system", lastValid: "current-light" };
    }
    return { selected: parsed.selected, lastValid: parsed.lastValid };
  } catch {
    return { selected: "system", lastValid: "current-light" };
  }
}

export function setThemePreference(preference: ThemePreference): void {
  write(THEME_SELECTION, JSON.stringify(preference));
}

/** The one supporting detail shown beneath every thread name. */
export function threadSecondaryLine(): ThreadSecondaryLine {
  const stored = read(THREAD_SECONDARY_LINE);
  return stored === "directory" || stored === "worktree" ? stored : "app";
}

export function setThreadSecondaryLine(line: ThreadSecondaryLine): void {
  write(THREAD_SECONDARY_LINE, line);
}

function projectDisclosure(): Readonly<Record<string, boolean>> {
  const stored = read(PROJECT_DISCLOSURE);
  if (!stored) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([projectId, expanded]) =>
          projectId.length > 0 && projectId.length <= 128 && typeof expanded === "boolean",
      ),
    );
  } catch {
    return {};
  }
}

export function projectExpanded(projectId: string): boolean {
  return projectDisclosure()[projectId] !== false;
}

export function setProjectExpanded(projectId: string, expanded: boolean): void {
  write(PROJECT_DISCLOSURE, JSON.stringify({ ...projectDisclosure(), [projectId]: expanded }));
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
