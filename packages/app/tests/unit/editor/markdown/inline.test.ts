import { describe, expect, it } from "vitest";

import { renderInlineMarkdown } from "@/editor/markdown/inline";

function render(source: string): HTMLElement {
  const host = document.createElement("div");
  host.append(renderInlineMarkdown(source));
  return host;
}

describe("rendered editor fragments", () => {
  it("returns inline DOM without inventing a paragraph wrapper", () => {
    const fragment = renderInlineMarkdown("a `token` and [link](./other.md)");
    const host = document.createElement("div");
    host.append(fragment);

    expect(fragment).toBeInstanceOf(DocumentFragment);
    expect(host.querySelector("p")).toBeNull();
    expect(host.querySelector("code")?.textContent).toBe("token");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("./other.md");
  });

  it("renders the inline constructs a table cell can contain", () => {
    const host = render("*emphasis*, **strong**, `code`, and ![local](./diagram.png)");

    expect(host.querySelector("em")?.textContent).toBe("emphasis");
    expect(host.querySelector("strong")?.textContent).toBe("strong");
    expect(host.querySelector("code")?.textContent).toBe("code");
    expect(host.querySelector("img")?.getAttribute("src")).toBe("./diagram.png");
  });
});

describe("rendered editor fragments: the file is hostile input", () => {
  it("escapes raw HTML instead of parsing it", () => {
    const host = render("<img src=x onerror=alert(1)>");

    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("does not execute or retain script markup", () => {
    expect(render("<script>alert(1)</script>").querySelector("script")).toBeNull();
  });

  it.each([
    ["https://example.com/a.png", "https"],
    ["http://example.com/a.png", "http"],
    ["//example.com/a.png", "protocol-relative"],
    ["  https://example.com/a.png", "leading whitespace"],
    ["HTTPS://EXAMPLE.COM/A.PNG", "uppercase scheme"],
  ])("blocks remote image %s (%s)", (src) => {
    const host = render(`![alt](${src})`);

    expect(host.querySelector("img"), src).toBeNull();
    expect(host.querySelector(".md-image-blocked")?.textContent).toBe("alt");
  });

  it("neutralises javascript links while keeping ordinary links", () => {
    const hostile = render("[click](javascript:alert(1))");
    const ordinary = render("[docs](https://example.com/a) and [rel](./other.md)");

    expect(hostile.querySelector("a")?.getAttribute("href") ?? "").not.toMatch(/^javascript:/i);
    expect([...ordinary.querySelectorAll("a")].map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com/a",
      "./other.md",
    ]);
  });
});

describe("rendered editor fragments: the text is not rewritten", () => {
  it("leaves quotes and dashes exactly as written", () => {
    const host = render(`He said "hello" -- then left...`);

    expect(host.textContent).toContain(`"hello"`);
    expect(host.textContent).toContain("--");
    expect(host.textContent).toContain("...");
  });

  it("does not linkify bare URLs", () => {
    expect(render("see https://example.com for details").querySelector("a")).toBeNull();
  });

  it("renders empty inline content as nothing", () => {
    expect(render("").children).toHaveLength(0);
  });
});
