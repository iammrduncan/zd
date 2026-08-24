export const THEME_CONFIG_LIMIT_BYTES = 65_536;

export const THEME_COLOUR_ROLES = [
  "surface.canvas",
  "surface.sidebar",
  "surface.transient",
  "surface.selection",
  "surface.code",
  "surface.diff-added",
  "surface.diff-deleted",
  "text.primary",
  "text.secondary",
  "text.muted",
  "text.link",
  "line.quiet",
  "line.focus",
  "state.added",
  "state.changed",
  "state.deleted",
  "state.ignored",
  "state.error",
  "state.waiting",
  "state.busy",
  "state.idle",
] as const;

export const THEME_SYNTAX_ROLES = [
  "keyword",
  "type",
  "function",
  "string",
  "number",
  "comment",
  "punctuation",
] as const;

export type ThemeColourRole = (typeof THEME_COLOUR_ROLES)[number];
export type ThemeSyntaxRole = (typeof THEME_SYNTAX_ROLES)[number];
export type ThemeAppearance = "light" | "dark";
export type HexColour = `#${string}`;

export interface ThemeConfigV1 {
  readonly schemaVersion: 1;
  readonly name: string;
  readonly appearance: ThemeAppearance;
  readonly colours: Readonly<Record<ThemeColourRole, HexColour>>;
  readonly syntax: Readonly<Record<ThemeSyntaxRole, HexColour>>;
}

export type ThemeParseResult =
  | { readonly ok: true; readonly value: ThemeConfigV1 }
  | { readonly ok: false; readonly problem: string };

const ROOT_KEYS = ["schemaVersion", "name", "appearance", "colours", "syntax"] as const;
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._()'-]{0,63}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function closedKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): string | null {
  const present = new Set(Object.keys(value));
  const missing = expected.find((key) => !present.has(key));
  if (missing) return `${label} is missing key ${missing}`;
  const additional = Object.keys(value).find((key) => !expected.includes(key));
  return additional ? `${label} has additional key ${additional}` : null;
}

function colourRecord<K extends string>(
  value: unknown,
  roles: readonly K[],
  label: string,
): { ok: true; value: Readonly<Record<K, HexColour>> } | { ok: false; problem: string } {
  if (!isRecord(value)) return { ok: false, problem: `${label} must be an object` };
  const keyProblem = closedKeys(value, roles, label);
  if (keyProblem) return { ok: false, problem: keyProblem };

  const colours: Partial<Record<K, HexColour>> = {};
  for (const role of roles) {
    const colour = value[role];
    if (typeof colour !== "string" || !HEX.test(colour)) {
      return { ok: false, problem: `${label}.${role} must be a #RRGGBB colour` };
    }
    colours[role] = colour.toLowerCase() as HexColour;
  }
  return { ok: true, value: Object.freeze(colours as Record<K, HexColour>) };
}

function luminance(hex: HexColour): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(left: HexColour, right: HexColour): number {
  const lighter = Math.max(luminance(left), luminance(right));
  const darker = Math.min(luminance(left), luminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function contrastProblem(colours: ThemeConfigV1["colours"]): string | null {
  const pairs = [
    ["text.primary", "surface.canvas", 7, 16],
    ["text.secondary", "surface.sidebar", 4.5, Infinity],
    ["text.muted", "surface.sidebar", 4.5, Infinity],
    ["text.link", "surface.canvas", 4.5, Infinity],
    ["line.focus", "surface.canvas", 3, Infinity],
  ] as const satisfies readonly [ThemeColourRole, ThemeColourRole, number, number][];

  for (const [foreground, background, minimum, maximum] of pairs) {
    const purePair = new Set([colours[foreground], colours[background]]);
    if (purePair.has("#000000") && purePair.has("#ffffff")) {
      return `${foreground} on ${background} cannot pair pure black with pure white`;
    }
    const ratio = contrast(colours[foreground], colours[background]);
    if (ratio < minimum || ratio > maximum) {
      const ceiling = Number.isFinite(maximum) ? ` and at most ${maximum}:1` : "";
      return `${foreground} on ${background} is ${ratio.toFixed(2)}:1; it must be at least ${minimum}:1${ceiling}`;
    }
  }
  return null;
}

/** Parse untrusted theme data without allowing it to grow executable behavior. */
export function parseThemeConfig(source: string, sourceName = "theme.config"): ThemeParseResult {
  if (new TextEncoder().encode(source).byteLength > THEME_CONFIG_LIMIT_BYTES) {
    return {
      ok: false,
      problem: `${sourceName} exceeds the 65,536-byte limit`,
    };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(source);
  } catch {
    return { ok: false, problem: `${sourceName} contains invalid JSON` };
  }
  if (!isRecord(decoded)) return { ok: false, problem: `${sourceName} must contain an object` };

  const rootProblem = closedKeys(decoded, ROOT_KEYS, sourceName);
  if (rootProblem) return { ok: false, problem: rootProblem };
  if (decoded.schemaVersion !== 1) {
    return { ok: false, problem: `${sourceName} has unsupported schemaVersion` };
  }
  if (typeof decoded.name !== "string" || !SAFE_NAME.test(decoded.name)) {
    return { ok: false, problem: `${sourceName}.name must be a safe display name` };
  }
  if (decoded.appearance !== "light" && decoded.appearance !== "dark") {
    return { ok: false, problem: `${sourceName}.appearance must be light or dark` };
  }

  const colours = colourRecord(decoded.colours, THEME_COLOUR_ROLES, `${sourceName}.colours`);
  if (!colours.ok) return colours;
  const syntax = colourRecord(decoded.syntax, THEME_SYNTAX_ROLES, `${sourceName}.syntax`);
  if (!syntax.ok) return syntax;
  const readability = contrastProblem(colours.value);
  if (readability) return { ok: false, problem: `${sourceName}: ${readability}` };

  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: 1,
      name: decoded.name,
      appearance: decoded.appearance,
      colours: colours.value,
      syntax: syntax.value,
    }),
  };
}
