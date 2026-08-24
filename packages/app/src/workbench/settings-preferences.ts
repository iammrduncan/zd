import type { WorkbenchStateOwner } from "./state";
import { applyWarmth } from "@/design/warmth";

const KEY = "zd.workbenchSettings.v1";

export type ReadingGranularity = "line" | "paragraph" | "section";

export interface WorkbenchSettingsPreferences {
  readonly schemaVersion: 1;
  readonly appearance: {
    readonly warmth: number;
    readonly proseSize: number;
    readonly codeSize: number;
    readonly headingScale: number;
  };
  readonly reading: {
    readonly focus: boolean;
    readonly focusDim: number;
    readonly granularity: ReadingGranularity;
    readonly typewriter: boolean;
    readonly wordWrap: boolean;
  };
  readonly workbench: {
    readonly threadsVisibility: "full" | "collapsed" | "hidden";
    readonly filesVisibility: "visible" | "hidden";
    readonly centreMode: "overlap" | "side-by-side";
    readonly threadsWidth: number;
    readonly filesWidth: number;
    readonly centreSplit: number;
  };
}

const defaults: WorkbenchSettingsPreferences = {
  schemaVersion: 1,
  appearance: { warmth: 0, proseSize: 17, codeSize: 14, headingScale: 1 },
  reading: {
    focus: false,
    focusDim: 0.9,
    granularity: "paragraph",
    typewriter: false,
    wordWrap: true,
  },
  workbench: {
    threadsVisibility: "full",
    filesVisibility: "visible",
    centreMode: "overlap",
    threadsWidth: 236,
    filesWidth: 280,
    centreSplit: 0.42,
  },
};

let remembered: string | null = null;

function bounded(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

function choice<T extends string>(value: unknown, choices: readonly T[], fallback: T): T {
  return typeof value === "string" && choices.includes(value as T) ? (value as T) : fallback;
}

export function parseWorkbenchSettings(value: unknown): WorkbenchSettingsPreferences {
  if (!value || typeof value !== "object") return defaults;
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== 1) return defaults;
  const appearance = (source.appearance ?? {}) as Record<string, unknown>;
  const reading = (source.reading ?? {}) as Record<string, unknown>;
  const workbench = (source.workbench ?? {}) as Record<string, unknown>;
  return {
    schemaVersion: 1,
    appearance: {
      warmth: bounded(appearance.warmth, defaults.appearance.warmth, 0, 1),
      proseSize: bounded(appearance.proseSize, defaults.appearance.proseSize, 14, 28),
      codeSize: bounded(appearance.codeSize, defaults.appearance.codeSize, 12, 24),
      headingScale: bounded(appearance.headingScale, defaults.appearance.headingScale, 0.85, 1.25),
    },
    reading: {
      focus: typeof reading.focus === "boolean" ? reading.focus : defaults.reading.focus,
      focusDim: bounded(reading.focusDim, defaults.reading.focusDim, 0, 1),
      granularity: choice(
        reading.granularity,
        ["line", "paragraph", "section"],
        defaults.reading.granularity,
      ),
      typewriter:
        typeof reading.typewriter === "boolean" ? reading.typewriter : defaults.reading.typewriter,
      wordWrap:
        typeof reading.wordWrap === "boolean" ? reading.wordWrap : defaults.reading.wordWrap,
    },
    workbench: {
      threadsVisibility: choice(
        workbench.threadsVisibility,
        ["full", "collapsed", "hidden"],
        defaults.workbench.threadsVisibility,
      ),
      filesVisibility: choice(
        workbench.filesVisibility,
        ["visible", "hidden"],
        defaults.workbench.filesVisibility,
      ),
      centreMode: choice(
        workbench.centreMode,
        ["overlap", "side-by-side"],
        defaults.workbench.centreMode,
      ),
      threadsWidth: bounded(workbench.threadsWidth, defaults.workbench.threadsWidth, 184, 300),
      filesWidth: bounded(workbench.filesWidth, defaults.workbench.filesWidth, 220, 360),
      centreSplit: bounded(workbench.centreSplit, defaults.workbench.centreSplit, 0.3, 0.7),
    },
  };
}

export function workbenchSettingsPreferences(): WorkbenchSettingsPreferences {
  let stored = remembered;
  if (stored === null) {
    try {
      stored = window.localStorage.getItem(KEY);
    } catch {
      stored = null;
    }
  }
  if (!stored) return defaults;
  try {
    return parseWorkbenchSettings(JSON.parse(stored));
  } catch {
    return defaults;
  }
}

export function saveWorkbenchSettings(preferences: WorkbenchSettingsPreferences): string | null {
  const normalized = parseWorkbenchSettings(preferences);
  remembered = JSON.stringify(normalized);
  try {
    window.localStorage.setItem(KEY, remembered);
    return null;
  } catch (cause) {
    return `This change is active for this session but could not be stored: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
}

export function applyWorkbenchSettings(
  preferences: WorkbenchSettingsPreferences,
  state?: WorkbenchStateOwner,
): void {
  const root = document.documentElement;
  applyWarmth(root, preferences.appearance.warmth);
  root.style.setProperty("--type-prose-size", `${preferences.appearance.proseSize}px`);
  root.style.setProperty("--type-code-size", `${preferences.appearance.codeSize}px`);
  root.style.setProperty("--type-heading-scale", String(preferences.appearance.headingScale));
  root.style.setProperty("--focus-dim", String(preferences.reading.focusDim));
  state?.updateRegions({
    ...state.snapshot().regions,
    threads: {
      ...state.snapshot().regions.threads,
      visibility: preferences.workbench.threadsVisibility,
      width: preferences.workbench.threadsWidth,
    },
    files: {
      ...state.snapshot().regions.files,
      visibility: preferences.workbench.filesVisibility,
      width: preferences.workbench.filesWidth,
    },
    centre: {
      ...state.snapshot().regions.centre,
      mode: preferences.workbench.centreMode,
      split: preferences.workbench.centreSplit,
    },
  });
  window.dispatchEvent(
    new CustomEvent<WorkbenchSettingsPreferences>("zd-workbench-settings-change", {
      detail: preferences,
    }),
  );
}

export function forgetWorkbenchSettingsPreferences(): void {
  remembered = null;
}
