import { describe, expect, it } from "vitest";

import { lineCount, readTime, statusLine, wordCount } from "@/miniapps/md/status";

// DESIGN.md §7.10: the strip "reports the live buffer, including unsaved
// changes". The sentence and the count are pure, so they are pinned here rather
// than through a browser.

describe("wordCount", () => {
  it("counts whitespace-separated runs", () => {
    expect(wordCount("one two three")).toBe(3);
  });

  it("is not fooled by runs of whitespace or by leading and trailing space", () => {
    expect(wordCount("  one   two \n three \t ")).toBe(3);
  });

  it("counts an empty or blank buffer as no words rather than one", () => {
    // "".split(/\s+/) is [""], which is length 1 — the bug this exists to stop.
    expect(wordCount("")).toBe(0);
    expect(wordCount("   \n  ")).toBe(0);
  });

  it("counts markdown notation as part of the word it marks", () => {
    // A status line is for the writer, and `# Heading` is two words on screen.
    expect(wordCount("# Heading")).toBe(2);
  });
});

describe("statusLine", () => {
  it("names the counts and the saved state", () => {
    expect(statusLine({ words: 3, characters: 12, lines: 1, dirty: false })).toBe(
      "3 words · 12 characters · 1 line · 1m · saved",
    );
  });

  it("says unsaved when the buffer differs from what was written", () => {
    expect(statusLine({ words: 3, characters: 12, lines: 1, dirty: true })).toContain("unsaved");
  });

  it("groups long numbers so a large document stays readable", () => {
    // The agent logs this app exists to read run to hundreds of thousands of
    // characters, and `418206 characters` is not a number anyone reads at a
    // glance from a line that leaves after ten seconds.
    expect(
      statusLine({ words: 41_820, characters: 418_206, lines: 9_120, dirty: false }),
    ).toContain("418,206 characters");
  });
});

/*
 * A read time and a line count — feedback, 2026-07-30: "stats line needs Read
 * time (Just show '4m' or soemthing like that, no details but if someone sees a
 * time on a stat they know what it is) and line count".
 *
 * The read time is the one value here that is not a count of anything. It is words
 * divided by a rate, and the rate is a decision — so it is named once in the
 * module and asserted here through the boundaries it produces rather than through
 * a second copy of the number.
 */

describe("lineCount", () => {
  it("counts a single line with no newline in it", () => {
    expect(lineCount("one line")).toBe(1);
  });

  it("counts the lines between newlines, not the newlines", () => {
    expect(lineCount("one\ntwo\nthree")).toBe(3);
  });

  it("counts a trailing newline as opening a line that exists", () => {
    /*
     * `"a\n"` is two lines: the second is empty and the caret can sit on it. This
     * is what the editor's own `doc.lines` says, and a status line that disagreed
     * with the document it describes would be worse than no line count.
     */
    expect(lineCount("a\n")).toBe(2);
  });

  it("counts an empty buffer as one line", () => {
    // There is always somewhere to type. Zero would describe a document that
    // cannot exist.
    expect(lineCount("")).toBe(1);
  });
});

describe("readTime", () => {
  it("rounds up, so any words at all take at least a minute", () => {
    // "no details" — a document with a sentence in it reads as `1m`, not `0m`,
    // because rounding down would tell a reader something is instant.
    expect(readTime(1)).toBe("1m");
  });

  it("says nothing takes no time", () => {
    expect(readTime(0)).toBe("0m");
  });

  it("crosses into hours rather than counting past sixty minutes", () => {
    /*
     * The multi-megabyte agent logs in §10 are exactly the documents that reach
     * this, and `184m` is a number nobody converts at a glance from a line that
     * leaves after ten seconds.
     */
    expect(readTime(200 * 60)).toBe("1h");
    expect(readTime(200 * 95)).toBe("1h 35m");
  });

  it("keeps the pair short by dropping a zero remainder", () => {
    expect(readTime(200 * 120)).toBe("2h");
  });
});
