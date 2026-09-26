import { expect, test } from "@playwright/test";

import { sameColour } from "../colour";
import { openEditor } from "./harness";

async function mountLanguage(
  page: import("@playwright/test").Page,
  path: string,
  source: string,
): Promise<void> {
  await page.evaluate(
    async ({ documentPath, text }) => {
      const editorModule = "/src/editor/index.ts";
      const { createEditor, languageFor } = await import(editorModule);
      document.querySelector(".md-surface")?.remove();
      const surface = document.createElement("main");
      surface.className = "md-surface";
      const host = document.createElement("div");
      host.className = "md-editor";
      surface.append(host);
      document.body.append(surface);
      const editor = createEditor(host, text, { language: languageFor(documentPath) });
      (window as typeof window & { zdLanguageEditor?: { destroy(): void } }).zdLanguageEditor =
        editor;
    },
    { documentPath: path, text: source },
  );
}

test("Zig source paints language constructs through the shared syntax palette", async ({
  page,
}) => {
  await openEditor(page);
  await mountLanguage(
    page,
    "src/main.zig",
    'const std = @import("std");\nfn main() void {\n  const attempts: u8 = 3; // bounded\n}',
  );

  for (const role of ["keyword", "function", "string", "type", "number", "comment"]) {
    await expect(page.locator(`.md-syn-${role}`), `${role} syntax stayed plain`).not.toHaveCount(0);
  }
});

test("todo.txt distinguishes its task vocabulary", async ({ page }) => {
  await openEditor(page);
  await mountLanguage(
    page,
    "todo.txt",
    "(A) 2026-08-25 Ship +zd @desk\n(B) Review docs\n(C) Ask Joseph\nx 2026-08-24 Done",
  );

  await expect(page.locator(".md-syn-keyword")).toContainText("(A)");
  await expect(page.locator(".md-syn-number")).toContainText("2026-08-25");
  await expect(page.locator(".md-syn-type").first()).toContainText("+zd");
  await expect(page.locator(".md-syn-function").first()).toContainText("@desk");
  await expect(page.locator(".md-syn-comment")).toContainText("Done");
});

test("FEEDBACK.txt maps open, active, and addressed lines to state tokens in every theme", async ({
  page,
}) => {
  await openEditor(page);
  await mountLanguage(
    page,
    "docs/planning/FEEDBACK.txt",
    [
      "<=== New Feedback ===>",
      "open item",
      "\\active item",
      "<=== Feedback Addressed ===>",
      "finished item",
    ].join("\n"),
  );

  for (const theme of ["light", "dark", "dracula", "homebrew"] as const) {
    await page.evaluate(async (selected) => {
      const appearanceModule = "/src/design/appearance.ts";
      const { setTheme } = await import(appearanceModule);
      setTheme(selected);
    }, theme);

    const colours = await page.evaluate(() => {
      const pairs = [
        [".zd-feedback-new", "--state-added"],
        [".zd-feedback-progress", "--state-changed"],
        [".zd-feedback-addressed", "--text-muted"],
      ] as const;
      return pairs.map(([selector, token]) => {
        const element = document.querySelector<HTMLElement>(selector)!;
        const probe = document.createElement("span");
        probe.style.color = `var(${token})`;
        document.body.append(probe);
        const result = {
          selector,
          painted: getComputedStyle(element).color,
          token: getComputedStyle(probe).color,
        };
        probe.remove();
        return result;
      });
    });

    for (const colour of colours) {
      expect(
        sameColour(colour.painted, colour.token),
        `${theme} ${colour.selector} ignored its state token`,
      ).toBe(true);
    }
  }
});
