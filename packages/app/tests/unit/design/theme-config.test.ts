import { describe, expect, it, vi } from "vitest";

import {
  BUILT_IN_THEMES,
  THEME_CONFIG_LIMIT_BYTES,
  THEME_STYLE_PROPERTIES,
  ThemeController,
  loadThemeCatalog,
  parseThemeConfig,
} from "@/design/themes";

function sourceFromCurrent(change: (value: Record<string, unknown>) => void = () => {}): string {
  const value = JSON.parse(JSON.stringify(BUILT_IN_THEMES[0]!.config)) as Record<string, unknown>;
  value.name = "Test Theme";
  change(value);
  return JSON.stringify(value);
}

function problem(source: string): string {
  const result = parseThemeConfig(source, "test.theme.config");
  expect(result.ok).toBe(false);
  return result.ok ? "" : result.problem;
}

describe("validated theme configuration", () => {
  it("loads every built-in through the same closed parser", () => {
    expect(BUILT_IN_THEMES.map(({ id }) => id)).toEqual([
      "current-light",
      "dark",
      "dracula",
      "homebrew",
    ]);
    expect(BUILT_IN_THEMES.map(({ config }) => config.appearance)).toEqual([
      "light",
      "dark",
      "dark",
      "dark",
    ]);

    for (const theme of BUILT_IN_THEMES) {
      expect(parseThemeConfig(theme.source, theme.fileName)).toEqual({
        ok: true,
        value: theme.config,
      });
    }
  });

  it("matches the defining colours of the macOS Terminal Homebrew profile", () => {
    const homebrew = BUILT_IN_THEMES.find(({ id }) => id === "homebrew")!;

    expect(homebrew.config.colours["surface.canvas"]).toBe("#000000");
    expect(homebrew.config.colours["text.primary"]).toBe("#28fe14");
    expect(homebrew.config.colours["surface.selection"]).toBe("#0c2eee");
    expect(homebrew.config.colours["line.focus"]).toBe("#38fe27");
  });

  it("bundles the Dracula MIT attribution with the built-in it covers", () => {
    const dracula = BUILT_IN_THEMES.find(({ id }) => id === "dracula")!;

    expect(dracula.licenseNotice).toContain("MIT License");
    expect(dracula.licenseNotice).toContain("Copyright (c) 2016 Dracula Theme");
  });

  it("rejects unsupported versions, missing keys, and additional keys", () => {
    expect(
      problem(
        sourceFromCurrent((value) => {
          value.schemaVersion = 2;
        }),
      ),
    ).toContain("schemaVersion");
    expect(
      problem(
        sourceFromCurrent((value) => {
          delete (value.colours as Record<string, unknown>)["state.busy"];
        }),
      ),
    ).toContain("missing key state.busy");
    expect(
      problem(
        sourceFromCurrent((value) => {
          (value.syntax as Record<string, unknown>).accent = "#123456";
        }),
      ),
    ).toContain("additional key accent");
  });

  it("rejects invalid colours, executable-looking names, and unreadable text", () => {
    expect(
      problem(
        sourceFromCurrent((value) => {
          (value.colours as Record<string, unknown>)["text.primary"] = "rgb(0 0 0)";
        }),
      ),
    ).toContain("#RRGGBB");
    expect(
      problem(
        sourceFromCurrent((value) => {
          value.name = "https://example.test/theme";
        }),
      ),
    ).toContain("safe display name");
    expect(
      problem(
        sourceFromCurrent((value) => {
          (value.colours as Record<string, unknown>)["text.primary"] = "#999999";
        }),
      ),
    ).toContain("text.primary on surface.canvas");
  });

  it("rejects files larger than the documented byte limit", () => {
    const source = sourceFromCurrent();
    expect(
      problem(`${source}${" ".repeat(THEME_CONFIG_LIMIT_BYTES - source.length + 1)}`),
    ).toContain("65,536-byte limit");
  });

  it("isolates one invalid external file without losing valid themes", () => {
    const catalog = loadThemeCatalog([
      { fileName: "broken.theme.config", contents: "{" },
      { fileName: "custom.theme.config", contents: sourceFromCurrent() },
    ]);

    expect([...catalog.themes.keys()]).toEqual([
      "current-light",
      "dark",
      "dracula",
      "homebrew",
      "custom",
    ]);
    expect(catalog.notices).toEqual([
      expect.objectContaining({
        source: "broken.theme.config",
        problem: expect.stringContaining("JSON"),
      }),
    ]);
  });

  it("rejects custom ids reserved for system following and surface inheritance", () => {
    const source = sourceFromCurrent();
    const catalog = loadThemeCatalog([
      { fileName: "system.theme.config", contents: source },
      { fileName: "workbench.theme.config", contents: source },
    ]);

    expect(catalog.themes.has("system")).toBe(false);
    expect(catalog.themes.has("workbench")).toBe(false);
    expect(catalog.notices.map(({ problem }) => problem)).toEqual([
      "theme id system is reserved",
      "theme id workbench is reserved",
    ]);
  });

  it("falls back to the last valid theme, then Current Light", () => {
    const root = document.createElement("div");
    const catalog = loadThemeCatalog([]);
    const notice = vi.fn();
    const controller = new ThemeController(root, catalog, {
      selected: "missing-theme",
      lastValid: "dark",
      onNotice: notice,
      prefersDark: () => false,
    });

    expect(controller.snapshot()).toEqual({
      selected: "missing-theme",
      resolved: "dark",
      lastValid: "dark",
    });
    expect(root.style.getPropertyValue("--surface-canvas")).toBe("#191a19");

    controller.setSelection("still-missing", "also-missing");
    expect(controller.snapshot().resolved).toBe("current-light");
    expect(notice).toHaveBeenCalledTimes(2);
    controller.dispose();
  });

  it("updates every open region through shared CSS properties without remounting", () => {
    const root = document.createElement("div");
    const region = document.createElement("section");
    root.append(region);
    const controller = new ThemeController(root, loadThemeCatalog([]), {
      selected: "current-light",
      lastValid: "current-light",
      prefersDark: () => false,
    });

    controller.setSelection("dracula");

    expect(root.firstElementChild).toBe(region);
    expect(root.dataset.themeName).toBe("dracula");
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--surface-canvas")).toBe("#282a36");
    for (const property of THEME_STYLE_PROPERTIES) {
      expect(root.style.getPropertyValue(property), `${property} was not applied`).toMatch(
        /^#[0-9a-f]{6}$/,
      );
    }
    controller.dispose();
  });

  it("follows operating-system changes only while System is selected", () => {
    const listeners = new Set<() => void>();
    const media = {
      matches: false,
      addEventListener: vi.fn((_type: string, listener: () => void) => listeners.add(listener)),
      removeEventListener: vi.fn((_type: string, listener: () => void) =>
        listeners.delete(listener),
      ),
    };
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => media),
    );
    const controller = new ThemeController(document.createElement("div"), loadThemeCatalog([]), {
      selected: "system",
      lastValid: "current-light",
    });

    media.matches = true;
    for (const listener of listeners) listener();
    expect(controller.snapshot().resolved).toBe("dark");

    controller.setSelection("dracula");
    media.matches = false;
    for (const listener of listeners) listener();
    expect(controller.snapshot().resolved).toBe("dracula");

    controller.dispose();
    expect(listeners).toHaveLength(0);
    vi.unstubAllGlobals();
  });
});
