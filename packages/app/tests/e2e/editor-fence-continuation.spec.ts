import { expect, test } from "@playwright/test";

/*
 * Vision §6.1: "A fence and its optional language open a code block on Enter, and a
 * second Enter closes it."
 *
 * In the reporter's own words: "same thing for code fences... after entering the
 * triplebacktick and the code language (or not) and pressing enter it should create
 * a code block and double enter required to exit (just like typing in slack does)",
 * and separately "! code block pressing enter twice does not leave the code block".
 *
 * Split out of the blockquote task on 2026-07-30 because none of this comes from
 * `@codemirror/lang-markdown`. `insertNewlineContinueMarkup` handles blockquotes and
 * lists and stops there, so both halves here are ours.
 *
 * Why opening matters beyond convenience: an unclosed fence is not a small mistake.
 * The parser runs it to the end of the document, so every paragraph below the fence
 * you just typed becomes code — the whole rest of the file changes plane at once.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 9000 });
  await page.goto("/dev/editor.html");
  await page.locator(".md-line-h1").first().waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
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
    return { line: index + 1 };
  }, needle);
}

/** `count` source lines starting at one-based `at`. */
async function lines(page: import("@playwright/test").Page, at: number, count: number) {
  return page.evaluate(
    ({ from, take }) =>
      window
        .zdEditor!.text()
        .split("\n")
        .slice(from - 1, from - 1 + take),
    { from: at, take: count },
  );
}

/**
 * Write an opening fence on the caret's line and leave the caret at its end.
 *
 * `insertText` rather than `keyboard.type`, and then the caret is placed again
 * deliberately. Typing a fence one character at a time does not leave the caret
 * where the last character went: the moment `\`\`\`` parses as an incomplete fence
 * the caret is pushed out of that line, so a following `rust` lands on the line
 * below. That behaviour predates this task — it reproduces with these commands
 * removed — and is filed; it is not what these specs are about, and letting it
 * decide the setup would mean measuring it by accident.
 */
async function openingFence(page: import("@playwright/test").Page, marker: string, at: number) {
  await page.keyboard.insertText(marker);
  // By line number, not by searching for the marker. The fixture already contains a
  // line that is exactly ```rust, so searching found *that* one and quietly moved the
  // caret two hundred lines away — the assertions then read a paragraph and reported
  // the opening fence as altered.
  await page.evaluate((line) => {
    const lines = window.zdEditor!.text().split("\n");
    const start = lines.slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    window.zdEditor!.setCaret(start + lines[line - 1]!.length);
  }, at);
}

/** Which source line the caret is on. */
async function caretLine(page: import("@playwright/test").Page) {
  return page.evaluate(() => window.zdEditor!.selection().line);
}

test("enter after a fence line closes the block and leaves the caret inside", async ({ page }) => {
  // A fresh line in prose, then type an opening fence on it.
  const { line } = await caretAtEndOfLine(page, "The paragraph after it starts");
  await page.keyboard.press("Enter");
  await openingFence(page, "```rust", line + 1);
  await page.keyboard.press("Enter");

  const written = await lines(page, line + 1, 3);
  /*
   * Three lines: the opener, a blank one for the caret, and a closer the reader
   * never typed. Without the closer the fence runs to the end of the file.
   */
  expect(written[0], "the opening fence was altered").toBe("```rust");
  expect(written[1], "there is nowhere to type").toBe("");
  expect(written[2], "the block was not closed").toBe("```");
  expect(await caretLine(page), "the caret is not inside the block").toBe(line + 2);
});

test("the closing fence matches the characters the opener used", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "The paragraph after it starts");
  await page.keyboard.press("Enter");
  await openingFence(page, "~~~~", line + 1);
  await page.keyboard.press("Enter");

  const written = await lines(page, line + 1, 3);
  /*
   * A fence may be tildes, and may be longer than three characters — CommonMark
   * allows both, and a closer has to be at least as long as its opener and made of
   * the same character. Closing `~~~~` with ``` produces a block that never ends,
   * which is the failure this whole command exists to prevent.
   */
  expect(written[2], "the closer does not match the opener").toBe("~~~~");
});

test("a second enter leaves the block", async ({ page }) => {
  /*
   * The *last* code line of the fixture's Rust block, which is the `}` after
   * `Ok(raw)` — not `Ok(raw)` itself. Leaving only happens from a blank line directly
   * above the closer, so starting a line too early meant the command correctly
   * declined and the test read that as the feature not working.
   */
  const line = await page.evaluate(() => {
    const lines = window.zdEditor!.text().split("\n");
    const index = lines.findIndex((text) => text.includes("    Ok(raw)")) + 1;
    const start = lines.slice(0, index).reduce((total, text) => total + text.length + 1, 0);
    window.zdEditor!.setCaret(start + lines[index]!.length);
    return index + 1;
  });
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("prose after the block");

  const written = await lines(page, line, 3);
  /*
   * "double enter required to exit (just like typing in slack does)". The blank line
   * the first Enter made is taken back — it was scaffolding for the second press,
   * not content — so the block ends where it did and the prose lands after the
   * closing fence rather than inside the code.
   */
  expect(written[0], "the last code line changed").toBe("}");
  expect(written[1], "a blank line was left inside the block").toBe("```");
  expect(written[2], "the prose did not land outside the block").toBe("prose after the block");
});

test("enter on a blank line in the middle of code is still a newline", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "// Read a document and hand it back");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// still inside");

  const written = await lines(page, line + 1, 3);
  /*
   * Leaving only happens from the blank line immediately before the closing fence.
   * Anywhere else in a block, a blank line is someone spacing out their code, and
   * ejecting them from the fence for it would be the opposite of helpful.
   */
  expect(written[0], "the first blank line was consumed").toBe("");
  expect(written[1], "the caret was thrown out of the block").toBe("// still inside");
});

test("enter at the end of a code line stays inside the block", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "// Read a document and hand it back");
  await page.keyboard.press("Enter");
  await page.keyboard.type("// a second comment");

  const [written] = await lines(page, line + 1, 1);
  // Ordinary editing inside a fence, which must not have become special.
  expect(written).toBe("// a second comment");
});

test("an already closed fence never gains a second closer", async ({ page }) => {
  const before = await page.evaluate(() => window.zdEditor!.text());

  // The opening fence line of a block that is already closed. Its row is hidden, so
  // only `setCaret` can reach it — which is exactly why this needs pinning: the
  // command must read the parse tree rather than assume an unclosed fence.
  const { line } = await caretAtEndOfLine(page, "```rust");
  await page.keyboard.press("Enter");

  const written = await lines(page, line, 3);
  expect(written[0], "the opening fence was altered").toBe("```rust");
  expect(written[1], "enter did not insert a plain line inside the block").toBe("");
  expect(written[2], "a second closing fence was inserted").not.toBe("```");

  const after = await page.evaluate(() => window.zdEditor!.text());
  expect(after.split("```").length, "the number of fence markers changed").toBe(
    before.split("```").length,
  );
});

/*
 * An incomplete fence is a line someone is still typing.
 *
 * §7.4: "Incomplete syntax remains editable plain text." notation/rows.ts said so in
 * a comment — "An unclosed fence has one mark, and its row must stay: hiding the
 * opening of a block that never ends would swallow the line the caret is on while
 * someone is still typing it" — and then hid the opening row one statement before
 * the check that was supposed to prevent it.
 *
 * The consequence is not cosmetic. A hidden row is an atomic range, so the caret is
 * pushed off the line, and the language typed after the fence lands on the line
 * below. Which means a fence with a language could not be typed at all, and the
 * continuation work that opens a block on Enter could not be reached the only way
 * anyone reaches it.
 */

test("an incomplete fence keeps its row while it is being typed", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "The paragraph after it starts");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```");

  const state = await page.evaluate((at) => {
    const drawn = [...document.querySelectorAll<HTMLElement>(".cm-line")].some(
      (element) => element.textContent === "```",
    );
    return { drawn, caretLine: window.zdEditor!.selection().line, expected: at };
  }, line + 1);

  // The row has to be on screen, because it is the row being typed on.
  expect(state.drawn, "the fence row was hidden while it was being typed").toBe(true);
  expect(state.caretLine, "the caret was pushed off the fence line").toBe(state.expected);
});

test("a language typed after a fence lands on the fence line", async ({ page }) => {
  const { line } = await caretAtEndOfLine(page, "The paragraph after it starts");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```rust");

  const [written, below] = await lines(page, line + 1, 2);
  /*
   * The whole complaint, in one assertion. Typed one character at a time, exactly as
   * a person types it — `insertText` hides this bug completely, which is why the
   * specs above use it for their setup and this one deliberately does not.
   */
  expect(written, "the language did not land on the fence line").toBe("```rust");
  expect(below, "the language was pushed onto its own line").not.toBe("rust");
});
