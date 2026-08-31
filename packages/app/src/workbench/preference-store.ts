export const WORD_WRAP = "zd.wordWrap";
export const DIAGNOSTICS_ENABLED = "zd.diagnosticsEnabled";
export const ATTENTION_DESKTOP = "zd.attentionDesktop";
export const ATTENTION_SOUND = "zd.attentionSound";
export const ATTENTION_MUTED = "zd.attentionMuted";
export const ATTENTION_VOLUME = "zd.attentionVolume";
export const SHORTCUT_BINDINGS = "zd.shortcutBindings.v1";
export const THEME_SELECTION = "zd.themeSelection.v1";
export const SURFACE_THEMES = "zd.surfaceThemes.v1";
export const THREAD_SECONDARY_LINE = "zd.threadSecondaryLine.v1";
export const PROJECT_DISCLOSURE = "zd.projectDisclosure.v1";
export const WORKBENCH_SETTINGS = "zd.workbenchSettings.v1";

const ATTENTION_AGENT_SOUNDS = [
  "zd.attentionSound.codex",
  "zd.attentionSound.claude-code",
  "zd.attentionSound.opencode",
] as const;

export const LEGACY_PREFERENCE_KEYS = [
  WORD_WRAP,
  DIAGNOSTICS_ENABLED,
  ATTENTION_DESKTOP,
  ATTENTION_SOUND,
  ATTENTION_MUTED,
  ATTENTION_VOLUME,
  ...ATTENTION_AGENT_SOUNDS,
  SHORTCUT_BINDINGS,
  THEME_SELECTION,
  SURFACE_THEMES,
  THREAD_SECONDARY_LINE,
  PROJECT_DISCLOSURE,
  WORKBENCH_SETTINGS,
] as const;

export interface DurablePreferencesRecord {
  readonly [key: string]: unknown;
  readonly schemaVersion: 1;
  readonly values: Readonly<Record<string, string>>;
}

type PreferenceSink = (record: DurablePreferencesRecord) => void;

const knownKeys = new Set<string>(LEGACY_PREFERENCE_KEYS);
const session = new Map<string, string>();
let durable = false;
let sink: PreferenceSink | null = null;

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readPreference(key: string): string | null {
  const remembered = session.get(key);
  if (remembered !== undefined) return remembered;
  if (durable) return null;
  try {
    return browserStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function durablePreferencesRecord(): DurablePreferencesRecord {
  return {
    schemaVersion: 1,
    values: Object.fromEntries(
      [...session]
        .filter(([key]) => knownKeys.has(key))
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  };
}

export function writePreference(key: string, value: string): string | null {
  if (!knownKeys.has(key)) return "This preference is not supported.";
  session.set(key, value);
  if (durable) {
    sink?.(durablePreferencesRecord());
    return null;
  }
  try {
    browserStorage()?.setItem(key, value);
    return null;
  } catch (cause) {
    return `This change is active for this session but could not be stored: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export function configureDurablePreferences(
  value: unknown,
  persist: PreferenceSink,
): readonly string[] {
  durable = true;
  sink = persist;
  session.clear();
  if (value === null) return [];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return ["Stored preferences have an invalid format and were not loaded."];
  }
  const record = value as Record<string, unknown>;
  if (
    record.schemaVersion !== 1 ||
    typeof record.values !== "object" ||
    record.values === null ||
    Array.isArray(record.values)
  ) {
    return ["Stored preferences have an unsupported format and were not loaded."];
  }
  let ignored = false;
  for (const [key, stored] of Object.entries(record.values as Record<string, unknown>)) {
    if (!knownKeys.has(key) || typeof stored !== "string") {
      ignored = true;
      continue;
    }
    session.set(key, stored);
  }
  return ignored ? ["Some stored preferences were invalid and were not loaded."] : [];
}

export function forgetPreference(key: string): void {
  session.delete(key);
}

export function resetPreferenceStore(): void {
  durable = false;
  sink = null;
  session.clear();
}
