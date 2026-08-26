import { expect, test } from "@playwright/test";

// System resolves to Current Light or Dark rather than being a third appearance.
// Explicit themes are applied through the same loader used during workbench boot.

const CANVAS = { light: "rgb(250, 250, 247)", dark: "rgb(25, 26, 25)" };
const PROSE = { light: "rgb(36, 37, 34)", dark: "rgb(229, 226, 217)" };

async function paint(
  page: import("@playwright/test").Page,
  theme: "system" | "light" | "dark" | "dracula" | "homebrew" = "system",
) {
  await page.locator(".zd-workbench").waitFor();
  await page.evaluate(async (value) => {
    const appearanceModule = "/src/design/appearance.ts";
    const { setTheme } = await import(appearanceModule);
    setTheme(value);
  }, theme);

  return page.evaluate(() => {
    const style = getComputedStyle(document.body);
    return { background: style.backgroundColor, text: style.color };
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`follow-system resolves to the ${scheme} palette`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/");

    const painted = await paint(page, "system");
    expect(painted.background).toBe(CANVAS[scheme]);
    expect(painted.text).toBe(PROSE[scheme]);
  });
}

test("an explicit theme overrides the system preference in both directions", async ({ page }) => {
  await page.goto("/");

  // Pinning Light while the OS says Dark is the case that fails if the palette
  // is driven by a prefers-color-scheme media query instead of color-scheme.
  await page.emulateMedia({ colorScheme: "dark" });
  expect((await paint(page, "light")).background).toBe(CANVAS.light);

  await page.emulateMedia({ colorScheme: "light" });
  expect((await paint(page, "dark")).background).toBe(CANVAS.dark);
});

test("clearing the explicit theme returns to following the system", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");

  expect((await paint(page, "light")).background).toBe(CANVAS.light);
  expect((await paint(page, "system")).background).toBe(CANVAS.dark);
});

test("Dracula replaces the complete workbench palette without remounting", async ({ page }) => {
  await page.goto("/");
  const workbench = page.locator(".zd-workbench");
  await workbench.evaluate((node) => {
    (node as HTMLElement).dataset.themeProbe = "same-node";
  });

  expect((await paint(page, "dracula")).background).toBe("rgb(40, 42, 54)");
  expect(
    await workbench.evaluate((node) => {
      const style = getComputedStyle(node);
      return {
        sidebar: style.getPropertyValue("--surface-sidebar").trim(),
        selection: style.getPropertyValue("--surface-selection").trim(),
        muted: style.getPropertyValue("--text-muted").trim(),
        focus: style.getPropertyValue("--line-focus").trim(),
        punctuation: style.getPropertyValue("--syntax-punctuation").trim(),
      };
    }),
  ).toEqual({
    sidebar: "#0a080c",
    selection: "#65547d",
    muted: "#a186c7",
    focus: "#c9a8f9",
    punctuation: "#ff79c6",
  });
  await expect(workbench).toBeAttached();
  await expect(workbench).toHaveAttribute("data-theme-probe", "same-node");
});

test("Homebrew uses the macOS Terminal profile foreground and background", async ({ page }) => {
  await page.goto("/");

  expect(await paint(page, "homebrew")).toEqual({
    background: "rgb(0, 0, 0)",
    text: "rgb(40, 254, 20)",
  });
});

test("warmth rests at an exact identity", async ({ page }) => {
  await page.goto("/");

  // §4.3: at 6500K the transform is an exact identity. Nothing consumes --warmth
  // yet, so the guarantee this locks is that the resting palette is unmodified —
  // whatever implements warmth has to keep this true at 0.
  await page.emulateMedia({ colorScheme: "light" });
  const warmth = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--warmth").trim(),
  );

  expect(warmth).toBe("0");
  expect((await paint(page)).background).toBe(CANVAS.light);
});
