import { describe, expect, it } from "vitest";

import { renderMermaidDiagram } from "@/editor/mermaid/render";

describe("Mermaid SVG rendering", () => {
  it("renders a labelled, theme-aware SVG from Mermaid source", () => {
    const diagram = renderMermaidDiagram("flowchart LR\n  Plan[Plan] --> Ship[Ship]");

    expect(diagram).not.toBeNull();
    expect(diagram!.tagName.toLowerCase()).toBe("svg");
    expect(diagram!.getAttribute("role")).toBe("img");
    expect(diagram!.getAttribute("aria-label")).toBe("Mermaid flowchart");
    expect(diagram!.textContent).toContain("Plan");
    expect(diagram!.textContent).toContain("Ship");
    expect(diagram!.outerHTML).toContain("var(--text-primary)");
    expect(diagram!.outerHTML).not.toContain("fonts.googleapis.com");
  });

  it("returns null for invalid source so the editor can leave it editable", () => {
    expect(renderMermaidDiagram("this is not a Mermaid diagram")).toBeNull();
  });

  it("never returns executable or remotely loading SVG content", () => {
    const diagram = renderMermaidDiagram(
      'flowchart LR\n  A["<script>alert(1)</script>"] --> B[Done]',
    );

    expect(
      diagram?.querySelector("script, foreignObject, iframe, object, embed, image, a"),
    ).toBeNull();
    for (const element of diagram?.querySelectorAll("*") ?? []) {
      for (const attribute of element.getAttributeNames()) {
        expect(attribute.toLowerCase().startsWith("on")).toBe(false);
        expect(element.getAttribute(attribute)?.toLowerCase()).not.toContain("javascript:");
        expect(element.getAttribute(attribute)?.toLowerCase()).not.toContain("http://");
        expect(element.getAttribute(attribute)?.toLowerCase()).not.toContain("https://");
      }
    }
  });
});
