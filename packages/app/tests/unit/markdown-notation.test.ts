import { describe, expect, it } from "vitest";

import { createEditor } from "@/miniapps/md/editor/editor";

// Vision §6.1: notation is visible, and the line it sits on still reads as the
// block it is. What is asserted here is only *which lines are what* — what those
// lines then look like is type and geometry, so it is CSS, and it is measured in
// a real engine in tests/e2e/editor-notation.spec.ts.
//
// The interesting case throughout is the one a regex over lines gets wrong: a
// `#` or a `-` inside a fence is somebody's shell script, and every agent log
// this app exists to read is mostly fences.

function classesOf(doc: string): string[][] {
  const host = document.createElement("div");
  document.body.append(host);
  createEditor(host, doc);

  return [...host.querySelectorAll(".cm-line")].map((line) =>
    [...line.classList].filter((name) => name.startsWith("md-line-")),
  );
}

describe("markdown notation in the editing surface", () => {
  describe("headings", () => {
    it("marks each heading line with its own level", () => {
      const doc = [
        "# One",
        "",
        "## Two",
        "",
        "### Three",
        "",
        "#### Four",
        "",
        "##### Five",
        "",
        "###### Six",
      ].join("\n");

      expect(classesOf(doc)).toEqual([
        ["md-line-h1"],
        [],
        ["md-line-h2"],
        [],
        ["md-line-h3"],
        [],
        ["md-line-h4"],
        [],
        ["md-line-h5"],
        [],
        ["md-line-h6"],
      ]);
    });

    it("leaves prose alone", () => {
      expect(classesOf("A paragraph that mentions C# and nothing else.")).toEqual([[]]);
    });

    it("does not turn a seventh hash into a heading", () => {
      // CommonMark stops at six, and so does the type ladder in DESIGN.md §5.2.
      expect(classesOf("####### Seven")).toEqual([[]]);
    });
  });

  describe("lists", () => {
    it("marks the line that carries the marker apart from the rest of the item", () => {
      // The distinction is the whole point of finding F12: the marker line hangs
      // its marker out of the column, and a line that continues the item in the
      // source is already at the text origin and must not hang anything.
      const doc = ["- an item whose text", "  carries on over a second source line", "- another"].join(
        "\n",
      );

      expect(classesOf(doc)).toEqual([["md-line-item"], ["md-line-item-cont"], ["md-line-item"]]);
    });

    it("marks ordered items the same way as unordered ones", () => {
      expect(classesOf("1. first\n2. second")).toEqual([
        ["md-line-item"],
        ["md-line-item"],
      ]);
    });

    it("marks a nested item as an item in its own right", () => {
      expect(classesOf("- outer\n  - inner")).toEqual([["md-line-item"], ["md-line-item"]]);
    });
  });

  describe("blockquotes", () => {
    it("marks every line of the quote", () => {
      expect(classesOf("> first line\n> second line\n\nprose")).toEqual([
        ["md-line-quote"],
        ["md-line-quote"],
        [],
        [],
      ]);
    });
  });

  describe("fenced code", () => {
    it("draws the code and not the fence rows", () => {
      /*
       * Inverted 2026-07-29. This used to assert three rendered rows on the reading
       * that "the fence characters are part of the block, not a lid on it" — §5.2
       * now says the opening and closing fences "are not drawn once the block is
       * formed", so a formed block renders only its code.
       *
       * `classesOf` reads rendered lines, which is why the count changes: the fence
       * lines still exist in the document and still carry `md-line-code`, they just
       * have no row. What a save writes is unaffected, and editor-fenced-code.spec.ts
       * asserts that against the real buffer.
       */
      const doc = ["prose", "```sh", "npm test", "```"].join("\n");

      expect(classesOf(doc)).toEqual([[], ["md-line-code"]]);
    });

    it("does not read the contents of a fence as markdown", () => {
      // The case a regex over lines gets wrong, and the reason this file parses:
      // inside a fence a `#` is a comment and a `-` is somebody's shell flag.
      const doc = [
        "prose",
        "```sh",
        "# not a heading",
        "- not a list item",
        "> not a quote",
        "```",
      ].join("\n");

      expect(classesOf(doc)).toEqual([
        [],
        ["md-line-code"],
        ["md-line-code"],
        ["md-line-code"],
      ]);
    });
  });
});
