import { afterEach, describe, expect, it, vi } from "vitest";

import { loadThemeCatalog } from "@/design/themes";
import {
  SURFACE_THEME_OPTIONS,
  SurfaceThemeController,
  type SurfaceThemePreferences,
} from "@/workbench/surface-themes";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function mountedSurfaces(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = `
    <aside class="zd-workbench-threads"></aside>
    <section class="zd-thread-surface"><div class="terminal"></div></section>
    <div class="current-file"><div class="md-editor" data-language="markdown"></div></div>
    <aside class="zd-workbench-files"></aside>
  `;
  document.body.append(host);
  return host;
}

describe("surface theme ownership", () => {
  it("defines one explicit selection target for every requested workbench surface", () => {
    expect(SURFACE_THEME_OPTIONS.map(({ id, label }) => [id, label])).toEqual([
      ["threads", "Threads"],
      ["panels", "Projects panel"],
      ["code", "Code"],
      ["markdown", "Markdown"],
      ["filePanel", "File panel"],
      ["meta", "Settings / Meta"],
    ]);
  });

  it("applies independent palettes and returns a surface to workbench inheritance", () => {
    const host = mountedSurfaces();
    const saved = vi.fn<(preferences: SurfaceThemePreferences) => void>();
    const controller = new SurfaceThemeController(host, loadThemeCatalog([]), {
      initial: { threads: "dracula", panels: "homebrew", markdown: "dark" },
      onChange: saved,
    });

    expect(host.querySelector<HTMLElement>(".zd-thread-surface")?.dataset.themeName).toBe(
      "dracula",
    );
    expect(host.querySelector<HTMLElement>(".zd-workbench-threads")?.dataset.themeName).toBe(
      "homebrew",
    );
    expect(host.querySelector<HTMLElement>(".current-file")?.dataset.themeName).toBe("dark");
    expect(
      host.querySelector<HTMLElement>(".zd-workbench-files")?.dataset.themeName,
    ).toBeUndefined();

    controller.setSelection("threads", "workbench");
    expect(
      host.querySelector<HTMLElement>(".zd-thread-surface")?.dataset.themeName,
    ).toBeUndefined();
    expect(saved).toHaveBeenLastCalledWith({ panels: "homebrew", markdown: "dark" });
    controller.dispose();
  });

  it("switches the same editor element between Markdown and code themes", async () => {
    const host = mountedSurfaces();
    const currentFile = host.querySelector<HTMLElement>(".current-file")!;
    const editor = currentFile.querySelector<HTMLElement>(".md-editor")!;
    const controller = new SurfaceThemeController(host, loadThemeCatalog([]), {
      initial: { markdown: "dracula", code: "homebrew" },
    });

    expect(currentFile.dataset.themeName).toBe("dracula");
    editor.dataset.language = "code";
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(currentFile.dataset.themeName).toBe("homebrew");
    controller.dispose();
    expect(currentFile.dataset.themeName).toBeUndefined();
  });

  it("themes a Settings or Meta panel mounted after boot", async () => {
    const host = mountedSurfaces();
    const controller = new SurfaceThemeController(host, loadThemeCatalog([]), {
      initial: { meta: "dracula" },
    });
    const settings = document.createElement("section");
    settings.className = "zd-settings-plane";
    host.append(settings);
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(settings.dataset.themeName).toBe("dracula");
    controller.dispose();
  });
});
