import { describe, expect, it } from "vitest";

import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";

import {
  DEFAULT_FIND_OPTIONS,
  findText,
  replacementFor,
  visibleMarkdownSourceRanges,
  type FindOptions,
} from "@/editor/find";

function find(source: string, query: string, options: Partial<FindOptions> = {}) {
  return findText(source, query, { ...DEFAULT_FIND_OPTIONS, ...options });
}

describe("current-file matching", () => {
  it("finds literal text without case sensitivity by default", () => {
    const result = find("Alpha alpha ALPHA", "alpha");

    expect(result.matches.map(({ from, to }) => [from, to])).toEqual([
      [0, 5],
      [6, 11],
      [12, 17],
    ]);
    expect(result.error).toBeNull();
  });

  it("supports case and whole-word options together", () => {
    const result = find("cat catalog Cat cat_2 cat", "cat", {
      caseSensitive: true,
      wholeWord: true,
    });

    expect(result.matches.map(({ from }) => from)).toEqual([0, 22]);
  });

  it("supports regular expressions and captures for replacement", () => {
    const result = find("one=1 two=22", "([a-z]+)=(\\d+)", { regularExpression: true });

    expect(result.matches).toHaveLength(2);
    expect(replacementFor(result.matches[1]!, "$2:$1")).toBe("22:two");
  });

  it("states an invalid expression and does not run it", () => {
    const result = find("anything", "(", { regularExpression: true });

    expect(result.matches).toEqual([]);
    expect(result.error).toContain("Invalid regular expression");
  });

  it("bounds query length and total results", () => {
    const tooLong = find("text", "x".repeat(1_025));
    const many = find("a ".repeat(10_100), "a");

    expect(tooLong.error).toContain("1,024");
    expect(many.matches).toHaveLength(10_000);
    expect(many.limited).toBe(true);
  });
});

describe("rendered Markdown source ranges", () => {
  const source = [
    "# Visible heading",
    "",
    "A [visible label](hidden-target) and <https://visible.test>.",
    "",
    "![diagram alt](hidden-image.png)",
    "",
    "| Name | Link |",
    "| --- | --- |",
    "| cell text | [table label](table-target) |",
    "",
    "---",
    "",
    "```rust",
    "let visible_code = true;",
    "```",
  ].join("\n");

  function renderedFind(query: string, raw = false) {
    const state = EditorState.create({
      doc: source,
      extensions: [markdown({ base: markdownLanguage })],
    });
    return findText(source, query, DEFAULT_FIND_OPTIONS, visibleMarkdownSourceRanges(state, raw));
  }

  it.each([
    "visible label",
    "https://visible.test",
    "diagram alt",
    "cell text",
    "table label",
    "visible_code",
  ])("maps visible rendered text %s to a real source range", (query) => {
    const match = renderedFind(query).matches[0];

    expect(match).toBeDefined();
    expect(source.slice(match!.from, match!.to)).toBe(query);
  });

  it.each(["hidden-target", "hidden-image.png", "table-target", "| --- |", "```rust"])(
    "does not claim hidden source %s as a rendered match",
    (query) => {
      expect(renderedFind(query).matches).toEqual([]);
    },
  );

  it("exposes every hidden source range in Raw Mode", () => {
    for (const query of [
      "hidden-target",
      "hidden-image.png",
      "table-target",
      "| --- |",
      "```rust",
    ]) {
      expect(renderedFind(query, true).matches, `${query} stayed hidden`).toHaveLength(1);
    }
  });
});
