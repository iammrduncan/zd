import { ThemeController, type ThemeCatalog, type ThemeNotice } from "@/design/themes";
import type { SurfaceThemeId, SurfaceThemePreferences } from "./preferences";

export type { SurfaceThemeId, SurfaceThemePreferences } from "./preferences";

export interface SurfaceThemeOption {
  readonly id: SurfaceThemeId;
  readonly label: string;
  readonly selector: string;
}

export const SURFACE_THEME_OPTIONS: readonly SurfaceThemeOption[] = Object.freeze([
  { id: "threads", label: "Threads", selector: ".zd-thread-surface" },
  { id: "panels", label: "Projects panel", selector: ".zd-workbench-threads" },
  {
    id: "code",
    label: "Code",
    selector: '.current-file:has(.md-editor[data-language="code"])',
  },
  {
    id: "markdown",
    label: "Markdown",
    selector: '.current-file:has(.md-editor[data-language="markdown"])',
  },
  { id: "filePanel", label: "File panel", selector: ".zd-workbench-files" },
  {
    id: "meta",
    label: "Settings / Meta",
    selector: ".zd-settings-plane, .zd-command-list, .zd-reference, .md-feedback-view",
  },
]);

export interface SurfaceThemeControllerOptions {
  readonly initial?: SurfaceThemePreferences;
  readonly onChange?: (preferences: SurfaceThemePreferences) => void;
  readonly onNotice?: (notice: ThemeNotice) => void;
}

interface AppliedSurfaceTheme {
  readonly scope: SurfaceThemeId;
  readonly selected: string;
  readonly controller: ThemeController;
}

function matching(root: HTMLElement, selector: string): readonly HTMLElement[] {
  return [
    ...(root.matches(selector) ? [root] : []),
    ...root.querySelectorAll<HTMLElement>(selector),
  ];
}

/** Apply optional palette overrides while every unselected surface keeps inheriting the root. */
export class SurfaceThemeController {
  readonly #root: HTMLElement;
  readonly #catalog: ThemeCatalog;
  readonly #onChange: ((preferences: SurfaceThemePreferences) => void) | undefined;
  readonly #onNotice: ((notice: ThemeNotice) => void) | undefined;
  readonly #applied = new Map<HTMLElement, AppliedSurfaceTheme>();
  readonly #observer: MutationObserver | null;
  #preferences: SurfaceThemePreferences;
  #refreshQueued = false;
  #active = true;

  constructor(
    root: HTMLElement,
    catalog: ThemeCatalog,
    options: SurfaceThemeControllerOptions = {},
  ) {
    this.#root = root;
    this.#catalog = catalog;
    this.#onChange = options.onChange;
    this.#onNotice = options.onNotice;
    const available = Object.entries(options.initial ?? {}).flatMap(([scope, selected]) => {
      if (!selected) return [];
      if (!catalog.themes.has(selected)) {
        this.#onNotice?.({ source: selected, problem: `theme ${selected} is unavailable` });
        return [];
      }
      return [[scope, selected]];
    });
    this.#preferences = Object.freeze(Object.fromEntries(available));
    this.#observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => this.#scheduleRefresh());
    this.#observer?.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-language"],
    });
    this.refresh();
  }

  selection(scope: SurfaceThemeId): string {
    return this.#preferences[scope] ?? "workbench";
  }

  setSelection(scope: SurfaceThemeId, selected: string): void {
    if (selected !== "workbench" && !this.#catalog.themes.has(selected)) {
      this.#onNotice?.({ source: selected, problem: `theme ${selected} is unavailable` });
      return;
    }
    const next = { ...this.#preferences };
    if (selected === "workbench") delete next[scope];
    else next[scope] = selected;
    this.#preferences = Object.freeze(next);
    this.#onChange?.(this.#preferences);
    this.refresh();
  }

  refresh(): void {
    if (!this.#active) return;
    const wanted = new Map<HTMLElement, { scope: SurfaceThemeId; selected: string }>();
    for (const option of SURFACE_THEME_OPTIONS) {
      const selected = this.#preferences[option.id];
      if (!selected) continue;
      for (const element of matching(this.#root, option.selector)) {
        wanted.set(element, { scope: option.id, selected });
      }
    }

    for (const [element, applied] of this.#applied) {
      const next = wanted.get(element);
      if (next?.scope === applied.scope && next.selected === applied.selected) {
        wanted.delete(element);
        continue;
      }
      applied.controller.dispose();
      this.#applied.delete(element);
    }

    for (const [element, next] of wanted) {
      const controller = new ThemeController(element, this.#catalog, {
        selected: next.selected,
        lastValid: next.selected,
        onNotice: this.#onNotice,
        prefersDark: () => false,
      });
      this.#applied.set(element, { ...next, controller });
    }
  }

  #scheduleRefresh(): void {
    if (!this.#active || this.#refreshQueued) return;
    this.#refreshQueued = true;
    queueMicrotask(() => {
      this.#refreshQueued = false;
      this.refresh();
    });
  }

  dispose(): void {
    if (!this.#active) return;
    this.#active = false;
    this.#observer?.disconnect();
    for (const applied of this.#applied.values()) applied.controller.dispose();
    this.#applied.clear();
  }
}
