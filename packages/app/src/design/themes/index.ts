import currentLightSource from "./builtins/current-light.theme.config?raw";
import darkSource from "./builtins/dark.theme.config?raw";
import draculaSource from "./builtins/dracula.theme.config?raw";

import {
  THEME_COLOUR_ROLES,
  THEME_CONFIG_LIMIT_BYTES,
  THEME_SYNTAX_ROLES,
  parseThemeConfig,
  type ThemeConfigV1,
} from "./schema";

export { THEME_COLOUR_ROLES, THEME_CONFIG_LIMIT_BYTES, THEME_SYNTAX_ROLES, parseThemeConfig };
export type { ThemeAppearance, ThemeConfigV1, ThemeParseResult } from "./schema";

export interface ThemeDefinition {
  readonly id: string;
  readonly fileName: string;
  readonly source: string;
  readonly config: ThemeConfigV1;
  readonly builtIn: boolean;
}

export interface ThemeConfigSource {
  readonly fileName: string;
  readonly contents?: string | null;
  readonly problem?: string | null;
}

export interface ThemeNotice {
  readonly source: string;
  readonly problem: string;
}

export interface ThemeCatalog {
  readonly themes: ReadonlyMap<string, ThemeDefinition>;
  readonly notices: readonly ThemeNotice[];
}

function builtIn(id: string, fileName: string, source: string): ThemeDefinition {
  const parsed = parseThemeConfig(source, fileName);
  if (!parsed.ok) throw new Error(`invalid built-in theme: ${parsed.problem}`);
  return Object.freeze({ id, fileName, source, config: parsed.value, builtIn: true });
}

export const BUILT_IN_THEMES = Object.freeze([
  builtIn("current-light", "current-light.theme.config", currentLightSource),
  builtIn("dark", "dark.theme.config", darkSource),
  builtIn("dracula", "dracula.theme.config", draculaSource),
]);

const THEME_FILE = /^([a-z0-9][a-z0-9_-]{0,63})\.theme\.config$/i;

function externalId(fileName: string): string | null {
  return THEME_FILE.exec(fileName)?.[1]?.toLowerCase() ?? null;
}

/** Keep malformed external files local to themselves; built-ins always remain available. */
export function loadThemeCatalog(sources: readonly ThemeConfigSource[]): ThemeCatalog {
  const themes = new Map(BUILT_IN_THEMES.map((theme) => [theme.id, theme]));
  const notices: ThemeNotice[] = [];

  for (const source of sources) {
    const id = externalId(source.fileName);
    if (!id) {
      notices.push({ source: source.fileName, problem: "theme file has an unsafe name" });
      continue;
    }
    if (source.problem || source.contents == null) {
      notices.push({
        source: source.fileName,
        problem: source.problem ?? "theme file could not be read",
      });
      continue;
    }
    if (themes.has(id)) {
      notices.push({ source: source.fileName, problem: `theme id ${id} is already installed` });
      continue;
    }
    const parsed = parseThemeConfig(source.contents, source.fileName);
    if (!parsed.ok) {
      notices.push({ source: source.fileName, problem: parsed.problem });
      continue;
    }
    themes.set(
      id,
      Object.freeze({
        id,
        fileName: source.fileName,
        source: source.contents,
        config: parsed.value,
        builtIn: false,
      }),
    );
  }

  return Object.freeze({ themes, notices: Object.freeze(notices) });
}

export const THEME_STYLE_PROPERTIES = Object.freeze([
  ...THEME_COLOUR_ROLES.map((role) => `--${role.replaceAll(".", "-")}`),
  ...THEME_SYNTAX_ROLES.map((role) => `--syntax-${role}`),
]);

function applyConfig(root: HTMLElement, definition: ThemeDefinition): void {
  root.dataset.theme = definition.config.appearance;
  root.dataset.themeName = definition.id;
  root.style.colorScheme = definition.config.appearance;
  for (const role of THEME_COLOUR_ROLES) {
    root.style.setProperty(`--${role.replaceAll(".", "-")}`, definition.config.colours[role]);
  }
  for (const role of THEME_SYNTAX_ROLES) {
    root.style.setProperty(`--syntax-${role}`, definition.config.syntax[role]);
  }
}

function clearConfig(root: HTMLElement): void {
  delete root.dataset.theme;
  delete root.dataset.themeName;
  root.style.removeProperty("color-scheme");
  for (const property of THEME_STYLE_PROPERTIES) root.style.removeProperty(property);
}

export interface ThemeSnapshot {
  readonly selected: string;
  readonly resolved: string;
  readonly lastValid: string;
}

export interface ThemeControllerOptions {
  readonly selected: string;
  readonly lastValid: string;
  readonly onNotice?: (notice: ThemeNotice) => void;
  readonly onChange?: (snapshot: ThemeSnapshot) => void;
  readonly prefersDark?: () => boolean;
}

/** Own selection resolution and project one palette into every mounted region. */
export class ThemeController {
  readonly #root: HTMLElement;
  readonly #catalog: ThemeCatalog;
  readonly #onNotice: ((notice: ThemeNotice) => void) | undefined;
  readonly #onChange: ((snapshot: ThemeSnapshot) => void) | undefined;
  readonly #media: MediaQueryList | null;
  readonly #prefersDark: () => boolean;
  #snapshot: ThemeSnapshot;

  constructor(root: HTMLElement, catalog: ThemeCatalog, options: ThemeControllerOptions) {
    this.#root = root;
    this.#catalog = catalog;
    this.#onNotice = options.onNotice;
    this.#onChange = options.onChange;
    this.#media = options.prefersDark
      ? null
      : typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;
    this.#prefersDark = options.prefersDark ?? (() => this.#media?.matches ?? false);
    this.#snapshot = {
      selected: options.selected,
      resolved: options.lastValid,
      lastValid: options.lastValid,
    };
    this.#media?.addEventListener("change", this.#systemChanged);
    this.setSelection(options.selected, options.lastValid);
  }

  readonly #systemChanged = (): void => {
    if (this.#snapshot.selected === "system") this.setSelection("system");
  };

  snapshot(): ThemeSnapshot {
    return { ...this.#snapshot };
  }

  setSelection(selected: string, lastValid = this.#snapshot.lastValid): void {
    const currentLight = this.#catalog.themes.get("current-light");
    if (!currentLight) throw new Error("Current Light is unavailable");
    const fallback = this.#catalog.themes.get(lastValid) ?? currentLight;
    let resolved: ThemeDefinition | undefined;

    if (selected === "system") {
      resolved = this.#catalog.themes.get(this.#prefersDark() ? "dark" : "current-light");
    } else {
      resolved = this.#catalog.themes.get(selected);
    }
    if (!resolved) {
      this.#onNotice?.({ source: selected, problem: `theme ${selected} is unavailable` });
      resolved = fallback;
    }

    applyConfig(this.#root, resolved);
    this.#snapshot = { selected, resolved: resolved.id, lastValid: resolved.id };
    this.#onChange?.(this.snapshot());
  }

  dispose(): void {
    this.#media?.removeEventListener("change", this.#systemChanged);
    clearConfig(this.#root);
  }
}
