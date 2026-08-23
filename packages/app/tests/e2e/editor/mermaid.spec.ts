import { expect, test } from "@playwright/test";

import { sameColour } from "../colour";
import { materializeEditorTarget, openEditor } from "./harness";

test("a Mermaid fence renders as a themed diagram and Raw Mode restores its source", async ({
  page,
}) => {
  await openEditor(page);

  const diagram = await materializeEditorTarget(
    page,
    page.locator('.md-mermaid-diagram[aria-label="Mermaid flowchart"]'),
    "the rendered Mermaid fence",
  );
  await expect(diagram.locator("svg")).toBeVisible();
  await expect(diagram).toContainText("Plan");
  await expect(diagram).toContainText("Ship");
  await expect(page.locator(".cm-content")).not.toContainText("flowchart LR");

  await page.keyboard.press("ControlOrMeta+e");

  await expect(page.locator(".md-mermaid-diagram")).toHaveCount(0);
  await expect(page.locator(".cm-content")).toContainText("flowchart LR");
  await expect(page.locator(".cm-content")).toContainText("Plan[Plan] --> Ship[Ship]");
});

test("a standalone Mermaid file opens as a diagram and can reveal editable source", async ({
  page,
}) => {
  await openEditor(page, { url: "/dev/editor.html?doc=mermaid" });

  const editor = page.locator('.md-editor[data-language="mermaid"]');
  const diagram = editor.locator('.md-mermaid-diagram[aria-label="Mermaid sequence diagram"]');
  await expect(editor).toBeVisible();
  await expect(diagram).toBeVisible();
  await expect(diagram).toContainText("Writer");
  await expect(diagram).toContainText("Reader");
  await expect(editor.locator(".cm-gutters")).toHaveCount(0);

  await page.keyboard.press("ControlOrMeta+e");

  await expect(diagram).toHaveCount(0);
  await expect(editor.locator(".cm-content")).toContainText("sequenceDiagram");
  await editor.locator(".cm-content").click();
  await page.keyboard.type("%% editable");
  await expect(editor.locator(".cm-content")).toContainText("%% editable");
});

test("an existing diagram follows the shared light and dark theme without remote requests", async ({
  page,
}) => {
  const remoteRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
      remoteRequests.push(request.url());
    }
  });
  await openEditor(page, { url: "/dev/editor.html?doc=mermaid" });

  const colours = await page.evaluate(async () => {
    const appearanceModule = "/src/design/appearance.ts";
    const { setTheme } = await import(appearanceModule);
    const svg = document.querySelector<SVGSVGElement>(".md-mermaid-diagram svg")!;
    const actor = svg.querySelector<SVGTextElement>("g.actor text")!;
    const probe = document.createElement("span");
    probe.style.color = "var(--text-primary)";
    document.body.append(probe);
    const read = () => ({
      ink: getComputedStyle(actor).fill,
      token: getComputedStyle(probe).color,
    });

    setTheme("light");
    const light = read();
    setTheme("dark");
    const dark = read();
    probe.remove();
    return {
      light,
      dark,
      sameSvg: svg === document.querySelector(".md-mermaid-diagram svg"),
    };
  });

  expect(colours.sameSvg).toBe(true);
  expect(sameColour(colours.light.ink, colours.light.token)).toBe(true);
  expect(sameColour(colours.dark.ink, colours.dark.token)).toBe(true);
  expect(sameColour(colours.light.ink, colours.dark.ink)).toBe(false);
  expect(remoteRequests).toEqual([]);
});
