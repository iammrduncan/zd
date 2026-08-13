import { expect, test } from "@playwright/test";

import { openEditor } from "./harness";

/*
 * Vision §6.1: "**Structure continues as you type it, the way a chat composer
 * does.** Typing `>` and a space makes a blockquote; Enter continues it; a second
 * Enter leaves it."
 *
 * Reported twice. "block quotes after doing new line by default go to regular line,
 * only after typing does it turn that line back to a block quote. It should auto
 * block quote and if nothing is typed and enter is pressed then it demotes it to a
 * newline" (2026-07-29), and "pressing enter on the last item in a list does not
 * create a new item in the list like i expected it would".
 *
 * `@codemirror/lang-markdown` ships `insertNewlineContinueMarkup` for exactly this
 * and it has been held off behind `addKeymap: false` since the parser was wired,
 * because taking the library's keymap wholesale would have answered questions this
 * task exists to ask. It covers blockquotes and lists. It does **not** cover code
 * fences — that half is its own task.
 *
 * Enter and Backspace live on a CodeMirror keymap rather than in the suite registry,
 * and that is not an exception to §7.1. The registry owns *commands* — things with a
 * chord, a description, and a row in the Reference. Enter is text editing, which is
 * why `defaultKeymap` has always been in this editor's extension list.
 */

test.beforeEach(async ({ page }) => {
  await openEditor(page);
  await page.locator(".cm-content").click();
});

/** Put the caret at the end of the first source line containing `needle`. */
async function caretAtEndOfLine(page: import("@playwright/test").Page, needle: string) {
  return page.evaluate((text) => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((line) => line.includes(text));
    if (index < 0) throw new Error(`no source line contains ${text}`);
    const start = lines.slice(0, index).reduce((total, line) => total + line.length + 1, 0);
    window.zdEditor!.setCaret(start + lines[index]!.length);
    return { line: index + 1, source: lines[index]! };
  }, needle);
}

/** The source lines around line `number`, one-based. */
async function linesAround(page: import("@playwright/test").Page, number: number, span: number) {
  return page.evaluate(
    ({ at, count }) =>
      window
        .zdEditor!.text()
        .split("\n")
        .slice(at - 1, at - 1 + count),
    { at: number, count: span },
  );
}

test("enter inside a blockquote continues the quote", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "composer does.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("and so does this one");

  const after = await linesAround(page, line + 1, 1);
  // §6.1: "Enter continues it." Without this the new line is plain prose and the
  // quote silently ends mid-thought — you only find out when it renders.
  expect(after[0], "the new line did not continue the quote").toBe("> and so does this one");
});

test("a second enter leaves the blockquote", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "composer does.");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("plain prose again");

  /*
   * One line, and exactly one. "if nothing is typed and enter is pressed then it
   * demotes it to a newline" — the marker comes off the line the caret is on, so
   * the whole claim is about that single line. Slicing two lines and searching them
   * for a `>` is what this assertion did first, and it failed on the *next* line of
   * the fixture, which is allowed to contain anything at all.
   */
  const [demoted] = await linesAround(page, line + 1, 1);
  expect(demoted, "the quote marker was not taken off the line").toBe("plain prose again");
});

test("enter on a list item continues the list", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "a typeset bullet would be");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a new item");

  const after = await linesAround(page, line + 1, 1);
  // The separately reported half: "pressing enter on the last item in a list does
  // not create a new item in the list like i expected it would."
  expect(after[0], "the new line is not a list item").toBe("- a new item");
});

test("a second enter leaves the list", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "a typeset bullet would be");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("prose after the list");

  // The one line the demotion is about — see the note in the blockquote case.
  const [demoted] = await linesAround(page, line + 1, 1);
  expect(demoted, "the list marker was not taken off the line").toBe("prose after the list");
});

test("a nested item continues at its own depth", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "another nested item");
  await page.keyboard.press("Enter");
  await page.keyboard.type("a third nested item");

  const after = await linesAround(page, line + 1, 1);
  // Continuing at the parent's depth would silently re-level the document, which is
  // worse than not continuing at all — the indentation is the structure here.
  expect(after[0], "the nested item continued at the wrong depth").toBe("  - a third nested item");
});

test("enter in plain prose is still just a newline", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "not, the claim above is decoration");
  await page.keyboard.press("Enter");
  await page.keyboard.type("nothing should be prefixed here");

  const after = await linesAround(page, line + 1, 1);
  // The library's own warning: the command "does nothing in non-Markdown context, so
  // it should not be used as the only binding for Enter". This is the check that it
  // was bound alongside the generic one rather than in place of it.
  expect(after[0]).toBe("nothing should be prefixed here");
});

test("backspace after a quote marker removes the markup, not a character", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "composer does.");
  await page.keyboard.press("Enter");
  // The caret is now directly after a freshly continued `> `.
  await page.keyboard.press("Backspace");
  await page.keyboard.type("out of the quote");

  const after = await linesAround(page, line + 1, 1);
  /*
   * `deleteMarkupBackward`, the other half of the library's keymap. Without it
   * Backspace eats the space and leaves a bare `>`, which is still a blockquote —
   * so the obvious way out of a quote you did not want produces a quote you cannot
   * see the end of.
   */
  expect(after[0], "backspace left a bare quote marker").toBe("out of the quote");
});
