import type { ThemeCatalog } from "@/design/themes";
import type { Unmount } from "./runtime";
import { register } from "./shortcuts";

/** Register palette-only theme choices from the exact catalog the workbench loaded. */
export function registerThemeCommands(
  catalog: ThemeCatalog,
  select: (themeId: string) => void,
): Unmount {
  const cleanups: Unmount[] = [
    register({
      id: "theme.select.system",
      description: "Theme: Follow System",
      run: () => {
        select("system");
        return true;
      },
    }),
  ];

  for (const definition of catalog.themes.values()) {
    cleanups.push(
      register({
        id: `theme.select.${definition.id}`,
        description: `Theme: ${definition.config.name}`,
        run: () => {
          select(definition.id);
          return true;
        },
      }),
    );
  }

  return () => {
    for (const cleanup of [...cleanups].reverse()) cleanup();
  };
}
